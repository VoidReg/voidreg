use actix_web::http::header;
use actix_web::{HttpRequest, HttpResponse, delete, get, patch, web};
use base64::Engine as _;
use base64::engine::general_purpose::URL_SAFE_NO_PAD;
use serde::Deserialize;
use serde_json::Value;
use sha2::{Digest, Sha256};

use crate::auth::extract::{OptionalCommenter, RequiredCommenter};
use crate::auth::rate::RateLimiter;
use crate::auth::{
    OAUTH_STATE_COOKIE, OAUTH_VERIFIER_COOKIE, SESSION_KIND_ADMIN, SESSION_KIND_COMMENTER,
    admin_csrf_cookie, admin_session_cookie, commenter_expired_cookie, commenter_session_cookie,
    cookie_token, expired_oauth_cookies, new_session_token, oauth_state_cookie,
    oauth_verifier_cookie,
};
use crate::config::Config;
use crate::db::Db;
use crate::domain::{
    CommenterIdentity, CommenterProfile, CommenterSessionResponse, ProfileDeleteQuery,
    ProfileUpdate,
};
use crate::error::AppError;
use crate::util::constant_time_eq;

const GOOGLE_AUTH_URL: &str = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN_URL: &str = "https://oauth2.googleapis.com/token";
const GOOGLE_USERINFO_URL: &str = "https://openidconnect.googleapis.com/v1/userinfo";
const GITHUB_AUTH_URL: &str = "https://github.com/login/oauth/authorize";
const GITHUB_TOKEN_URL: &str = "https://github.com/login/oauth/access_token";
const GITHUB_USER_URL: &str = "https://api.github.com/user";
const GITHUB_EMAILS_URL: &str = "https://api.github.com/user/emails";

#[derive(Debug, Deserialize, Default)]
pub struct OAuthStartQuery {
    pub purpose: Option<String>,
    pub return_to: Option<String>,
    /// Connect this provider to the signed-in profile instead of signing in.
    pub link: Option<bool>,
}

#[cfg_attr(feature = "swagger", utoipa::path(
    get,
    path = "/api/v1/auth/{provider}/start",
    tag = "auth",
    params(
        ("provider" = String, Path, description = "google or github"),
        ("purpose" = Option<String>, Query, description = "admin or commenter, default commenter"),
        ("return_to" = Option<String>, Query, description = "Local /blog/{slug} or /account path for commenter sign-in"),
        ("link" = Option<bool>, Query, description = "Connect this provider to the signed-in profile")
    ),
    responses(
        (status = 302, description = "Redirect to the provider"),
        (status = 503, description = "Provider not configured", body = crate::error::ErrorBody)
    )
))]
#[get("/auth/{provider}/start")]
pub async fn start(
    config: web::Data<Config>,
    path: web::Path<String>,
    query: web::Query<OAuthStartQuery>,
) -> Result<HttpResponse, AppError> {
    let provider = path.into_inner();
    config
        .oauth_provider(&provider)
        .ok_or_else(|| oauth_unavailable(&provider))?;

    let purpose = query.purpose.as_deref().unwrap_or("commenter");
    if !matches!(purpose, "admin" | "commenter") {
        return Err(AppError::BadRequest("invalid sign-in purpose".to_owned()));
    }
    let return_to = query
        .return_to
        .as_deref()
        .filter(|_| purpose == "commenter");
    if return_to.is_some_and(|path| !safe_return(path)) {
        return Err(AppError::BadRequest("invalid return location".to_owned()));
    }
    let link = purpose == "commenter" && query.link.unwrap_or(false);
    let state = format!(
        "{provider}:{purpose}:{}:{}:{}",
        crate::util::random_token(),
        URL_SAFE_NO_PAD.encode(return_to.unwrap_or_default()),
        u8::from(link)
    );
    let mut response = HttpResponse::Found();
    response.insert_header((header::CACHE_CONTROL, "no-store"));
    response.insert_header((header::REFERRER_POLICY, "no-referrer"));
    match provider.as_str() {
        "google" => {
            let verifier = crate::util::random_token();
            let challenge = pkce_challenge(&verifier);
            let redirect = format!(
                "{}?client_id={}&redirect_uri={}&response_type=code&scope={}&state={}&code_challenge={}&code_challenge_method=S256",
                GOOGLE_AUTH_URL,
                urlencode(config.google_client_id.as_deref().unwrap_or_default()),
                urlencode(&config.oauth_redirect_uri("google")),
                urlencode("openid email profile"),
                urlencode(&state),
                urlencode(&challenge),
            );
            apply_oauth_cookies(&mut response, &config, &state, Some(&verifier));
            response.insert_header((header::LOCATION, redirect.as_str()));
        }
        "github" => {
            let verifier = crate::util::random_token();
            let challenge = pkce_challenge(&verifier);
            let redirect = format!(
                "{}?client_id={}&redirect_uri={}&scope={}&state={}&code_challenge={}&code_challenge_method=S256",
                GITHUB_AUTH_URL,
                urlencode(config.github_client_id.as_deref().unwrap_or_default()),
                urlencode(&config.oauth_redirect_uri("github")),
                urlencode(if purpose == "admin" {
                    "read:user"
                } else {
                    "read:user user:email"
                }),
                urlencode(&state),
                urlencode(&challenge),
            );
            apply_oauth_cookies(&mut response, &config, &state, Some(&verifier));
            response.insert_header((header::LOCATION, redirect.as_str()));
        }
        other => return Err(oauth_unavailable(other)),
    }

    Ok(response.finish())
}

#[derive(Debug, Deserialize)]
pub struct OAuthCallbackQuery {
    pub code: Option<String>,
    pub state: Option<String>,
    pub error: Option<String>,
}

#[cfg_attr(feature = "swagger", utoipa::path(
    get,
    path = "/api/v1/auth/{provider}/callback",
    tag = "auth",
    params(
        ("provider" = String, Path, description = "google or github"),
        ("code" = Option<String>, Query, description = "Provider authorization code"),
        ("state" = Option<String>, Query, description = "State echoed by the provider")
    ),
    responses(
        (status = 302, description = "Redirect with an authorized admin or commenter session"),
        (status = 400, description = "Invalid state or missing code", body = crate::error::ErrorBody),
        (status = 503, description = "Provider not configured", body = crate::error::ErrorBody)
    )
))]
#[get("/auth/{provider}/callback")]
pub async fn callback(
    db: web::Data<Db>,
    config: web::Data<Config>,
    path: web::Path<String>,
    query: web::Query<OAuthCallbackQuery>,
    request: HttpRequest,
) -> Result<HttpResponse, AppError> {
    let provider = path.into_inner();
    config
        .oauth_provider(&provider)
        .ok_or_else(|| oauth_unavailable(&provider))?;

    let returned_state = query
        .state
        .as_deref()
        .ok_or_else(|| AppError::BadRequest("missing state".to_owned()))?;
    let expected_state = cookie_token(&request, OAUTH_STATE_COOKIE)
        .ok_or_else(|| AppError::BadRequest("expired OAuth state; try again".to_owned()))?;
    if !expected_state.starts_with(&format!("{provider}:"))
        || !constant_time_eq(expected_state.as_bytes(), returned_state.as_bytes())
    {
        return Err(AppError::BadRequest("OAuth state mismatch".to_owned()));
    }

    let purpose = expected_state.split(':').nth(1).unwrap_or_default();
    if !matches!(purpose, "admin" | "commenter") {
        return Err(AppError::BadRequest("invalid sign-in purpose".to_owned()));
    }
    let return_to = expected_state
        .split(':')
        .nth(3)
        .and_then(|value| URL_SAFE_NO_PAD.decode(value).ok())
        .and_then(|value| String::from_utf8(value).ok())
        .filter(|path| safe_return(path));
    let link = purpose == "commenter" && expected_state.split(':').nth(4) == Some("1");
    if query.error.is_some() {
        let mut response = redirect_after_failure(&config, purpose, "sign_in_cancelled", None)?;
        if purpose == "commenter" {
            send_to(
                &config,
                &mut response,
                return_to.as_deref(),
                Some("sign_in_cancelled"),
            )?;
        }
        return Ok(response);
    }
    let code = query
        .code
        .as_deref()
        .map(str::trim)
        .filter(|c| !c.is_empty())
        .ok_or_else(|| AppError::BadRequest("missing authorization code".to_owned()))?;
    let verifier = cookie_token(&request, OAUTH_VERIFIER_COOKIE)
        .ok_or_else(|| AppError::BadRequest("expired PKCE verifier; try again".to_owned()))?;

    let profile = match provider.as_str() {
        "google" => {
            let access = exchange_google(&config, code, Some(&verifier)).await?;
            fetch_google_profile(&access).await?
        }
        "github" => {
            let access = exchange_github(&config, code, &verifier).await?;
            fetch_github_profile(&access, purpose != "admin").await?
        }
        other => return Err(oauth_unavailable(other)),
    };

    if link && let Some(profile_id) = current_profile(&db, &request).await? {
        let mut response = finish_link(&db, &config, &provider, profile, &profile_id).await?;
        send_to(&config, &mut response, return_to.as_deref(), None)?;
        return Ok(response);
    }
    let mut response = finish_sign_in(&db, &config, &provider, purpose, profile).await?;
    if purpose == "commenter" {
        send_to(&config, &mut response, return_to.as_deref(), None)?;
    }
    Ok(response)
}

/// Points a redirect at the page the person came from, when there is one.
fn send_to(
    config: &Config,
    response: &mut HttpResponse,
    path: Option<&str>,
    error: Option<&str>,
) -> Result<(), AppError> {
    let Some(path) = path else {
        return Ok(());
    };
    let mut location = format!("{}{path}", config.public_base_url);
    if let Some(error) = error {
        location.push_str(&format!("?auth_error={}", urlencode(error)));
    }
    response.headers_mut().insert(
        header::LOCATION,
        location
            .parse()
            .map_err(|_| AppError::BadRequest("invalid return location".to_owned()))?,
    );
    Ok(())
}

/// The profile of the commenter session sent with this request, if any.
async fn current_profile(db: &Db, request: &HttpRequest) -> Result<Option<String>, AppError> {
    let Some(token) = cookie_token(request, crate::auth::COMMENTER_SESSION_COOKIE) else {
        return Ok(None);
    };
    let Some(session) = db
        .get_live_session(&crate::auth::hash_token(&token))
        .await?
    else {
        return Ok(None);
    };
    if session.kind != SESSION_KIND_COMMENTER {
        return Ok(None);
    }
    match session.identity_id {
        Some(identity_id) => db.profile_id_for_identity(&identity_id).await,
        None => Ok(None),
    }
}

/// Only article pages and the account page may receive a commenter after sign-in.
fn safe_return(path: &str) -> bool {
    (path.starts_with("/blog/") || path == "/account")
        && path.len() <= 512
        && !path.contains(['\\', '\r', '\n'])
        && !path.contains("//")
        && !path.contains("..")
        && !path.contains('%')
}

async fn finish_sign_in(
    db: &Db,
    config: &Config,
    provider: &str,
    purpose: &str,
    profile: OAuthProfile,
) -> Result<HttpResponse, AppError> {
    if purpose == "admin" && !config.admin_identity_allowed(provider, &profile.subject) {
        let account = format!("{provider}:{}", profile.subject);
        return redirect_after_failure(config, purpose, "not_authorized", Some(&account));
    }

    let identity = db
        .upsert_identity(
            provider,
            &profile.subject,
            &profile.email,
            &profile.name,
            profile.avatar_url.as_deref(),
        )
        .await?;
    if purpose == "commenter" {
        db.attach_profile(&identity, profile.email_verified, None)
            .await?;
    }

    let (token, token_hash) = new_session_token();
    db.create_session(
        if purpose == "admin" {
            SESSION_KIND_ADMIN
        } else {
            SESSION_KIND_COMMENTER
        },
        &token_hash,
        Some(&identity.id),
        if purpose == "admin" {
            config.admin_session_ttl_hours
        } else {
            config.commenter_session_ttl_hours
        },
    )
    .await?;

    let mut response = HttpResponse::Found();
    response.insert_header((header::CACHE_CONTROL, "no-store"));
    response.insert_header((header::REFERRER_POLICY, "no-referrer"));
    for cookie in expired_oauth_cookies(config) {
        response.cookie(cookie);
    }
    let redirect = if purpose == "admin" {
        response.cookie(admin_session_cookie(config, &token));
        response.cookie(admin_csrf_cookie(
            config,
            &crate::api::v1::admin::session::csrf_for(&token),
        ));
        format!("{}/admin/", config.public_base_url)
    } else {
        response.cookie(commenter_session_cookie(config, &token));
        config.commenter_redirect()
    };
    response.insert_header((header::LOCATION, redirect.as_str()));
    Ok(response.finish())
}

/// Connects another provider to the profile of the signed-in commenter. The
/// current session stays as it is; only the new provider joins the profile.
async fn finish_link(
    db: &Db,
    config: &Config,
    provider: &str,
    profile: OAuthProfile,
    profile_id: &str,
) -> Result<HttpResponse, AppError> {
    let identity = db
        .upsert_identity(
            provider,
            &profile.subject,
            &profile.email,
            &profile.name,
            profile.avatar_url.as_deref(),
        )
        .await?;
    let failure = match db
        .attach_profile(&identity, profile.email_verified, Some(profile_id))
        .await
    {
        Ok(_) => None,
        Err(AppError::Conflict(_)) => Some("already_linked"),
        Err(other) => return Err(other),
    };
    let mut response = HttpResponse::Found();
    response.insert_header((header::CACHE_CONTROL, "no-store"));
    response.insert_header((header::REFERRER_POLICY, "no-referrer"));
    for cookie in expired_oauth_cookies(config) {
        response.cookie(cookie);
    }
    let mut location = format!("{}/account", config.public_base_url);
    if let Some(error) = failure {
        location.push_str(&format!("?auth_error={error}"));
    }
    response.insert_header((header::LOCATION, location));
    Ok(response.finish())
}

#[cfg_attr(feature = "swagger", utoipa::path(
    get,
    path = "/api/v1/auth/session",
    tag = "auth",
    responses(
        (status = 200, description = "Current commenter identity", body = CommenterSessionResponse)
    )
))]
#[get("/auth/session")]
pub async fn show_session(
    commenter: OptionalCommenter,
    config: web::Data<Config>,
) -> Result<HttpResponse, AppError> {
    let body = match (commenter.identity, commenter.profile) {
        (Some(identity), Some(profile)) => signed_in(identity, profile, &config),
        _ => CommenterSessionResponse::signed_out(available_providers(&config)),
    };
    Ok(HttpResponse::Ok()
        .insert_header((header::CACHE_CONTROL, "no-store"))
        .json(body))
}

fn signed_in(
    identity: CommenterIdentity,
    profile: CommenterProfile,
    config: &Config,
) -> CommenterSessionResponse {
    CommenterSessionResponse {
        authenticated: true,
        identity: Some(CommenterIdentity {
            name: profile.display_name.clone(),
            avatar_url: profile.avatar_url.clone(),
            ..identity
        }),
        profile: Some(profile),
        providers: Some(available_providers(config)),
    }
}

/// GitHub is listed first: it is the sign-in most readers of this site already use.
fn available_providers(config: &Config) -> Vec<String> {
    ["github", "google"]
        .into_iter()
        .filter(|provider| config.oauth_provider(provider).is_some())
        .map(str::to_owned)
        .collect()
}

#[cfg_attr(feature = "swagger", utoipa::path(
    delete,
    path = "/api/v1/auth/session",
    tag = "auth",
    responses(
        (status = 200, description = "Commenter session cleared", body = CommenterSessionResponse)
    )
))]
#[delete("/auth/session")]
pub async fn clear_session(
    db: web::Data<Db>,
    config: web::Data<Config>,
    request: HttpRequest,
) -> Result<HttpResponse, AppError> {
    crate::auth::same_origin_check(&request)?;
    if let Some(token) = cookie_token(&request, crate::auth::COMMENTER_SESSION_COOKIE) {
        db.delete_session(&crate::auth::hash_token(&token)).await?;
    }
    Ok(signed_out_response(&config))
}

fn signed_out_response(config: &Config) -> HttpResponse {
    HttpResponse::Ok()
        .insert_header((header::CACHE_CONTROL, "no-store"))
        .cookie(commenter_expired_cookie(config))
        .json(CommenterSessionResponse::signed_out(available_providers(
            config,
        )))
}

const PROFILE_WRITES_PER_HOUR: usize = 30;

fn check_profile_rate(limiter: &RateLimiter, profile_id: &str) -> Result<(), AppError> {
    if limiter.check(
        &format!("profile:{profile_id}"),
        PROFILE_WRITES_PER_HOUR,
        std::time::Duration::from_secs(3600),
    ) {
        Ok(())
    } else {
        Err(AppError::TooManyRequests(
            "Too many profile changes. Try again later.".to_owned(),
        ))
    }
}

#[cfg_attr(feature = "swagger", utoipa::path(
    patch,
    path = "/api/v1/auth/profile",
    tag = "auth",
    request_body = ProfileUpdate,
    responses(
        (status = 200, description = "Updated profile", body = CommenterSessionResponse),
        (status = 401, description = "Not signed in", body = crate::error::ErrorBody),
        (status = 409, description = "Display name taken", body = crate::error::ErrorBody),
        (status = 422, description = "Invalid display name", body = crate::error::ErrorBody)
    )
))]
#[patch("/auth/profile")]
pub async fn update_profile(
    db: web::Data<Db>,
    config: web::Data<Config>,
    limiter: web::Data<RateLimiter>,
    commenter: RequiredCommenter,
    payload: web::Json<ProfileUpdate>,
    request: HttpRequest,
) -> Result<HttpResponse, AppError> {
    crate::auth::same_origin_check(&request)?;
    let context = commenter.0;
    check_profile_rate(&limiter, &context.profile.id)?;
    let profile = db
        .update_profile(&context.profile.id, &context.identity.id, &payload)
        .await?;
    Ok(HttpResponse::Ok()
        .insert_header((header::CACHE_CONTROL, "no-store"))
        .json(signed_in(context.identity, profile, &config)))
}

#[cfg_attr(feature = "swagger", utoipa::path(
    delete,
    path = "/api/v1/auth/identities/{identity_id}",
    tag = "auth",
    params(("identity_id" = String, Path, description = "Connected account to disconnect")),
    responses(
        (status = 200, description = "Updated profile", body = CommenterSessionResponse),
        (status = 409, description = "Last or current account", body = crate::error::ErrorBody)
    )
))]
#[delete("/auth/identities/{identity_id}")]
pub async fn unlink_identity(
    db: web::Data<Db>,
    config: web::Data<Config>,
    limiter: web::Data<RateLimiter>,
    commenter: RequiredCommenter,
    path: web::Path<String>,
    request: HttpRequest,
) -> Result<HttpResponse, AppError> {
    crate::auth::same_origin_check(&request)?;
    let context = commenter.0;
    check_profile_rate(&limiter, &context.profile.id)?;
    let profile = db
        .unlink_account(
            &context.profile.id,
            &context.identity.id,
            &path.into_inner(),
            |provider, subject| config.admin_identity_allowed(provider, subject),
        )
        .await?;
    Ok(HttpResponse::Ok()
        .insert_header((header::CACHE_CONTROL, "no-store"))
        .json(signed_in(context.identity, profile, &config)))
}

#[cfg_attr(feature = "swagger", utoipa::path(
    delete,
    path = "/api/v1/auth/sessions",
    tag = "auth",
    responses((status = 200, description = "Signed out on every device", body = CommenterSessionResponse))
))]
#[delete("/auth/sessions")]
pub async fn clear_sessions(
    db: web::Data<Db>,
    config: web::Data<Config>,
    commenter: RequiredCommenter,
    request: HttpRequest,
) -> Result<HttpResponse, AppError> {
    crate::auth::same_origin_check(&request)?;
    db.delete_profile_sessions(&commenter.0.profile.id).await?;
    Ok(signed_out_response(&config))
}

#[cfg_attr(feature = "swagger", utoipa::path(
    get,
    path = "/api/v1/auth/profile/export",
    tag = "auth",
    responses((status = 200, description = "Profile and comments as JSON"))
))]
#[get("/auth/profile/export")]
pub async fn export_profile(
    db: web::Data<Db>,
    commenter: RequiredCommenter,
) -> Result<HttpResponse, AppError> {
    let data = db.export_profile(&commenter.0.profile.id).await?;
    Ok(HttpResponse::Ok()
        .insert_header((header::CACHE_CONTROL, "no-store"))
        .insert_header((
            header::CONTENT_DISPOSITION,
            "attachment; filename=\"voidreg-profile.json\"",
        ))
        .json(data))
}

#[cfg_attr(feature = "swagger", utoipa::path(
    delete,
    path = "/api/v1/auth/profile",
    tag = "auth",
    params(ProfileDeleteQuery),
    responses(
        (status = 200, description = "Profile deleted", body = CommenterSessionResponse),
        (status = 403, description = "Owner or moderated accounts", body = crate::error::ErrorBody)
    )
))]
#[delete("/auth/profile")]
pub async fn delete_profile(
    db: web::Data<Db>,
    config: web::Data<Config>,
    limiter: web::Data<RateLimiter>,
    commenter: RequiredCommenter,
    query: web::Query<ProfileDeleteQuery>,
    request: HttpRequest,
) -> Result<HttpResponse, AppError> {
    crate::auth::same_origin_check(&request)?;
    let context = commenter.0;
    check_profile_rate(&limiter, &context.profile.id)?;
    db.delete_profile(
        &context.profile.id,
        query.remove_comments,
        |provider, subject| config.admin_identity_allowed(provider, subject),
    )
    .await?;
    Ok(signed_out_response(&config))
}

struct OAuthProfile {
    subject: String,
    email: String,
    /// True only when the provider vouches for the email, so it may link profiles.
    email_verified: bool,
    name: String,
    avatar_url: Option<String>,
}

fn oauth_unavailable(provider: &str) -> AppError {
    AppError::ServiceUnavailable(format!(
        "OAuth provider '{provider}' is not configured; set its client id and secret to enable sign-in"
    ))
}

fn apply_oauth_cookies(
    response: &mut actix_web::HttpResponseBuilder,
    config: &Config,
    state: &str,
    verifier: Option<&str>,
) {
    response.cookie(oauth_state_cookie(config, state));
    if let Some(verifier) = verifier {
        response.cookie(oauth_verifier_cookie(config, verifier));
    }
}

fn redirect_after_failure(
    config: &Config,
    purpose: &str,
    message: &str,
    account: Option<&str>,
) -> Result<HttpResponse, AppError> {
    let mut response = HttpResponse::Found();
    response.insert_header((header::CACHE_CONTROL, "no-store"));
    response.insert_header((header::REFERRER_POLICY, "no-referrer"));
    for cookie in expired_oauth_cookies(config) {
        response.cookie(cookie);
    }
    if purpose == "admin" {
        response.cookie(crate::auth::expired_cookie(
            crate::auth::ADMIN_SESSION_COOKIE,
            config,
        ));
        response.cookie(crate::auth::expired_cookie(
            crate::auth::ADMIN_CSRF_COOKIE,
            config,
        ));
    }
    let redirect = format!(
        "{}?auth_error={}",
        if purpose == "admin" {
            format!("{}/admin/", config.public_base_url)
        } else {
            config.commenter_redirect()
        },
        urlencode(message)
    );
    let redirect = match account {
        Some(account) => format!("{redirect}&account={}", urlencode(account)),
        None => redirect,
    };
    response.insert_header((header::LOCATION, redirect.as_str()));
    Ok(response.finish())
}

async fn exchange_google(
    config: &Config,
    code: &str,
    verifier: Option<&str>,
) -> Result<String, AppError> {
    let (client_id, client_secret) = config
        .oauth_provider("google")
        .ok_or_else(|| oauth_unavailable("google"))?;
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(15))
        .build()
        .map_err(|err| AppError::Internal(err.to_string()))?;
    let mut form = vec![
        ("code", code.to_owned()),
        ("client_id", client_id.to_owned()),
        ("client_secret", client_secret.to_owned()),
        ("redirect_uri", config.oauth_redirect_uri("google")),
        ("grant_type", "authorization_code".to_owned()),
    ];
    if let Some(verifier) = verifier {
        form.push(("code_verifier", verifier.to_owned()));
    }
    let response = client
        .post(GOOGLE_TOKEN_URL)
        .form(&form)
        .send()
        .await
        .map_err(|err| AppError::Internal(format!("google token request failed: {err}")))?;
    let body: Value = response
        .json()
        .await
        .map_err(|err| AppError::Internal(format!("google token response invalid: {err}")))?;
    body.get("access_token")
        .and_then(Value::as_str)
        .map(str::to_owned)
        .ok_or_else(|| AppError::Internal("google token response missing access_token".to_owned()))
}

async fn fetch_google_profile(access_token: &str) -> Result<OAuthProfile, AppError> {
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(15))
        .build()
        .map_err(|err| AppError::Internal(err.to_string()))?;
    let profile: Value = client
        .get(GOOGLE_USERINFO_URL)
        .bearer_auth(access_token)
        .send()
        .await
        .map_err(|err| AppError::Internal(format!("google profile request failed: {err}")))?
        .error_for_status()
        .map_err(|err| AppError::Internal(format!("google profile rejected: {err}")))?
        .json()
        .await
        .map_err(|err| AppError::Internal(format!("google profile invalid: {err}")))?;
    if profile["email_verified"] != true {
        return Err(AppError::Unauthorized(
            "Google email is not verified".to_owned(),
        ));
    }
    Ok(OAuthProfile {
        subject: json_string(&profile, "sub")
            .ok_or_else(|| AppError::Internal("google profile missing subject".to_owned()))?,
        email: json_string(&profile, "email").unwrap_or_default(),
        email_verified: true,
        name: json_string(&profile, "name").unwrap_or_default(),
        avatar_url: json_string(&profile, "picture"),
    })
}

async fn exchange_github(config: &Config, code: &str, verifier: &str) -> Result<String, AppError> {
    let (client_id, client_secret) = config
        .oauth_provider("github")
        .ok_or_else(|| oauth_unavailable("github"))?;
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(15))
        .build()
        .map_err(|err| AppError::Internal(err.to_string()))?;
    let response = client
        .post(GITHUB_TOKEN_URL)
        .header(reqwest::header::ACCEPT, "application/json")
        .form(&[
            ("client_id", client_id),
            ("client_secret", client_secret),
            ("code", code),
            ("code_verifier", verifier),
            ("redirect_uri", config.oauth_redirect_uri("github").as_str()),
        ])
        .send()
        .await
        .map_err(|err| AppError::Internal(format!("github token request failed: {err}")))?;
    let body: Value = response
        .json()
        .await
        .map_err(|err| AppError::Internal(format!("github token response invalid: {err}")))?;
    body.get("access_token")
        .and_then(Value::as_str)
        .map(str::to_owned)
        .ok_or_else(|| AppError::Internal("github token response missing access_token".to_owned()))
}

async fn fetch_github_profile(
    access_token: &str,
    include_email: bool,
) -> Result<OAuthProfile, AppError> {
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(15))
        .build()
        .map_err(|err| AppError::Internal(err.to_string()))?;
    let profile: Value = client
        .get(GITHUB_USER_URL)
        .bearer_auth(access_token)
        .header(reqwest::header::USER_AGENT, "voidreg-api")
        .header(reqwest::header::ACCEPT, "application/vnd.github+json")
        .send()
        .await
        .map_err(|err| AppError::Internal(format!("github profile request failed: {err}")))?
        .error_for_status()
        .map_err(|err| AppError::Internal(format!("github profile rejected: {err}")))?
        .json()
        .await
        .map_err(|err| AppError::Internal(format!("github profile invalid: {err}")))?;

    let subject = profile
        .get("id")
        .and_then(Value::as_u64)
        .map(|id| id.to_string())
        .ok_or_else(|| AppError::Internal("github profile missing subject".to_owned()))?;
    let public_email = json_string(&profile, "email").unwrap_or_default();
    let mut email = public_email.clone();
    let mut email_verified = false;
    if include_email {
        // Only an address GitHub marks verified may link accounts. A failed
        // lookup keeps sign-in working with the public address, unverified.
        let emails: Option<Value> = async {
            client
                .get(GITHUB_EMAILS_URL)
                .bearer_auth(access_token)
                .header(reqwest::header::USER_AGENT, "voidreg-api")
                .header(reqwest::header::ACCEPT, "application/vnd.github+json")
                .send()
                .await
                .ok()?
                .error_for_status()
                .ok()?
                .json()
                .await
                .ok()
        }
        .await;
        if let Some((address, verified)) = emails.as_ref().and_then(github_email) {
            email = address;
            email_verified = verified;
        }
    }

    Ok(OAuthProfile {
        subject,
        email,
        email_verified,
        name: json_string(&profile, "name")
            .or_else(|| json_string(&profile, "login"))
            .unwrap_or_else(|| "GitHub user".to_owned()),
        avatar_url: json_string(&profile, "avatar_url"),
    })
}

/// Picks the primary verified address, else any verified one, else the primary.
fn github_email(emails: &Value) -> Option<(String, bool)> {
    let entries = emails.as_array()?;
    let flag = |entry: &Value, key: &str| entry.get(key).and_then(Value::as_bool).unwrap_or(false);
    let address = |entry: &Value| {
        entry
            .get("email")
            .and_then(Value::as_str)
            .map(str::to_owned)
    };
    entries
        .iter()
        .find(|e| flag(e, "primary") && flag(e, "verified"))
        .or_else(|| entries.iter().find(|e| flag(e, "verified")))
        .and_then(|e| address(e).map(|a| (a, true)))
        .or_else(|| {
            entries
                .iter()
                .find(|e| flag(e, "primary"))
                .and_then(|e| address(e).map(|a| (a, false)))
        })
}

fn json_string(value: &Value, key: &str) -> Option<String> {
    value
        .get(key)
        .and_then(Value::as_str)
        .map(str::to_owned)
        .filter(|v| !v.is_empty())
}

fn pkce_challenge(verifier: &str) -> String {
    let digest = Sha256::digest(verifier.as_bytes());
    URL_SAFE_NO_PAD.encode(digest)
}

fn urlencode(value: &str) -> String {
    let mut encoded = String::with_capacity(value.len());
    for byte in value.bytes() {
        match byte {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'_' | b'.' | b'~' => {
                encoded.push(byte as char);
            }
            other => encoded.push_str(&format!("%{other:02X}")),
        }
    }
    encoded
}

#[cfg_attr(feature = "swagger", utoipa::path(
    get, path = "/api/v1/auth/providers", tag = "auth",
    responses((status = 200, description = "Configured commenter providers", body = Vec<String>))
))]
#[get("/auth/providers")]
pub async fn providers(config: web::Data<Config>) -> HttpResponse {
    HttpResponse::Ok().json(available_providers(&config))
}

#[cfg(test)]
mod admin_oauth_tests {
    use super::*;
    use actix_web::{cookie::Cookie, http::StatusCode, test};

    fn profile(subject: &str) -> OAuthProfile {
        OAuthProfile {
            subject: subject.to_owned(),
            email: "owner@example.com".to_owned(),
            email_verified: true,
            name: "Owner".to_owned(),
            avatar_url: None,
        }
    }
    async fn database() -> Db {
        let db = Db::memory().await.unwrap();
        db.migrate().await.unwrap();
        db
    }
    fn session_cookie(response: &HttpResponse) -> Cookie<'static> {
        response
            .cookies()
            .find(|c| c.name() == crate::auth::ADMIN_SESSION_COOKIE && !c.value().is_empty())
            .unwrap()
            .into_owned()
    }

    #[actix_web::test]
    async fn admin_requires_exact_provider_subject_and_issues_protected_session() {
        let db = database().await;
        let mut config = Config::for_test();
        config.admin_password_enabled = false;
        config.public_base_url = "https://www.voidreg.xyz".to_owned();
        config.admin_github_ids = vec!["141011344".to_owned()];
        for (provider, subject) in [("github", "other"), ("google", "141011344")] {
            let denied = finish_sign_in(&db, &config, provider, "admin", profile(subject))
                .await
                .unwrap();
            assert!(
                denied
                    .headers()
                    .get(header::LOCATION)
                    .unwrap()
                    .to_str()
                    .unwrap()
                    .contains("auth_error=not_authorized")
            );
            assert!(!denied.cookies().any(|c| c.name() == crate::auth::ADMIN_SESSION_COOKIE && !c.value().is_empty()));
        }
        let response = finish_sign_in(&db, &config, "github", "admin", profile("141011344"))
            .await
            .unwrap();
        assert_eq!(
            response.headers().get(header::LOCATION).unwrap(),
            "https://www.voidreg.xyz/admin/"
        );
        let session = session_cookie(&response);
        assert_eq!(session.secure(), Some(true));
        assert_eq!(session.http_only(), Some(true));
        let csrf = response
            .cookies()
            .find(|c| c.name() == crate::auth::ADMIN_CSRF_COOKIE)
            .unwrap()
            .value()
            .to_owned();
        let app = test::init_service(crate::app::build(db.clone(), config.clone())).await;
        let response = test::call_service(
            &app,
            test::TestRequest::get()
                .uri("/api/v1/admin/session")
                .cookie(session.clone())
                .to_request(),
        )
        .await;
        assert_eq!(response.status(), StatusCode::OK);
        let response = test::call_service(
            &app,
            test::TestRequest::delete()
                .uri("/api/v1/admin/session")
                .cookie(session.clone())
                .to_request(),
        )
        .await;
        assert_eq!(response.status(), StatusCode::FORBIDDEN);
        config.admin_github_ids.clear();
        let revoked = test::init_service(crate::app::build(db.clone(), config)).await;
        let response = test::call_service(
            &revoked,
            test::TestRequest::get()
                .uri("/api/v1/admin/session")
                .cookie(session.clone())
                .to_request(),
        )
        .await;
        assert_eq!(response.status(), StatusCode::FORBIDDEN);
        let response = test::call_service(
            &app,
            test::TestRequest::delete()
                .uri("/api/v1/admin/session")
                .cookie(session.clone())
                .insert_header(("X-CSRF-Token", csrf))
                .to_request(),
        )
        .await;
        assert_eq!(response.status(), StatusCode::OK);
        let response = test::call_service(
            &app,
            test::TestRequest::get()
                .uri("/api/v1/admin/session")
                .cookie(session)
                .to_request(),
        )
        .await;
        assert_eq!(response.status(), StatusCode::UNAUTHORIZED);
    }

    #[actix_web::test]
    async fn commenter_flow_never_grants_admin_even_for_allowlisted_account() {
        let db = database().await;
        let mut config = Config::for_test();
        config.admin_github_ids = vec!["141011344".to_owned()];
        let response = finish_sign_in(&db, &config, "github", "commenter", profile("141011344"))
            .await
            .unwrap();
        assert!(
            !response
                .cookies()
                .any(|c| c.name() == crate::auth::ADMIN_SESSION_COOKIE)
        );
        let cookie = response
            .cookies()
            .find(|c| c.name() == crate::auth::COMMENTER_SESSION_COOKIE)
            .unwrap()
            .into_owned();
        let app = test::init_service(crate::app::build(db, config)).await;
        let response = test::call_service(
            &app,
            test::TestRequest::get()
                .uri("/api/v1/admin/session")
                .cookie(cookie)
                .to_request(),
        )
        .await;
        assert_eq!(response.status(), StatusCode::UNAUTHORIZED);
    }

    fn commenter_profile(subject: &str, email: &str, verified: bool) -> OAuthProfile {
        OAuthProfile {
            subject: subject.to_owned(),
            email: email.to_owned(),
            email_verified: verified,
            name: "Ada".to_owned(),
            avatar_url: None,
        }
    }

    #[actix_web::test]
    async fn commenter_sign_in_joins_verified_emails_and_lasts_the_commenter_ttl() {
        let db = database().await;
        let mut config = Config::for_test();
        config.commenter_session_ttl_hours = 720;
        let mut profiles = Vec::new();
        for (provider, subject, email, verified) in [
            ("github", "1", "ada@example.com", true),
            ("google", "g1", "Ada@Example.com", true),
            ("github", "2", "ada@example.com", false),
        ] {
            let response = finish_sign_in(
                &db,
                &config,
                provider,
                "commenter",
                commenter_profile(subject, email, verified),
            )
            .await
            .unwrap();
            let cookie = response
                .cookies()
                .find(|c| c.name() == crate::auth::COMMENTER_SESSION_COOKIE)
                .unwrap();
            assert_eq!(
                cookie.max_age(),
                Some(actix_web::cookie::time::Duration::hours(720))
            );
            let identity = db.find_identity(provider, subject).await.unwrap().unwrap();
            profiles.push(
                db.profile_id_for_identity(&identity.id)
                    .await
                    .unwrap()
                    .unwrap(),
            );
        }
        assert_eq!(profiles[0], profiles[1]);
        assert_ne!(profiles[0], profiles[2]);
    }

    #[actix_web::test]
    async fn linking_while_signed_in_keeps_the_session_and_rejects_foreign_profiles() {
        let db = database().await;
        let config = Config::for_test();
        for (provider, subject, email) in [
            ("github", "1", "ada@example.com"),
            ("google", "g9", "grace@example.com"),
        ] {
            finish_sign_in(
                &db,
                &config,
                provider,
                "commenter",
                commenter_profile(subject, email, true),
            )
            .await
            .unwrap();
        }
        let github = db.find_identity("github", "1").await.unwrap().unwrap();
        let profile = db
            .profile_id_for_identity(&github.id)
            .await
            .unwrap()
            .unwrap();
        let linked = finish_link(
            &db,
            &config,
            "google",
            commenter_profile("g1", "other@example.com", true),
            &profile,
        )
        .await
        .unwrap();
        assert!(
            !linked
                .cookies()
                .any(|c| c.name() == crate::auth::COMMENTER_SESSION_COOKIE)
        );
        assert!(
            linked
                .headers()
                .get(header::LOCATION)
                .unwrap()
                .to_str()
                .unwrap()
                .ends_with("/account")
        );
        let google = db.find_identity("google", "g1").await.unwrap().unwrap();
        assert_eq!(
            db.profile_id_for_identity(&google.id).await.unwrap(),
            Some(profile.clone())
        );

        let stolen = finish_link(
            &db,
            &config,
            "google",
            commenter_profile("g9", "grace@example.com", true),
            &profile,
        )
        .await
        .unwrap();
        assert!(
            stolen
                .headers()
                .get(header::LOCATION)
                .unwrap()
                .to_str()
                .unwrap()
                .ends_with("/account?auth_error=already_linked")
        );
    }

    #[actix_web::test]
    async fn github_emails_link_only_when_the_provider_verified_them() {
        let verified = serde_json::json!([
            {"email": "old@example.com", "primary": false, "verified": true},
            {"email": "main@example.com", "primary": true, "verified": true}
        ]);
        assert_eq!(
            github_email(&verified),
            Some(("main@example.com".to_owned(), true))
        );
        let secondary = serde_json::json!([
            {"email": "main@example.com", "primary": true, "verified": false},
            {"email": "old@example.com", "primary": false, "verified": true}
        ]);
        assert_eq!(
            github_email(&secondary),
            Some(("old@example.com".to_owned(), true))
        );
        let none =
            serde_json::json!([{"email": "main@example.com", "primary": true, "verified": false}]);
        assert_eq!(
            github_email(&none),
            Some(("main@example.com".to_owned(), false))
        );
        assert_eq!(
            github_email(&serde_json::json!({"message": "Bad credentials"})),
            None
        );
    }

    #[actix_web::test]
    async fn disabling_password_rejects_login_and_existing_password_sessions() {
        let db = database().await;
        let (token, hash) = new_session_token();
        db.create_session(SESSION_KIND_ADMIN, &hash, None, 1)
            .await
            .unwrap();
        let mut config = Config::for_test();
        config.admin_password_enabled = false;
        let app = test::init_service(crate::app::build(db, config)).await;
        let response = test::call_service(
            &app,
            test::TestRequest::post()
                .uri("/api/v1/admin/session")
                .set_json(serde_json::json!({"password":"voidreg-test-admin"}))
                .to_request(),
        )
        .await;
        assert_eq!(response.status(), StatusCode::SERVICE_UNAVAILABLE);
        let response = test::call_service(
            &app,
            test::TestRequest::get()
                .uri("/api/v1/admin/session")
                .cookie(Cookie::new(crate::auth::ADMIN_SESSION_COOKIE, token))
                .to_request(),
        )
        .await;
        assert_eq!(response.status(), StatusCode::UNAUTHORIZED);
    }

    #[actix_web::test]
    async fn oauth_purpose_is_state_bound_and_cancellation_clears_cookies() {
        let mut config = Config::for_test();
        config.github_client_id = Some("client".to_owned());
        config.github_client_secret = Some("secret".to_owned());
        let app = test::init_service(crate::app::build(database().await, config)).await;
        let response = test::call_service(
            &app,
            test::TestRequest::get()
                .uri("/api/v1/auth/github/start?purpose=admin")
                .to_request(),
        )
        .await;
        let cookies: Vec<_> = response
            .response()
            .cookies()
            .map(|c| c.into_owned())
            .collect();
        let state = cookies
            .iter()
            .find(|c| c.name() == OAUTH_STATE_COOKIE)
            .unwrap();
        assert!(state.value().starts_with("github:admin:"));
        let location = response
            .headers()
            .get(header::LOCATION)
            .unwrap()
            .to_str()
            .unwrap();
        assert!(location.contains("code_challenge_method=S256"));
        let uri = format!(
            "/api/v1/auth/github/callback?error=access_denied&state={}&purpose=commenter",
            urlencode(state.value())
        );
        let response = test::call_service(
            &app,
            test::TestRequest::get()
                .uri(&uri)
                .cookie(state.clone())
                .to_request(),
        )
        .await;
        assert!(
            response
                .headers()
                .get(header::LOCATION)
                .unwrap()
                .to_str()
                .unwrap()
                .contains("/admin/?auth_error=sign_in_cancelled")
        );
        assert!(
            response
                .response()
                .cookies()
                .filter(|c| c.name().starts_with("voidreg_oauth_"))
                .all(|c| c.value().is_empty())
        );
        let response = test::call_service(
            &app,
            test::TestRequest::get()
                .uri("/api/v1/auth/github/start?purpose=superadmin")
                .to_request(),
        )
        .await;
        assert_eq!(response.status(), StatusCode::BAD_REQUEST);
    }
}

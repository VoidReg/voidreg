//! Request extractors for authenticated admin and commenter sessions.

use std::future::{Ready, ready};
use std::pin::Pin;

use actix_web::dev::Payload;
use actix_web::web::Data;
use actix_web::{FromRequest, HttpRequest};

use crate::auth::{
    ADMIN_SESSION_COOKIE, COMMENTER_SESSION_COOKIE, SESSION_KIND_ADMIN, SESSION_KIND_COMMENTER,
    cookie_token, csrf_check, hash_token,
};
use crate::db::Db;
use crate::domain::{CommenterIdentity, CommenterProfile};
use crate::error::AppError;

/// Extracts a live admin session cookie or fails the request with 401.
/// Handlers call `validate` to check the session against the database, and
/// unsafe methods pass the CSRF double-submit check here.
pub struct AdminSession {
    pub token: String,
    config: crate::config::Config,
}

impl FromRequest for AdminSession {
    type Error = AppError;
    type Future = Ready<Result<Self, Self::Error>>;

    fn from_request(request: &HttpRequest, _payload: &mut Payload) -> Self::Future {
        ready(from_request_admin(request))
    }
}

fn from_request_admin(request: &HttpRequest) -> Result<AdminSession, AppError> {
    let token = cookie_token(request, ADMIN_SESSION_COOKIE)
        .ok_or_else(|| AppError::Unauthorized("admin authentication required".to_owned()))?;
    csrf_check(request)?;
    let config = request
        .app_data::<Data<crate::config::Config>>()
        .ok_or_else(|| AppError::Internal("missing authentication configuration".to_owned()))?
        .get_ref()
        .clone();
    Ok(AdminSession { token, config })
}

impl AdminSession {
    /// Verifies the session token against the database.
    pub async fn validate(&self, db: &Db) -> Result<(), AppError> {
        let session = db
            .get_live_session(&hash_token(&self.token))
            .await?
            .ok_or_else(|| AppError::Unauthorized("admin session expired".to_owned()))?;
        if session.kind != SESSION_KIND_ADMIN {
            return Err(AppError::Unauthorized("admin session required".to_owned()));
        }
        match session.identity_id {
            Some(id) => {
                let (provider, subject) = db.identity_subject(&id).await?.ok_or_else(|| {
                    AppError::Unauthorized("admin identity no longer exists".to_owned())
                })?;
                if !self.config.admin_identity_allowed(&provider, &subject) {
                    return Err(AppError::Forbidden(
                        "admin access is not allowed for this account".to_owned(),
                    ));
                }
            }
            None if !self.config.admin_auth_configured() => {
                return Err(AppError::Unauthorized(
                    "password sessions are disabled".to_owned(),
                ));
            }
            None => {}
        }
        Ok(())
    }
}

/// The commenter behind a live commenter session.
pub struct CommenterContext {
    pub token: String,
    pub identity: CommenterIdentity,
    pub profile: CommenterProfile,
}

async fn lookup_commenter(
    db: Option<Data<Db>>,
    token: Option<String>,
) -> Result<Option<CommenterContext>, AppError> {
    let (Some(db), Some(token)) = (db, token) else {
        return Ok(None);
    };
    let Some(session) = db.get_live_session(&hash_token(&token)).await? else {
        return Ok(None);
    };
    if session.kind != SESSION_KIND_COMMENTER {
        return Ok(None);
    }
    let Some(identity_id) = session.identity_id else {
        return Ok(None);
    };
    Ok(db
        .commenter_by_identity(&identity_id)
        .await?
        .map(|(identity, profile)| CommenterContext {
            token,
            identity,
            profile,
        }))
}

/// Extracts the commenter identity behind a valid commenter session, or None
/// for anonymous visitors. Never fails the request.
pub struct OptionalCommenter {
    pub identity: Option<CommenterIdentity>,
    pub profile: Option<CommenterProfile>,
}

impl FromRequest for OptionalCommenter {
    type Error = AppError;
    type Future = Pin<Box<dyn std::future::Future<Output = Result<Self, Self::Error>>>>;

    fn from_request(request: &HttpRequest, _payload: &mut Payload) -> Self::Future {
        let db = request.app_data::<Data<Db>>().cloned();
        let token = cookie_token(request, COMMENTER_SESSION_COOKIE);
        Box::pin(async move {
            let context = lookup_commenter(db, token).await?;
            Ok(match context {
                Some(context) => OptionalCommenter {
                    identity: Some(context.identity),
                    profile: Some(context.profile),
                },
                None => OptionalCommenter {
                    identity: None,
                    profile: None,
                },
            })
        })
    }
}

/// A signed-in commenter; anonymous requests fail with 401.
pub struct RequiredCommenter(pub CommenterContext);

impl FromRequest for RequiredCommenter {
    type Error = AppError;
    type Future = Pin<Box<dyn std::future::Future<Output = Result<Self, Self::Error>>>>;

    fn from_request(request: &HttpRequest, _payload: &mut Payload) -> Self::Future {
        let db = request.app_data::<Data<Db>>().cloned();
        let token = cookie_token(request, COMMENTER_SESSION_COOKIE);
        Box::pin(async move {
            lookup_commenter(db, token)
                .await?
                .map(RequiredCommenter)
                .ok_or_else(|| AppError::Unauthorized("sign in to manage your profile".to_owned()))
        })
    }
}

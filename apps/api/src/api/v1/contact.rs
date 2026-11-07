//! The contact form. Only the web app may call these routes: it holds `CONTACT_FORWARD_TOKEN`,
//! and nginx does not expose them publicly. The destination address (`CONTACT_TO_EMAIL`) lives
//! only in this service's environment and is never returned or logged.
use actix_web::{HttpRequest, post, web};

use crate::config::Config;
use crate::contact_form::{self, MIN_AGE_SECS};
use crate::db::Db;
use crate::db::contact::ContactAdmission;
use crate::domain::{ContactFormResponse, ContactRequest, ContactResponse};
use crate::error::AppError;
use crate::mail;
use crate::util::{constant_time_eq, sha256_hex};

const MAX_NAME: usize = 120;
const MAX_MESSAGE: usize = 5000;
const MIN_MESSAGE: usize = 5;
const MAX_LINKS: usize = 2;

fn now() -> i64 {
    time::OffsetDateTime::now_utc().unix_timestamp()
}

/// Only the web app, holding the shared token, may use the contact routes. Everyone else sees an
/// ordinary 404, exactly as if the routes did not exist.
fn require_web_app(config: &Config, request: &HttpRequest) -> Result<(), AppError> {
    let expected = config.contact_forward_token.as_deref();
    let given = request
        .headers()
        .get("X-Contact-Forward")
        .and_then(|value| value.to_str().ok());
    match (expected, given) {
        (Some(expected), Some(given))
            if constant_time_eq(expected.as_bytes(), given.as_bytes()) =>
        {
            Ok(())
        }
        _ => Err(AppError::NotFound("not found".to_owned())),
    }
}

#[cfg_attr(feature = "swagger", utoipa::path(
    post,
    path = "/api/v1/contact/form",
    tag = "contact",
    responses(
        (status = 200, description = "Short-lived form token", body = ContactFormResponse),
        (status = 404, description = "Not available to this caller", body = crate::error::ErrorBody)
    )
))]
#[post("/contact/form")]
pub async fn issue_contact_form(
    config: web::Data<Config>,
    request: HttpRequest,
) -> Result<web::Json<ContactFormResponse>, AppError> {
    require_web_app(&config, &request)?;
    let secret = config
        .contact_form_secret
        .as_deref()
        .ok_or_else(|| AppError::NotFound("not found".to_owned()))?;
    Ok(web::Json(ContactFormResponse {
        token: contact_form::issue(secret, now()),
        min_seconds: MIN_AGE_SECS,
    }))
}

#[cfg_attr(feature = "swagger", utoipa::path(
    post,
    path = "/api/v1/contact",
    tag = "contact",
    request_body = ContactRequest,
    responses(
        (status = 200, description = "Message accepted", body = ContactResponse),
        (status = 404, description = "Not available to this caller", body = crate::error::ErrorBody),
        (status = 422, description = "Invalid payload", body = crate::error::ErrorBody),
        (status = 429, description = "Too many messages", body = crate::error::ErrorBody)
    )
))]
#[post("/contact")]
pub async fn create_contact(
    db: web::Data<Db>,
    config: web::Data<Config>,
    request: HttpRequest,
    body: web::Bytes,
) -> Result<web::Json<ContactResponse>, AppError> {
    // Authenticate before looking at the body, so strangers learn nothing from error shapes.
    require_web_app(&config, &request)?;
    let payload: ContactRequest = serde_json::from_slice(&body)
        .map_err(|_| AppError::Unprocessable("Fill in every field.".to_owned()))?;
    let received = || Ok(web::Json(ContactResponse { status: "received" }));

    // A filled honeypot is a script. Answer as if it worked so it learns nothing, and do nothing.
    if !payload.website.trim().is_empty() {
        tracing::info!("contact submission dropped: honeypot filled");
        return received();
    }

    let secret = config
        .contact_form_secret
        .as_deref()
        .ok_or_else(|| AppError::NotFound("not found".to_owned()))?;
    // One generic answer for every token problem, so the checks cannot be probed one by one.
    if contact_form::verify(secret, &payload.form_token, now()).is_err() {
        return Err(AppError::Unprocessable(
            "This form was sent too quickly or has expired. Wait a moment and try again, or reload the page.".to_owned(),
        ));
    }

    let name = payload
        .name
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ");
    let email = payload.email.trim();
    let message = payload.message.replace("\r\n", "\n");
    let message = message.trim();

    if name.is_empty() || name.chars().count() > MAX_NAME || name.chars().any(char::is_control) {
        return Err(AppError::Unprocessable(
            "Enter a name of up to 120 characters.".to_owned(),
        ));
    }
    if !is_valid_email(email) {
        return Err(AppError::Unprocessable(
            "Enter a valid email address.".to_owned(),
        ));
    }
    let length = message.chars().count();
    if !(MIN_MESSAGE..=MAX_MESSAGE).contains(&length) {
        return Err(AppError::Unprocessable(format!(
            "Write a message between {MIN_MESSAGE} and {MAX_MESSAGE} characters."
        )));
    }
    if link_count(message) > MAX_LINKS {
        return Err(AppError::Unprocessable(
            "Messages can include at most two links.".to_owned(),
        ));
    }

    let source = source_hash(&config, &request);
    let fingerprint = sha256_hex(
        format!(
            "{}|{}",
            email.to_lowercase(),
            message
                .split_whitespace()
                .collect::<Vec<_>>()
                .join(" ")
                .to_lowercase()
        )
        .as_bytes(),
    );
    let attempt = match db.admit_contact(&source, &fingerprint, now()).await? {
        ContactAdmission::Admitted(id) => id,
        ContactAdmission::Duplicate => return received(),
        ContactAdmission::RateLimited => {
            return Err(AppError::TooManyRequests(
                "Too many messages from this connection. Please try again later.".to_owned(),
            ));
        }
    };

    // Keep the message first, so an email outage never loses it.
    db.insert_contact(&name, email, message).await?;
    let outcome = match mail::send_contact(&config, &attempt, &name, email, message).await {
        Ok(true) => "delivered",
        Ok(false) => "skipped",
        Err(error) => {
            tracing::error!(%error, "contact message stored but not emailed");
            "failed"
        }
    };
    db.set_contact_outcome(&attempt, outcome).await?;
    received()
}

/// Salted hash of the visitor's address as forwarded by the web app. Raw addresses are not stored.
fn source_hash(config: &Config, request: &HttpRequest) -> String {
    let address = request
        .headers()
        .get("X-Contact-Client")
        .and_then(|value| value.to_str().ok())
        .and_then(|value| value.trim().parse::<std::net::IpAddr>().ok())
        .map(|ip| ip.to_string())
        .unwrap_or_else(|| "unknown".to_owned());
    sha256_hex(format!("{}:contact:{address}", config.comment_ip_salt).as_bytes())
}

fn link_count(message: &str) -> usize {
    let lower = message.to_lowercase();
    ["http://", "https://", "www."]
        .iter()
        .map(|needle| lower.matches(needle).count())
        .sum()
}

pub fn is_valid_email(email: &str) -> bool {
    if email.len() > 254
        || email.contains(|c: char| c.is_whitespace() || c.is_control() || "<>\",;".contains(c))
    {
        return false;
    }
    let Some((local, domain)) = email.split_once('@') else {
        return false;
    };
    !local.is_empty()
        && !domain.is_empty()
        && !domain.contains('@')
        && domain.contains('.')
        && !domain.starts_with('.')
        && !domain.ends_with('.')
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn email_validation_rejects_injection_and_oddities() {
        assert!(is_valid_email("ada@example.com"));
        for bad in [
            "",
            "ada",
            "ada@",
            "@example.com",
            "ada@example",
            "ada@@example.com",
            "ada@example.com\nBcc:x@y.z",
            "a da@example.com",
            "ada@example.com,eve@example.com",
            "<ada@example.com>",
        ] {
            assert!(!is_valid_email(bad), "{bad}");
        }
    }

    #[test]
    fn links_are_counted_across_schemes() {
        assert_eq!(link_count("no links here"), 0);
        assert_eq!(
            link_count("see https://a.test and HTTP://b.test and www.c.test"),
            3
        );
    }
}

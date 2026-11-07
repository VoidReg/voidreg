use serde_json::json;

use crate::config::Config;
use crate::error::AppError;

const RESEND_URL: &str = "https://api.resend.com/emails";

/// Removes control characters (so no header or line can be injected) and caps the length.
fn single_line(value: &str, max: usize) -> String {
    value
        .chars()
        .map(|c| if c.is_control() { ' ' } else { c })
        .collect::<String>()
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ")
        .chars()
        .take(max)
        .collect()
}

/// The notification mail for a contact message. Plain text only, and the sender's address is a
/// reply-to, never the From address.
pub fn contact_mail(
    config: &Config,
    name: &str,
    reply_to: &str,
    message: &str,
) -> serde_json::Value {
    let name = single_line(name, 80);
    let reply_to = single_line(reply_to, 254);
    json!({
        "from": config.resend_from(),
        "to": [config.contact_to_email.as_str()],
        "reply_to": reply_to,
        "subject": format!("Contact form: {name}"),
        "text": format!("From: {name} <{reply_to}>\n\n{message}"),
    })
}

/// Sends the notification. `key` makes a retried request idempotent at Resend.
pub async fn send_contact(
    config: &Config,
    key: &str,
    name: &str,
    reply_to: &str,
    message: &str,
) -> Result<bool, AppError> {
    if config.skips_outbound_mail() {
        return Ok(false);
    }

    let client = reqwest::Client::builder()
        .user_agent("voidreg-api/0.1")
        .timeout(std::time::Duration::from_secs(20))
        .build()
        .map_err(|err| AppError::Internal(err.to_string()))?;

    let response = client
        .post(RESEND_URL)
        .bearer_auth(&config.resend_api_key)
        .header("Idempotency-Key", format!("voidreg-contact-{key}"))
        .json(&contact_mail(config, name, reply_to, message))
        .send()
        .await
        .map_err(|err| AppError::Internal(err.to_string()))?;

    let status = response.status();
    if !status.is_success() {
        let _ = response.text().await;
        tracing::error!(status = %status, "contact email send failed");
        return Err(AppError::Internal(
            "failed to send contact email".to_owned(),
        ));
    }

    Ok(true)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn mail_never_carries_line_breaks_in_headers_and_replies_to_the_sender() {
        let config = Config::for_test();
        let mail = contact_mail(
            &config,
            "Ada\r\nBcc: spam@example.com",
            "ada@example.com\nBcc: x@example.com",
            "Hello\nthere",
        );
        let subject = mail["subject"].as_str().unwrap();
        assert!(!subject.contains('\n') && !subject.contains('\r'));
        assert_eq!(subject, "Contact form: Ada Bcc: spam@example.com");
        let reply = mail["reply_to"].as_str().unwrap();
        assert!(!reply.contains('\n'));
        assert_eq!(mail["to"][0], "admin@example.com");
        assert!(mail["from"].as_str().unwrap().starts_with("Voidreg <form@"));
        assert!(mail.get("html").is_none());
    }
}

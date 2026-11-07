//! The contact form is reachable only through the web app, and it resists scripted abuse.
use actix_web::http::StatusCode;
use actix_web::test::{self, TestRequest};
use serde_json::{Value, json};
use voidreg_api::app::build;
use voidreg_api::config::Config;
use voidreg_api::contact_form;
use voidreg_api::db::Db;
use voidreg_api::db::contact::{GLOBAL_PER_DAY, SOURCE_PER_HOUR};

fn now() -> i64 {
    time::OffsetDateTime::now_utc().unix_timestamp()
}

async fn db() -> Db {
    let db = Db::memory().await.unwrap();
    db.migrate().await.unwrap();
    db
}

/// A token for a form that has been open long enough to be sent.
fn token(config: &Config) -> String {
    contact_form::issue(config.contact_form_secret.as_deref().unwrap(), now() - 30)
}

fn body(config: &Config, message: &str) -> Value {
    json!({
        "name": "Ada Lovelace",
        "email": "ada@example.com",
        "message": message,
        "form_token": token(config),
    })
}

fn post(config: &Config, client: &str, payload: Value) -> actix_web::test::TestRequest {
    TestRequest::post()
        .uri("/api/v1/contact")
        .insert_header((
            "X-Contact-Forward",
            config.contact_forward_token.clone().unwrap(),
        ))
        .insert_header(("X-Contact-Client", client.to_owned()))
        .set_json(payload)
}

#[actix_web::test]
async fn only_the_web_app_can_reach_the_routes() {
    let config = Config::for_test();
    let app = test::init_service(build(db().await, config.clone())).await;

    for builder in [
        TestRequest::post().uri("/api/v1/contact/form"),
        TestRequest::post().uri("/api/v1/contact"),
        TestRequest::post()
            .uri("/api/v1/contact")
            .insert_header(("X-Contact-Forward", "wrong")),
    ] {
        let resp = test::call_service(&app, builder.set_json(json!({})).to_request()).await;
        assert_eq!(resp.status(), StatusCode::NOT_FOUND);
    }

    let issued: Value = test::call_and_read_body_json(
        &app,
        TestRequest::post()
            .uri("/api/v1/contact/form")
            .insert_header(("X-Contact-Forward", "test-forward-token"))
            .to_request(),
    )
    .await;
    assert!(issued["token"].as_str().unwrap().contains('.'));
    assert_eq!(issued["min_seconds"], 3);
}

#[actix_web::test]
async fn unconfigured_forms_stay_closed() {
    let mut config = Config::for_test();
    config.contact_forward_token = None;
    let app = test::init_service(build(db().await, config.clone())).await;
    let resp = test::call_service(
        &app,
        TestRequest::post()
            .uri("/api/v1/contact/form")
            .insert_header(("X-Contact-Forward", "anything"))
            .to_request(),
    )
    .await;
    assert_eq!(resp.status(), StatusCode::NOT_FOUND);
}

#[actix_web::test]
async fn valid_messages_are_stored_and_invalid_ones_rejected() {
    let config = Config::for_test();
    let db = db().await;
    let app = test::init_service(build(db.clone(), config.clone())).await;

    let sent: Value = test::call_and_read_body_json(
        &app,
        post(
            &config,
            "203.0.113.5",
            body(&config, "Hello from the tests."),
        )
        .to_request(),
    )
    .await;
    assert_eq!(sent["status"], "received");
    // Test config skips outbound mail, and the message is stored regardless.
    assert_eq!(
        db.contact_summary().await.unwrap(),
        (1, vec!["skipped".into()])
    );

    let bad = [
        json!({"name":"","email":"ada@example.com","message":"Hello there","form_token":token(&config)}),
        json!({"name":"Ada","email":"not-an-email","message":"Hello there","form_token":token(&config)}),
        json!({"name":"Ada","email":"ada@example.com\nBcc: x@y.z","message":"Hello there","form_token":token(&config)}),
        json!({"name":"Ada","email":"ada@example.com","message":"hey","form_token":token(&config)}),
        json!({"name":"Ada","email":"ada@example.com","message":"x".repeat(5001),"form_token":token(&config)}),
        json!({"name":"Ada","email":"ada@example.com","message":"a https://a.test b https://b.test c www.c.test","form_token":token(&config)}),
    ];
    for payload in bad {
        let resp =
            test::call_service(&app, post(&config, "203.0.113.6", payload).to_request()).await;
        assert_eq!(resp.status(), StatusCode::UNPROCESSABLE_ENTITY);
    }
    assert_eq!(db.contact_summary().await.unwrap().0, 1);
}

#[actix_web::test]
async fn missing_forged_stale_and_hasty_tokens_are_refused() {
    let config = Config::for_test();
    let db = db().await;
    let app = test::init_service(build(db.clone(), config.clone())).await;
    let secret = config.contact_form_secret.as_deref().unwrap();

    for form_token in [
        String::new(),
        "garbage".to_owned(),
        contact_form::issue("some-other-secret", now() - 30),
        contact_form::issue(secret, now() - contact_form::MAX_AGE_SECS - 60),
        contact_form::issue(secret, now()),
    ] {
        let mut payload = body(&config, "Hello from the tests.");
        payload["form_token"] = form_token.into();
        let resp =
            test::call_service(&app, post(&config, "203.0.113.7", payload).to_request()).await;
        assert_eq!(resp.status(), StatusCode::UNPROCESSABLE_ENTITY);
    }
    assert_eq!(db.contact_summary().await.unwrap(), (0, vec![]));
}

#[actix_web::test]
async fn a_filled_honeypot_looks_like_success_but_stores_nothing() {
    let config = Config::for_test();
    let db = db().await;
    let app = test::init_service(build(db.clone(), config.clone())).await;
    let mut payload = body(&config, "Hello from a bot.");
    payload["website"] = "https://spam.example".into();
    let resp: Value =
        test::call_and_read_body_json(&app, post(&config, "203.0.113.8", payload).to_request())
            .await;
    assert_eq!(resp["status"], "received");
    assert_eq!(db.contact_summary().await.unwrap(), (0, vec![]));
}

#[actix_web::test]
async fn repeats_are_ignored_and_floods_are_limited_per_source() {
    let config = Config::for_test();
    let db = db().await;
    let app = test::init_service(build(db.clone(), config.clone())).await;

    // Sending the same message twice stores it once.
    for _ in 0..2 {
        let resp = test::call_service(
            &app,
            post(
                &config,
                "203.0.113.9",
                body(&config, "Exactly the same words."),
            )
            .to_request(),
        )
        .await;
        assert_eq!(resp.status(), StatusCode::OK);
    }
    assert_eq!(db.contact_summary().await.unwrap().0, 1);

    // Different messages from one source are capped per hour.
    for n in 1..SOURCE_PER_HOUR {
        let resp = test::call_service(
            &app,
            post(
                &config,
                "203.0.113.9",
                body(&config, &format!("Another message {n}")),
            )
            .to_request(),
        )
        .await;
        assert_eq!(resp.status(), StatusCode::OK);
    }
    let resp = test::call_service(
        &app,
        post(
            &config,
            "203.0.113.9",
            body(&config, "One message too many"),
        )
        .to_request(),
    )
    .await;
    assert_eq!(resp.status(), StatusCode::TOO_MANY_REQUESTS);

    // Another source is unaffected.
    let resp = test::call_service(
        &app,
        post(
            &config,
            "198.51.100.4",
            body(&config, "One message too many"),
        )
        .to_request(),
    )
    .await;
    assert_eq!(resp.status(), StatusCode::OK);
}

#[actix_web::test]
async fn the_site_wide_daily_cap_holds_even_across_many_sources() {
    let config = Config::for_test();
    let db = db().await;
    for n in 0..GLOBAL_PER_DAY {
        db.admit_contact(&format!("source-{n}"), &format!("fp-{n}"), now())
            .await
            .unwrap();
    }
    let app = test::init_service(build(db, config.clone())).await;
    let resp = test::call_service(
        &app,
        post(
            &config,
            "192.0.2.77",
            body(&config, "A perfectly polite message"),
        )
        .to_request(),
    )
    .await;
    assert_eq!(resp.status(), StatusCode::TOO_MANY_REQUESTS);
}

/// Serves one canned HTTP response per connection and returns each raw request it received.
async fn mock_resend(
    status: u16,
    requests: usize,
) -> (String, tokio::task::JoinHandle<Vec<String>>) {
    use tokio::io::{AsyncReadExt, AsyncWriteExt};
    let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
    let url = format!("http://{}/emails", listener.local_addr().unwrap());
    let handle = tokio::spawn(async move {
        let mut seen = Vec::new();
        for _ in 0..requests {
            let (mut socket, _) = listener.accept().await.unwrap();
            let mut data = Vec::new();
            let mut chunk = [0u8; 4096];
            loop {
                let n = socket.read(&mut chunk).await.unwrap();
                data.extend_from_slice(&chunk[..n]);
                let text = String::from_utf8_lossy(&data).to_string();
                if let Some(head_end) = text.find("\r\n\r\n") {
                    let length = text[..head_end]
                        .lines()
                        .find_map(|line| {
                            line.to_lowercase()
                                .strip_prefix("content-length:")
                                .and_then(|v| v.trim().parse::<usize>().ok())
                        })
                        .unwrap_or(0);
                    if data.len() >= head_end + 4 + length {
                        break;
                    }
                }
                if n == 0 {
                    break;
                }
            }
            seen.push(String::from_utf8_lossy(&data).to_string());
            let reply = format!(
                "HTTP/1.1 {status} X\r\ncontent-type: application/json\r\ncontent-length: 2\r\nconnection: close\r\n\r\n{{}}"
            );
            socket.write_all(reply.as_bytes()).await.unwrap();
            socket.shutdown().await.unwrap();
        }
        seen
    });
    (url, handle)
}

#[actix_web::test]
async fn messages_are_emailed_through_resend_and_failures_never_lose_them() {
    for (status, outcome) in [(200, "delivered"), (500, "failed")] {
        let (url, server) = mock_resend(status, 1).await;
        let mut config = Config::for_test();
        config.resend_api_key = "re_live_key".to_owned();
        config.resend_api_url = url;
        let db = db().await;
        let app = test::init_service(build(db.clone(), config.clone())).await;

        let resp: Value = test::call_and_read_body_json(
            &app,
            post(
                &config,
                "203.0.113.9",
                body(&config, "Please call me back."),
            )
            .to_request(),
        )
        .await;
        // The visitor sees success either way, because the message itself is kept.
        assert_eq!(resp["status"], "received");
        assert_eq!(
            db.contact_summary().await.unwrap(),
            (1, vec![outcome.into()])
        );

        let request = server.await.unwrap().remove(0);
        let lower = request.to_lowercase();
        assert!(lower.starts_with("post /emails "));
        assert!(lower.contains("authorization: bearer re_live_key"));
        assert!(lower.contains("idempotency-key: voidreg-contact-"));
        let payload: Value =
            serde_json::from_str(request.split("\r\n\r\n").nth(1).unwrap()).unwrap();
        assert_eq!(payload["to"][0], "admin@example.com");
        assert_eq!(payload["reply_to"], "ada@example.com");
        assert!(
            payload["text"]
                .as_str()
                .unwrap()
                .contains("Please call me back.")
        );
    }
}

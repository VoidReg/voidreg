use actix_web::{cookie::Cookie, http::StatusCode, test};
use serde_json::{Value, json};
use voidreg_api::{
    app::build,
    config::Config,
    db::{
        Db, NewComment,
        moderation::{BlockInput, ModerationQuery},
    },
    error::AppError,
};

fn input<'a>(source: &'a str, user: Option<&'a str>, body: &'a str) -> NewComment<'a> {
    NewComment {
        article_slug: "discussion",
        identity_id: user,
        author_name: "Reader",
        body,
        status: if user.is_some() {
            "approved"
        } else {
            "pending"
        },
        ip_hash: source,
        parent_id: None,
        thread_id: None,
    }
}
async fn fixture() -> Db {
    let db = Db::memory().await.unwrap();
    db.migrate().await.unwrap();
    db.insert_article(voidreg_api::db::ArticleFields {
        meta: Default::default(),
        revision: 1,
        slug: "discussion".into(),
        title: "Discussion".into(),
        category: "Systems".into(),
        summary: "A test discussion".into(),
        status: "published".into(),
        featured: false,
        sort_order: 0,
        published_at: Some("2026-10-15T00:00:00Z".into()),
        reading_time_minutes: None,
        sections: "[]".into(),
        document: String::new(),
        document_version: 0,
        compiled: String::new(),
        content_hash: String::new(),
    })
    .await
    .unwrap();
    db
}

#[actix_web::test]
async fn durable_quota_duplicate_honeypot_and_link_quarantine() {
    let db = fixture().await;
    let config = Config::for_test();
    let source = "a".repeat(64);
    assert!(
        db.admit_comment(input(&source, None, "Question"), false, &config)
            .await
            .unwrap()
            .is_some()
    );
    assert!(matches!(
        db.admit_comment(input(&source, None, " Question  "), false, &config)
            .await,
        Err(AppError::CommentRateLimited(600))
    ));
    assert!(
        db.admit_comment(input(&source, None, "Bot"), true, &config)
            .await
            .unwrap()
            .is_none()
    );
    assert!(matches!(
        db.admit_comment(input(&source, None, "Third"), false, &config)
            .await,
        Err(AppError::CommentRateLimited(3600))
    ));
    let user = db
        .upsert_identity("github", "spamtest", "user@example.test", "User", None)
        .await
        .unwrap();
    let c = db
        .admit_comment(
            input(
                &"b".repeat(64),
                Some(&user.id),
                "https://a.test https://b.test http://c.test https://d.test",
            ),
            false,
            &config,
        )
        .await
        .unwrap()
        .unwrap();
    assert_eq!(c.status, "spam");
    let public = db
        .public_comment_page("discussion", None, 1, 20)
        .await
        .unwrap();
    assert_eq!(public["total"], 0);
    let events = db
        .moderation_page("events", &ModerationQuery::default())
        .await
        .unwrap();
    assert!(events["total"].as_i64().unwrap() >= 4);
    let users = db
        .moderation_page("users", &ModerationQuery::default())
        .await
        .unwrap();
    assert!(users["items"][0]["last_seen"].is_number());
    let associated = db
        .moderation_page(
            "users",
            &ModerationQuery {
                source: Some("b".repeat(64)),
                ..Default::default()
            },
        )
        .await
        .unwrap();
    assert_eq!(associated["total"], 1);
    let unrelated = db
        .moderation_page(
            "users",
            &ModerationQuery {
                source: Some("f".repeat(64)),
                ..Default::default()
            },
        )
        .await
        .unwrap();
    assert_eq!(unrelated["total"], 0);
}

#[actix_web::test]
async fn block_hides_history_preserves_other_replies_and_requires_review() {
    let db = fixture().await;
    let config = Config::for_test();
    let source = "c".repeat(64);
    let other = "d".repeat(64);
    let user = db
        .upsert_identity(
            "github",
            "blocked",
            "user@example.test",
            "Blocked User",
            None,
        )
        .await
        .unwrap();
    let reader = db
        .upsert_identity(
            "github",
            "other",
            "other@example.test",
            "Other Reader",
            None,
        )
        .await
        .unwrap();
    let root = db
        .admit_comment(input(&source, Some(&user.id), "Root"), false, &config)
        .await
        .unwrap()
        .unwrap();
    let mut reply = input(&other, Some(&reader.id), "Another reader's reply");
    reply.parent_id = Some(&root.id);
    let child = db
        .admit_comment(reply, false, &config)
        .await
        .unwrap()
        .unwrap();
    let block = db
        .block_comments(
            &BlockInput {
                kind: "user".into(),
                target: user.id.clone(),
                reason: "Repeated spam".into(),
                hours: None,
            },
            "test-admin",
        )
        .await
        .unwrap();
    let public = db
        .public_comment_page("discussion", None, 1, 20)
        .await
        .unwrap();
    assert_eq!(public["items"][0]["removed"], true);
    assert_eq!(public["items"][0]["body"], "");
    assert!(public["items"][0].get("source").is_none());
    assert!(public["items"][0].get("identity_id").is_none());
    assert!(public["items"][0].get("email").is_none());
    assert_eq!(public["items"][0]["author_name"], "Hidden comment");
    let replies = db
        .public_comment_page("discussion", Some(&root.id), 1, 20)
        .await
        .unwrap();
    assert_eq!(replies["items"][0]["id"], child.id);
    assert!(matches!(
        db.admit_comment(input(&other, Some(&user.id), "New IP"), false, &config)
            .await,
        Err(AppError::Forbidden(_))
    ));
    assert!(
        db.moderate_comment(&root.id, "approve", "test-admin", "")
            .await
            .is_err()
    );
    db.revoke_comment_block(block["id"].as_str().unwrap(), "test-admin")
        .await
        .unwrap();
    assert_eq!(
        db.get_comment(&root.id).await.unwrap().unwrap().status,
        "hidden"
    );
    db.moderate_comment(&root.id, "restore", "test-admin", "Reviewed")
        .await
        .unwrap();
    assert_eq!(
        db.get_comment(&root.id).await.unwrap().unwrap().status,
        "pending"
    );
    db.moderate_comment(&root.id, "approve", "test-admin", "Reviewed")
        .await
        .unwrap();
    assert_eq!(
        db.public_comment_page("discussion", None, 1, 20)
            .await
            .unwrap()["items"][0]["body"],
        "Root"
    );
    let sources = db
        .moderation_page("sources", &ModerationQuery::default())
        .await
        .unwrap();
    assert_eq!(sources["total"], 2);
    let audit = db
        .moderation_page("audit", &ModerationQuery::default())
        .await
        .unwrap();
    assert!(audit["total"].as_i64().unwrap() >= 4);
}

#[actix_web::test]
async fn burst_limit_is_atomic_and_account_limits_survive_ip_rotation() {
    let db = fixture().await;
    let config = Config::for_test();
    let user = db
        .upsert_identity("github", "burst", "burst@example.test", "Burst", None)
        .await
        .unwrap();
    let mut tasks = vec![];
    for n in 0..8 {
        let db = db.clone();
        let config = config.clone();
        let user = user.id.clone();
        tasks.push(tokio::spawn(async move {
            db.admit_comment(
                input(&format!("{n:064x}"), Some(&user), &format!("Message {n}")),
                false,
                &config,
            )
            .await
        }));
    }
    let mut allowed = 0;
    for task in tasks {
        match task.await.unwrap() {
            Ok(Some(_)) => allowed += 1,
            Err(AppError::CommentRateLimited(10)) => {}
            other => panic!("unexpected result {other:?}"),
        }
    }
    assert_eq!(allowed, 3);
}

#[actix_web::test]
async fn moderation_http_auth_csrf_ip_block_and_payload_limits() {
    let db = fixture().await;
    let config = Config::for_test();
    let (token, hash) = voidreg_api::auth::new_session_token();
    db.create_session("admin", &hash, None, 1).await.unwrap();
    let csrf = voidreg_api::api::v1::admin::session::csrf_for(&token);
    let admin = Cookie::new("voidreg_admin_session", token);
    let app = test::init_service(build(db.clone(), config.clone())).await;
    assert_eq!(
        test::call_service(
            &app,
            test::TestRequest::get()
                .uri("/api/v1/admin/moderation/users")
                .to_request()
        )
        .await
        .status(),
        StatusCode::UNAUTHORIZED
    );
    assert_eq!(
        test::call_service(
            &app,
            test::TestRequest::post()
                .uri("/api/v1/admin/moderation/blocks")
                .cookie(admin.clone())
                .set_json(json!({"kind":"ip","target":"192.0.2.44","reason":"Spam","hours":24}))
                .to_request()
        )
        .await
        .status(),
        StatusCode::FORBIDDEN
    );
    let response = test::call_service(
        &app,
        test::TestRequest::post()
            .uri("/api/v1/admin/moderation/blocks")
            .cookie(admin.clone())
            .insert_header(("X-CSRF-Token", csrf.clone()))
            .set_json(json!({"kind":"ip","target":"192.0.2.44","reason":"Spam","hours":24}))
            .to_request(),
    )
    .await;
    assert_eq!(response.status(), StatusCode::CREATED);
    let response = test::call_service(
        &app,
        test::TestRequest::post()
            .uri("/api/v1/blogs/discussion/comments")
            .peer_addr("192.0.2.44:4000".parse().unwrap())
            .insert_header(("X-Forwarded-For", "198.51.100.99"))
            .set_json(json!({"name":"Reader","body":"Blocked with spoofed forwarding"}))
            .to_request(),
    )
    .await;
    assert_eq!(response.status(), StatusCode::FORBIDDEN);
    let identity = db
        .upsert_identity(
            "github",
            "existing-session",
            "reader@example.test",
            "Reader",
            None,
        )
        .await
        .unwrap();
    let (reader, reader_hash) = voidreg_api::auth::new_session_token();
    db.create_session("commenter", &reader_hash, Some(&identity.id), 1)
        .await
        .unwrap();
    let reader = Cookie::new("voidreg_commenter_session", reader);
    let response = test::call_service(
        &app,
        test::TestRequest::post()
            .uri("/api/v1/blogs/discussion/comments")
            .peer_addr("198.51.100.2:4000".parse().unwrap())
            .cookie(reader.clone())
            .set_json(json!({"name":"Reader","body":"First contribution"}))
            .to_request(),
    )
    .await;
    assert_eq!(response.status(), StatusCode::ACCEPTED);
    let response = test::call_service(
        &app,
        test::TestRequest::post()
            .uri("/api/v1/admin/moderation/blocks")
            .cookie(admin.clone())
            .insert_header(("X-CSRF-Token", csrf.clone()))
            .set_json(
                json!({"kind":"user","target":identity.id,"reason":"Account spam","hours":null}),
            )
            .to_request(),
    )
    .await;
    assert_eq!(response.status(), StatusCode::CREATED);
    let response = test::call_service(
        &app,
        test::TestRequest::post()
            .uri("/api/v1/blogs/discussion/comments")
            .peer_addr("198.51.100.3:4000".parse().unwrap())
            .cookie(reader)
            .set_json(json!({"name":"Reader","body":"Same session and a new address"}))
            .to_request(),
    )
    .await;
    assert_eq!(response.status(), StatusCode::FORBIDDEN);
    {
        let (ip, peer) = ("2001:0db8:0:0:0:0:0:44", "[2001:db8::44]:4000");
        let response = test::call_service(
            &app,
            test::TestRequest::post()
                .uri("/api/v1/admin/moderation/blocks")
                .cookie(admin.clone())
                .insert_header(("X-CSRF-Token", csrf.clone()))
                .set_json(json!({"kind":"ip","target":ip,"reason":"IPv6 spam","hours":24}))
                .to_request(),
        )
        .await;
        assert_eq!(response.status(), StatusCode::CREATED);
        let response = test::call_service(
            &app,
            test::TestRequest::post()
                .uri("/api/v1/blogs/discussion/comments")
                .peer_addr(peer.parse().unwrap())
                .set_json(json!({"name":"Reader","body":"IPv6 blocked"}))
                .to_request(),
        )
        .await;
        assert_eq!(response.status(), StatusCode::FORBIDDEN);
    }
    for expected in [StatusCode::ACCEPTED, StatusCode::TOO_MANY_REQUESTS] {
        let response = test::call_service(
            &app,
            test::TestRequest::post()
                .uri("/api/v1/blogs/discussion/comments")
                .peer_addr("198.51.100.8:4000".parse().unwrap())
                .set_json(json!({"name":"Reader","body":"Duplicate HTTP verification"}))
                .to_request(),
        )
        .await;
        assert_eq!(response.status(), expected);
        if expected == StatusCode::TOO_MANY_REQUESTS {
            assert_eq!(response.headers().get("Retry-After").unwrap(), "600");
        }
    }
    for collection in [
        "comments", "users", "sources", "blocks", "events", "audit", "summary",
    ] {
        let response = test::call_service(
            &app,
            test::TestRequest::get()
                .uri(&format!("/api/v1/admin/moderation/{collection}"))
                .cookie(admin.clone())
                .to_request(),
        )
        .await;
        assert_eq!(response.status(), StatusCode::OK, "{collection}");
        let data: Value = test::read_body_json(response).await;
        if collection == "blocks" {
            assert_eq!(data["items"][0]["active"], 1);
        }
        assert!(!data.to_string().contains("192.0.2.44"));
    }
    let response = test::call_service(
        &app,
        test::TestRequest::post()
            .uri("/api/v1/blogs/discussion/comments")
            .set_json(json!({"name":"Reader","body":"x".repeat(9000)}))
            .to_request(),
    )
    .await;
    assert_eq!(response.status(), StatusCode::PAYLOAD_TOO_LARGE);
}

#[actix_web::test]
async fn restart_preserves_blocks_quotas_and_migration_is_idempotent() {
    let path = std::env::temp_dir().join(format!("voidreg-spam-{}.db", uuid::Uuid::new_v4()));
    let mut config = Config::for_test();
    config.database_url = path.to_string_lossy().into();
    let source = "e".repeat(64);
    let db = Db::connect(&config).await.unwrap();
    db.seed_if_empty().await.unwrap();
    db.admit_comment(input(&source, None, "Question one"), false, &config)
        .await
        .unwrap();
    let target = "f".repeat(64);
    db.block_comments(
        &BlockInput {
            kind: "source".into(),
            target: target.clone(),
            reason: "Spam".into(),
            hours: Some(24),
        },
        "test-admin",
    )
    .await
    .unwrap();
    drop(db);
    let db = Db::connect(&config).await.unwrap();
    db.migrate().await.unwrap();
    db.migrate().await.unwrap();
    assert!(matches!(
        db.admit_comment(input(&target, None, "Attempt"), false, &config)
            .await,
        Err(AppError::Forbidden(_))
    ));
    assert!(matches!(
        db.admit_comment(input(&source, None, "Question one"), false, &config)
            .await,
        Err(AppError::CommentRateLimited(600))
    ));
    db.admit_comment(input(&source, None, "Question two"), false, &config)
        .await
        .unwrap();
    assert!(matches!(
        db.admit_comment(input(&source, None, "Question three"), false, &config)
            .await,
        Err(AppError::CommentRateLimited(3600))
    ));
    drop(db);
    let _ = std::fs::remove_file(path);
}

#[actix_web::test]
async fn independent_database_connections_share_admission_limits() {
    let path =
        std::env::temp_dir().join(format!("voidreg-shared-spam-{}.db", uuid::Uuid::new_v4()));
    let mut config = Config::for_test();
    config.database_url = path.to_string_lossy().into();
    let one = Db::connect(&config).await.unwrap();
    one.migrate().await.unwrap();
    let identity = one
        .upsert_identity("github", "shared", "shared@example.test", "Shared", None)
        .await
        .unwrap();
    let two = Db::connect(&config).await.unwrap();
    two.migrate().await.unwrap();
    let mut tasks = vec![];
    for n in 0..8 {
        let db = if n % 2 == 0 { one.clone() } else { two.clone() };
        let config = config.clone();
        let user = identity.id.clone();
        tasks.push(tokio::spawn(async move {
            db.admit_comment(
                input(
                    &format!("{n:064x}"),
                    Some(&user),
                    &format!("Concurrent message {n}"),
                ),
                false,
                &config,
            )
            .await
        }));
    }
    let mut accepted = 0;
    for task in tasks {
        match task.await.unwrap() {
            Ok(Some(_)) => accepted += 1,
            Err(AppError::CommentRateLimited(10)) => {}
            other => panic!("unexpected admission result {other:?}"),
        }
    }
    assert_eq!(accepted, 3);
    drop(one);
    drop(two);
    let _ = std::fs::remove_file(path);
}

#[actix_web::test]
async fn source_and_account_quotas_are_independent_not_combined() {
    let db = fixture().await;
    let mut config = Config::for_test();
    config.comment_burst = 100;
    config.comment_user_hourly = 3;
    config.comment_user_article_hourly = 3;
    let a = db
        .upsert_identity("github", "quota-a", "a@example.test", "A", None)
        .await
        .unwrap();
    let b = db
        .upsert_identity("github", "quota-b", "b@example.test", "B", None)
        .await
        .unwrap();
    for (source, user, body) in [
        ("a", &a.id, "A from first source"),
        ("b", &b.id, "B from second source"),
        ("b", &a.id, "A from second source"),
        ("b", &a.id, "A reaches own quota"),
    ] {
        db.admit_comment(input(&source.repeat(64), Some(user), body), false, &config)
            .await
            .unwrap();
    }
    assert!(matches!(
        db.admit_comment(
            input(&"c".repeat(64), Some(&a.id), "A rotates again"),
            false,
            &config
        )
        .await,
        Err(AppError::CommentRateLimited(3600))
    ));
}

use actix_web::{App, HttpResponse, HttpServer, cookie::Cookie, http::StatusCode, test, web};
use serde_json::{Value, json};
use voidreg_api::{
    app::build,
    config::Config,
    db::{ArticleFields, Db, IdentityInfo},
};

const PNG: &[u8] = b"\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR";

async fn database() -> Db {
    let db = Db::memory().await.unwrap();
    db.migrate().await.unwrap();
    db.insert_article(ArticleFields {
        meta: Default::default(),
        revision: 1,
        slug: "discussion".into(),
        title: "discussion".into(),
        category: "Systems".into(),
        summary: "Summary".into(),
        tags: vec![],
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

fn config() -> Config {
    let mut config = Config::for_test();
    config.comment_burst = 100;
    config.comment_user_hourly = 1000;
    config.comment_user_article_hourly = 1000;
    config
}

async fn identity(
    db: &Db,
    provider: &str,
    subject: &str,
    email: &str,
    name: &str,
    avatar: Option<&str>,
) -> IdentityInfo {
    db.upsert_identity(provider, subject, email, name, avatar)
        .await
        .unwrap()
}

async fn sign_in(db: &Db, identity: &IdentityInfo) -> Cookie<'static> {
    let (token, hash) = voidreg_api::auth::new_session_token();
    db.create_session("commenter", &hash, Some(&identity.id), 1)
        .await
        .unwrap();
    Cookie::new("voidreg_commenter_session", token)
}

macro_rules! session {
    ($app:expr, $cookie:expr) => {{
        let response = test::call_service(
            &$app,
            test::TestRequest::get()
                .uri("/api/v1/auth/session")
                .cookie($cookie.clone())
                .to_request(),
        )
        .await;
        let body = test::read_body(response).await;
        serde_json::from_slice::<Value>(&body).unwrap()
    }};
}

macro_rules! call {
    ($app:expr, $request:expr) => {{
        let response = test::call_service(&$app, $request.to_request()).await;
        let status = response.status();
        let body = test::read_body(response).await;
        (
            status,
            serde_json::from_slice::<Value>(&body).unwrap_or(Value::Null),
        )
    }};
}

fn patch(cookie: &Cookie<'static>, body: Value) -> test::TestRequest {
    test::TestRequest::patch()
        .uri("/api/v1/auth/profile")
        .cookie(cookie.clone())
        .set_json(body)
}

fn comment(cookie: Option<&Cookie<'static>>, name: &str, body: &str) -> test::TestRequest {
    let request = test::TestRequest::post()
        .uri("/api/v1/blogs/discussion/comments")
        .set_json(json!({"name": name, "body": body}));
    match cookie {
        Some(cookie) => request.cookie(cookie.clone()),
        None => request,
    }
}

#[actix_web::test]
async fn verified_email_links_providers_and_unverified_email_does_not() {
    let db = database().await;
    let github = identity(&db, "github", "1", "Ada@Example.com", "Ada L", None).await;
    let google = identity(&db, "google", "g1", "ada@example.com", "Ada Lovelace", None).await;
    let spoof = identity(&db, "github", "2", "ada@example.com", "Mallory", None).await;
    let other = identity(&db, "google", "g2", "grace@example.com", "Grace", None).await;

    let first = db.attach_profile(&github, true, None).await.unwrap();
    let second = db.attach_profile(&google, true, None).await.unwrap();
    assert_eq!(first, second, "the same verified email is the same person");
    let unverified = db.attach_profile(&spoof, false, None).await.unwrap();
    assert_ne!(first, unverified, "an unverified email never links");
    let grace = db.attach_profile(&other, true, None).await.unwrap();
    assert_ne!(first, grace);

    // Signing in again keeps the profile.
    assert_eq!(db.attach_profile(&github, true, None).await.unwrap(), first);

    // Explicit connect works regardless of email, but never steals another profile.
    let extra = identity(
        &db,
        "github",
        "3",
        "elsewhere@example.com",
        "Elsewhere",
        None,
    )
    .await;
    assert_eq!(
        db.attach_profile(&extra, true, Some(&grace)).await.unwrap(),
        grace
    );
    let (_, profile) = db.commenter_by_identity(&extra.id).await.unwrap().unwrap();
    assert_eq!(profile.linked.len(), 2);
    assert!(
        db.attach_profile(&extra, true, Some(&first))
            .await
            .is_err_and(|e| matches!(e, voidreg_api::error::AppError::Conflict(_)))
    );
}

#[actix_web::test]
async fn profile_name_rules_and_live_comment_identity() {
    let db = database().await;
    let ada = identity(&db, "github", "1", "ada@example.com", "Ada", None).await;
    let grace = identity(&db, "github", "2", "grace@example.com", "Ada", None).await;
    let (ada_cookie, grace_cookie) = (sign_in(&db, &ada).await, sign_in(&db, &grace).await);
    let app = test::init_service(build(db.clone(), config())).await;

    let first = session!(app, ada_cookie);
    let second = session!(app, grace_cookie);
    assert_eq!(first["profile"]["display_name"], "Ada");
    let generated = second["profile"]["display_name"].as_str().unwrap();
    assert_ne!(generated, "Ada", "a colliding provider name gets a suffix");
    assert!(generated.starts_with("Ada "));
    assert_eq!(first["identity"]["name"], "Ada");

    for (name, status) in [
        ("Grace", StatusCode::OK),
        ("grace", StatusCode::OK),
        ("Admin", StatusCode::UNPROCESSABLE_ENTITY),
        ("V o i d r e g", StatusCode::UNPROCESSABLE_ENTITY),
        ("x", StatusCode::UNPROCESSABLE_ENTITY),
        (
            "visit https://spam.example",
            StatusCode::UNPROCESSABLE_ENTITY,
        ),
        ("Zero\u{200B}width", StatusCode::UNPROCESSABLE_ENTITY),
    ] {
        let (code, _) = call!(app, patch(&grace_cookie, json!({"display_name": name})));
        assert_eq!(code, status, "{name}");
    }
    let (code, _) = call!(app, patch(&ada_cookie, json!({"display_name": "GRACE"})));
    assert_eq!(code, StatusCode::CONFLICT, "names are unique ignoring case");

    // Existing comments follow the live display name.
    let (code, posted) = call!(app, comment(Some(&grace_cookie), "ignored", "hello there"));
    assert_eq!(code, StatusCode::ACCEPTED);
    assert_eq!(posted["status"], "approved");
    let (_, page) = call!(
        app,
        test::TestRequest::get().uri("/api/v1/blogs/discussion/comments")
    );
    assert_eq!(page["items"][0]["author_name"], "grace");
    assert_eq!(page["items"][0]["verified"], true);
    let (code, renamed) = call!(
        app,
        patch(&grace_cookie, json!({"display_name": "  Grace   Hopper "}))
    );
    assert_eq!(code, StatusCode::OK);
    assert_eq!(renamed["identity"]["name"], "Grace Hopper");
    let (_, page) = call!(
        app,
        test::TestRequest::get().uri("/api/v1/blogs/discussion/comments")
    );
    assert_eq!(page["items"][0]["author_name"], "Grace Hopper");

    // Guests cannot borrow a member name or a reserved one.
    for name in ["grace hopper", "GRACE HOPPER", "Voidreg", "Admin"] {
        let (code, _) = call!(app, comment(None, name, "guest comment"));
        assert_eq!(code, StatusCode::UNPROCESSABLE_ENTITY, "{name}");
    }
    let (code, guest) = call!(app, comment(None, "Visitor", "guest comment"));
    assert_eq!(
        (code, &guest["status"]),
        (StatusCode::ACCEPTED, &json!("pending"))
    );
}

#[actix_web::test]
async fn writes_require_a_session_a_json_body_and_the_site_origin() {
    let db = database().await;
    let ada = identity(&db, "github", "1", "ada@example.com", "Ada", None).await;
    let cookie = sign_in(&db, &ada).await;
    let app = test::init_service(build(db, config())).await;

    let (code, _) = call!(
        app,
        test::TestRequest::patch()
            .uri("/api/v1/auth/profile")
            .set_json(json!({"display_name": "Nobody"}))
    );
    assert_eq!(code, StatusCode::UNAUTHORIZED);
    let (code, _) = call!(
        app,
        test::TestRequest::get().uri("/api/v1/auth/profile/export")
    );
    assert_eq!(code, StatusCode::UNAUTHORIZED);

    for (origin, expected) in [
        ("https://evil.example", StatusCode::FORBIDDEN),
        ("http://127.0.0.1:8080", StatusCode::OK),
        ("http://localhost:5173", StatusCode::OK),
    ] {
        let (code, _) = call!(
            app,
            patch(&cookie, json!({"show_avatar": false})).insert_header(("Origin", origin))
        );
        assert_eq!(code, expected, "{origin}");
    }
    let (code, _) = call!(
        app,
        patch(&cookie, json!({"show_avatar": false}))
            .insert_header(("Sec-Fetch-Site", "cross-site"))
    );
    assert_eq!(code, StatusCode::FORBIDDEN);
    let (code, _) = call!(
        app,
        test::TestRequest::patch()
            .uri("/api/v1/auth/profile")
            .cookie(cookie.clone())
            .insert_header(("Content-Type", "text/plain"))
            .set_payload("{\"display_name\":\"Plain\"}")
    );
    assert_eq!(code, StatusCode::BAD_REQUEST);
    let (code, _) = call!(
        app,
        test::TestRequest::delete()
            .uri("/api/v1/auth/profile")
            .cookie(cookie.clone())
            .insert_header(("Origin", "https://evil.example"))
    );
    assert_eq!(code, StatusCode::FORBIDDEN);
}

#[actix_web::test]
async fn signed_out_session_lists_providers_for_the_header() {
    let mut config = config();
    config.github_client_id = Some("client".into());
    config.github_client_secret = Some("secret".into());
    let app = test::init_service(build(database().await, config)).await;
    let (code, body) = call!(app, test::TestRequest::get().uri("/api/v1/auth/session"));
    assert_eq!(code, StatusCode::OK);
    assert_eq!(body["authenticated"], false);
    assert_eq!(body["providers"], json!(["github"]));
    assert!(body.get("profile").is_none());
}

#[actix_web::test]
async fn photo_is_hidden_by_default_and_served_only_through_the_proxy() {
    let server = HttpServer::new(|| {
        App::new()
            .route(
                "/a.png",
                web::get().to(|| async { HttpResponse::Ok().content_type("image/png").body(PNG) }),
            )
            .route(
                "/page",
                web::get().to(|| async {
                    HttpResponse::Ok()
                        .content_type("image/png")
                        .body("<html>hi</html>")
                }),
            )
            .route(
                "/big.png",
                web::get().to(|| async {
                    let mut body = PNG.to_vec();
                    body.resize(600 * 1024, 0);
                    HttpResponse::Ok().content_type("image/png").body(body)
                }),
            )
    })
    .workers(1)
    .bind(("127.0.0.1", 0))
    .unwrap();
    let host = format!("127.0.0.1:{}", server.addrs()[0].port());
    actix_web::rt::spawn(server.run());

    let db = database().await;
    let ada = identity(
        &db,
        "github",
        "1",
        "ada@example.com",
        "Ada",
        Some(&format!("http://{host}/a.png")),
    )
    .await;
    let cookie = sign_in(&db, &ada).await;
    let mut config = config();
    config.avatar_hosts = vec![host.clone()];
    let app = test::init_service(build(db.clone(), config)).await;

    let body = session!(app, cookie);
    let profile_id = body["profile"]["id"].as_str().unwrap().to_owned();
    assert_eq!(body["profile"]["show_avatar"], false);
    assert!(body["profile"].get("avatar_url").is_none());
    assert!(
        body["profile"]["linked"][0]["has_avatar"]
            .as_bool()
            .unwrap()
    );
    let avatar_path = format!("/api/v1/avatars/{profile_id}");
    let (code, _) = call!(app, test::TestRequest::get().uri(&avatar_path));
    assert_eq!(
        code,
        StatusCode::NOT_FOUND,
        "hidden photos are never served"
    );

    call!(app, comment(Some(&cookie), "x", "no photo yet"));
    let (_, page) = call!(
        app,
        test::TestRequest::get().uri("/api/v1/blogs/discussion/comments")
    );
    assert!(page["items"][0]["avatar_url"].is_null());

    let (code, shown) = call!(app, patch(&cookie, json!({"show_avatar": true})));
    assert_eq!(code, StatusCode::OK);
    let url = shown["profile"]["avatar_url"].as_str().unwrap();
    assert!(url.starts_with(&avatar_path));
    assert_eq!(shown["identity"]["avatar_url"], url);
    let (_, page) = call!(
        app,
        test::TestRequest::get().uri("/api/v1/blogs/discussion/comments")
    );
    assert_eq!(page["items"][0]["avatar_url"], url);

    let response = test::call_service(&app, test::TestRequest::get().uri(url).to_request()).await;
    assert_eq!(response.status(), StatusCode::OK);
    let headers = response.headers().clone();
    assert_eq!(headers.get("content-type").unwrap(), "image/png");
    assert_eq!(headers.get("x-content-type-options").unwrap(), "nosniff");
    assert!(
        headers
            .get("content-security-policy")
            .unwrap()
            .to_str()
            .unwrap()
            .contains("sandbox")
    );
    assert_eq!(test::read_body(response).await.as_ref(), PNG);

    for path in ["/page", "/big.png", "/missing.png"] {
        let ada_again = identity(
            &db,
            "github",
            "1",
            "ada@example.com",
            "Ada",
            Some(&format!("http://{host}{path}")),
        )
        .await;
        assert_eq!(ada_again.id, ada.id);
        let (code, _) = call!(app, test::TestRequest::get().uri(&avatar_path));
        assert_eq!(code, StatusCode::NOT_FOUND, "{path} is not a usable photo");
    }

    let elsewhere = identity(
        &db,
        "github",
        "1",
        "ada@example.com",
        "Ada",
        Some("http://169.254.169.254/latest/meta-data"),
    )
    .await;
    assert_eq!(elsewhere.id, ada.id);
    let (code, _) = call!(app, test::TestRequest::get().uri(&avatar_path));
    assert_eq!(
        code,
        StatusCode::NOT_FOUND,
        "hosts off the allowlist are not fetched"
    );

    let (code, _) = call!(app, patch(&cookie, json!({"show_avatar": false})));
    assert_eq!(code, StatusCode::OK);
    let (code, _) = call!(
        app,
        test::TestRequest::get().uri("/api/v1/avatars/not-a-uuid")
    );
    assert_eq!(code, StatusCode::NOT_FOUND);
}

#[actix_web::test]
async fn connected_accounts_unlink_keep_comments_and_guard_the_last_one() {
    let db = database().await;
    let github = identity(&db, "github", "1", "ada@example.com", "Ada", None).await;
    let google = identity(&db, "google", "g1", "ada@example.com", "Ada", None).await;
    let profile = db.attach_profile(&github, true, None).await.unwrap();
    assert_eq!(
        db.attach_profile(&google, true, None).await.unwrap(),
        profile
    );
    let (github_cookie, google_cookie) = (sign_in(&db, &github).await, sign_in(&db, &google).await);
    let app = test::init_service(build(db.clone(), config())).await;

    let body = session!(app, github_cookie);
    assert_eq!(body["profile"]["linked"].as_array().unwrap().len(), 2);
    assert_eq!(
        body["profile"]["linked"]
            .as_array()
            .unwrap()
            .iter()
            .filter(|a| a["current"] == true)
            .count(),
        1
    );
    call!(
        app,
        comment(Some(&google_cookie), "x", "written via google")
    );
    let unlink = |cookie: &Cookie<'static>, id: &str| {
        test::TestRequest::delete()
            .uri(&format!("/api/v1/auth/identities/{id}"))
            .cookie(cookie.clone())
    };
    let (code, _) = call!(app, unlink(&github_cookie, &github.id));
    assert_eq!(
        code,
        StatusCode::CONFLICT,
        "the account in use cannot be removed"
    );
    let (code, _) = call!(
        app,
        unlink(&github_cookie, "00000000-0000-4000-8000-000000000000")
    );
    assert_eq!(code, StatusCode::NOT_FOUND);

    let (code, after) = call!(app, unlink(&github_cookie, &google.id));
    assert_eq!(code, StatusCode::OK);
    assert_eq!(after["profile"]["linked"].as_array().unwrap().len(), 1);
    let (code, _) = call!(
        app,
        test::TestRequest::get()
            .uri("/api/v1/auth/session")
            .cookie(google_cookie.clone())
    );
    assert_eq!(code, StatusCode::OK);
    assert_eq!(
        session!(app, google_cookie)["authenticated"],
        false,
        "the disconnected account's sessions end"
    );
    let (_, page) = call!(
        app,
        test::TestRequest::get().uri("/api/v1/blogs/discussion/comments")
    );
    assert_eq!(page["items"][0]["author_name"], "Ada");
    assert_eq!(
        page["items"][0]["verified"], true,
        "comments stay on the profile"
    );
    let (code, _) = call!(app, unlink(&github_cookie, &github.id));
    assert_eq!(
        code,
        StatusCode::CONFLICT,
        "the last account cannot be removed"
    );
}

#[actix_web::test]
async fn sign_out_everywhere_ends_every_session_of_the_profile() {
    let db = database().await;
    let github = identity(&db, "github", "1", "ada@example.com", "Ada", None).await;
    let google = identity(&db, "google", "g1", "ada@example.com", "Ada", None).await;
    let profile = db.attach_profile(&github, true, None).await.unwrap();
    db.attach_profile(&google, true, None).await.unwrap();
    let cookies = [
        sign_in(&db, &github).await,
        sign_in(&db, &github).await,
        sign_in(&db, &google).await,
    ];
    let bystander = identity(&db, "github", "9", "bob@example.com", "Bob", None).await;
    let bob = sign_in(&db, &bystander).await;
    let app = test::init_service(build(db.clone(), config())).await;
    assert!(
        session!(app, cookies[0])["authenticated"]
            .as_bool()
            .unwrap()
    );
    let response = test::call_service(
        &app,
        test::TestRequest::delete()
            .uri("/api/v1/auth/sessions")
            .cookie(cookies[0].clone())
            .to_request(),
    )
    .await;
    assert_eq!(response.status(), StatusCode::OK);
    for cookie in &cookies {
        assert_eq!(session!(app, cookie)["authenticated"], false);
    }
    assert!(session!(app, bob)["authenticated"].as_bool().unwrap());
    assert!(db.profile_id_for_identity(&github.id).await.unwrap() == Some(profile));
}

#[actix_web::test]
async fn export_and_delete_anonymize_or_remove_comments() {
    let db = database().await;
    let owner = identity(&db, "github", "owner", "owner@example.com", "Owner", None).await;
    let mut config = config();
    config.admin_github_ids = vec!["owner".into()];
    let ada = identity(&db, "github", "1", "ada@example.com", "Ada", None).await;
    let bob = identity(&db, "github", "2", "bob@example.com", "Bob", None).await;
    let (ada_cookie, bob_cookie, owner_cookie) = (
        sign_in(&db, &ada).await,
        sign_in(&db, &bob).await,
        sign_in(&db, &owner).await,
    );
    let app = test::init_service(build(db.clone(), config)).await;
    call!(app, comment(Some(&ada_cookie), "x", "from ada"));
    call!(app, comment(Some(&bob_cookie), "x", "from bob"));

    let (code, export) = call!(
        app,
        test::TestRequest::get()
            .uri("/api/v1/auth/profile/export")
            .cookie(ada_cookie.clone())
    );
    assert_eq!(code, StatusCode::OK);
    assert_eq!(export["comments"].as_array().unwrap().len(), 1);
    assert_eq!(export["comments"][0]["body"], "from ada");
    assert_eq!(export["accounts"][0]["email"], "ada@example.com");

    let (code, _) = call!(
        app,
        test::TestRequest::delete()
            .uri("/api/v1/auth/profile")
            .cookie(owner_cookie.clone())
    );
    assert_eq!(code, StatusCode::FORBIDDEN, "owner accounts are protected");

    let (code, gone) = call!(
        app,
        test::TestRequest::delete()
            .uri("/api/v1/auth/profile")
            .cookie(ada_cookie.clone())
    );
    assert_eq!(code, StatusCode::OK);
    assert_eq!(gone["authenticated"], false);
    assert_eq!(session!(app, ada_cookie)["authenticated"], false);
    assert!(db.find_identity("github", "1").await.unwrap().is_none());
    let (_, page) = call!(
        app,
        test::TestRequest::get().uri("/api/v1/blogs/discussion/comments")
    );
    let items = page["items"].as_array().unwrap();
    let names: Vec<_> = items
        .iter()
        .map(|c| c["author_name"].as_str().unwrap())
        .collect();
    assert!(names.contains(&"Deleted user") && names.contains(&"Bob"));
    let deleted = items
        .iter()
        .find(|c| c["author_name"] == "Deleted user")
        .unwrap();
    assert_eq!(deleted["body"], "from ada");
    assert_eq!(deleted["verified"], false);

    let (code, _) = call!(
        app,
        test::TestRequest::delete()
            .uri("/api/v1/auth/profile?remove_comments=true")
            .cookie(bob_cookie)
    );
    assert_eq!(code, StatusCode::OK);
    let (_, page) = call!(
        app,
        test::TestRequest::get().uri("/api/v1/blogs/discussion/comments")
    );
    let bob_comment = page["items"]
        .as_array()
        .unwrap()
        .iter()
        .find(|c| c["body"] == "from bob");
    assert!(bob_comment.is_none(), "removed comments lose their text");
    // The freed name can be taken again.
    let again = identity(&db, "github", "3", "new@example.com", "Bob", None).await;
    let again_cookie = sign_in(&db, &again).await;
    assert_eq!(
        session!(app, again_cookie)["profile"]["display_name"],
        "Bob"
    );
}

#[actix_web::test]
async fn a_block_covers_every_connected_account_and_blocks_deletion() {
    let db = database().await;
    let github = identity(&db, "github", "1", "ada@example.com", "Ada", None).await;
    let google = identity(&db, "google", "g1", "ada@example.com", "Ada", None).await;
    let profile = db.attach_profile(&github, true, None).await.unwrap();
    db.attach_profile(&google, true, None).await.unwrap();
    let (github_cookie, google_cookie) = (sign_in(&db, &github).await, sign_in(&db, &google).await);
    let (admin, hash) = voidreg_api::auth::new_session_token();
    db.create_session("admin", &hash, None, 1).await.unwrap();
    let csrf = voidreg_api::api::v1::admin::session::csrf_for(&admin);
    let admin = Cookie::new("voidreg_admin_session", admin);
    let app = test::init_service(build(db.clone(), config())).await;

    let (code, _) = call!(app, comment(Some(&github_cookie), "x", "via github"));
    assert_eq!(code, StatusCode::ACCEPTED);
    let (code, _) = call!(app, comment(Some(&google_cookie), "x", "via google"));
    assert_eq!(code, StatusCode::ACCEPTED);

    let (code, _) = call!(
        app,
        test::TestRequest::post()
            .uri("/api/v1/admin/moderation/blocks")
            .cookie(admin)
            .insert_header(("X-CSRF-Token", csrf))
            .set_json(
                json!({"kind": "user", "target": github.id, "reason": "spam", "hours": null})
            )
    );
    assert_eq!(code, StatusCode::CREATED);

    let (_, page) = call!(
        app,
        test::TestRequest::get().uri("/api/v1/blogs/discussion/comments")
    );
    assert!(
        page["items"]
            .as_array()
            .unwrap()
            .iter()
            .all(|c| c["removed"] == true),
        "both accounts' comments are hidden"
    );
    let (code, _) = call!(app, comment(Some(&google_cookie), "x", "evading the block"));
    assert_eq!(
        code,
        StatusCode::FORBIDDEN,
        "the connected account is blocked too"
    );
    let (code, _) = call!(
        app,
        test::TestRequest::delete()
            .uri("/api/v1/auth/profile")
            .cookie(google_cookie.clone())
    );
    assert_eq!(
        code,
        StatusCode::FORBIDDEN,
        "deleting cannot launder a block"
    );
    let (code, _) = call!(
        app,
        test::TestRequest::delete()
            .uri(&format!("/api/v1/auth/identities/{}", github.id))
            .cookie(google_cookie)
    );
    assert_eq!(
        code,
        StatusCode::FORBIDDEN,
        "unlinking cannot launder a block"
    );
    assert_eq!(
        db.profile_id_for_identity(&google.id).await.unwrap(),
        Some(profile)
    );
}

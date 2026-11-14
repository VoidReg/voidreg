#[path = "support/compiler.rs"]
mod compiler;
use actix_web::{cookie::Cookie, http::StatusCode, test};
use serde_json::{Value, json};
use voidreg_api::{
    app::build,
    auth::{hash_token, new_session_token},
    config::Config,
    db::Db,
};

#[actix_web::test]
async fn tokens_draft_permissions_revisions_revocation_and_owner_isolation() {
    let db = Db::memory().await.unwrap();
    db.migrate().await.unwrap();
    db.migrate().await.unwrap();
    let compiler = compiler::Compiler::start();
    let mut config = Config::for_test();
    compiler.configure(&mut config);
    config.admin_github_ids = vec!["owner".into(), "second".into()];
    let owner = db
        .upsert_identity("github", "owner", "", "Owner", None)
        .await
        .unwrap();
    let second = db
        .upsert_identity("github", "second", "", "Second", None)
        .await
        .unwrap();
    let (admin, hash) = new_session_token();
    db.create_session("admin", &hash, Some(&owner.id), 1)
        .await
        .unwrap();
    let csrf = voidreg_api::api::v1::admin::session::csrf_for(&admin);
    let cookie = Cookie::new("voidreg_admin_session", admin);
    let app = test::init_service(build(db.clone(), config.clone())).await;
    let request = test::TestRequest::post()
        .uri("/api/v1/admin/mcp-tokens")
        .cookie(cookie.clone())
        .set_json(json!({"name":"CLI"}))
        .to_request();
    assert_eq!(
        test::call_service(&app, request).await.status(),
        StatusCode::FORBIDDEN
    );
    let response = test::call_service(
        &app,
        test::TestRequest::post()
            .uri("/api/v1/admin/mcp-tokens")
            .cookie(cookie.clone())
            .insert_header(("X-CSRF-Token", csrf.clone()))
            .set_json(json!({"name":"CLI"}))
            .to_request(),
    )
    .await;
    assert_eq!(response.status(), StatusCode::CREATED);
    let created: Value = test::read_body_json(response).await;
    let token = created["token"].as_str().unwrap();
    let id = created["connection"]["id"].as_str().unwrap();
    let auth = format!("Bearer {token}");
    assert!(created["connection"].get("token_hash").is_none());
    assert!(db.list_mcp_tokens(&second.id).await.unwrap().is_empty());
    db.revoke_mcp_token(id, &second.id).await.unwrap();
    assert!(
        db.mcp_token_identity(&hash_token(token))
            .await
            .unwrap()
            .is_some()
    );
    for header in [None, Some("Bearer bad")] {
        let mut request = test::TestRequest::get().uri("/api/v1/mcp/session");
        if let Some(header) = header {
            request = request.insert_header(("Authorization", header));
        }
        assert_eq!(
            test::call_service(&app, request.to_request())
                .await
                .status(),
            StatusCode::UNAUTHORIZED
        );
    }
    let expired = "vr_mcp_expired";
    db.create_mcp_token(&owner.id, "Expired", &hash_token(expired), -1)
        .await
        .unwrap();
    assert_eq!(
        test::call_service(
            &app,
            test::TestRequest::get()
                .uri("/api/v1/mcp/session")
                .insert_header(("Authorization", format!("Bearer {expired}")))
                .to_request()
        )
        .await
        .status(),
        StatusCode::UNAUTHORIZED
    );
    assert_eq!(
        test::call_service(
            &app,
            test::TestRequest::get()
                .uri("/api/v1/admin/articles")
                .insert_header(("Authorization", auth.clone()))
                .to_request()
        )
        .await
        .status(),
        StatusCode::UNAUTHORIZED
    );
    let document = json!({"schemaVersion":1,"blocks":[]});
    let compiled = json!({"format":"publisle:publication","formatVersion":1,"identity":"test","rendererBuild":"1","html":"","styles":[],"modules":[],"islands":[],"diagnostics":[]});
    let body: Value = test::call_and_read_body_json(&app, test::TestRequest::post().uri("/api/v1/mcp/articles").insert_header(("Authorization", auth.clone())).set_json(json!({"slug":"mcp-draft","title":"Draft","category":"Systems","summary":"Summary","document":document,"compiled":compiled})).to_request()).await;
    assert_eq!(body["revision"], 1);
    assert_eq!(body["status"], "draft");
    let update = json!({"title":"Updated","expected_revision":1});
    let request = || {
        test::TestRequest::put()
            .uri("/api/v1/mcp/articles/mcp-draft")
            .insert_header(("Authorization", auth.clone()))
            .set_json(&update)
            .to_request()
    };
    let (left, right) = tokio::join!(
        test::call_service(&app, request()),
        test::call_service(&app, request())
    );
    assert!(matches!(
        (left.status(), right.status()),
        (StatusCode::OK, StatusCode::CONFLICT) | (StatusCode::CONFLICT, StatusCode::OK)
    ));
    let compilation: Value = test::call_and_read_body_json(
        &app,
        test::TestRequest::post()
            .uri("/api/v1/admin/articles/mcp-draft/compile")
            .cookie(cookie.clone())
            .insert_header(("X-CSRF-Token", csrf.clone()))
            .set_json(json!({"expected_revision":2}))
            .to_request(),
    )
    .await;
    let publish = |revision| {
        test::TestRequest::post()
            .uri("/api/v1/admin/articles/mcp-draft/publish")
            .cookie(cookie.clone())
            .insert_header(("X-CSRF-Token", csrf.clone()))
            .set_json(json!({"expected_revision":revision,"compilation_id":compilation["id"]}))
            .to_request()
    };
    assert_eq!(
        test::call_service(&app, publish(1)).await.status(),
        StatusCode::CONFLICT
    );
    assert_eq!(
        test::call_service(&app, publish(2)).await.status(),
        StatusCode::OK
    );
    assert_eq!(
        test::call_service(
            &app,
            test::TestRequest::put()
                .uri("/api/v1/mcp/articles/mcp-draft")
                .insert_header(("Authorization", auth.clone()))
                .set_json(json!({"title":"Live edit","expected_revision":3}))
                .to_request()
        )
        .await
        .status(),
        StatusCode::FORBIDDEN
    );
    assert_eq!(
        test::call_service(
            &app,
            test::TestRequest::post()
                .uri("/api/v1/mcp/articles/mcp-draft/publish")
                .insert_header(("Authorization", auth.clone()))
                .to_request()
        )
        .await
        .status(),
        StatusCode::NOT_FOUND
    );
    let current = db.admin_get_article("mcp-draft").await.unwrap();
    assert_eq!(current.title, "Updated");
    assert_eq!(current.revision, 3);
    // Losing the allowlist invalidates existing tokens without waiting for expiry.
    config.admin_github_ids.clear();
    let denied = test::init_service(build(db.clone(), config)).await;
    assert_eq!(
        test::call_service(
            &denied,
            test::TestRequest::get()
                .uri("/api/v1/mcp/session")
                .insert_header(("Authorization", auth.clone()))
                .to_request()
        )
        .await
        .status(),
        StatusCode::FORBIDDEN
    );
    let tokens: Value = test::call_and_read_body_json(
        &app,
        test::TestRequest::get()
            .uri("/api/v1/admin/mcp-tokens")
            .cookie(cookie.clone())
            .to_request(),
    )
    .await;
    assert!(
        tokens["items"]
            .as_array()
            .unwrap()
            .iter()
            .all(|item| item.get("token_hash").is_none() && item.get("token").is_none())
    );
    assert!(
        db.list_mcp_tokens(&owner.id)
            .await
            .unwrap()
            .iter()
            .any(|t| t.last_used_at.is_some())
    );
    assert_eq!(
        test::call_service(
            &app,
            test::TestRequest::delete()
                .uri(&format!("/api/v1/admin/mcp-tokens/{id}"))
                .cookie(cookie)
                .insert_header(("X-CSRF-Token", csrf))
                .to_request()
        )
        .await
        .status(),
        StatusCode::OK
    );
    assert_eq!(
        test::call_service(
            &app,
            test::TestRequest::get()
                .uri("/api/v1/mcp/session")
                .insert_header(("Authorization", auth))
                .to_request()
        )
        .await
        .status(),
        StatusCode::UNAUTHORIZED
    );
}

#[actix_web::test]
async fn conditional_write_prevents_publish_races_and_requires_draft_status() {
    use voidreg_api::db::ArticleFields;
    let db = Db::memory().await.unwrap();
    db.migrate().await.unwrap();
    let draft = ArticleFields {
        meta: Default::default(),
        revision: 1,
        slug: "racing-draft".into(),
        title: "Original".into(),
        category: "Systems".into(),
        summary: "Summary".into(),
        tags: vec![],
        status: "draft".into(),
        featured: false,
        sort_order: 0,
        published_at: None,
        reading_time_minutes: None,
        sections: "[]".into(),
        document: json!({"schemaVersion":1,"blocks":[]}).to_string(),
        document_version: 0,
        compiled: json!({"format":"publisle:publication","formatVersion":1,"identity":"fixture","rendererBuild":"1","html":"<p>Hello</p>","styles":[],"modules":[],"islands":[],"diagnostics":[]}).to_string(),
        content_hash: String::new(),
    };
    db.insert_article(draft.clone()).await.unwrap();
    let mut edited = draft.clone();
    edited.title = "MCP edit".into();
    let (publish, edit) = tokio::join!(
        db.publish_article_snapshot("racing-draft", 1),
        db.save_article(&edited, true)
    );
    assert_ne!(publish.is_ok(), edit.is_ok());
    let current = db.admin_get_article(&draft.slug).await.unwrap();
    assert_eq!(current.revision, 2);
    if publish.is_ok() {
        assert_eq!(current.status.as_str(), "published");
        assert_eq!(current.title, "Original");
        // Even a current revision cannot turn a live article back into a draft.
        edited.revision = current.revision;
        assert!(matches!(
            db.save_article(&edited, true).await,
            Err(voidreg_api::error::AppError::Conflict(_))
        ));
    } else {
        assert_eq!(current.status.as_str(), "draft");
        assert_eq!(current.title, "MCP edit");
    }
}

#[actix_web::test]
async fn the_bridge_files_drafts_under_projects_and_topics_without_touching_other_meta() {
    let db = Db::memory().await.unwrap();
    db.migrate().await.unwrap();
    let mut config = Config::for_test();
    config.admin_github_ids = vec!["owner".into()];
    let owner = db
        .upsert_identity("github", "owner", "", "Owner", None)
        .await
        .unwrap();
    let (random, _) = new_session_token();
    let token = format!("vr_mcp_{random}");
    db.create_mcp_token(&owner.id, "CLI", &hash_token(&token), 24)
        .await
        .unwrap();
    let auth = format!("Bearer {token}");
    let project = db
        .content_create(
            "project",
            json!({"slug":"alpha","status":"published","title":"Alpha","category":"Systems","summary":"A project","tags":[],"sections":[],"hero":null,"related_slugs":[],"related_project_ids":[],"repo_url":null,"has_detail_page":true,"featured":false,"sort_order":0,"document":{"schemaVersion":1,"blocks":[]}}),
        )
        .await
        .unwrap();
    let pid = project["id"].as_str().unwrap().to_owned();
    let app = test::init_service(build(db.clone(), config)).await;

    let call = |method: test::TestRequest, uri: &str, body: Option<Value>| {
        let mut request = method
            .uri(uri)
            .insert_header(("Authorization", auth.clone()));
        if let Some(body) = body {
            request = request.set_json(body);
        }
        test::call_service(&app, request.to_request())
    };

    // The bridge answers only to a valid token.
    let anonymous = test::call_service(
        &app,
        test::TestRequest::get()
            .uri("/api/v1/mcp/topics")
            .to_request(),
    )
    .await;
    assert_eq!(anonymous.status(), StatusCode::UNAUTHORIZED);

    let found: Value = test::read_body_json(
        call(test::TestRequest::get(), "/api/v1/mcp/projects/alpha", None).await,
    )
    .await;
    assert_eq!(found["id"], pid);

    let created = call(
        test::TestRequest::post(),
        "/api/v1/mcp/topics",
        Some(json!({"project_id": pid, "title": "Intro", "summary": "Start here"})),
    )
    .await;
    assert_eq!(created.status(), StatusCode::CREATED);
    let topic: Value = test::read_body_json(created).await;
    assert_eq!(topic["slug"], "intro");
    assert_eq!(topic["status"], "published");
    let topic_id = topic["id"].as_str().unwrap().to_owned();

    let listed: Value = test::read_body_json(
        call(
            test::TestRequest::get(),
            "/api/v1/mcp/topics?project=alpha",
            None,
        )
        .await,
    )
    .await;
    assert_eq!(listed["items"].as_array().unwrap().len(), 1);

    let renamed = call(
        test::TestRequest::put(),
        &format!("/api/v1/mcp/topics/{pid}/intro"),
        Some(json!({"expected_revision": topic["revision"], "title": "Introduction"})),
    )
    .await;
    assert_eq!(renamed.status(), StatusCode::OK);
    let stale = call(
        test::TestRequest::put(),
        &format!("/api/v1/mcp/topics/{pid}/intro"),
        Some(json!({"expected_revision": topic["revision"], "title": "Again"})),
    )
    .await;
    assert_eq!(stale.status(), StatusCode::CONFLICT);

    let compiled = json!({"format":"publisle:publication","formatVersion":1,"identity":"test","rendererBuild":"1","html":"","styles":[],"modules":[],"islands":[],"diagnostics":[]});
    let document = json!({"schemaVersion":1,"blocks":[]});
    // Filing and the blog presentation fields can change. The discussion link cannot.
    let post: Value = test::read_body_json(
        call(
            test::TestRequest::post(),
            "/api/v1/mcp/articles",
            Some(json!({
                "slug":"filed","title":"Filed","category":"Notes","summary":"A post",
                "document":document,"compiled":compiled,
                "meta":{"project_ids":[pid],"topic_id":topic_id,"seo_title":"hijacked","hero_image":"https://cdn.example/cover.png"}
            })),
        )
        .await,
    )
    .await;
    assert_eq!(post["project_ids"], json!([pid]));
    assert_eq!(post["topic_id"], topic_id);
    assert_eq!(post["seo_title"], "hijacked");
    assert_eq!(post["hero_image"], "https://cdn.example/cover.png");
    assert_eq!(post["media_ids"], json!([]));
    let missing_media = call(
        test::TestRequest::put(),
        "/api/v1/mcp/articles/filed",
        Some(json!({
            "expected_revision": post["revision"],
            "meta": {"media_ids": ["00000000-0000-0000-0000-000000000000.png"]}
        })),
    )
    .await;
    assert_eq!(missing_media.status(), StatusCode::UNPROCESSABLE_ENTITY);
    let locked = call(
        test::TestRequest::put(),
        "/api/v1/mcp/articles/filed",
        Some(json!({
            "expected_revision": post["revision"],
            "meta": {"discussion_slug": "other"}
        })),
    )
    .await;
    assert_eq!(locked.status(), StatusCode::FORBIDDEN);

    let cleared: Value = test::read_body_json(
        call(
            test::TestRequest::put(),
            "/api/v1/mcp/articles/filed",
            Some(json!({
                "expected_revision": post["revision"],
                "meta":{"project_ids":[pid],"topic_id":null,"seo_title":"hijacked"}
            })),
        )
        .await,
    )
    .await;
    assert!(cleared.get("topic_id").is_none_or(Value::is_null));
    assert_eq!(cleared["project_ids"], json!([pid]));
    assert_eq!(cleared["discussion_slug"], post["discussion_slug"]);
    assert_eq!(cleared["seo_title"], "hijacked");
    assert_eq!(cleared["hero_image"], "https://cdn.example/cover.png");

    let forbidden = call(
        test::TestRequest::put(),
        "/api/v1/mcp/articles/filed",
        Some(json!({"expected_revision": cleared["revision"], "featured": true})),
    )
    .await;
    assert_eq!(forbidden.status(), StatusCode::FORBIDDEN);
}

#[actix_web::test]
async fn project_permission_creates_and_edits_project_drafts_but_never_published_projects() {
    let db = Db::memory().await.unwrap();
    db.migrate().await.unwrap();
    let mut config = Config::for_test();
    config.admin_github_ids = vec!["owner".into()];
    let owner = db
        .upsert_identity("github", "owner", "", "Owner", None)
        .await
        .unwrap();
    let (admin, hash) = new_session_token();
    db.create_session("admin", &hash, Some(&owner.id), 1)
        .await
        .unwrap();
    let csrf = voidreg_api::api::v1::admin::session::csrf_for(&admin);
    let cookie = Cookie::new("voidreg_admin_session", admin);
    let app = test::init_service(build(db.clone(), config)).await;

    let mint = |scopes: Value| {
        test::TestRequest::post()
            .uri("/api/v1/admin/mcp-tokens")
            .cookie(cookie.clone())
            .insert_header(("X-CSRF-Token", csrf.clone()))
            .set_json(json!({"name":"Client","scopes":scopes}))
            .to_request()
    };
    // Unknown permissions are refused; a plain token carries none.
    assert_eq!(
        test::call_service(&app, mint(json!(["publish"])))
            .await
            .status(),
        StatusCode::UNPROCESSABLE_ENTITY
    );
    let plain: Value = test::call_and_read_body_json(&app, mint(json!([]))).await;
    let wide: Value =
        test::call_and_read_body_json(&app, mint(json!(["projects", "projects"]))).await;
    assert_eq!(plain["connection"]["scopes"], json!([]));
    assert_eq!(wide["connection"]["scopes"], json!(["projects"]));
    let plain = format!("Bearer {}", plain["token"].as_str().unwrap());
    let wide = format!("Bearer {}", wide["token"].as_str().unwrap());

    let call = |method: test::TestRequest, auth: &str, uri: &str, body: Option<Value>| {
        let mut request = method
            .uri(uri)
            .insert_header(("Authorization", auth.to_owned()));
        if let Some(body) = body {
            request = request.set_json(body);
        }
        test::call_service(&app, request.to_request())
    };
    let draft = json!({
        "slug": "first",
        "title": "First",
        "category": "Systems",
        "summary": "A draft project",
        "tags": ["rust"],
        "featured": true,
        "sort_order": 5,
        "document": {"schemaVersion":1,"blocks":[]}
    });

    let session: Value = test::read_body_json(
        call(test::TestRequest::get(), &wide, "/api/v1/mcp/session", None).await,
    )
    .await;
    assert_eq!(session["scopes"], json!(["projects"]));
    let denied = call(
        test::TestRequest::post(),
        &plain,
        "/api/v1/mcp/projects",
        Some(draft.clone()),
    )
    .await;
    assert_eq!(denied.status(), StatusCode::FORBIDDEN);

    let created = call(
        test::TestRequest::post(),
        &wide,
        "/api/v1/mcp/projects",
        Some(draft.clone()),
    )
    .await;
    assert_eq!(created.status(), StatusCode::CREATED);
    let created: Value = test::read_body_json(created).await;
    assert_eq!(created["status"], "draft");
    let revision = created["revision"].as_i64().unwrap();

    // Compiled output and URL renames stay with the owner. Cover and search fields are
    // accepted and checked against the media library in the upload test.
    for key in ["compiled", "pending_slug", "slug"] {
        let response = call(
            test::TestRequest::put(),
            &wide,
            "/api/v1/mcp/projects/first",
            Some(json!({"expected_revision": revision, key: "x"})),
        )
        .await;
        assert_eq!(response.status(), StatusCode::FORBIDDEN, "{key}");
    }
    let updated = call(
        test::TestRequest::put(),
        &wide,
        "/api/v1/mcp/projects/first",
        Some(json!({"expected_revision": revision, "title": "First, revised"})),
    )
    .await;
    assert_eq!(updated.status(), StatusCode::OK);
    let stale = call(
        test::TestRequest::put(),
        &wide,
        "/api/v1/mcp/projects/first",
        Some(json!({"expected_revision": revision, "title": "Stale"})),
    )
    .await;
    assert_eq!(stale.status(), StatusCode::CONFLICT);
    let denied = call(
        test::TestRequest::put(),
        &plain,
        "/api/v1/mcp/projects/first",
        Some(json!({"expected_revision": revision + 1, "title": "No"})),
    )
    .await;
    assert_eq!(denied.status(), StatusCode::FORBIDDEN);

    // Nothing is public, and a published project cannot be edited with a token.
    let public: Value = test::call_and_read_body_json(
        &app,
        test::TestRequest::get()
            .uri("/api/v1/projects")
            .to_request(),
    )
    .await;
    assert!(public["items"].as_array().unwrap().is_empty());
    let live = db
        .content_create(
            "project",
            json!({"slug":"live","status":"published","title":"Live","category":"Systems","summary":"A project","tags":[],"sections":[],"hero":null,"related_slugs":[],"related_project_ids":[],"repo_url":null,"has_detail_page":true,"featured":false,"sort_order":0,"document":{"schemaVersion":1,"blocks":[]}}),
        )
        .await
        .unwrap();
    let refused = call(
        test::TestRequest::put(),
        &wide,
        "/api/v1/mcp/projects/live",
        Some(json!({"expected_revision": live["revision"], "title": "Hijacked"})),
    )
    .await;
    assert_eq!(refused.status(), StatusCode::CONFLICT);
    let listed: Value = test::read_body_json(
        call(
            test::TestRequest::get(),
            &plain,
            "/api/v1/mcp/projects",
            None,
        )
        .await,
    )
    .await;
    assert_eq!(listed["items"].as_array().unwrap().len(), 2);
}

#[actix_web::test]
async fn mcp_uploads_images_and_sets_draft_cover_and_search_fields() {
    let dir = std::env::temp_dir().join(format!("voidreg-mcp-media-{}", std::process::id()));
    std::fs::create_dir_all(&dir).unwrap();
    let _cleanup = RemoveDir(&dir);
    // SAFETY: this test is the only reader or writer of MEDIA_PATH.
    unsafe { std::env::set_var("MEDIA_PATH", &dir) };

    let db = Db::memory().await.unwrap();
    db.migrate().await.unwrap();
    let mut config = Config::for_test();
    config.admin_github_ids = vec!["owner".into()];
    let owner = db
        .upsert_identity("github", "owner", "", "Owner", None)
        .await
        .unwrap();
    let (admin, hash) = new_session_token();
    db.create_session("admin", &hash, Some(&owner.id), 1)
        .await
        .unwrap();
    let csrf = voidreg_api::api::v1::admin::session::csrf_for(&admin);
    let cookie = Cookie::new("voidreg_admin_session", admin);
    let app = test::init_service(build(db.clone(), config)).await;
    let minted: Value = test::call_and_read_body_json(
        &app,
        test::TestRequest::post()
            .uri("/api/v1/admin/mcp-tokens")
            .cookie(cookie)
            .insert_header(("X-CSRF-Token", csrf))
            .set_json(json!({"name":"Blog","scopes":["projects"]}))
            .to_request(),
    )
    .await;
    let auth = format!("Bearer {}", minted["token"].as_str().unwrap());
    let call = |method: test::TestRequest, uri: &str, body: Option<Value>| {
        let mut request = method
            .uri(uri)
            .insert_header(("Authorization", auth.clone()));
        if let Some(body) = body {
            request = request.set_json(body);
        }
        test::call_service(&app, request.to_request())
    };
    let png = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
    let missing_alt = call(
        test::TestRequest::post(),
        "/api/v1/mcp/media",
        Some(json!({"name":"Cover","data":png})),
    )
    .await;
    assert_eq!(missing_alt.status(), StatusCode::UNPROCESSABLE_ENTITY);
    let garbage = call(
        test::TestRequest::post(),
        "/api/v1/mcp/media",
        Some(json!({"name":"Cover","alt":"A pixel","data":"aGVsbG8="})),
    )
    .await;
    assert_eq!(garbage.status(), StatusCode::UNPROCESSABLE_ENTITY);
    let uploaded = call(
        test::TestRequest::post(),
        "/api/v1/mcp/media",
        Some(json!({"name":"Cover","alt":"A pixel","caption":"One pixel","data":png})),
    )
    .await;
    assert_eq!(uploaded.status(), StatusCode::CREATED);
    let asset: Value = test::read_body_json(uploaded).await;
    assert_eq!(asset["alt"], "A pixel");
    assert_eq!(asset["width"], 1);
    let id = asset["id"].as_str().unwrap();
    let url = asset["url"].as_str().unwrap().to_owned();
    assert!(url.ends_with(id));
    assert!(dir.join(id).is_file());

    let renamed = call(
        test::TestRequest::put(),
        &format!("/api/v1/mcp/media/{id}"),
        Some(json!({"caption":"The cover"})),
    )
    .await;
    assert_eq!(renamed.status(), StatusCode::OK);
    let library: Value =
        test::read_body_json(call(test::TestRequest::get(), "/api/v1/mcp/media", None).await).await;
    assert_eq!(library["items"][0]["caption"], "The cover");

    let compiled = json!({"format":"publisle:publication","formatVersion":1,"identity":"test","rendererBuild":"1","html":"","styles":[],"modules":[],"islands":[],"diagnostics":[]});
    let post: Value = test::read_body_json(
        call(
            test::TestRequest::post(),
            "/api/v1/mcp/articles",
            Some(json!({
                "slug":"with-cover","title":"With cover","category":"Notes","summary":"A post",
                "document":{"schemaVersion":1,"blocks":[]},"compiled":compiled
            })),
        )
        .await,
    )
    .await;
    let updated: Value = test::read_body_json(
        call(
            test::TestRequest::put(),
            "/api/v1/mcp/articles/with-cover",
            Some(json!({
                "expected_revision": post["revision"],
                "meta": {"hero_image": url, "seo_title": "Covered", "media_ids": [id]}
            })),
        )
        .await,
    )
    .await;
    assert_eq!(updated["hero_image"], url);
    assert_eq!(updated["seo_title"], "Covered");
    assert_eq!(updated["media_ids"], json!([id]));
    assert_eq!(updated["title"], "With cover");

    let project = call(
        test::TestRequest::post(),
        "/api/v1/mcp/projects",
        Some(json!({
            "slug":"covered","title":"Covered","category":"Notes","summary":"A project",
            "document":{"schemaVersion":1,"blocks":[]},
            "hero_image": url,
            "seo_description": "The project card",
            "media_ids": [url]
        })),
    )
    .await;
    assert_eq!(project.status(), StatusCode::CREATED);
    let project: Value = test::read_body_json(project).await;
    assert_eq!(project["hero_image"], url);
    assert_eq!(project["seo_description"], "The project card");
    assert_eq!(project["media_ids"], json!([id]));

    let missing = call(
        test::TestRequest::put(),
        "/api/v1/mcp/projects/covered",
        Some(json!({
            "expected_revision": project["revision"],
            "hero_image": "/media/00000000-0000-0000-0000-000000000000.png"
        })),
    )
    .await;
    assert_eq!(missing.status(), StatusCode::UNPROCESSABLE_ENTITY);
    let removed = call(
        test::TestRequest::delete(),
        &format!("/api/v1/mcp/media/{id}"),
        None,
    )
    .await;
    assert_eq!(removed.status(), StatusCode::NOT_FOUND);
    assert!(dir.join(id).is_file());
}

struct RemoveDir<'a>(&'a std::path::Path);
impl Drop for RemoveDir<'_> {
    fn drop(&mut self) {
        let _ = std::fs::remove_dir_all(self.0);
    }
}

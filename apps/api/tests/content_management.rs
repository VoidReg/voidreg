#[path = "support/compiler.rs"]
mod compiler;
use serde_json::{Value, json};
use voidreg_api::{
    config::Config,
    db::{Db, content::ContentQuery},
};
fn content(slug: &str) -> Value {
    json!({"slug":slug,"title":"A complete project","category":"Systems","summary":"A project overview","tags":["Rust"],"sections":[],"hero":null,"related_slugs":[],"repo_url":null,"has_detail_page":true,"featured":true,"sort_order":0,"published_at":null,"reading_time_minutes":null,"content_hash":"","document":{"schemaVersion":1,"metadata":{"title":"A complete project","language":"en"},"blocks":[{"id":"018fabc0-0000-4000-8000-000000000001","type":"publisle:paragraph","schemaVersion":1,"data":{"content":[{"type":"text","value":"Project details"}]}}]},"compiled":{"format":"publisle:publication","formatVersion":1,"identity":"fixture","rendererBuild":"1","html":"<p>Project details</p>","styles":[],"modules":[],"islands":[],"diagnostics":[]}})
}
#[actix_web::test]
async fn snapshots_relationships_aliases_archive_and_revision_conflicts() {
    let db = Db::memory().await.unwrap();
    db.migrate().await.unwrap();
    let project = db
        .content_create("project", content("sample"))
        .await
        .unwrap();
    let id = project["id"].clone();
    assert!(db.get_project("sample").await.is_err());
    db.content_action("project", "sample", 1, "publish")
        .await
        .unwrap();
    let mut draft = db.content_get("project", "sample", false).await.unwrap();
    draft["title"] = json!("Private changes");
    draft["pending_slug"] = json!("renamed");
    db.content_save("project", "sample", 2, draft.clone(), false)
        .await
        .unwrap();
    assert_eq!(
        db.get_project("sample").await.unwrap().title,
        "A complete project"
    );
    assert!(
        db.content_save("project", "sample", 2, draft, false)
            .await
            .is_err()
    );
    let updated = db
        .content_action("project", "sample", 3, "publish")
        .await
        .unwrap();
    assert_eq!(updated["slug"], "renamed");
    assert_eq!(db.get_project("sample").await.unwrap().slug, "renamed");
    assert_eq!(
        db.get_project("renamed").await.unwrap().meta.id,
        id.as_str().unwrap()
    );
    assert!(
        db.content_create("project", content("sample"))
            .await
            .is_err()
    );
    let mut post = content("project-note");
    post["project_ids"] = json!([id]);
    db.content_create("article", post).await.unwrap();
    db.content_action("article", "project-note", 1, "publish")
        .await
        .unwrap();
    let page = db
        .content_page(
            "article",
            true,
            &ContentQuery {
                project_id: Some(id.as_str().unwrap().into()),
                ..Default::default()
            },
        )
        .await
        .unwrap();
    assert_eq!(page["total"], 1);
    assert!(page["items"][0].get("document").is_none());
    assert!(page["items"][0].get("compiled").is_none());
    assert!(
        db.content_action("project", "renamed", 4, "delete")
            .await
            .is_err()
    );
    assert_eq!(
        db.discussion_key("project-note").await.unwrap(),
        "project-note"
    );
    let mut post = db
        .content_get("article", "project-note", false)
        .await
        .unwrap();
    post["pending_slug"] = json!("new-note");
    post["project_ids"] = json!([]);
    db.content_save("article", "project-note", 2, post, false)
        .await
        .unwrap();
    assert_eq!(
        db.content_page(
            "article",
            true,
            &ContentQuery {
                project_id: Some(id.as_str().unwrap().into()),
                ..Default::default()
            }
        )
        .await
        .unwrap()["total"],
        1
    );
    db.content_action("article", "project-note", 3, "publish")
        .await
        .unwrap();
    assert_eq!(db.discussion_key("new-note").await.unwrap(), "project-note");
    assert_eq!(
        db.content_page(
            "article",
            true,
            &ContentQuery {
                project_id: Some(id.as_str().unwrap().into()),
                ..Default::default()
            }
        )
        .await
        .unwrap()["total"],
        0
    );
    db.content_action("project", "renamed", 4, "archive")
        .await
        .unwrap();
    assert!(db.get_project("sample").await.is_err());
    db.content_action("project", "renamed", 5, "restore")
        .await
        .unwrap();
    assert!(db.get_project("renamed").await.is_err());
    db.content_action("project", "renamed", 6, "delete")
        .await
        .unwrap();
    db.migrate().await.unwrap();
    assert!(db.content_get("project", "sample", false).await.is_err());
}
#[actix_web::test]
async fn migrations_and_disk_persistence_preserve_existing_content() {
    let path = std::env::temp_dir().join(format!("voidreg-content-{}.db", uuid::Uuid::new_v4()));
    let mut config = Config::for_test();
    config.database_url = path.to_str().unwrap().into();
    let db = Db::connect(&config).await.unwrap();
    db.migrate().await.unwrap();
    db.seed_if_empty().await.unwrap();
    let before = db.get_project("minirt").await.unwrap();
    let mut value = db.content_get("project", "minirt", false).await.unwrap();
    value["title"] = json!("Admin edit");
    db.content_save("project", "minirt", 1, value, false)
        .await
        .unwrap();
    db.migrate().await.unwrap();
    db.seed_if_empty().await.unwrap();
    db.migrate().await.unwrap();
    assert_eq!(
        db.content_get("project", "minirt", false).await.unwrap()["title"],
        "Admin edit"
    );
    assert_eq!(db.get_project("minirt").await.unwrap().title, before.title);
    drop(db);
    let db = Db::connect(&config).await.unwrap();
    db.migrate().await.unwrap();
    assert_eq!(
        db.content_get("project", "minirt", false).await.unwrap()["title"],
        "Admin edit"
    );
    drop(db);
    let _ = std::fs::remove_file(path);
}
#[actix_web::test]
async fn invalid_associations_and_media_references_are_checked() {
    let db = Db::memory().await.unwrap();
    db.migrate().await.unwrap();
    let mut value = content("bad-link");
    value["project_ids"] = json!([uuid::Uuid::new_v4().to_string()]);
    db.content_create("article", value).await.unwrap();
    assert!(
        db.content_action("article", "bad-link", 1, "publish")
            .await
            .is_err()
    );
    let mut bad = content("invalid");
    bad["hero_image"] = json!("javascript:alert(1)");
    assert!(db.content_create("project", bad).await.is_err());
    let filename = format!("{}.png", uuid::Uuid::new_v4());
    let url = format!("/media/{filename}");
    db.media_save(
        &filename,
        &json!({"id":filename,"url":url,"alt":"A useful image","caption":"Caption"}),
    )
    .await
    .unwrap();
    let mut value = content("with-image");
    value["hero_image"] = json!(url);
    db.content_create("project", value).await.unwrap();
    assert!(db.media_delete(&filename).await.is_err());
    let published = db
        .content_action("project", "with-image", 1, "publish")
        .await
        .unwrap();
    assert_eq!(published["hero_alt"], "A useful image");
    db.content_action("project", "with-image", 2, "delete")
        .await
        .unwrap();
    db.media_delete(&filename).await.unwrap();
}

#[actix_web::test]
async fn project_http_management_validates_fields_and_invalidates_stale_compilation() {
    use actix_web::{cookie::Cookie, http::StatusCode, test};
    let db = Db::memory().await.unwrap();
    db.migrate().await.unwrap();
    let (token, hash) = voidreg_api::auth::new_session_token();
    db.create_session("admin", &hash, None, 1).await.unwrap();
    let csrf = voidreg_api::api::v1::admin::session::csrf_for(&token);
    let cookie = Cookie::new("voidreg_admin_session", token);
    let compiler = compiler::Compiler::start();
    let mut config = Config::for_test();
    compiler.configure(&mut config);
    let app = test::init_service(voidreg_api::app::build(db, config)).await;
    let request = test::TestRequest::get()
        .uri("/api/v1/admin/projects")
        .to_request();
    assert_eq!(
        test::call_service(&app, request).await.status(),
        StatusCode::UNAUTHORIZED
    );
    let mut invalid = content("bad-tags");
    invalid["tags"] = json!([42]);
    let request = test::TestRequest::post()
        .uri("/api/v1/admin/projects")
        .cookie(cookie.clone())
        .insert_header(("X-CSRF-Token", csrf.clone()))
        .set_json(invalid)
        .to_request();
    assert_eq!(
        test::call_service(&app, request).await.status(),
        StatusCode::UNPROCESSABLE_ENTITY
    );
    let request = test::TestRequest::post()
        .uri("/api/v1/admin/projects")
        .cookie(cookie.clone())
        .insert_header(("X-CSRF-Token", csrf.clone()))
        .set_json(content("http-project"))
        .to_request();
    let response = test::call_service(&app, request).await;
    assert_eq!(response.status(), StatusCode::CREATED);
    let compilation: Value = test::call_and_read_body_json(
        &app,
        test::TestRequest::post()
            .uri("/api/v1/admin/projects/http-project/compile")
            .cookie(cookie.clone())
            .insert_header(("X-CSRF-Token", csrf.clone()))
            .set_json(json!({"expected_revision":1}))
            .to_request(),
    )
    .await;
    let request = test::TestRequest::post()
        .uri("/api/v1/admin/projects/http-project/publish")
        .cookie(cookie.clone())
        .insert_header(("X-CSRF-Token", csrf.clone()))
        .set_json(json!({"expected_revision":1,"compilation_id":compilation["id"]}))
        .to_request();
    assert_eq!(
        test::call_service(&app, request).await.status(),
        StatusCode::OK
    );
    let document = json!({"schemaVersion":1,"blocks":[]});
    let request=test::TestRequest::put().uri("/api/v1/admin/projects/http-project").cookie(cookie.clone()).insert_header(("X-CSRF-Token",csrf.clone())).set_json(json!({"expected_revision":2,"document":document,"summary":"Private new summary","unrecognized":"must not be stored"})).to_request();
    let response: Value = test::call_and_read_body_json(&app, request).await;
    assert!(response["compiled"].is_null());
    assert!(response.get("unrecognized").is_none());
    assert!(response.get("expected_revision").is_none());
    let public: Value = test::call_and_read_body_json(
        &app,
        test::TestRequest::get()
            .uri("/api/v1/projects/http-project")
            .to_request(),
    )
    .await;
    assert_eq!(public["summary"], "A project overview");
    let request = test::TestRequest::post()
        .uri("/api/v1/admin/projects/http-project/publish")
        .cookie(cookie)
        .insert_header(("X-CSRF-Token", csrf))
        .set_json(json!({"expected_revision":3}))
        .to_request();
    assert_eq!(
        test::call_service(&app, request).await.status(),
        StatusCode::UNPROCESSABLE_ENTITY
    );
}

#[actix_web::test]
async fn artifact_refresh_never_publishes_private_working_changes() {
    let db = Db::memory().await.unwrap();
    db.migrate().await.unwrap();
    db.content_create("project", content("refresh-project"))
        .await
        .unwrap();
    db.content_action("project", "refresh-project", 1, "publish")
        .await
        .unwrap();
    let original = db
        .content_get("project", "refresh-project", true)
        .await
        .unwrap();
    let mut working = db
        .content_get("project", "refresh-project", false)
        .await
        .unwrap();
    working["title"] = json!("Private working title");
    working["summary"] = json!("Unpublished summary");
    working["document"]["blocks"][0]["data"]["content"][0]["value"] = json!("Private source");
    db.content_save("project", "refresh-project", 2, working, false)
        .await
        .unwrap();
    let filename = format!("{}-light.png", "a".repeat(64));
    assert!(!db.diagram_is_published(&filename).await.unwrap());
    let mut artifact = original["compiled"].clone();
    artifact["html"] = json!(format!(
        "<img src=\"/media/diagrams/{filename}\" alt=\"Diagram\">"
    ));
    db.refresh_publication("project", "refresh-project", 3, artifact.clone())
        .await
        .unwrap();
    let public = db
        .content_get("project", "refresh-project", true)
        .await
        .unwrap();
    let draft = db
        .content_get("project", "refresh-project", false)
        .await
        .unwrap();
    assert_eq!(public["document"], original["document"]);
    assert_eq!(public["title"], original["title"]);
    assert_eq!(public["summary"], original["summary"]);
    assert_eq!(public["published_at"], original["published_at"]);
    assert_eq!(public["compiled"], artifact);
    assert_eq!(draft["title"], "Private working title");
    assert_eq!(
        draft["document"]["blocks"][0]["data"]["content"][0]["value"],
        "Private source"
    );
    assert_eq!(draft["revision"], 4);
    assert!(db.diagram_is_published(&filename).await.unwrap());
    assert!(
        db.refresh_publication("project", "refresh-project", 3, artifact)
            .await
            .is_err()
    );
    db.content_action("project", "refresh-project", 4, "unpublish")
        .await
        .unwrap();
    assert!(!db.diagram_is_published(&filename).await.unwrap());
}

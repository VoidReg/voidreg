use actix_web::{cookie::Cookie, http::StatusCode, test};
use serde_json::{Value, json};
use voidreg_api::{config::Config, db::Db, error::AppError};

fn content(slug: &str, title: &str) -> Value {
    json!({"slug":slug,"title":title,"category":"Systems","summary":"A project overview","tags":["Rust"],"sections":[],"hero":null,"related_slugs":[],"related_project_ids":[],"repo_url":null,"has_detail_page":true,"featured":false,"sort_order":0,"document":{"schemaVersion":1,"metadata":{"title":title,"language":"en"},"blocks":[{"id":"018fabc0-0000-4000-8000-000000000001","type":"publisle:paragraph","schemaVersion":1,"data":{"content":[{"type":"text","value":format!("Body of {title} with several words")}]}}]},"compiled":{"format":"publisle:publication","formatVersion":1,"identity":"fixture","rendererBuild":"1","html":"<p>Details</p>","styles":[],"modules":[],"islands":[],"diagnostics":[]}})
}
async fn db() -> Db {
    let db = Db::memory().await.unwrap();
    db.migrate().await.unwrap();
    db
}
/// Saves a new title on top of the current working copy and returns the new revision.
async fn retitle(db: &Db, slug: &str, revision: i64, title: &str) -> i64 {
    let mut value = db.content_get("project", slug, false).await.unwrap();
    value["title"] = json!(title);
    value["document"]["blocks"][0]["data"]["content"][0]["value"] =
        json!(format!("Body of {title}"));
    db.content_save("project", slug, revision, value, false)
        .await
        .unwrap()["revision"]
        .as_i64()
        .unwrap()
}
async fn events(db: &Db, slug: &str) -> Vec<String> {
    let list = db
        .revisions_list("project", slug, None, Some(100))
        .await
        .unwrap();
    list["items"]
        .as_array()
        .unwrap()
        .iter()
        .map(|i| i["event"].as_str().unwrap().to_owned())
        .collect()
}

#[actix_web::test]
async fn milestones_are_kept_and_autosaves_coalesce_without_compiled_output() {
    let db = db().await;
    db.content_create("project", content("alpha", "One"))
        .await
        .unwrap();
    let mut rev = 1;
    for title in ["Two", "Three", "Four"] {
        rev = retitle(&db, "alpha", rev, title).await;
    }
    assert_eq!(rev, 4);
    assert_eq!(
        events(&db, "alpha").await,
        ["save", "create"],
        "three quick autosaves collapse into one row"
    );
    db.content_action("project", "alpha", rev, "publish")
        .await
        .unwrap();
    rev = retitle(&db, "alpha", 5, "Five").await;
    db.content_action("project", "alpha", rev, "unpublish")
        .await
        .unwrap();
    assert_eq!(
        events(&db, "alpha").await,
        ["unpublish", "save", "publish", "save", "create"],
        "a save after a milestone keeps its own row"
    );
    let list = db
        .revisions_list("project", "alpha", None, None)
        .await
        .unwrap();
    let newest = &list["items"][0];
    assert_eq!(newest["revision"], 7);
    assert_eq!(newest["title"], "Five");
    assert_eq!(newest["blocks"], 1);
    assert!(newest["words"].as_i64().unwrap() >= 2);
    assert_eq!(list["current"], 7);
    let snapshot = db.revision_get("project", "alpha", 5).await.unwrap();
    assert_eq!(snapshot["event"], "publish");
    assert_eq!(snapshot["snapshot"]["title"], "Four");
    assert!(
        snapshot["snapshot"].get("compiled").is_none(),
        "snapshots never store compiled output"
    );
    assert!(matches!(
        db.revision_get("project", "alpha", 99).await,
        Err(AppError::NotFound(_))
    ));
}

#[actix_web::test]
async fn retention_is_bounded_and_the_live_publication_survives() {
    let db = db().await;
    db.content_create("project", content("bounded", "Start"))
        .await
        .unwrap();
    db.content_action("project", "bounded", 1, "publish")
        .await
        .unwrap();
    let mut rev = 2;
    for i in 0..110 {
        rev = retitle(&db, "bounded", rev, &format!("Edit {i}")).await;
        db.content_action("project", "bounded", rev, "unpublish")
            .await
            .unwrap();
        rev += 1;
        db.content_action("project", "bounded", rev, "publish")
            .await
            .unwrap();
        rev += 1;
    }
    let mut saves = 0;
    let mut milestones = 0;
    let mut live = 0;
    let mut before = None;
    loop {
        let page = db
            .revisions_list("project", "bounded", before, Some(100))
            .await
            .unwrap();
        for item in page["items"].as_array().unwrap() {
            if item["event"] == "save" {
                saves += 1;
            } else {
                milestones += 1;
            }
            if item["live"] == true {
                live += 1;
                assert_eq!(item["event"], "publish");
            }
        }
        if page["has_more"] != true {
            break;
        }
        before = page["items"]
            .as_array()
            .unwrap()
            .last()
            .map(|i| i["revision"].as_i64().unwrap());
    }
    assert_eq!(saves, 50, "autosave rows are capped");
    assert_eq!(milestones, 200, "milestone rows are capped");
    assert_eq!(live, 1, "the published revision is still available");
}

#[actix_web::test]
async fn restoring_makes_a_new_working_revision_and_never_touches_the_public_copy() {
    let db = db().await;
    db.content_create("project", content("restore-me", "Original"))
        .await
        .unwrap();
    db.content_action("project", "restore-me", 1, "publish")
        .await
        .unwrap();
    let rev = retitle(&db, "restore-me", 2, "Edited").await;
    assert_eq!(rev, 3);

    assert!(
        matches!(
            db.revision_restore("project", "restore-me", 2, 2).await,
            Err(AppError::Conflict(_))
        ),
        "stale expected revision"
    );
    assert!(matches!(
        db.revision_restore("project", "restore-me", 42, 3).await,
        Err(AppError::NotFound(_))
    ));
    let restored = db
        .revision_restore("project", "restore-me", 2, 3)
        .await
        .unwrap();
    assert_eq!(restored["title"], "Original");
    assert_eq!(restored["revision"], 4);
    assert_eq!(restored["slug"], "restore-me");
    assert_eq!(restored["has_unpublished_changes"], true);
    assert!(
        restored.get("compiled").is_none(),
        "compiled output is regenerated"
    );
    assert_eq!(events(&db, "restore-me").await[0], "revert");

    let public = db.content_get("project", "restore-me", true).await.unwrap();
    assert_eq!(public["title"], "Original", "public copy untouched");
    // The restored draft can be edited, published again, and restored from older history.
    let rev = retitle(&db, "restore-me", 4, "Third").await;
    let again = db
        .revision_restore("project", "restore-me", 3, rev)
        .await
        .unwrap();
    assert_eq!(again["title"], "Edited");

    db.content_action(
        "project",
        "restore-me",
        again["revision"].as_i64().unwrap(),
        "archive",
    )
    .await
    .unwrap();
    assert!(
        matches!(
            db.revision_restore("project", "restore-me", 2, 7).await,
            Err(AppError::Conflict(_))
        ),
        "archived content must be restored first"
    );
}

#[actix_web::test]
async fn history_survives_slug_renames_and_is_keyed_by_entry() {
    let db = db().await;
    db.content_create("project", content("old-name", "Renamable"))
        .await
        .unwrap();
    db.content_action("project", "old-name", 1, "publish")
        .await
        .unwrap();
    let mut value = db.content_get("project", "old-name", false).await.unwrap();
    value["pending_slug"] = json!("new-name");
    let saved = db
        .content_save("project", "old-name", 2, value, false)
        .await
        .unwrap();
    db.content_action(
        "project",
        "old-name",
        saved["revision"].as_i64().unwrap(),
        "publish",
    )
    .await
    .unwrap();
    let by_new = events(&db, "new-name").await;
    let by_old = events(&db, "old-name").await;
    assert_eq!(by_new, by_old, "aliases resolve to the same history");
    assert!(by_new.starts_with(&["publish".to_owned(), "save".to_owned()]));
}

#[actix_web::test]
async fn http_history_requires_a_session_and_restores_with_csrf() {
    let db = db().await;
    let (token, hash) = voidreg_api::auth::new_session_token();
    db.create_session("admin", &hash, None, 1).await.unwrap();
    let csrf = voidreg_api::api::v1::admin::session::csrf_for(&token);
    let cookie = Cookie::new("voidreg_admin_session", token);
    db.content_create("project", content("http-history", "Before"))
        .await
        .unwrap();
    retitle(&db, "http-history", 1, "After").await;
    let app = test::init_service(voidreg_api::app::build(db, Config::for_test())).await;

    let anonymous = test::TestRequest::get()
        .uri("/api/v1/admin/projects/http-history/revisions")
        .to_request();
    assert_eq!(
        test::call_service(&app, anonymous).await.status(),
        StatusCode::UNAUTHORIZED
    );

    let list: Value = test::call_and_read_body_json(
        &app,
        test::TestRequest::get()
            .uri("/api/v1/admin/projects/http-history/revisions?limit=10")
            .cookie(cookie.clone())
            .to_request(),
    )
    .await;
    assert_eq!(list["items"].as_array().unwrap().len(), 2);
    let one: Value = test::call_and_read_body_json(
        &app,
        test::TestRequest::get()
            .uri("/api/v1/admin/projects/http-history/revisions/1")
            .cookie(cookie.clone())
            .to_request(),
    )
    .await;
    assert_eq!(one["snapshot"]["title"], "Before");

    let without_csrf = test::TestRequest::post()
        .uri("/api/v1/admin/projects/http-history/revisions/1/restore")
        .cookie(cookie.clone())
        .set_json(json!({"expected_revision":2}))
        .to_request();
    assert!(
        !test::call_service(&app, without_csrf)
            .await
            .status()
            .is_success()
    );

    let restored: Value = test::call_and_read_body_json(
        &app,
        test::TestRequest::post()
            .uri("/api/v1/admin/projects/http-history/revisions/1/restore")
            .cookie(cookie.clone())
            .insert_header(("X-CSRF-Token", csrf.clone()))
            .set_json(json!({"expected_revision":2}))
            .to_request(),
    )
    .await;
    assert_eq!(restored["title"], "Before");
    let unknown = test::TestRequest::get()
        .uri("/api/v1/admin/widgets/http-history/revisions")
        .cookie(cookie)
        .to_request();
    assert_eq!(
        test::call_service(&app, unknown).await.status(),
        StatusCode::NOT_FOUND
    );
}

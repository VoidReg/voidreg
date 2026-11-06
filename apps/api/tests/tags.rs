use actix_web::{cookie::Cookie, http::StatusCode, test};
use serde_json::{Value, json};
use voidreg_api::{config::Config, db::Db, domain::normalize_tags};

fn document(text: &str) -> Value {
    json!({"schemaVersion":1,"metadata":{"title":"T","language":"en"},"blocks":[{"id":"018fabc0-0000-4000-8000-000000000001","type":"publisle:paragraph","schemaVersion":1,"data":{"content":[{"type":"text","value":text}]}}]})
}
fn project(slug: &str, tags: Value) -> Value {
    json!({"slug":slug,"title":slug,"category":"Systems","summary":"A project","tags":tags,"sections":[],"hero":null,"related_slugs":[],"related_project_ids":[],"repo_url":null,"has_detail_page":true,"featured":false,"sort_order":0,"document":document("Body")})
}
fn article(slug: &str, tags: Value) -> Value {
    json!({"slug":slug,"title":slug,"category":"Notes","summary":"A post","tags":tags,"status":"draft","featured":false,"sort_order":0,"sections":[],"project_ids":[],"document":document("Body")})
}

#[actix_web::test]
async fn tags_are_trimmed_collapsed_and_deduplicated_case_insensitively() {
    let tags =
        normalize_tags(["  Rust ", "rust", "Wi-Fi   CSI", "", "ESP32", "wi-fi csi"]).unwrap();
    assert_eq!(tags, ["Rust", "Wi-Fi CSI", "ESP32"]);
    assert!(normalize_tags(["x".repeat(41)]).is_err(), "too long");
    assert!(normalize_tags(["bad\ntag"]).is_err(), "control character");
    let many: Vec<String> = (0..21).map(|i| format!("tag{i}")).collect();
    assert!(normalize_tags(&many).is_err(), "too many");
    assert_eq!(normalize_tags(&many[..20]).unwrap().len(), 20);
}

#[actix_web::test]
async fn articles_store_tags_and_the_vocabulary_counts_both_kinds() {
    let db = Db::memory().await.unwrap();
    db.migrate().await.unwrap();
    db.content_create("project", project("alpha", json!(["Rust", "ESP32"])))
        .await
        .unwrap();
    db.content_create("article", article("first", json!(["rust", "Notes"])))
        .await
        .unwrap();
    db.content_create("article", article("second", json!(["Rust"])))
        .await
        .unwrap();

    let all = db.tag_vocabulary(false, None, None).await.unwrap();
    let rust = all["items"]
        .as_array()
        .unwrap()
        .iter()
        .find(|t| t["name"].as_str().unwrap().eq_ignore_ascii_case("rust"))
        .unwrap();
    assert_eq!(rust["count_projects"], 1);
    assert_eq!(rust["count_posts"], 2);
    assert_eq!(
        all["items"][0]["name"].as_str().unwrap().to_lowercase(),
        "rust",
        "most used first"
    );

    let filtered = db.tag_vocabulary(false, Some("es"), None).await.unwrap();
    let names: Vec<_> = filtered["items"]
        .as_array()
        .unwrap()
        .iter()
        .map(|t| t["name"].as_str().unwrap().to_owned())
        .collect();
    assert_eq!(names[0], "ESP32", "prefix matches rank first");
    assert!(names.iter().all(|n| n.to_lowercase().contains("es")));
    let one = db.tag_vocabulary(false, None, Some(1)).await.unwrap();
    assert_eq!(one["items"].as_array().unwrap().len(), 1);
    assert_eq!(one["total"], 3);
    let none = db.tag_vocabulary(false, Some("100%"), None).await.unwrap();
    assert_eq!(
        none["items"].as_array().unwrap().len(),
        0,
        "wildcards are escaped"
    );

    // Drafts are invisible to the public vocabulary until published.
    let public = db.tag_vocabulary(true, None, None).await.unwrap();
    assert_eq!(public["items"].as_array().unwrap().len(), 0);
}

#[actix_web::test]
async fn http_tags_round_trip_normalize_and_require_a_session() {
    let db = Db::memory().await.unwrap();
    db.migrate().await.unwrap();
    let (token, hash) = voidreg_api::auth::new_session_token();
    db.create_session("admin", &hash, None, 1).await.unwrap();
    let csrf = voidreg_api::api::v1::admin::session::csrf_for(&token);
    let cookie = Cookie::new("voidreg_admin_session", token);
    let app = test::init_service(voidreg_api::app::build(db, Config::for_test())).await;

    let anonymous = test::TestRequest::get()
        .uri("/api/v1/admin/tags")
        .to_request();
    assert_eq!(
        test::call_service(&app, anonymous).await.status(),
        StatusCode::UNAUTHORIZED
    );

    let created: Value = test::call_and_read_body_json(
        &app,
        test::TestRequest::post()
            .uri("/api/v1/admin/articles")
            .cookie(cookie.clone())
            .insert_header(("X-CSRF-Token", csrf.clone()))
            .set_json(json!({"slug":"tagged","title":"Tagged","tags":[" Rust ","rust","Systems  design"]}))
            .to_request(),
    )
    .await;
    assert_eq!(created["tags"], json!(["Rust", "Systems design"]));

    let updated: Value = test::call_and_read_body_json(
        &app,
        test::TestRequest::put()
            .uri("/api/v1/admin/articles/tagged")
            .cookie(cookie.clone())
            .insert_header(("X-CSRF-Token", csrf.clone()))
            .set_json(json!({"expected_revision":1,"tags":["Embedded"]}))
            .to_request(),
    )
    .await;
    assert_eq!(updated["tags"], json!(["Embedded"]));
    let untouched: Value = test::call_and_read_body_json(
        &app,
        test::TestRequest::put()
            .uri("/api/v1/admin/articles/tagged")
            .cookie(cookie.clone())
            .insert_header(("X-CSRF-Token", csrf.clone()))
            .set_json(json!({"expected_revision":2,"title":"Retitled"}))
            .to_request(),
    )
    .await;
    assert_eq!(
        untouched["tags"],
        json!(["Embedded"]),
        "omitted tags are kept"
    );

    let rejected = test::TestRequest::put()
        .uri("/api/v1/admin/articles/tagged")
        .cookie(cookie.clone())
        .insert_header(("X-CSRF-Token", csrf.clone()))
        .set_json(json!({"expected_revision":3,"tags":["x".repeat(41)]}))
        .to_request();
    assert_eq!(
        test::call_service(&app, rejected).await.status(),
        StatusCode::UNPROCESSABLE_ENTITY
    );

    let project: Value = test::call_and_read_body_json(
        &app,
        test::TestRequest::post()
            .uri("/api/v1/admin/projects")
            .cookie(cookie.clone())
            .insert_header(("X-CSRF-Token", csrf.clone()))
            .set_json(json!({"slug":"proj","title":"Proj","tags":["rust","Rust","Embedded"]}))
            .to_request(),
    )
    .await;
    assert_eq!(project["tags"], json!(["rust", "Embedded"]));

    let vocabulary: Value = test::call_and_read_body_json(
        &app,
        test::TestRequest::get()
            .uri("/api/v1/admin/tags?q=emb")
            .cookie(cookie)
            .to_request(),
    )
    .await;
    assert_eq!(vocabulary["items"][0]["name"], "Embedded");
    assert_eq!(vocabulary["items"][0]["count_projects"], 1);
    assert_eq!(vocabulary["items"][0]["count_posts"], 1);
}

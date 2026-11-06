use actix_web::{cookie::Cookie, http::StatusCode, test};
use serde_json::{Value, json};
use voidreg_api::{config::Config, db::Db, db::content::ContentQuery};

fn document() -> Value {
    json!({"schemaVersion":1,"metadata":{"title":"T","language":"en"},"blocks":[{"id":"018fabc0-0000-4000-8000-000000000001","type":"publisle:paragraph","schemaVersion":1,"data":{"content":[{"type":"text","value":"Body"}]}}]})
}
fn project(slug: &str) -> Value {
    json!({"slug":slug,"status":"published","title":slug,"category":"Systems","summary":"A project","tags":[],"sections":[],"hero":null,"related_slugs":[],"related_project_ids":[],"repo_url":null,"has_detail_page":true,"featured":false,"sort_order":0,"document":document()})
}
fn article(slug: &str, project_ids: Value, topic_id: Option<&str>) -> Value {
    json!({"slug":slug,"title":slug,"category":"Notes","summary":"A post","tags":[],"status":"published","published_at":"2026-01-02T00:00:00Z","featured":false,"sort_order":0,"sections":[],"project_ids":project_ids,"topic_id":topic_id,"document":document()})
}
fn topic(project_id: &str, slug: &str) -> Value {
    json!({"slug":slug,"title":slug,"summary":"","project_id":project_id,"sort_order":0,"status":"published"})
}
fn id(v: &Value) -> String {
    v["id"].as_str().unwrap().to_owned()
}
async fn db() -> Db {
    let db = Db::memory().await.unwrap();
    db.migrate().await.unwrap();
    db
}

#[actix_web::test]
async fn topic_slugs_are_unique_per_project_not_globally() {
    let db = db().await;
    let a = id(&db
        .content_create("project", project("alpha"))
        .await
        .unwrap());
    let b = id(&db.content_create("project", project("beta")).await.unwrap());
    db.content_create("topic", topic(&a, "firmware"))
        .await
        .unwrap();
    db.content_create("topic", topic(&b, "firmware"))
        .await
        .unwrap();
    assert!(
        db.content_create("topic", topic(&a, "firmware"))
            .await
            .is_err()
    );
    assert!(
        db.content_create("topic", topic(&uuid::Uuid::new_v4().to_string(), "x"))
            .await
            .is_err(),
        "the project must exist"
    );
}

#[actix_web::test]
async fn a_post_topic_adds_its_project_and_unknown_topics_are_rejected() {
    let db = db().await;
    let a = id(&db
        .content_create("project", project("alpha"))
        .await
        .unwrap());
    let t = id(&db
        .content_create("topic", topic(&a, "firmware"))
        .await
        .unwrap());
    let post = db
        .content_create("article", article("post", json!([]), Some(&t)))
        .await
        .unwrap();
    assert_eq!(
        post["project_ids"],
        json!([a]),
        "project is added from the topic"
    );
    assert_eq!(post["topic_id"], json!(t));
    let missing = uuid::Uuid::new_v4().to_string();
    assert!(
        db.content_create("article", article("bad", json!([]), Some(&missing)))
            .await
            .is_err()
    );
    let plain = db
        .content_create("article", article("plain", json!([]), None))
        .await
        .unwrap();
    assert!(plain["topic_id"].is_null());
}

#[actix_web::test]
async fn topics_and_projects_with_dependents_cannot_be_deleted() {
    let db = db().await;
    let a = id(&db
        .content_create("project", project("alpha"))
        .await
        .unwrap());
    let t = db
        .content_create("topic", topic(&a, "firmware"))
        .await
        .unwrap();
    let t_id = id(&t);
    let key = format!("{a}:firmware");
    db.content_create("article", article("post", json!([]), Some(&t_id)))
        .await
        .unwrap();
    let topic_blocked = db.content_action("topic", &key, 1, "delete").await;
    assert!(topic_blocked.is_err(), "posts still use the topic");
    let project_blocked = db.content_action("project", "alpha", 1, "delete").await;
    assert!(project_blocked.is_err(), "the project still has a topic");

    // Move the post out of the topic, then both can go.
    let mut post = db.content_get("article", "post", false).await.unwrap();
    post["topic_id"] = Value::Null;
    db.content_save("article", "post", 1, post, false)
        .await
        .unwrap();
    db.content_action("topic", &key, 1, "delete").await.unwrap();
    assert!(db.content_get("topic", &key, false).await.is_err());
    assert!(
        db.content_create("topic", topic(&a, "firmware"))
            .await
            .is_ok(),
        "the URL is free again"
    );
}

#[actix_web::test]
async fn posts_filter_by_topic_and_topics_carry_counts() {
    let db = db().await;
    let a = id(&db
        .content_create("project", project("alpha"))
        .await
        .unwrap());
    let b = id(&db.content_create("project", project("beta")).await.unwrap());
    let fw = id(&db
        .content_create("topic", topic(&a, "firmware"))
        .await
        .unwrap());
    let hw = id(&db
        .content_create("topic", topic(&b, "firmware"))
        .await
        .unwrap());
    for (slug, project_ids, topic_id) in [
        ("one", json!([]), Some(fw.clone())),
        ("two", json!([]), Some(fw.clone())),
        ("three", json!([]), Some(hw.clone())),
        ("four", json!([a.clone()]), None),
    ] {
        db.content_create("article", article(slug, project_ids, topic_id.as_deref()))
            .await
            .unwrap();
    }
    let slugs = |page: &Value| {
        let mut s: Vec<String> = page["items"]
            .as_array()
            .unwrap()
            .iter()
            .map(|i| i["slug"].as_str().unwrap().to_owned())
            .collect();
        s.sort();
        s
    };
    let by_id = db
        .content_page(
            "article",
            true,
            &ContentQuery {
                topic_id: Some(fw.clone()),
                ..Default::default()
            },
        )
        .await
        .unwrap();
    assert_eq!(slugs(&by_id), ["one", "two"]);
    let by_slug = db
        .content_page(
            "article",
            true,
            &ContentQuery {
                project: Some("beta".into()),
                topic: Some("firmware".into()),
                ..Default::default()
            },
        )
        .await
        .unwrap();
    assert_eq!(
        slugs(&by_slug),
        ["three"],
        "slug resolves inside its project"
    );
    let orphan = db
        .content_page(
            "article",
            true,
            &ContentQuery {
                topic: Some("firmware".into()),
                ..Default::default()
            },
        )
        .await
        .unwrap();
    assert!(slugs(&orphan).is_empty(), "a topic slug needs a project");
    assert_eq!(by_id["items"][0]["topic"]["slug"], "firmware");
    assert_eq!(by_id["items"][0]["topic"]["project_slug"], "alpha");

    let topics = db
        .content_page(
            "topic",
            true,
            &ContentQuery {
                project: Some("alpha".into()),
                ..Default::default()
            },
        )
        .await
        .unwrap();
    assert_eq!(topics["items"].as_array().unwrap().len(), 1);
    assert_eq!(topics["items"][0]["post_count"], 2);
    assert_eq!(topics["items"][0]["latest_post_at"], "2026-01-02T00:00:00Z");
    assert_eq!(topics["items"][0]["project"]["slug"], "alpha");
}

#[actix_web::test]
async fn http_topics_round_trip() {
    let db = db().await;
    let (token, hash) = voidreg_api::auth::new_session_token();
    db.create_session("admin", &hash, None, 1).await.unwrap();
    let csrf = voidreg_api::api::v1::admin::session::csrf_for(&token);
    let cookie = Cookie::new("voidreg_admin_session", token);
    let a = id(&db
        .content_create("project", project("alpha"))
        .await
        .unwrap());
    let app = test::init_service(voidreg_api::app::build(db, Config::for_test())).await;

    let anonymous = test::TestRequest::post()
        .uri("/api/v1/admin/topics")
        .set_json(json!({"project_id": a, "title": "Firmware"}))
        .to_request();
    assert_eq!(
        test::call_service(&app, anonymous).await.status(),
        StatusCode::UNAUTHORIZED
    );

    let created: Value = test::call_and_read_body_json(
        &app,
        test::TestRequest::post()
            .uri("/api/v1/admin/topics")
            .cookie(cookie.clone())
            .insert_header(("X-CSRF-Token", csrf.clone()))
            .set_json(
                json!({"project_id": a, "title": "Firmware & drivers", "summary": "Low level"}),
            )
            .to_request(),
    )
    .await;
    assert_eq!(created["slug"], "firmware-drivers");
    assert_eq!(created["status"], "published");

    let public: Value = test::call_and_read_body_json(
        &app,
        test::TestRequest::get()
            .uri("/api/v1/topics?project=alpha")
            .to_request(),
    )
    .await;
    assert_eq!(public["items"][0]["title"], "Firmware & drivers");
    assert_eq!(public["items"][0]["post_count"], 0);
    let one = test::call_service(
        &app,
        test::TestRequest::get()
            .uri("/api/v1/topics/alpha/firmware-drivers")
            .to_request(),
    )
    .await;
    assert_eq!(one.status(), StatusCode::OK);
    let missing = test::call_service(
        &app,
        test::TestRequest::get()
            .uri("/api/v1/topics/alpha/nope")
            .to_request(),
    )
    .await;
    assert_eq!(missing.status(), StatusCode::NOT_FOUND);

    let updated: Value = test::call_and_read_body_json(
        &app,
        test::TestRequest::put()
            .uri(&format!("/api/v1/admin/topics/{a}/firmware-drivers"))
            .cookie(cookie.clone())
            .insert_header(("X-CSRF-Token", csrf.clone()))
            .set_json(json!({"expected_revision": created["revision"], "title": "Firmware"}))
            .to_request(),
    )
    .await;
    assert_eq!(updated["title"], "Firmware");
    let public: Value = test::call_and_read_body_json(
        &app,
        test::TestRequest::get()
            .uri("/api/v1/topics/alpha/firmware-drivers")
            .to_request(),
    )
    .await;
    assert_eq!(
        public["title"], "Firmware",
        "edits to a live topic publish with the save"
    );

    let removed = test::call_service(
        &app,
        test::TestRequest::delete()
            .uri(&format!("/api/v1/admin/topics/{a}/firmware-drivers"))
            .cookie(cookie)
            .insert_header(("X-CSRF-Token", csrf))
            .set_json(json!({"expected_revision": updated["revision"]}))
            .to_request(),
    )
    .await;
    assert_eq!(removed.status(), StatusCode::OK);
}

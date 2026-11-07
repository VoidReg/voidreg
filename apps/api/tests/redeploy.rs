//! A redeploy runs `migrate` against the live database every time the container starts.
//! It must never change, drop or reseed what the site already stores.
use serde_json::{Value, json};
use voidreg_api::{config::Config, db::Db};

fn document() -> Value {
    json!({"schemaVersion":1,"metadata":{"title":"T","language":"en"},"blocks":[{"id":"018fabc0-0000-4000-8000-000000000001","type":"publisle:paragraph","schemaVersion":1,"data":{"content":[{"type":"text","value":"Body"}]}}]})
}
fn project(slug: &str) -> Value {
    json!({"slug":slug,"status":"published","title":slug,"category":"Systems","summary":"A project","tags":[],"sections":[],"hero":null,"related_slugs":[],"related_project_ids":[],"repo_url":null,"has_detail_page":true,"featured":false,"sort_order":0,"document":document()})
}
fn article(slug: &str, project_id: &str, topic_id: &str) -> Value {
    json!({"slug":slug,"title":slug,"category":"Notes","summary":"A post","tags":["rust"],"status":"published","published_at":"2026-01-02T00:00:00Z","featured":false,"sort_order":0,"sections":[],"project_ids":[project_id],"topic_id":topic_id,"document":document()})
}

async fn snapshot(db: &Db) -> Value {
    let mut all = Vec::new();
    for kind in ["project", "topic", "article"] {
        all.push(json!({
            "kind": kind,
            "admin": db.content_list(kind, false).await.unwrap(),
            "public": db.content_list(kind, true).await.unwrap(),
        }));
    }
    Value::Array(all)
}

#[actix_web::test]
async fn restarting_and_migrating_again_leaves_stored_content_untouched() {
    let path = std::env::temp_dir().join(format!("voidreg-redeploy-{}.db", uuid::Uuid::new_v4()));
    let mut config = Config::for_test();
    config.database_url = path.to_str().unwrap().into();

    let db = Db::connect(&config).await.unwrap();
    db.migrate().await.unwrap();
    let p = db
        .content_create("project", project("keep-me"))
        .await
        .unwrap();
    let pid = p["id"].as_str().unwrap().to_owned();
    let t = db
        .content_create(
            "topic",
            json!({"slug":"bench","title":"Bench","summary":"","project_id":pid,"sort_order":0,"status":"published"}),
        )
        .await
        .unwrap();
    let tid = t["id"].as_str().unwrap().to_owned();
    db.content_create("article", article("first-post", &pid, &tid))
        .await
        .unwrap();
    db.insert_contact("Ada", "ada@example.test", "hello")
        .await
        .unwrap();
    let before = snapshot(&db).await;
    assert!(before.to_string().contains("first-post"));
    drop(db);

    // Three container starts in a row, each opening the same file and migrating.
    for _ in 0..3 {
        let db = Db::connect(&config).await.unwrap();
        db.migrate().await.unwrap();
        db.migrate().await.unwrap();
        assert_eq!(
            snapshot(&db).await,
            before,
            "migrate changed stored content"
        );
    }
    let _ = std::fs::remove_file(&path);
}

#[cfg(not(debug_assertions))]
#[actix_web::test]
async fn release_builds_refuse_to_seed_sample_content() {
    let db = Db::memory().await.unwrap();
    db.migrate().await.unwrap();
    assert!(db.seed_if_empty().await.is_err());
    assert!(db.list_projects(None).await.unwrap().is_empty());
}

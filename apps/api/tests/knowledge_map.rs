#[path = "support/compiler.rs"]
mod compiler;
use actix_web::{
    cookie::Cookie,
    http::{StatusCode, header},
    test,
};
use serde_json::{Value, json};
use voidreg_api::{
    app::build,
    config::Config,
    db::{Db, content::ContentQuery, graph::build_graph},
};

fn project(slug: &str, tags: Value) -> Value {
    json!({"slug":slug,"title":format!("Project {slug}"),"category":"Systems","summary":"A project overview","tags":tags,"sections":[],"hero":null,"related_slugs":[],"related_project_ids":[],"repo_url":null,"has_detail_page":true,"featured":false,"sort_order":0,"document":{"schemaVersion":1,"metadata":{"title":"x","language":"en"},"blocks":[{"id":"018fabc0-0000-4000-8000-000000000001","type":"publisle:paragraph","schemaVersion":1,"data":{"content":[{"type":"text","value":"Details"}]}}]},"compiled":{"format":"publisle:publication","formatVersion":1,"identity":"fixture","rendererBuild":"1","html":"<p>Details</p>","styles":[],"modules":[],"islands":[],"diagnostics":[]}})
}
fn article(slug: &str, project_ids: Value) -> Value {
    let mut v = project(slug, json!([]));
    v["project_ids"] = project_ids;
    v
}
async fn db() -> Db {
    let db = Db::memory().await.unwrap();
    db.migrate().await.unwrap();
    db
}
/// Creates a published project and returns its id.
async fn published(db: &Db, kind: &str, value: Value) -> String {
    let slug = value["slug"].as_str().unwrap().to_owned();
    let created = db.content_create(kind, value).await.unwrap();
    db.content_action(kind, &slug, 1, "publish").await.unwrap();
    created["id"].as_str().unwrap().to_owned()
}
async fn relate(
    db: &Db,
    slug: &str,
    revision: i64,
    ids: Value,
) -> Result<Value, voidreg_api::error::AppError> {
    let mut value = db.content_get("project", slug, false).await.unwrap();
    value["related_project_ids"] = ids;
    db.content_save("project", slug, revision, value, false)
        .await
}

#[actix_web::test]
async fn relations_are_validated_resolved_on_read_and_guard_deletion() {
    let db = db().await;
    let a = published(&db, "project", project("alpha", json!(["Rust"]))).await;
    let b = published(&db, "project", project("beta", json!(["Rust"]))).await;
    assert!(
        relate(&db, "alpha", 2, json!([a])).await.is_err(),
        "self relation"
    );
    assert!(
        relate(&db, "alpha", 2, json!([uuid::Uuid::new_v4().to_string()]))
            .await
            .is_err(),
        "unknown relation"
    );
    let saved = relate(&db, "alpha", 2, json!([b, b])).await.unwrap();
    assert_eq!(
        saved["related_project_ids"],
        json!([b]),
        "duplicates collapse"
    );
    db.content_action("project", "alpha", 3, "publish")
        .await
        .unwrap();

    let public = db.get_project("alpha").await.unwrap();
    assert_eq!(public.related_slugs, vec!["beta"]);
    assert_eq!(public.related[0].title, "Project beta");
    // An unpublished related project is never exposed publicly.
    db.content_action("project", "beta", 2, "unpublish")
        .await
        .unwrap();
    let public = db.get_project("alpha").await.unwrap();
    assert!(public.related.is_empty() && public.related_slugs.is_empty());
    // A project that others still relate to cannot be deleted.
    assert!(
        db.content_action("project", "beta", 3, "delete")
            .await
            .is_err()
    );
    // The published snapshot of alpha still links beta until alpha is republished.
    relate(&db, "alpha", 4, json!([])).await.unwrap();
    assert!(
        db.content_action("project", "beta", 3, "delete")
            .await
            .is_err()
    );
    db.content_action("project", "alpha", 5, "publish")
        .await
        .unwrap();
    db.content_action("project", "beta", 3, "delete")
        .await
        .unwrap();
    // Articles never carry relations.
    let mut post = article("note", json!([]));
    post["related_project_ids"] = json!([a]);
    let post = db.content_create("article", post).await.unwrap();
    assert_eq!(post["related_project_ids"], json!([]));
}

#[actix_web::test]
async fn legacy_related_slugs_backfill_into_stable_ids_once() {
    let db = db().await;
    db.seed_if_empty().await.unwrap();
    db.migrate().await.unwrap();
    let minirt = db.get_project("minirt").await.unwrap();
    assert_eq!(minirt.related_slugs, vec!["webserv", "csi-rs"]);
    assert_eq!(minirt.meta.related_project_ids.len(), 2);
    assert_eq!(minirt.related.len(), 2);
}

#[actix_web::test]
async fn listings_are_enriched_and_filterable() {
    let db = db().await;
    let a = published(&db, "project", project("alpha", json!(["Rust", "FPGA"]))).await;
    published(&db, "project", project("beta", json!(["Python"]))).await;
    published(&db, "article", article("note-one", json!([a]))).await;
    let mut draft_note = article("note-draft", json!([a]));
    draft_note["status"] = json!("draft");
    db.content_create("article", draft_note).await.unwrap();

    let posts = db
        .content_page("article", true, &ContentQuery::default())
        .await
        .unwrap();
    assert_eq!(posts["items"][0]["projects"][0]["slug"], "alpha");
    let by_slug = db
        .content_page(
            "article",
            true,
            &ContentQuery {
                project: Some("alpha".into()),
                ..Default::default()
            },
        )
        .await
        .unwrap();
    assert_eq!(by_slug["total"], 1);
    let unknown = db
        .content_page(
            "article",
            true,
            &ContentQuery {
                project: Some("nope".into()),
                ..Default::default()
            },
        )
        .await
        .unwrap();
    assert_eq!(unknown["total"], 0, "unknown project matches nothing");

    let projects = db
        .content_page("project", true, &ContentQuery::default())
        .await
        .unwrap();
    let alpha = projects["items"]
        .as_array()
        .unwrap()
        .iter()
        .find(|p| p["slug"] == "alpha")
        .unwrap();
    assert_eq!(alpha["post_count"], 1, "drafts do not count publicly");
    assert!(alpha["latest_post_at"].is_string());
    let tagged = db
        .content_page(
            "project",
            true,
            &ContentQuery {
                tag: Some("fpga".into()),
                ..Default::default()
            },
        )
        .await
        .unwrap();
    assert_eq!(tagged["total"], 1);
    let categorised = db
        .content_page(
            "project",
            true,
            &ContentQuery {
                category: Some("SYSTEMS".into()),
                ..Default::default()
            },
        )
        .await
        .unwrap();
    assert_eq!(categorised["total"], 2);
}

#[actix_web::test]
async fn graph_edges_are_symmetric_deduplicated_and_never_leak_drafts() {
    let p = |id: &str, tags: Value, related: Value, status: &str| json!({"id":id,"slug":id,"title":id,"category":"c","tags":tags,"status":status,"archived":false,"sort_order":0,"related_project_ids":related,"has_unpublished_changes":true});
    let projects = vec![
        p("a", json!(["Rust", "DSP"]), json!(["b"]), "published"),
        p("b", json!(["rust"]), json!(["a"]), "published"),
        p("c", json!(["RUST", "dsp"]), json!([]), "published"),
        p("d", json!(["Rust"]), json!(["a"]), "draft"),
    ];
    let post = |id: &str, projects: Value, status: &str| json!({"id":id,"slug":id,"title":id,"category":"c","status":status,"archived":false,"published_at":"2026-01-01T00:00:00Z","project_ids":projects});
    let articles = vec![
        post("p1", json!(["a", "d"]), "published"),
        post("p2", json!([]), "draft"),
    ];

    let public = build_graph(projects.clone(), articles.clone(), false);
    let ids: Vec<&str> = public["nodes"]
        .as_array()
        .unwrap()
        .iter()
        .map(|n| n["id"].as_str().unwrap())
        .collect();
    assert_eq!(ids, ["a", "b", "c", "p1"], "drafts excluded");
    assert!(
        public["nodes"]
            .as_array()
            .unwrap()
            .iter()
            .all(|n| n["changed"] == false),
        "the public graph never reveals unpublished edits"
    );
    let edges = public["edges"].as_array().unwrap();
    let kinds = |k: &str| edges.iter().filter(|e| e["kind"] == k).count();
    assert_eq!(
        kinds("post-project"),
        1,
        "edge to the draft project dropped"
    );
    assert_eq!(
        kinds("related"),
        1,
        "a-b declared from both sides counts once"
    );
    let shared: Vec<&Value> = edges.iter().filter(|e| e["kind"] == "shared-tag").collect();
    assert_eq!(
        shared.len(),
        2,
        "a-c and b-c, but not a-b which is explicit"
    );
    assert!(
        shared
            .iter()
            .any(|e| e["source"] == "a" && e["target"] == "c" && e["weight"] == 2)
    );

    let admin = build_graph(projects, articles, true);
    assert_eq!(admin["nodes"].as_array().unwrap().len(), 6);
    assert!(
        admin["nodes"]
            .as_array()
            .unwrap()
            .iter()
            .any(|n| n["id"] == "d" && n["draft"] == true && n["changed"] == true)
    );
}

#[actix_web::test]
async fn graph_and_preview_http_contracts() {
    let compiler = compiler::Compiler::start();
    let mut config = Config::for_test();
    compiler.configure(&mut config);
    let database = db().await;
    published(&database, "project", project("alpha", json!(["Rust"]))).await;
    database
        .content_create("project", project("secret", json!([])))
        .await
        .unwrap();
    let app = test::init_service(build(database, config)).await;

    let response = test::call_service(
        &app,
        test::TestRequest::get().uri("/api/v1/graph").to_request(),
    )
    .await;
    assert_eq!(response.status(), StatusCode::OK);
    let etag = response
        .headers()
        .get(header::ETAG)
        .unwrap()
        .to_str()
        .unwrap()
        .to_owned();
    let body: Value = test::read_body_json(response).await;
    assert_eq!(
        body["nodes"].as_array().unwrap().len(),
        1,
        "draft project hidden publicly"
    );
    let cached = test::call_service(
        &app,
        test::TestRequest::get()
            .uri("/api/v1/graph")
            .insert_header((header::IF_NONE_MATCH, etag))
            .to_request(),
    )
    .await;
    assert_eq!(cached.status(), StatusCode::NOT_MODIFIED);

    for uri in [
        "/api/v1/admin/graph",
        "/api/v1/admin/preview/projects/secret",
    ] {
        let response =
            test::call_service(&app, test::TestRequest::get().uri(uri).to_request()).await;
        assert_eq!(
            response.status(),
            StatusCode::UNAUTHORIZED,
            "{uri} requires an admin"
        );
    }
    let login = test::call_service(
        &app,
        test::TestRequest::post()
            .uri("/api/v1/admin/session")
            .set_json(json!({"password":"voidreg-test-admin"}))
            .to_request(),
    )
    .await;
    let session: Cookie<'static> = login
        .response()
        .cookies()
        .find(|c| c.name() == "voidreg_admin_session")
        .unwrap()
        .into_owned();
    let response = test::call_service(
        &app,
        test::TestRequest::get()
            .uri("/api/v1/admin/graph")
            .cookie(session.clone())
            .to_request(),
    )
    .await;
    let admin: Value = test::read_body_json(response).await;
    assert_eq!(
        admin["nodes"].as_array().unwrap().len(),
        2,
        "admin sees the draft"
    );

    let response = test::call_service(
        &app,
        test::TestRequest::get()
            .uri("/api/v1/admin/preview/projects/secret")
            .cookie(session.clone())
            .to_request(),
    )
    .await;
    let status = response.status();
    if status != StatusCode::OK {
        panic!("preview failed: {:?}", test::read_body(response).await);
    }
    assert_eq!(
        response.headers().get(header::CACHE_CONTROL).unwrap(),
        "private, no-store"
    );
    let preview: Value = test::read_body_json(response).await;
    assert_eq!(preview["state"], "ready");
    assert_eq!(preview["item"]["slug"], "secret");
    assert_eq!(
        preview["item"]["compiled"]["html"],
        "<p>Server compiled</p>"
    );
    // Previewing never publishes.
    let response = test::call_service(
        &app,
        test::TestRequest::get()
            .uri("/api/v1/projects/secret")
            .to_request(),
    )
    .await;
    assert_eq!(response.status(), StatusCode::NOT_FOUND);
    let response = test::call_service(
        &app,
        test::TestRequest::get()
            .uri("/api/v1/admin/preview/widgets/secret")
            .cookie(session)
            .to_request(),
    )
    .await;
    assert_eq!(response.status(), StatusCode::NOT_FOUND);
}

#[actix_web::test]
async fn preview_cache_follows_the_saved_revision() {
    let compiler = compiler::Compiler::start();
    let mut config = Config::for_test();
    compiler.configure(&mut config);
    let db = db().await;
    db.content_create("project", project("draft-one", json!([])))
        .await
        .unwrap();
    let first = voidreg_api::publishing::preview(&config, &db, "project", "draft-one")
        .await
        .unwrap();
    assert_eq!(first["item"]["revision"], 1);
    // Same revision: served from the cache and identical.
    let again = voidreg_api::publishing::preview(&config, &db, "project", "draft-one")
        .await
        .unwrap();
    assert_eq!(again["item"]["compiled"], first["item"]["compiled"]);
    let mut value = db.content_get("project", "draft-one", false).await.unwrap();
    value["title"] = json!("Renamed draft");
    db.content_save("project", "draft-one", 1, value, false)
        .await
        .unwrap();
    let next = voidreg_api::publishing::preview(&config, &db, "project", "draft-one")
        .await
        .unwrap();
    assert_eq!(next["item"]["revision"], 2);
    assert_eq!(next["item"]["title"], "Renamed draft");
}

//! Topics group a project's posts. A topic belongs to exactly one project and is addressed by
//! `{project_id}/{slug}`, because its URL only has to be unique inside that project.
use actix_web::{HttpResponse, delete, get, post, put, web};
use serde::Deserialize;
use serde_json::{Value, json};

use crate::auth::extract::AdminSession;
use crate::db::Db;
use crate::error::AppError;

#[derive(Deserialize)]
pub struct Revision {
    pub expected_revision: i64,
}

const MAX_TITLE: usize = 120;
const MAX_SUMMARY: usize = 400;

fn composite(project_id: &str, slug: &str) -> String {
    format!("{project_id}:{slug}")
}

fn slugify(title: &str) -> String {
    let mut slug = String::new();
    for c in title.to_lowercase().chars() {
        if c.is_ascii_alphanumeric() {
            slug.push(c);
        } else if !slug.ends_with('-') && !slug.is_empty() {
            slug.push('-');
        }
    }
    let slug = slug.trim_matches('-').to_owned();
    if slug.is_empty() {
        format!("topic-{}", &uuid::Uuid::new_v4().to_string()[..8])
    } else {
        slug.chars()
            .take(80)
            .collect::<String>()
            .trim_matches('-')
            .to_owned()
    }
}

fn slug_of(value: &Value) -> String {
    value["slug"].as_str().unwrap_or_default().to_owned()
}

fn text(input: &Value, key: &str, max: usize) -> Result<Option<String>, AppError> {
    match input.get(key) {
        None | Some(Value::Null) => Ok(None),
        Some(Value::String(s)) => {
            let s = s.split_whitespace().collect::<Vec<_>>().join(" ");
            if s.chars().count() > max {
                return Err(AppError::Unprocessable(format!(
                    "{key} can be at most {max} characters"
                )));
            }
            Ok(Some(s))
        }
        Some(_) => Err(AppError::Unprocessable(format!("{key} must be text"))),
    }
}

#[cfg_attr(feature = "swagger", utoipa::path(get, path = "/api/v1/admin/topics", tag = "admin", responses((status = 200, description = "Topic working copies with post counts"))))]
#[get("/topics")]
pub async fn list(
    db: web::Data<Db>,
    session: AdminSession,
    query: web::Query<crate::db::content::ContentQuery>,
) -> Result<HttpResponse, AppError> {
    session.validate(&db).await?;
    Ok(HttpResponse::Ok().json(db.content_page("topic", false, &query).await?))
}

#[cfg_attr(feature = "swagger", utoipa::path(get, path = "/api/v1/admin/topics/{project_id}/{slug}", tag = "admin", params(("project_id" = String, Path), ("slug" = String, Path)), responses((status = 200, description = "Topic working copy"))))]
#[get("/topics/{project_id}/{slug}")]
pub async fn get_one(
    db: web::Data<Db>,
    session: AdminSession,
    path: web::Path<(String, String)>,
) -> Result<HttpResponse, AppError> {
    session.validate(&db).await?;
    let (project_id, slug) = path.into_inner();
    Ok(HttpResponse::Ok().json(
        db.content_get_enriched("topic", &composite(&project_id, &slug), false)
            .await?,
    ))
}

#[cfg_attr(feature = "swagger", utoipa::path(post, path = "/api/v1/admin/topics", tag = "admin", request_body = Object, responses((status = 201, description = "Topic draft created"))))]
#[post("/topics")]
pub async fn create(
    db: web::Data<Db>,
    session: AdminSession,
    input: web::Json<Value>,
) -> Result<HttpResponse, AppError> {
    session.validate(&db).await?;
    Ok(HttpResponse::Created().json(create_topic(&db, &input).await?))
}

/// Creates a topic and publishes it. Shared by the admin API and the MCP bridge.
pub async fn create_topic(db: &Db, input: &Value) -> Result<Value, AppError> {
    let project_id = input["project_id"]
        .as_str()
        .ok_or_else(|| AppError::Unprocessable("project_id is required".into()))?
        .to_owned();
    let title = text(input, "title", MAX_TITLE)?
        .filter(|t| !t.is_empty())
        .ok_or_else(|| AppError::Unprocessable("a topic needs a title".into()))?;
    let summary = text(input, "summary", MAX_SUMMARY)?.unwrap_or_default();
    let slug = match input["slug"]
        .as_str()
        .map(str::trim)
        .filter(|s| !s.is_empty())
    {
        Some(slug) => slug.to_owned(),
        None => slugify(&title),
    };
    let value = json!({
        "slug": slug, "title": title, "summary": summary, "project_id": project_id,
        "sort_order": input["sort_order"].as_i64().unwrap_or(0), "status": "draft",
    });
    // Topics are lightweight structure, so they go live as soon as they exist. Posts still
    // decide what is public.
    let created = db.content_create("topic", value).await?;
    let revision = created["revision"].as_i64().unwrap_or(1);
    let key = composite(&project_id, &slug_of(&created));
    db.content_action("topic", &key, revision, "publish").await
}

#[cfg_attr(feature = "swagger", utoipa::path(put, path = "/api/v1/admin/topics/{project_id}/{slug}", tag = "admin", params(("project_id" = String, Path), ("slug" = String, Path)), request_body = Object, responses((status = 200, description = "Topic draft saved"))))]
#[put("/topics/{project_id}/{slug}")]
pub async fn update(
    db: web::Data<Db>,
    session: AdminSession,
    path: web::Path<(String, String)>,
    input: web::Json<Value>,
) -> Result<HttpResponse, AppError> {
    session.validate(&db).await?;
    let (project_id, slug) = path.into_inner();
    Ok(HttpResponse::Ok().json(update_topic(&db, &project_id, &slug, &input).await?))
}

/// Saves a topic's edits, publishing them when the topic is live. Shared with the MCP bridge.
pub async fn update_topic(
    db: &Db,
    project_id: &str,
    slug: &str,
    input: &Value,
) -> Result<Value, AppError> {
    let key = composite(project_id, slug);
    let revision = input["expected_revision"]
        .as_i64()
        .ok_or_else(|| AppError::Conflict("expected_revision required".into()))?;
    let mut current = db.content_get("topic", &key, false).await?;
    if let Some(title) = text(input, "title", MAX_TITLE)? {
        if title.is_empty() {
            return Err(AppError::Unprocessable("a topic needs a title".into()));
        }
        current["title"] = json!(title);
    }
    if let Some(summary) = text(input, "summary", MAX_SUMMARY)? {
        current["summary"] = json!(summary);
    }
    if let Some(order) = input["sort_order"].as_i64() {
        current["sort_order"] = json!(order);
    }
    let was_published = current["status"] == "published";
    let saved = db
        .content_save("topic", &key, revision, current, false)
        .await?;
    // Edits to a live topic go live with the save, like creating one.
    if was_published {
        let revision = saved["revision"].as_i64().unwrap_or(revision + 1);
        return db.content_action("topic", &key, revision, "publish").await;
    }
    Ok(saved)
}

#[cfg_attr(feature = "swagger", utoipa::path(post, path = "/api/v1/admin/topics/{project_id}/{slug}/{action}", tag = "admin", params(("project_id" = String, Path), ("slug" = String, Path), ("action" = String, Path)), request_body = Object, responses((status = 200, description = "Publish, unpublish, archive or restore a topic"))))]
#[post("/topics/{project_id}/{slug}/{action}")]
pub async fn action(
    db: web::Data<Db>,
    session: AdminSession,
    path: web::Path<(String, String, String)>,
    input: web::Json<Revision>,
) -> Result<HttpResponse, AppError> {
    session.validate(&db).await?;
    let (project_id, slug, action) = path.into_inner();
    if action == "delete" {
        return Err(AppError::NotFound("use DELETE to remove a topic".into()));
    }
    Ok(HttpResponse::Ok().json(
        db.content_action(
            "topic",
            &composite(&project_id, &slug),
            input.expected_revision,
            &action,
        )
        .await?,
    ))
}

#[cfg_attr(feature = "swagger", utoipa::path(delete, path = "/api/v1/admin/topics/{project_id}/{slug}", tag = "admin", params(("project_id" = String, Path), ("slug" = String, Path)), request_body = Object, responses((status = 200, description = "Topic deleted"))))]
#[delete("/topics/{project_id}/{slug}")]
pub async fn remove(
    db: web::Data<Db>,
    session: AdminSession,
    path: web::Path<(String, String)>,
    input: web::Json<Revision>,
) -> Result<HttpResponse, AppError> {
    session.validate(&db).await?;
    let (project_id, slug) = path.into_inner();
    db.content_action(
        "topic",
        &composite(&project_id, &slug),
        input.expected_revision,
        "delete",
    )
    .await?;
    Ok(HttpResponse::Ok().json(json!({"deleted": slug})))
}

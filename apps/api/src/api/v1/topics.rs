use actix_web::{HttpRequest, HttpResponse, get, web};
use serde_json::{Value, json};

use crate::api::v1::blogs::cached_response;
use crate::db::Db;
use crate::db::content::ContentQuery;
use crate::error::AppError;

/// Published topics with their post counts. Filter by `project` (slug) to list one project's
/// topics, or by `ids` to resolve a few topics, for example the topic of a post.
#[cfg_attr(feature = "swagger", utoipa::path(
    get,
    path = "/api/v1/topics",
    tag = "projects",
    params(ContentQuery),
    responses((status = 200, description = "Published topics", body = serde_json::Value))
))]
#[get("/topics")]
pub async fn list_topics(
    db: web::Data<Db>,
    query: web::Query<ContentQuery>,
    request: HttpRequest,
) -> Result<HttpResponse, AppError> {
    if let Some(project) = query.project.as_deref().filter(|p| !p.is_empty()) {
        // Topics of a project that is not public are not public either.
        db.content_get("project", project, true).await?;
    }
    let body = db.content_page("topic", true, &query).await?.to_string();
    Ok(cached_response(&request, body, "public, no-cache", None))
}

/// One published topic with its project and post count.
#[cfg_attr(feature = "swagger", utoipa::path(
    get,
    path = "/api/v1/topics/{project}/{slug}",
    tag = "projects",
    params(("project" = String, Path, description = "Project slug"), ("slug" = String, Path, description = "Topic slug")),
    responses(
        (status = 200, description = "Topic detail", body = serde_json::Value),
        (status = 404, description = "Topic not found", body = crate::error::ErrorBody)
    )
))]
#[get("/topics/{project}/{slug}")]
pub async fn get_topic(
    db: web::Data<Db>,
    path: web::Path<(String, String)>,
    request: HttpRequest,
) -> Result<HttpResponse, AppError> {
    let (project, slug) = path.into_inner();
    let owner: Value = db.content_get("project", &project, true).await?;
    let id = owner["id"].as_str().unwrap_or_default();
    let topic = db
        .content_get_enriched("topic", &format!("{id}:{slug}"), true)
        .await?;
    let body = json!(topic).to_string();
    Ok(cached_response(&request, body, "public, no-cache", None))
}

use actix_web::{HttpRequest, HttpResponse, get, web};
use serde::Deserialize;

use crate::api::v1::blogs::cached_response;
use crate::db::Db;
use crate::error::AppError;

#[derive(Deserialize)]
pub struct TagQuery {
    pub q: Option<String>,
    pub limit: Option<i64>,
}

#[cfg_attr(feature = "swagger", utoipa::path(
    get,
    path = "/api/v1/tags",
    tag = "projects",
    params(("q" = Option<String>, Query), ("limit" = Option<i64>, Query)),
    responses((status = 200, description = "Tags used by published projects and posts", body = serde_json::Value))
))]
#[get("/tags")]
pub async fn tags(
    db: web::Data<Db>,
    query: web::Query<TagQuery>,
    request: HttpRequest,
) -> Result<HttpResponse, AppError> {
    let body = db
        .tag_vocabulary(true, query.q.as_deref(), query.limit)
        .await?
        .to_string();
    Ok(cached_response(&request, body, "public, no-cache", None))
}

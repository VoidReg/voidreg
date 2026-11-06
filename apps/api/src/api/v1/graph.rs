use actix_web::{HttpRequest, HttpResponse, get, web};

use crate::api::v1::blogs::cached_response;
use crate::db::Db;
use crate::error::AppError;

#[cfg_attr(feature = "swagger", utoipa::path(
    get,
    path = "/api/v1/graph",
    tag = "projects",
    responses(
        (status = 200, description = "Published projects and posts with their relations", body = serde_json::Value),
        (status = 304, description = "Not modified")
    )
))]
#[get("/graph")]
pub async fn graph(db: web::Data<Db>, request: HttpRequest) -> Result<HttpResponse, AppError> {
    let body = db.content_graph(true).await?.to_string();
    Ok(cached_response(&request, body, "public, no-cache", None))
}

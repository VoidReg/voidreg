use actix_web::{get, web};

use crate::db::Db;
use crate::error::AppError;

pub type ProjectQuery = crate::db::content::ContentQuery;

#[cfg_attr(feature = "swagger", utoipa::path(
    get,
    path = "/api/v1/projects",
    tag = "projects",
    params(ProjectQuery),
    responses((status = 200, description = "Project list", body = serde_json::Value))
))]
#[get("/projects")]
pub async fn list_projects(
    db: web::Data<Db>,
    query: web::Query<ProjectQuery>,
) -> Result<web::Json<serde_json::Value>, AppError> {
    Ok(web::Json(db.content_page("project", true, &query).await?))
}

#[cfg_attr(feature = "swagger", utoipa::path(
    get,
    path = "/api/v1/projects/{slug}",
    tag = "projects",
    params(("slug" = String, Path, description = "Project slug")),
    responses(
        (status = 200, description = "Project detail", body = crate::domain::Project),
        (status = 404, description = "Project not found", body = crate::error::ErrorBody)
    )
))]
#[get("/projects/{slug}")]
pub async fn get_project(
    db: web::Data<Db>,
    path: web::Path<String>,
) -> Result<web::Json<crate::domain::Project>, AppError> {
    let project = db.get_project(&path).await?;
    Ok(web::Json(project))
}

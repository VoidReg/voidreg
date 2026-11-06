use crate::{auth::extract::AdminSession, db::Db, error::AppError};
use actix_web::{HttpResponse, get, post, web};
use serde::Deserialize;

#[derive(Deserialize)]
pub struct Page {
    pub before: Option<i64>,
    pub limit: Option<i64>,
}

#[derive(Deserialize)]
pub struct Restore {
    pub expected_revision: i64,
}

#[cfg_attr(feature="swagger", utoipa::path(get,path="/api/v1/admin/{kind}/{slug}/revisions",tag="admin",params(("kind"=String,Path),("slug"=String,Path),("before"=Option<i64>,Query),("limit"=Option<i64>,Query)),responses((status=200,description="Revision summaries, newest first"))))]
#[get("/{kind}/{slug}/revisions")]
pub async fn list(
    db: web::Data<Db>,
    session: AdminSession,
    path: web::Path<(String, String)>,
    page: web::Query<Page>,
) -> Result<HttpResponse, AppError> {
    session.validate(&db).await?;
    let (kind, slug) = path.into_inner();
    let kind = crate::publishing::kind(&kind)?;
    Ok(HttpResponse::Ok().json(
        db.revisions_list(kind, &slug, page.before, page.limit)
            .await?,
    ))
}

#[cfg_attr(feature="swagger", utoipa::path(get,path="/api/v1/admin/{kind}/{slug}/revisions/{revision}",tag="admin",params(("kind"=String,Path),("slug"=String,Path),("revision"=i64,Path)),responses((status=200,description="One revision snapshot"))))]
#[get("/{kind}/{slug}/revisions/{revision}")]
pub async fn show(
    db: web::Data<Db>,
    session: AdminSession,
    path: web::Path<(String, String, i64)>,
) -> Result<HttpResponse, AppError> {
    session.validate(&db).await?;
    let (kind, slug, revision) = path.into_inner();
    let kind = crate::publishing::kind(&kind)?;
    Ok(HttpResponse::Ok().json(db.revision_get(kind, &slug, revision).await?))
}

#[cfg_attr(feature="swagger", utoipa::path(post,path="/api/v1/admin/{kind}/{slug}/revisions/{revision}/restore",tag="admin",params(("kind"=String,Path),("slug"=String,Path),("revision"=i64,Path)),request_body=Object,responses((status=200,description="Snapshot restored as a new working revision"))))]
#[post("/{kind}/{slug}/revisions/{revision}/restore")]
pub async fn restore(
    db: web::Data<Db>,
    session: AdminSession,
    path: web::Path<(String, String, i64)>,
    input: web::Json<Restore>,
) -> Result<HttpResponse, AppError> {
    session.validate(&db).await?;
    let (kind, slug, revision) = path.into_inner();
    let kind = crate::publishing::kind(&kind)?;
    Ok(HttpResponse::Ok().json(
        db.revision_restore(kind, &slug, revision, input.expected_revision)
            .await?,
    ))
}

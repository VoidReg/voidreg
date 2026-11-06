use crate::{auth::extract::AdminSession, config::Config, db::Db, error::AppError, publishing};
use actix_web::{HttpResponse, get, post, web};
use serde::Deserialize;
#[derive(Deserialize)]
pub struct Compile {
    pub expected_revision: i64,
    pub snapshot: Option<String>,
}
#[post("/{kind}/{slug}/compile")]
pub async fn start(
    config: web::Data<Config>,
    db: web::Data<Db>,
    session: AdminSession,
    path: web::Path<(String, String)>,
    input: web::Json<Compile>,
) -> Result<HttpResponse, AppError> {
    session.validate(&db).await?;
    let (kind, slug) = path.into_inner();
    let result = publishing::start(
        &config,
        &db,
        publishing::kind(&kind)?,
        &slug,
        input.expected_revision,
        input.snapshot.as_deref() == Some("published"),
    )
    .await?;
    Ok(HttpResponse::Accepted()
        .insert_header(("Cache-Control", "no-store"))
        .json(result))
}
#[get("/compilations/{id}")]
pub async fn show(
    config: web::Data<Config>,
    session: AdminSession,
    db: web::Data<Db>,
    id: web::Path<String>,
) -> Result<HttpResponse, AppError> {
    session.validate(&db).await?;
    publishing::valid_id(&id)?;
    let mut result = publishing::request(&config, &format!("/jobs/{id}"), None).await?;
    publishing::private_preview(&mut result);
    if let Some(value) = result.as_object_mut() {
        value.remove("document");
    }
    Ok(HttpResponse::Ok()
        .insert_header(("Cache-Control", "no-store"))
        .json(result))
}
#[get("/compilations/assets/{filename}")]
pub async fn asset(
    config: web::Data<Config>,
    session: AdminSession,
    db: web::Data<Db>,
    filename: web::Path<String>,
) -> Result<HttpResponse, AppError> {
    session.validate(&db).await?;
    Ok(HttpResponse::Ok()
        .insert_header(("Cache-Control", "private, no-store"))
        .insert_header(("X-Content-Type-Options", "nosniff"))
        .content_type("image/png")
        .body(publishing::asset(&config, &filename).await?))
}

#[derive(Deserialize)]
pub struct Refresh {
    pub expected_revision: i64,
    pub compilation_id: String,
}
#[post("/{kind}/{slug}/refresh-publication")]
pub async fn refresh(
    config: web::Data<Config>,
    db: web::Data<Db>,
    session: AdminSession,
    path: web::Path<(String, String)>,
    input: web::Json<Refresh>,
) -> Result<HttpResponse, AppError> {
    session.validate(&db).await?;
    let (kind, slug) = path.into_inner();
    let kind = publishing::kind(&kind)?;
    let compiled = publishing::verified_publication(
        &config,
        &db,
        kind,
        &slug,
        input.expected_revision,
        &input.compilation_id,
    )
    .await?;
    Ok(HttpResponse::Ok().json(
        db.refresh_publication(kind, &slug, input.expected_revision, compiled)
            .await?,
    ))
}

/// Private, uncached preview source for the site's `/preview/...` pages. The browser
/// artifact is never trusted: the draft is compiled by the trusted compiler and cached by revision.
#[get("/preview/{kind}/{slug}")]
pub async fn preview(
    config: web::Data<Config>,
    db: web::Data<Db>,
    session: AdminSession,
    path: web::Path<(String, String)>,
) -> Result<HttpResponse, AppError> {
    session.validate(&db).await?;
    let (kind, slug) = path.into_inner();
    let result = publishing::preview(&config, &db, publishing::kind(&kind)?, &slug).await?;
    let mut response = if result["state"] == "pending" {
        let mut r = HttpResponse::Accepted();
        r.insert_header(("Retry-After", "2"));
        r
    } else {
        HttpResponse::Ok()
    };
    Ok(response
        .insert_header(("Cache-Control", "private, no-store"))
        .json(result))
}

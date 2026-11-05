//! Published raster files are public; media administration stays authenticated.
use crate::error::AppError;
use actix_web::{HttpResponse, get, web};
#[get("/media/{filename}")]
pub async fn show(filename: web::Path<String>) -> Result<HttpResponse, AppError> {
    let (id, extension) = filename
        .rsplit_once('.')
        .ok_or_else(|| AppError::NotFound("image not found".into()))?;
    if uuid::Uuid::parse_str(id).is_err() || !matches!(extension, "png" | "jpg") {
        return Err(AppError::NotFound("image not found".into()));
    }
    let directory = std::env::var("MEDIA_PATH").unwrap_or_else(|_| "data/media".into());
    let data = tokio::fs::read(std::path::Path::new(&directory).join(filename.as_str()))
        .await
        .map_err(|_| AppError::NotFound("image not found".into()))?;
    Ok(HttpResponse::Ok()
        .insert_header(("X-Content-Type-Options", "nosniff"))
        .insert_header(("Cache-Control", "public, max-age=31536000, immutable"))
        .content_type(if extension == "png" {
            "image/png"
        } else {
            "image/jpeg"
        })
        .body(data))
}

#[get("/media/diagrams/{filename}")]
pub async fn diagram(
    config: web::Data<crate::config::Config>,
    db: web::Data<crate::db::Db>,
    filename: web::Path<String>,
) -> Result<HttpResponse, AppError> {
    if !crate::publishing::valid_asset(&filename) || !db.diagram_is_published(&filename).await? {
        return Err(AppError::NotFound("Image not found.".into()));
    }
    Ok(HttpResponse::Ok()
        .insert_header(("X-Content-Type-Options", "nosniff"))
        .insert_header(("Cache-Control", "public, max-age=31536000, immutable"))
        .content_type("image/png")
        .body(crate::publishing::asset(&config, &filename).await?))
}

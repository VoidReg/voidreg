use crate::{auth::extract::AdminSession, db::Db, error::AppError};
use actix_web::{HttpResponse, delete, get, post, put, web};
use base64::{Engine, engine::general_purpose::STANDARD};
use serde_json::{Value, json};
fn directory() -> std::path::PathBuf {
    std::env::var("MEDIA_PATH")
        .unwrap_or_else(|_| "data/media".into())
        .into()
}
fn filename(value: &str) -> Result<(), AppError> {
    let valid = value
        .rsplit_once('.')
        .is_some_and(|(id, ext)| uuid::Uuid::parse_str(id).is_ok() && matches!(ext, "png" | "jpg"));
    if valid {
        Ok(())
    } else {
        Err(AppError::Unprocessable("invalid media filename".into()))
    }
}
#[cfg_attr(feature="swagger", utoipa::path(get,path="/api/v1/admin/media",tag="admin",responses((status=200,description="Media library"))))]
#[get("/media")]
pub async fn list(db: web::Data<Db>, session: AdminSession) -> Result<HttpResponse, AppError> {
    session.validate(&db).await?;
    Ok(HttpResponse::Ok().json(json!({"items":db.media_list().await?})))
}
#[cfg_attr(feature="swagger", utoipa::path(post,path="/api/v1/admin/media",tag="admin",request_body=Object,responses((status=201,description="Uploaded raster image"))))]
#[post("/media")]
pub async fn upload(
    db: web::Data<Db>,
    session: AdminSession,
    input: web::Json<Value>,
) -> Result<HttpResponse, AppError> {
    session.validate(&db).await?;
    let bytes = STANDARD
        .decode(input["data"].as_str().unwrap_or(""))
        .map_err(|_| AppError::Unprocessable("invalid base64 upload".into()))?;
    if bytes.len() > 4 * 1024 * 1024 {
        return Err(AppError::Unprocessable("images may be up to 4 MiB".into()));
    }
    let (extension, width, height) = image_dimensions(&bytes)?;
    if width == 0 || height == 0 || width > 16000 || height > 16000 {
        return Err(AppError::Unprocessable(
            "image dimensions must be between 1 and 16000 pixels".into(),
        ));
    }
    let name = format!("{}.{}", uuid::Uuid::new_v4(), extension);
    let dir = directory();
    tokio::fs::create_dir_all(&dir)
        .await
        .map_err(|e| AppError::Internal(e.to_string()))?;
    tokio::fs::write(dir.join(&name), &bytes)
        .await
        .map_err(|e| AppError::Internal(e.to_string()))?;
    let value = json!({"id":name,"url":format!("/media/{name}"),"name":input["name"].as_str().unwrap_or("Image"),"alt":input["alt"].as_str().unwrap_or(""),"caption":"","width":width,"height":height,"bytes":bytes.len(),"created_at":crate::util::now_rfc3339()});
    if let Err(e) = db.media_save(&name, &value).await {
        let _ = tokio::fs::remove_file(dir.join(&name)).await;
        return Err(e);
    }
    Ok(HttpResponse::Created().json(value))
}
// Parse headers without allocating/decompressing attacker-controlled image sizes.
fn image_dimensions(b: &[u8]) -> Result<(&'static str, u32, u32), AppError> {
    if b.starts_with(b"\x89PNG\r\n\x1a\n") && b.len() >= 24 && &b[12..16] == b"IHDR" {
        return Ok((
            "png",
            u32::from_be_bytes(b[16..20].try_into().unwrap()),
            u32::from_be_bytes(b[20..24].try_into().unwrap()),
        ));
    }
    if b.starts_with(&[255, 216]) {
        let mut i = 2;
        while i + 4 <= b.len() {
            if b[i] != 255 {
                break;
            }
            let marker = b[i + 1];
            i += 2;
            if marker == 217 || marker == 218 {
                break;
            }
            let n = u16::from_be_bytes([b[i], b[i + 1]]) as usize;
            if n < 2 || i + n > b.len() {
                break;
            }
            if matches!(marker,192..=195|197..=199|201..=203|205..=207) && n >= 7 {
                return Ok((
                    "jpg",
                    u16::from_be_bytes([b[i + 5], b[i + 6]]) as u32,
                    u16::from_be_bytes([b[i + 3], b[i + 4]]) as u32,
                ));
            }
            i += n;
        }
    }
    Err(AppError::Unprocessable("upload a PNG or JPEG image".into()))
}
#[cfg_attr(feature="swagger", utoipa::path(put,path="/api/v1/admin/media/{id}",tag="admin",params(("id"=String,Path)),request_body=Object,responses((status=200,description="Media metadata updated"))))]
#[put("/media/{id}")]
pub async fn update(
    db: web::Data<Db>,
    session: AdminSession,
    id: web::Path<String>,
    input: web::Json<Value>,
) -> Result<HttpResponse, AppError> {
    session.validate(&db).await?;
    filename(&id)?;
    let mut value = db
        .media_list()
        .await?
        .into_iter()
        .find(|v| v["id"] == *id)
        .ok_or_else(|| AppError::NotFound("media not found".into()))?;
    for key in ["name", "alt", "caption"] {
        if let Some(text) = input[key].as_str() {
            if text.len() > 4000 {
                return Err(AppError::Unprocessable("media text too long".into()));
            }
            value[key] = json!(text);
        }
    }
    db.media_save(&id, &value).await?;
    Ok(HttpResponse::Ok().json(value))
}
#[cfg_attr(feature="swagger", utoipa::path(delete,path="/api/v1/admin/media/{id}",tag="admin",params(("id"=String,Path)),responses((status=200,description="Unreferenced media deleted"))))]
#[delete("/media/{id}")]
pub async fn remove(
    db: web::Data<Db>,
    session: AdminSession,
    id: web::Path<String>,
) -> Result<HttpResponse, AppError> {
    session.validate(&db).await?;
    filename(&id)?;
    db.media_delete(&id).await?;
    let path = directory().join(id.as_str());
    if path.exists() {
        tokio::fs::remove_file(path)
            .await
            .map_err(|e| AppError::Internal(e.to_string()))?;
    }
    Ok(HttpResponse::Ok().json(json!({"deleted":*id})))
}

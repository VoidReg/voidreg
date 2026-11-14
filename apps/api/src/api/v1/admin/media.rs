use crate::{auth::extract::AdminSession, db::Db, error::AppError};
use actix_web::{HttpResponse, delete, get, post, put, web};
use base64::{Engine, engine::general_purpose::STANDARD};
use serde_json::{Value, json};
fn directory() -> std::path::PathBuf {
    std::env::var("MEDIA_PATH")
        .unwrap_or_else(|_| "data/media".into())
        .into()
}
pub(crate) fn filename(value: &str) -> Result<(), AppError> {
    let valid = value
        .rsplit_once('.')
        .is_some_and(|(id, ext)| uuid::Uuid::parse_str(id).is_ok() && matches!(ext, "png" | "jpg"));
    if valid {
        Ok(())
    } else {
        Err(AppError::Unprocessable("invalid media filename".into()))
    }
}
fn text_field(input: &Value, key: &str, max: usize) -> Result<String, AppError> {
    let text = match &input[key] {
        Value::Null => "",
        Value::String(text) => text,
        _ => return Err(AppError::Unprocessable(format!("{key} must be text"))),
    };
    if text.len() > max {
        return Err(AppError::Unprocessable(format!("{key} is too long")));
    }
    Ok(text.to_owned())
}
/// Decodes a PNG or JPEG upload of at most 4 MiB and stores it in the media library.
/// `data` is standard base64, with or without a `data:` URL prefix. Alt may be empty here;
/// the admin uploader fills it in afterwards, and the MCP route requires it.
pub async fn store(db: &Db, input: &Value) -> Result<Value, AppError> {
    let raw = input["data"].as_str().unwrap_or("");
    let raw = match raw.split_once(',') {
        Some((head, body)) if head.starts_with("data:") && head.contains("base64") => body,
        _ => raw,
    };
    let compact: String = raw.chars().filter(|c| !c.is_whitespace()).collect();
    let bytes = STANDARD
        .decode(compact)
        .map_err(|_| AppError::Unprocessable("invalid base64 upload".into()))?;
    if bytes.is_empty() || bytes.len() > 4 * 1024 * 1024 {
        return Err(AppError::Unprocessable("images may be up to 4 MiB".into()));
    }
    let (extension, width, height) = image_dimensions(&bytes)?;
    if width == 0 || height == 0 || width > 16000 || height > 16000 {
        return Err(AppError::Unprocessable(
            "image dimensions must be between 1 and 16000 pixels".into(),
        ));
    }
    let name = text_field(input, "name", 4000)?;
    let alt = text_field(input, "alt", 4000)?;
    let caption = text_field(input, "caption", 4000)?;
    let file = format!("{}.{}", uuid::Uuid::new_v4(), extension);
    let dir = directory();
    tokio::fs::create_dir_all(&dir)
        .await
        .map_err(|e| AppError::Internal(e.to_string()))?;
    tokio::fs::write(dir.join(&file), &bytes)
        .await
        .map_err(|e| AppError::Internal(e.to_string()))?;
    let value = json!({
        "id": file,
        "url": format!("/media/{file}"),
        "name": if name.is_empty() { "Image".to_owned() } else { name },
        "alt": alt,
        "caption": caption,
        "width": width,
        "height": height,
        "bytes": bytes.len(),
        "created_at": crate::util::now_rfc3339()
    });
    if let Err(e) = db.media_save(&file, &value).await {
        let _ = tokio::fs::remove_file(dir.join(&file)).await;
        return Err(e);
    }
    Ok(value)
}
pub async fn save_metadata(db: &Db, id: &str, input: &Value) -> Result<Value, AppError> {
    filename(id)?;
    let mut value = db
        .media_get(id)
        .await?
        .ok_or_else(|| AppError::NotFound("media not found".into()))?;
    for key in ["name", "alt", "caption"] {
        if input.get(key).is_some() {
            value[key] = json!(text_field(input, key, 4000)?);
        }
    }
    db.media_save(id, &value).await?;
    Ok(value)
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
    Ok(HttpResponse::Created().json(store(&db, &input).await?))
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
    Ok(HttpResponse::Ok().json(save_metadata(&db, &id, &input).await?))
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

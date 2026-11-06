use crate::{auth::extract::AdminSession, db::Db, error::AppError};
use actix_web::{HttpResponse, delete, get, post, put, web};
use serde::Deserialize;
use serde_json::{Value, json};

#[derive(Deserialize)]
pub struct Revision {
    pub expected_revision: i64,
    pub compilation_id: Option<String>,
}

#[cfg_attr(feature="swagger", utoipa::path(get,path="/api/v1/admin/projects",tag="admin",responses((status=200,description="Project working copies"))))]
#[get("/projects")]
pub async fn list(
    db: web::Data<Db>,
    session: AdminSession,
    query: web::Query<crate::db::content::ContentQuery>,
) -> Result<HttpResponse, AppError> {
    session.validate(&db).await?;
    Ok(HttpResponse::Ok().json(db.content_page("project", false, &query).await?))
}
#[cfg_attr(feature="swagger", utoipa::path(get,path="/api/v1/admin/projects/{slug}",tag="admin",params(("slug"=String,Path)),responses((status=200,description="Project working copy"))))]
#[get("/projects/{slug}")]
pub async fn get_one(
    db: web::Data<Db>,
    session: AdminSession,
    slug: web::Path<String>,
) -> Result<HttpResponse, AppError> {
    session.validate(&db).await?;
    Ok(HttpResponse::Ok().json(db.content_get("project", &slug, false).await?))
}
#[cfg_attr(feature="swagger", utoipa::path(get,path="/api/v1/admin/graph",tag="admin",responses((status=200,description="Graph of working copies, drafts included"))))]
#[get("/graph")]
pub async fn graph(db: web::Data<Db>, session: AdminSession) -> Result<HttpResponse, AppError> {
    session.validate(&db).await?;
    Ok(HttpResponse::Ok()
        .insert_header(("Cache-Control", "private, no-store"))
        .json(db.content_graph(false).await?))
}
fn merge_fields(value: &mut Value, input: &Value) {
    const FIELDS: &[&str] = &[
        "slug",
        "title",
        "category",
        "summary",
        "tags",
        "featured",
        "sort_order",
        "repo_url",
        "demo_url",
        "hero_image",
        "social_image",
        "seo_title",
        "seo_description",
        "document",
        "compiled",
        "media_ids",
        "related_project_ids",
        "pending_slug",
    ];
    if let Some(fields) = input.as_object() {
        for (key, v) in fields {
            if FIELDS.contains(&key.as_str()) {
                value[key] = v.clone();
            }
        }
    }
}
fn normalize_project_tags(value: &mut Value) -> Result<(), AppError> {
    let items = value["tags"]
        .as_array()
        .ok_or_else(|| AppError::Unprocessable("tags must be a list of text".into()))?;
    let raw = items
        .iter()
        .map(|t| {
            t.as_str()
                .map(str::to_owned)
                .ok_or_else(|| AppError::Unprocessable("tags must be a list of text".into()))
        })
        .collect::<Result<Vec<_>, _>>()?;
    value["tags"] = json!(crate::domain::normalize_tags(raw)?);
    Ok(())
}
fn validate(value: &Value) -> Result<(), AppError> {
    let _: crate::domain::Project = serde_json::from_value(value.clone())
        .map_err(|e| AppError::Unprocessable(format!("invalid project fields: {e}")))?;
    let slug = value["slug"].as_str().unwrap_or("");
    if slug.is_empty()
        || slug.len() > 120
        || slug.starts_with('-')
        || slug.ends_with('-')
        || slug.contains("--")
        || !slug
            .bytes()
            .all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || c == b'-')
    {
        return Err(AppError::Unprocessable(
            "use lowercase letters, numbers, and single hyphens for the URL".into(),
        ));
    }
    for key in ["repo_url", "demo_url", "hero_image", "social_image"] {
        if let Some(_url) = value[key].as_str().filter(|url| {
            !url.is_empty()
                && !url.starts_with("https://")
                && !url.starts_with("http://")
                && !url.starts_with("/media/")
        }) {
            return Err(AppError::Unprocessable(format!(
                "{key} must be an HTTP URL or managed media URL"
            )));
        }
    }
    if !value["document"].is_null() {
        crate::domain::document::validate_document(&value["document"].to_string())?;
    }
    if !value["compiled"].is_null() {
        crate::domain::document::validate_compiled(&value["compiled"].to_string())?;
    }
    Ok(())
}
#[cfg_attr(feature="swagger", utoipa::path(post,path="/api/v1/admin/projects",tag="admin",request_body=Object,responses((status=201,description="Project draft created"))))]
#[post("/projects")]
pub async fn create(
    db: web::Data<Db>,
    session: AdminSession,
    input: web::Json<Value>,
) -> Result<HttpResponse, AppError> {
    session.validate(&db).await?;
    let mut value = json!({"slug":format!("project-{}",uuid::Uuid::new_v4()),"title":"Untitled project","category":"","summary":"","tags":[],"sections":[],"hero":null,"related_slugs":[],"related_project_ids":[],"repo_url":null,"has_detail_page":true,"featured":false,"sort_order":0,"document":{"schemaVersion":1,"metadata":{"language":"en"},"blocks":[]},"compiled":null});
    merge_fields(&mut value, &input);
    normalize_project_tags(&mut value)?;
    value["status"] = json!("draft");
    validate(&value)?;
    Ok(HttpResponse::Created().json(db.content_create("project", value).await?))
}
#[cfg_attr(feature="swagger", utoipa::path(put,path="/api/v1/admin/projects/{slug}",tag="admin",params(("slug"=String,Path)),request_body=Object,responses((status=200,description="Project draft saved"))))]
#[put("/projects/{slug}")]
pub async fn update(
    db: web::Data<Db>,
    session: AdminSession,
    slug: web::Path<String>,
    input: web::Json<Value>,
) -> Result<HttpResponse, AppError> {
    session.validate(&db).await?;
    let mut current = db.content_get("project", &slug, false).await?;
    let revision = input["expected_revision"]
        .as_i64()
        .ok_or_else(|| AppError::Conflict("expected_revision required".into()))?;
    if input.get("document").is_some() {
        current["compiled"] = Value::Null;
    }
    merge_fields(&mut current, &input);
    normalize_project_tags(&mut current)?;
    validate(&current)?;
    if current["slug"] != *slug {
        current["pending_slug"] = current["slug"].clone();
    }
    Ok(HttpResponse::Ok().json(
        db.content_save("project", &slug, revision, current, false)
            .await?,
    ))
}
#[cfg_attr(feature="swagger", utoipa::path(post,path="/api/v1/admin/{kind}/{slug}/{action}",tag="admin",params(("kind"=String,Path),("slug"=String,Path),("action"=String,Path)),request_body=Object,responses((status=200,description="Revision-checked publication, archive, or restore"))))]
#[post("/{kind}/{slug}/{action}")]
pub async fn action(
    config: web::Data<crate::config::Config>,
    db: web::Data<Db>,
    session: AdminSession,
    path: web::Path<(String, String, String)>,
    input: web::Json<Revision>,
) -> Result<HttpResponse, AppError> {
    session.validate(&db).await?;
    let (kind, slug, action) = path.into_inner();
    let kind = match kind.as_str() {
        "projects" => "project",
        "articles" => "article",
        _ => return Err(AppError::NotFound("content kind not found".into())),
    };
    let compiled = if action == "publish" {
        Some(
            crate::publishing::verified(
                &config,
                &db,
                kind,
                &slug,
                input.expected_revision,
                input.compilation_id.as_deref(),
            )
            .await?,
        )
    } else {
        None
    };
    Ok(HttpResponse::Ok().json(
        db.content_action_compiled(kind, &slug, input.expected_revision, &action, compiled)
            .await?,
    ))
}
#[cfg_attr(feature="swagger", utoipa::path(delete,path="/api/v1/admin/projects/{slug}",tag="admin",params(("slug"=String,Path)),request_body=Object,responses((status=200,description="Project deleted"))))]
#[delete("/projects/{slug}")]
pub async fn remove(
    db: web::Data<Db>,
    session: AdminSession,
    slug: web::Path<String>,
    input: web::Json<Revision>,
) -> Result<HttpResponse, AppError> {
    session.validate(&db).await?;
    db.content_action("project", &slug, input.expected_revision, "delete")
        .await?;
    Ok(HttpResponse::Ok().json(json!({"deleted":*slug})))
}

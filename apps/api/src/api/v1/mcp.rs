//! Private HTTP bridge for the MCP service. Nginx denies public access.
//! Bearer credentials never grant cookie-admin access or publishing rights. A token reads
//! content, edits article drafts, uploads images, and sets cover and search fields on those
//! drafts. The `projects` permission, chosen by the owner when the token is created, adds
//! creating and editing project drafts, including the same cover and search fields. Nothing
//! here publishes or deletes.
use crate::{
    auth::{hash_token, rate::RateLimiter},
    config::Config,
    db::Db,
    domain::ArticleWriteRequest,
    error::AppError,
};
use actix_web::{HttpRequest, HttpResponse, get, post, put, web};
use serde::Deserialize;
use serde_json::Value;

/// Checks the bearer token and returns the extra permissions it carries.
pub async fn authorize(
    request: &HttpRequest,
    db: &Db,
    config: &Config,
    limiter: &RateLimiter,
) -> Result<Vec<String>, AppError> {
    let token = request
        .headers()
        .get("authorization")
        .and_then(|h| h.to_str().ok())
        .and_then(|h| h.strip_prefix("Bearer "))
        .filter(|s| s.starts_with("vr_mcp_") && s.len() <= 128)
        .ok_or_else(|| AppError::Unauthorized("MCP bearer token required".into()))?;
    let hash = hash_token(token);
    let (identity, scopes) = db
        .mcp_token_auth(&hash)
        .await?
        .ok_or_else(|| AppError::Unauthorized("MCP token expired or revoked".into()))?;
    let (provider, subject) = db
        .identity_subject(&identity)
        .await?
        .ok_or_else(|| AppError::Unauthorized("MCP owner no longer exists".into()))?;
    if provider != "github" || !config.admin_identity_allowed(&provider, &subject) {
        return Err(AppError::Forbidden(
            "MCP owner is no longer an administrator".into(),
        ));
    }
    if !limiter.check(
        &format!("mcp:{hash}"),
        240,
        std::time::Duration::from_secs(60),
    ) {
        return Err(AppError::TooManyRequests(
            "MCP request limit reached".into(),
        ));
    }
    db.touch_mcp_token(&hash).await?;
    Ok(scopes)
}

fn require_scope(scopes: &[String], scope: &str) -> Result<(), AppError> {
    if scopes.iter().any(|s| s == scope) {
        return Ok(());
    }
    Err(AppError::Forbidden(format!(
        "This token cannot do that. Create a new token with the '{scope}' permission in admin."
    )))
}
#[get("/session")]
async fn session(
    request: HttpRequest,
    db: web::Data<Db>,
    config: web::Data<Config>,
    limiter: web::Data<RateLimiter>,
) -> Result<HttpResponse, AppError> {
    let scopes = authorize(&request, &db, &config, &limiter).await?;
    Ok(HttpResponse::Ok().json(serde_json::json!({"authenticated": true, "scopes": scopes})))
}
#[derive(Deserialize)]
struct ListQuery {
    status: Option<String>,
    page: Option<usize>,
    per_page: Option<usize>,
}
#[get("/articles")]
async fn list(
    request: HttpRequest,
    db: web::Data<Db>,
    config: web::Data<Config>,
    limiter: web::Data<RateLimiter>,
    query: web::Query<ListQuery>,
) -> Result<HttpResponse, AppError> {
    authorize(&request, &db, &config, &limiter).await?;
    if query
        .status
        .as_deref()
        .is_some_and(|s| s != "draft" && s != "published")
    {
        return Err(AppError::Unprocessable(
            "status must be draft or published".into(),
        ));
    }
    let items: Vec<_> = db
        .admin_list_articles()
        .await?
        .into_iter()
        .filter(|a| {
            query
                .status
                .as_deref()
                .is_none_or(|s| a.status.as_str() == s)
        })
        .collect();
    let total = items.len();
    let page = query.page.unwrap_or(1).clamp(1, 1_000_000);
    let per_page = query.per_page.unwrap_or(20).clamp(1, 100);
    let items: Vec<_> = items
        .into_iter()
        .skip((page - 1) * per_page)
        .take(per_page)
        .collect();
    Ok(HttpResponse::Ok()
        .json(serde_json::json!({"items":items,"page":page,"per_page":per_page,"total":total})))
}
#[get("/articles/{slug}")]
async fn get(
    request: HttpRequest,
    db: web::Data<Db>,
    config: web::Data<Config>,
    limiter: web::Data<RateLimiter>,
    slug: web::Path<String>,
) -> Result<HttpResponse, AppError> {
    authorize(&request, &db, &config, &limiter).await?;
    Ok(HttpResponse::Ok().json(db.admin_get_article(&slug).await?))
}
fn restrict(input: &ArticleWriteRequest) -> Result<(), AppError> {
    if input.featured.is_some()
        || input.sort_order.is_some()
        || input.reading_time_minutes.is_some()
    {
        return Err(AppError::Forbidden(
            "MCP may edit title, category, summary, tags, filing, cover, search text, and draft content only".into(),
        ));
    }
    Ok(())
}
/// Meta keys a token may change on an article draft. Anything else, including the discussion
/// link, is rejected so a partial update cannot wipe or replace it.
const ARTICLE_META: &[&str] = &[
    "project_ids",
    "topic_id",
    "media_ids",
    "seo_title",
    "seo_description",
    "social_image",
    "hero_alt",
    "hero_caption",
    "hero_image",
];
fn parse_article(raw: &Value) -> Result<ArticleWriteRequest, AppError> {
    serde_json::from_value(raw.clone())
        .map_err(|e| AppError::Unprocessable(format!("invalid article fields: {e}")))
}
fn limited_text(value: &Value, key: &str, max: usize) -> Result<String, AppError> {
    let text = value
        .as_str()
        .ok_or_else(|| AppError::Unprocessable(format!("{key} must be text")))?;
    if text.len() > max {
        return Err(AppError::Unprocessable(format!("{key} is too long")));
    }
    Ok(text.to_owned())
}
fn optional_image(value: &Value, key: &str) -> Result<Option<String>, AppError> {
    match value {
        Value::Null => Ok(None),
        Value::String(text) if text.is_empty() => Ok(None),
        Value::String(text) => Ok(Some(text.clone())),
        _ => Err(AppError::Unprocessable(format!(
            "{key} must be an HTTP or managed media URL, or null"
        ))),
    }
}
async fn require_library_file(db: &Db, filename: &str) -> Result<(), AppError> {
    super::admin::media::filename(filename)?;
    if db.media_get(filename).await?.is_none() {
        return Err(AppError::Unprocessable(format!(
            "media '{filename}' does not exist. Upload it first."
        )));
    }
    Ok(())
}
async fn require_image_ref(db: &Db, key: &str, url: &str) -> Result<(), AppError> {
    if url.len() > 300 {
        return Err(AppError::Unprocessable(format!("{key} is too long")));
    }
    if let Some(filename) = url.strip_prefix("/media/") {
        return require_library_file(db, filename).await;
    }
    if url.starts_with("https://") || url.starts_with("http://") {
        return Ok(());
    }
    Err(AppError::Unprocessable(format!(
        "{key} must be an HTTP or managed media URL"
    )))
}
async fn media_ids(db: &Db, value: &Value) -> Result<Vec<String>, AppError> {
    let items = value
        .as_array()
        .ok_or_else(|| AppError::Unprocessable("media_ids must be a list".into()))?;
    if items.len() > 40 {
        return Err(AppError::Unprocessable(
            "use at most 40 media attachments".into(),
        ));
    }
    let mut out = Vec::new();
    for item in items {
        let raw = item.as_str().ok_or_else(|| {
            AppError::Unprocessable("media_ids must be a list of media ids".into())
        })?;
        let filename = raw.strip_prefix("/media/").unwrap_or(raw);
        require_library_file(db, filename).await?;
        if !out.iter().any(|id| id == filename) {
            out.push(filename.to_owned());
        }
    }
    Ok(out)
}
/// Applies only the meta keys present in the request, starting from the saved meta.
/// Omitted keys stay as they are. A `/media/` cover must already be in the library.
async fn apply_article_meta(
    db: &Db,
    mut input: ArticleWriteRequest,
    mut meta: crate::domain::ContentMeta,
    raw: Option<&Value>,
) -> Result<ArticleWriteRequest, AppError> {
    let Some(raw) = raw else {
        input.meta = None;
        return Ok(input);
    };
    let fields = raw
        .as_object()
        .ok_or_else(|| AppError::Unprocessable("meta must be an object".into()))?;
    for key in fields.keys() {
        if !ARTICLE_META.contains(&key.as_str()) {
            return Err(AppError::Forbidden(format!(
                "MCP may not set '{key}' on a draft. The discussion link stays as saved."
            )));
        }
    }
    if let Some(value) = fields.get("project_ids") {
        let ids: Vec<String> = serde_json::from_value(value.clone())
            .map_err(|_| AppError::Unprocessable("project_ids must be a list of ids".into()))?;
        if ids.len() > 100 {
            return Err(AppError::Unprocessable(
                "too many project associations".into(),
            ));
        }
        meta.project_ids = ids;
    }
    if let Some(value) = fields.get("topic_id") {
        meta.topic_id = match value {
            Value::Null => None,
            Value::String(id) if id.is_empty() => None,
            Value::String(id) => Some(id.clone()),
            _ => {
                return Err(AppError::Unprocessable(
                    "topic_id must be an id or null".into(),
                ));
            }
        };
    }
    if let Some(value) = fields.get("media_ids") {
        meta.media_ids = media_ids(db, value).await?;
    }
    if let Some(value) = fields.get("seo_title") {
        meta.seo_title = limited_text(value, "seo_title", 200)?;
    }
    if let Some(value) = fields.get("seo_description") {
        meta.seo_description = limited_text(value, "seo_description", 500)?;
    }
    if let Some(value) = fields.get("hero_alt") {
        meta.hero_alt = limited_text(value, "hero_alt", 4000)?;
    }
    if let Some(value) = fields.get("hero_caption") {
        meta.hero_caption = limited_text(value, "hero_caption", 4000)?;
    }
    for key in ["hero_image", "social_image"] {
        if let Some(value) = fields.get(key) {
            let url = optional_image(value, key)?;
            if let Some(url) = &url {
                require_image_ref(db, key, url).await?;
            }
            if key == "hero_image" {
                meta.hero_image = url;
            } else {
                meta.social_image = url;
            }
        }
    }
    input.meta = Some(meta);
    Ok(input)
}
fn require_upload_text(input: &Value) -> Result<(), AppError> {
    let name = input["name"].as_str().unwrap_or("").trim();
    let alt = input["alt"].as_str().unwrap_or("").trim();
    if name.is_empty() || name.len() > 200 {
        return Err(AppError::Unprocessable(
            "name is required and must be at most 200 characters".into(),
        ));
    }
    if alt.is_empty() || alt.len() > 4000 {
        return Err(AppError::Unprocessable(
            "alt text is required and must be at most 4000 characters".into(),
        ));
    }
    Ok(())
}
#[post("/articles")]
async fn create(
    request: HttpRequest,
    db: web::Data<Db>,
    config: web::Data<Config>,
    limiter: web::Data<RateLimiter>,
    input: web::Json<Value>,
) -> Result<HttpResponse, AppError> {
    authorize(&request, &db, &config, &limiter).await?;
    let raw = input.into_inner();
    let mut parsed = parse_article(&raw)?;
    restrict(&parsed)?;
    parsed = apply_article_meta(&db, parsed, Default::default(), raw.get("meta")).await?;
    super::admin::articles::create(&db, parsed).await
}
#[put("/articles/{slug}")]
async fn update(
    request: HttpRequest,
    db: web::Data<Db>,
    config: web::Data<Config>,
    limiter: web::Data<RateLimiter>,
    slug: web::Path<String>,
    input: web::Json<Value>,
) -> Result<HttpResponse, AppError> {
    authorize(&request, &db, &config, &limiter).await?;
    let raw = input.into_inner();
    let mut parsed = parse_article(&raw)?;
    restrict(&parsed)?;
    let slug = slug.into_inner();
    let current = db.admin_get_article(&slug).await?.meta;
    parsed = apply_article_meta(&db, parsed, current, raw.get("meta")).await?;
    super::admin::articles::update(&db, slug, parsed, true).await
}
#[post("/compilations")]
async fn compile(
    request: HttpRequest,
    db: web::Data<Db>,
    config: web::Data<Config>,
    limiter: web::Data<RateLimiter>,
    input: web::Json<serde_json::Value>,
) -> Result<HttpResponse, AppError> {
    authorize(&request, &db, &config, &limiter).await?;
    let document = &input["document"];
    crate::domain::document::validate_document(&document.to_string())?;
    Ok(HttpResponse::Accepted().json(crate::publishing::request(&config,"/jobs", Some(&serde_json::json!({"kind":"article","slug":"mcp-validation","revision":0,"title":input["title"],"document":document}))).await?))
}
#[get("/compilations/{id}")]
async fn compilation(
    request: HttpRequest,
    db: web::Data<Db>,
    config: web::Data<Config>,
    limiter: web::Data<RateLimiter>,
    id: web::Path<String>,
) -> Result<HttpResponse, AppError> {
    authorize(&request, &db, &config, &limiter).await?;
    crate::publishing::valid_id(&id)?;
    let mut job = crate::publishing::request(&config, &format!("/jobs/{id}"), None).await?;
    // Validation results never expose preview files or a publication artifact.
    if let Some(value) = job.as_object_mut() {
        value.remove("document");
        value.remove("artifact");
    }
    Ok(HttpResponse::Ok().json(job))
}
/// The project a post or topic is filed under, as the owner's working copy.
#[get("/projects/{slug}")]
async fn project(
    request: HttpRequest,
    db: web::Data<Db>,
    config: web::Data<Config>,
    limiter: web::Data<RateLimiter>,
    slug: web::Path<String>,
) -> Result<HttpResponse, AppError> {
    authorize(&request, &db, &config, &limiter).await?;
    Ok(HttpResponse::Ok().json(db.content_get("project", &slug, false).await?))
}
/// Working copies of projects, drafts included.
#[get("/projects")]
async fn list_projects(
    request: HttpRequest,
    db: web::Data<Db>,
    config: web::Data<Config>,
    limiter: web::Data<RateLimiter>,
    query: web::Query<crate::db::content::ContentQuery>,
) -> Result<HttpResponse, AppError> {
    authorize(&request, &db, &config, &limiter).await?;
    Ok(HttpResponse::Ok().json(db.content_page("project", false, &query).await?))
}

/// Fields a project-scoped token may set. The compiled artifact, slug renames and publishing
/// stay with the owner. Featured and order only take effect when the owner publishes.
/// Cover alt for a `/media/` image is taken from the media asset at publication.
const PROJECT_FIELDS: &[&str] = &[
    "title",
    "category",
    "summary",
    "tags",
    "repo_url",
    "demo_url",
    "featured",
    "sort_order",
    "document",
    "related_project_ids",
    "hero_image",
    "social_image",
    "seo_title",
    "seo_description",
    "media_ids",
];
async fn screen_project_media(db: &Db, input: &mut Value) -> Result<(), AppError> {
    for key in ["hero_image", "social_image"] {
        if !input.get(key).is_some_and(|value| !value.is_null()) {
            continue;
        }
        let url = input[key].as_str().ok_or_else(|| {
            AppError::Unprocessable(format!(
                "{key} must be an HTTP or managed media URL, or null"
            ))
        })?;
        if url.is_empty() {
            input[key] = Value::Null;
            continue;
        }
        require_image_ref(db, key, url).await?;
    }
    if input.get("seo_title").is_some() {
        limited_text(&input["seo_title"], "seo_title", 200)?;
    }
    if input.get("seo_description").is_some() {
        limited_text(&input["seo_description"], "seo_description", 500)?;
    }
    if input.get("media_ids").is_some() {
        let ids = media_ids(db, &input["media_ids"]).await?;
        input["media_ids"] = serde_json::json!(ids);
    }
    Ok(())
}

fn restrict_project(input: &Value, creating: bool) -> Result<(), AppError> {
    let Some(fields) = input.as_object() else {
        return Err(AppError::Unprocessable("expected a JSON object".into()));
    };
    for key in fields.keys() {
        let allowed = PROJECT_FIELDS.contains(&key.as_str())
            || key == "expected_revision" && !creating
            || key == "slug" && creating;
        if !allowed {
            return Err(AppError::Forbidden(format!(
                "MCP may not set '{key}' on a project. Publishing, deletion, compiled output and URL renames stay in admin."
            )));
        }
    }
    Ok(())
}

#[post("/projects")]
async fn create_project(
    request: HttpRequest,
    db: web::Data<Db>,
    config: web::Data<Config>,
    limiter: web::Data<RateLimiter>,
    input: web::Json<Value>,
) -> Result<HttpResponse, AppError> {
    let scopes = authorize(&request, &db, &config, &limiter).await?;
    require_scope(&scopes, super::admin::mcp::SCOPE_PROJECTS)?;
    let mut input = input.into_inner();
    restrict_project(&input, true)?;
    screen_project_media(&db, &mut input).await?;
    Ok(HttpResponse::Created()
        .json(super::admin::content::create_project_draft(&db, &input).await?))
}

#[put("/projects/{slug}")]
async fn update_project(
    request: HttpRequest,
    db: web::Data<Db>,
    config: web::Data<Config>,
    limiter: web::Data<RateLimiter>,
    slug: web::Path<String>,
    input: web::Json<Value>,
) -> Result<HttpResponse, AppError> {
    let scopes = authorize(&request, &db, &config, &limiter).await?;
    require_scope(&scopes, super::admin::mcp::SCOPE_PROJECTS)?;
    let mut input = input.into_inner();
    restrict_project(&input, false)?;
    screen_project_media(&db, &mut input).await?;
    Ok(HttpResponse::Ok()
        .json(super::admin::content::update_project_draft(&db, &slug, &input, true).await?))
}

#[get("/topics")]
async fn topics(
    request: HttpRequest,
    db: web::Data<Db>,
    config: web::Data<Config>,
    limiter: web::Data<RateLimiter>,
    query: web::Query<crate::db::content::ContentQuery>,
) -> Result<HttpResponse, AppError> {
    authorize(&request, &db, &config, &limiter).await?;
    Ok(HttpResponse::Ok().json(db.content_page("topic", false, &query).await?))
}
#[get("/topics/{project_id}/{slug}")]
async fn topic(
    request: HttpRequest,
    db: web::Data<Db>,
    config: web::Data<Config>,
    limiter: web::Data<RateLimiter>,
    path: web::Path<(String, String)>,
) -> Result<HttpResponse, AppError> {
    authorize(&request, &db, &config, &limiter).await?;
    let (project_id, slug) = path.into_inner();
    Ok(HttpResponse::Ok().json(
        db.content_get_enriched("topic", &format!("{project_id}:{slug}"), false)
            .await?,
    ))
}
#[post("/topics")]
async fn create_topic(
    request: HttpRequest,
    db: web::Data<Db>,
    config: web::Data<Config>,
    limiter: web::Data<RateLimiter>,
    input: web::Json<Value>,
) -> Result<HttpResponse, AppError> {
    authorize(&request, &db, &config, &limiter).await?;
    Ok(HttpResponse::Created()
        .json(crate::api::v1::admin::topics::create_topic(&db, &input).await?))
}
#[put("/topics/{project_id}/{slug}")]
async fn update_topic(
    request: HttpRequest,
    db: web::Data<Db>,
    config: web::Data<Config>,
    limiter: web::Data<RateLimiter>,
    path: web::Path<(String, String)>,
    input: web::Json<Value>,
) -> Result<HttpResponse, AppError> {
    authorize(&request, &db, &config, &limiter).await?;
    let (project_id, slug) = path.into_inner();
    Ok(HttpResponse::Ok()
        .json(crate::api::v1::admin::topics::update_topic(&db, &project_id, &slug, &input).await?))
}
#[get("/media")]
async fn list_media(
    request: HttpRequest,
    db: web::Data<Db>,
    config: web::Data<Config>,
    limiter: web::Data<RateLimiter>,
) -> Result<HttpResponse, AppError> {
    authorize(&request, &db, &config, &limiter).await?;
    Ok(HttpResponse::Ok().json(serde_json::json!({"items": db.media_list().await?})))
}
#[post("/media")]
async fn upload_media(
    request: HttpRequest,
    db: web::Data<Db>,
    config: web::Data<Config>,
    limiter: web::Data<RateLimiter>,
    input: web::Json<Value>,
) -> Result<HttpResponse, AppError> {
    authorize(&request, &db, &config, &limiter).await?;
    require_upload_text(&input)?;
    Ok(HttpResponse::Created().json(super::admin::media::store(&db, &input).await?))
}
#[put("/media/{id}")]
async fn update_media(
    request: HttpRequest,
    db: web::Data<Db>,
    config: web::Data<Config>,
    limiter: web::Data<RateLimiter>,
    id: web::Path<String>,
    input: web::Json<Value>,
) -> Result<HttpResponse, AppError> {
    authorize(&request, &db, &config, &limiter).await?;
    Ok(HttpResponse::Ok().json(super::admin::media::save_metadata(&db, &id, &input).await?))
}
pub fn configure(cfg: &mut web::ServiceConfig) {
    cfg.service(compile)
        .service(compilation)
        .service(session)
        .service(list)
        .service(get)
        .service(create)
        .service(update)
        .service(list_media)
        .service(upload_media)
        .service(update_media)
        .service(project)
        .service(list_projects)
        .service(create_project)
        .service(update_project)
        .service(topics)
        .service(topic)
        .service(create_topic)
        .service(update_topic);
}

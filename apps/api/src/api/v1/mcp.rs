//! Private HTTP bridge for the MCP service. Nginx denies public access.
//! Bearer credentials never grant cookie-admin access or publishing rights. A token reads
//! content and edits article drafts. The `projects` permission, chosen by the owner when the
//! token is created, adds creating and editing project drafts. Nothing here publishes.
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
            "MCP may edit title, category, summary, tags, filing, and draft content only".into(),
        ));
    }
    Ok(())
}
/// Clients may change where a post is filed (its projects and topic) and nothing else in `meta`.
/// Everything else stays as saved, including the discussion link and the media attachments.
fn filing_only(
    mut input: ArticleWriteRequest,
    current: crate::domain::ContentMeta,
) -> ArticleWriteRequest {
    if let Some(requested) = input.meta.take() {
        let mut meta = current;
        meta.project_ids = requested.project_ids;
        meta.topic_id = requested.topic_id;
        input.meta = Some(meta);
    }
    input
}
#[post("/articles")]
async fn create(
    request: HttpRequest,
    db: web::Data<Db>,
    config: web::Data<Config>,
    limiter: web::Data<RateLimiter>,
    input: web::Json<ArticleWriteRequest>,
) -> Result<HttpResponse, AppError> {
    authorize(&request, &db, &config, &limiter).await?;
    restrict(&input)?;
    let input = filing_only(input.into_inner(), Default::default());
    super::admin::articles::create(&db, input).await
}
#[put("/articles/{slug}")]
async fn update(
    request: HttpRequest,
    db: web::Data<Db>,
    config: web::Data<Config>,
    limiter: web::Data<RateLimiter>,
    slug: web::Path<String>,
    input: web::Json<ArticleWriteRequest>,
) -> Result<HttpResponse, AppError> {
    authorize(&request, &db, &config, &limiter).await?;
    restrict(&input)?;
    let slug = slug.into_inner();
    let current = db.admin_get_article(&slug).await?.meta;
    let input = filing_only(input.into_inner(), current);
    super::admin::articles::update(&db, slug, input, true).await
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

/// Fields a project-scoped token may set. Media, SEO fields, the compiled artifact and URL
/// changes stay with the owner. Featured and order only take effect when the owner publishes.
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
];

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
                "MCP may not set '{key}' on a project. Use admin for media, SEO, URLs and publishing."
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
    restrict_project(&input, true)?;
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
    restrict_project(&input, false)?;
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
pub fn configure(cfg: &mut web::ServiceConfig) {
    cfg.service(compile)
        .service(compilation)
        .service(session)
        .service(list)
        .service(get)
        .service(create)
        .service(update)
        .service(project)
        .service(list_projects)
        .service(create_project)
        .service(update_project)
        .service(topics)
        .service(topic)
        .service(create_topic)
        .service(update_topic);
}

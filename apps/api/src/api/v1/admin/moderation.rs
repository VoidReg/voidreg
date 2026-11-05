use crate::{
    auth::{extract::AdminSession, hash_token},
    config::Config,
    db::{
        Db,
        moderation::{BlockInput, ModerationQuery},
    },
    error::AppError,
};
use actix_web::{HttpResponse, get, post, web};
use serde::Deserialize;
use serde_json::json;
fn actor(session: &AdminSession) -> String {
    format!("session:{}", &hash_token(&session.token)[..16])
}
#[cfg_attr(feature="swagger",utoipa::path(get,path="/api/v1/admin/moderation/summary",tag="admin",responses((status=200,description="Moderation response",body=serde_json::Value),(status=401,description="Admin session required"),(status=403,description="Access denied"))))]
#[get("/moderation/summary")]
pub async fn summary(db: web::Data<Db>, session: AdminSession) -> Result<HttpResponse, AppError> {
    session.validate(&db).await?;
    Ok(HttpResponse::Ok().json(db.moderation_summary().await?))
}
fn resolve_target(kind: &str, target: &str, config: &Config) -> Result<(String, String), AppError> {
    if kind == "ip" {
        let address = target
            .trim()
            .parse::<std::net::IpAddr>()
            .map_err(|_| AppError::Unprocessable("Enter an exact IPv4 or IPv6 address".into()))?;
        return Ok((
            "source".into(),
            crate::util::sha256_hex(format!("{}:{}", config.comment_ip_salt, address).as_bytes()),
        ));
    }
    Ok((kind.into(), target.into()))
}
#[cfg_attr(feature="swagger",utoipa::path(post,path="/api/v1/admin/moderation/block-preview",tag="admin",request_body=BlockTarget,responses((status=200,description="Moderation response",body=serde_json::Value),(status=401,description="Admin session required"),(status=403,description="Access denied"))))]
#[post("/moderation/block-preview")]
pub async fn preview(
    db: web::Data<Db>,
    config: web::Data<Config>,
    q: web::Json<BlockTarget>,
    session: AdminSession,
) -> Result<HttpResponse, AppError> {
    session.validate(&db).await?;
    let (kind, target) = resolve_target(&q.kind, &q.target, &config)?;
    Ok(HttpResponse::Ok().json(db.block_preview(&kind, &target).await?))
}
#[derive(Deserialize)]
#[cfg_attr(feature = "swagger", derive(utoipa::ToSchema))]
pub struct BlockTarget {
    pub kind: String,
    pub target: String,
}
#[cfg_attr(feature="swagger",utoipa::path(get,path="/api/v1/admin/moderation/{collection}",tag="admin",params(("collection"=String,Path),ModerationQuery),responses((status=200,description="Moderation response",body=serde_json::Value),(status=401,description="Admin session required"),(status=403,description="Access denied"))))]
#[get("/moderation/{collection}")]
pub async fn list(
    db: web::Data<Db>,
    path: web::Path<String>,
    q: web::Query<ModerationQuery>,
    session: AdminSession,
) -> Result<HttpResponse, AppError> {
    session.validate(&db).await?;
    Ok(HttpResponse::Ok().json(db.moderation_page(&path, &q).await?))
}
#[cfg_attr(feature="swagger",utoipa::path(post,path="/api/v1/admin/moderation/blocks",tag="admin",request_body=BlockInput,responses((status=200,description="Moderation response",body=serde_json::Value),(status=401,description="Admin session required"),(status=403,description="Access denied"))))]
#[post("/moderation/blocks")]
pub async fn block(
    db: web::Data<Db>,
    config: web::Data<Config>,
    mut input: web::Json<BlockInput>,
    session: AdminSession,
) -> Result<HttpResponse, AppError> {
    session.validate(&db).await?;
    let (kind, target) = resolve_target(&input.kind, &input.target, &config)?;
    input.kind = kind;
    input.target = target;
    Ok(HttpResponse::Created().json(db.block_comments(&input, &actor(&session)).await?))
}
#[cfg_attr(feature="swagger",utoipa::path(post,path="/api/v1/admin/moderation/blocks/{id}/revoke",tag="admin",params(("id"=String,Path)),responses((status=200,description="Moderation response",body=serde_json::Value),(status=401,description="Admin session required"),(status=403,description="Access denied"))))]
#[post("/moderation/blocks/{id}/revoke")]
pub async fn revoke(
    db: web::Data<Db>,
    id: web::Path<String>,
    session: AdminSession,
) -> Result<HttpResponse, AppError> {
    session.validate(&db).await?;
    db.revoke_comment_block(&id, &actor(&session)).await?;
    Ok(HttpResponse::Ok().json(json!({"revoked":id.into_inner()})))
}
#[derive(Deserialize)]
#[cfg_attr(feature = "swagger", derive(utoipa::ToSchema))]
pub struct Reason {
    #[serde(default)]
    pub reason: String,
}
#[cfg_attr(feature="swagger",utoipa::path(post,path="/api/v1/admin/moderation/comments/{id}/{action}",tag="admin",params(("id"=String,Path),("action"=String,Path)),request_body=Reason,responses((status=200,description="Moderation response",body=serde_json::Value),(status=401,description="Admin session required"),(status=403,description="Access denied"))))]
#[post("/moderation/comments/{id}/{action}")]
pub async fn moderate(
    db: web::Data<Db>,
    path: web::Path<(String, String)>,
    body: web::Json<Reason>,
    session: AdminSession,
) -> Result<HttpResponse, AppError> {
    session.validate(&db).await?;
    if body.reason.len() > 1000 {
        return Err(AppError::Unprocessable("Reason is too long".into()));
    }
    let (id, action) = path.into_inner();
    Ok(HttpResponse::Ok().json(
        db.moderate_comment(&id, &action, &actor(&session), &body.reason)
            .await?,
    ))
}

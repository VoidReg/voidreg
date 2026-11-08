//! Management stays behind GitHub sign-in and the normal admin CSRF check.
use crate::{
    auth::{extract::AdminSession, hash_token, new_session_token},
    db::Db,
    error::AppError,
};
use actix_web::{HttpResponse, delete, get, post, web};
use serde::Deserialize;

async fn owner(session: &AdminSession, db: &Db) -> Result<String, AppError> {
    session.validate(db).await?;
    let identity = db
        .get_live_session(&hash_token(&session.token))
        .await?
        .and_then(|s| s.identity_id)
        .ok_or_else(|| {
            AppError::Forbidden("GitHub sign-in is required to manage MCP connections".into())
        })?;
    if db
        .identity_subject(&identity)
        .await?
        .is_none_or(|(provider, _)| provider != "github")
    {
        return Err(AppError::Forbidden(
            "GitHub sign-in is required to manage MCP connections".into(),
        ));
    }
    Ok(identity)
}
/// Extra permissions a token can carry. Without any, a token reads content and edits article
/// drafts. Nothing here can publish: the owner does that in admin.
pub const SCOPE_PROJECTS: &str = "projects";

#[derive(Deserialize)]
pub struct TokenRequest {
    pub name: String,
    /// Optional extra permissions, for example `["projects"]` to create and edit project drafts.
    #[serde(default)]
    pub scopes: Vec<String>,
}
#[get("/mcp-tokens")]
pub async fn list(db: web::Data<Db>, session: AdminSession) -> Result<HttpResponse, AppError> {
    let identity = owner(&session, &db).await?;
    Ok(HttpResponse::Ok().json(serde_json::json!({"items": db.list_mcp_tokens(&identity).await?})))
}
#[post("/mcp-tokens")]
pub async fn create(
    db: web::Data<Db>,
    session: AdminSession,
    input: web::Json<TokenRequest>,
) -> Result<HttpResponse, AppError> {
    let identity = owner(&session, &db).await?;
    let name = input.name.trim();
    if name.is_empty() || name.chars().count() > 80 {
        return Err(AppError::Unprocessable(
            "connection name must be 1-80 characters".into(),
        ));
    }
    let mut scopes: Vec<String> = Vec::new();
    for scope in &input.scopes {
        if scope != SCOPE_PROJECTS {
            return Err(AppError::Unprocessable(format!(
                "unknown permission '{scope}'"
            )));
        }
        if !scopes.contains(scope) {
            scopes.push(scope.clone());
        }
    }
    let (random, _) = new_session_token();
    let token = format!("vr_mcp_{random}");
    let info = db
        .create_mcp_token_with_scopes(&identity, name, &hash_token(&token), 30 * 24, &scopes)
        .await?;
    Ok(HttpResponse::Created().json(serde_json::json!({"connection": info, "token": token})))
}
#[delete("/mcp-tokens/{id}")]
pub async fn revoke(
    db: web::Data<Db>,
    session: AdminSession,
    id: web::Path<String>,
) -> Result<HttpResponse, AppError> {
    let identity = owner(&session, &db).await?;
    db.revoke_mcp_token(&id, &identity).await?;
    Ok(HttpResponse::Ok().json(serde_json::json!({"revoked": true})))
}

use actix_web::{HttpRequest, HttpResponse, get, web};
use serde::Deserialize;

use crate::auth::client_ip;
use crate::auth::extract::OptionalCommenter;
use crate::config::Config;
use crate::db::Db;
use crate::domain::{
    COMMENT_STATUS_APPROVED, COMMENT_STATUS_PENDING, CommentCreateRequest, CommentCreateResponse,
};
use crate::error::AppError;
use crate::util::sha256_hex;

const MAX_NAME_LEN: usize = 80;
const MAX_BODY_LEN: usize = 2000;
#[derive(Debug, Deserialize)]
#[cfg_attr(feature = "swagger", derive(utoipa::IntoParams))]
pub struct CommentListQuery {
    pub page: Option<i64>,
    pub per_page: Option<i64>,
}

#[cfg_attr(feature = "swagger", utoipa::path(
    get,
    path = "/api/v1/blogs/{slug}/comments",
    tag = "comments",
    params(
        ("slug" = String, Path, description = "Blog slug"),
        CommentListQuery
    ),
    responses(
        (status = 200, description = "Visible discussion threads", body = crate::domain::CommentListResponse),
        (status = 404, description = "Blog not found", body = crate::error::ErrorBody)
    )
))]
pub async fn list_comments(
    db: web::Data<Db>,
    path: web::Path<String>,
    query: web::Query<CommentListQuery>,
) -> Result<HttpResponse, AppError> {
    let slug = path.into_inner();
    // 404 when the article does not exist or is not published.
    let slug = db.discussion_key(&slug).await?;

    let result = db
        .public_comment_page(
            &slug,
            None,
            query.page.unwrap_or(1),
            query.per_page.unwrap_or(20),
        )
        .await?;
    Ok(HttpResponse::Ok()
        .insert_header(("Cache-Control", "no-store"))
        .json(result))
}

#[cfg_attr(feature = "swagger", utoipa::path(
    get, path = "/api/v1/blogs/{slug}/comments/{id}/replies", tag = "comments",
    params(("slug" = String, Path), ("id" = String, Path), CommentListQuery),
    responses((status = 200, description = "Replies in chronological order", body = crate::domain::CommentListResponse))
))]
#[get("/blogs/{slug}/comments/{id}/replies")]
pub async fn list_replies(
    db: web::Data<Db>,
    path: web::Path<(String, String)>,
    query: web::Query<CommentListQuery>,
) -> Result<HttpResponse, AppError> {
    let (slug, id) = path.into_inner();
    let slug = db.discussion_key(&slug).await?;
    let result = db
        .public_comment_page(
            &slug,
            Some(&id),
            query.page.unwrap_or(1),
            query.per_page.unwrap_or(20),
        )
        .await?;
    Ok(HttpResponse::Ok()
        .insert_header(("Cache-Control", "no-store"))
        .json(result))
}

#[cfg_attr(feature = "swagger", utoipa::path(
    post,
    path = "/api/v1/blogs/{slug}/comments",
    tag = "comments",
    request_body = CommentCreateRequest,
    params(("slug" = String, Path, description = "Blog slug")),
    responses(
        (status = 202, description = "Comment accepted", body = CommentCreateResponse),
        (status = 404, description = "Blog not found", body = crate::error::ErrorBody),
        (status = 422, description = "Invalid payload", body = crate::error::ErrorBody),
        (status = 429, description = "Rate limited", body = crate::error::ErrorBody)
    )
))]
pub async fn create_comment(
    db: web::Data<Db>,
    config: web::Data<Config>,
    path: web::Path<String>,
    payload: web::Json<CommentCreateRequest>,
    commenter: OptionalCommenter,
    request: HttpRequest,
) -> Result<HttpResponse, AppError> {
    let slug = path.into_inner();
    let slug = db.discussion_key(&slug).await?;

    let name = commenter
        .identity
        .as_ref()
        .map(|identity| identity.name.as_str())
        .unwrap_or(&payload.name)
        .trim();
    let body = payload.body.trim();

    if name.is_empty() || name.chars().count() > MAX_NAME_LEN {
        return Err(AppError::Unprocessable(format!(
            "name must be between 1 and {MAX_NAME_LEN} characters"
        )));
    }
    if body.is_empty() || body.chars().count() > MAX_BODY_LEN {
        return Err(AppError::Unprocessable(format!(
            "comment must be between 1 and {MAX_BODY_LEN} characters"
        )));
    }
    if let Some(email) = payload
        .email
        .as_deref()
        .map(str::trim)
        .filter(|v| !v.is_empty())
        && !crate::api::v1::contact::is_valid_email(email)
    {
        return Err(AppError::Unprocessable(
            "enter a valid email address".to_owned(),
        ));
    }

    let honeypot = payload
        .website
        .as_deref()
        .is_some_and(|v| !v.trim().is_empty());
    let ip_hash = comment_ip_hash(&config, &request);
    // Verified commenters skip moderation; anonymous comments wait for
    // approval in the admin queue.
    let status = if commenter.identity.is_some() {
        COMMENT_STATUS_APPROVED
    } else {
        COMMENT_STATUS_PENDING
    };
    let identity_id = commenter
        .identity
        .as_ref()
        .map(|identity| identity.id.clone());

    let comment = db
        .admit_comment(
            crate::db::NewComment {
                article_slug: &slug,
                identity_id: identity_id.as_deref(),
                author_name: name,
                body,
                status,
                ip_hash: &ip_hash,
                parent_id: payload.parent_id.as_deref(),
                thread_id: None,
            },
            honeypot,
            &config,
        )
        .await?;
    Ok(HttpResponse::Accepted().json(CommentCreateResponse {
        id: comment.as_ref().map(|c| c.id.clone()).unwrap_or_default(),
        status: comment
            .as_ref()
            .map(|c| {
                if c.status == "approved" {
                    "approved"
                } else {
                    "pending"
                }
            })
            .unwrap_or("pending")
            .to_owned(),
    }))
}

/// Salted hash of the client IP; raw addresses are never stored.
fn comment_ip_hash(config: &Config, request: &HttpRequest) -> String {
    sha256_hex(format!("{}:{}", config.comment_ip_salt, client_ip(request)).as_bytes())
}

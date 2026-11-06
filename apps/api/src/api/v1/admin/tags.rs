use crate::{api::v1::tags::TagQuery, auth::extract::AdminSession, db::Db, error::AppError};
use actix_web::{HttpResponse, get, web};

#[cfg_attr(feature="swagger", utoipa::path(get,path="/api/v1/admin/tags",tag="admin",params(("q"=Option<String>,Query),("limit"=Option<i64>,Query)),responses((status=200,description="Tag vocabulary across working copies with per-kind counts"))))]
#[get("/tags")]
pub async fn list(
    db: web::Data<Db>,
    session: AdminSession,
    query: web::Query<TagQuery>,
) -> Result<HttpResponse, AppError> {
    session.validate(&db).await?;
    Ok(HttpResponse::Ok()
        .insert_header(("Cache-Control", "private, no-store"))
        .json(
            db.tag_vocabulary(false, query.q.as_deref(), query.limit)
                .await?,
        ))
}

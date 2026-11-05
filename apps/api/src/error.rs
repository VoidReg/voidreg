use actix_web::http::StatusCode;
use actix_web::{HttpResponse, ResponseError};
use serde::Serialize;

#[derive(Debug, thiserror::Error)]
pub enum AppError {
    #[error("{0}")]
    BadRequest(String),
    #[error("{0}")]
    Unauthorized(String),
    #[error("{0}")]
    Forbidden(String),
    #[error("{0}")]
    NotFound(String),
    #[error("{0}")]
    Conflict(String),
    #[error("{0}")]
    Unprocessable(String),
    #[error("{0}")]
    TooManyRequests(String),
    #[error("Too many comment attempts. Please wait before trying again.")]
    CommentRateLimited(i64),
    #[error("{0}")]
    ServiceUnavailable(String),
    #[error("database error: {0}")]
    Database(String),
    #[error("internal error")]
    Internal(String),
}

#[derive(Debug, Serialize)]
#[cfg_attr(feature = "swagger", derive(utoipa::ToSchema))]
pub struct ErrorBody {
    pub error: ErrorDetail,
}

#[derive(Debug, Serialize)]
#[cfg_attr(feature = "swagger", derive(utoipa::ToSchema))]
pub struct ErrorDetail {
    pub code: &'static str,
    pub message: String,
}

impl AppError {
    pub fn code(&self) -> &'static str {
        match self {
            Self::BadRequest(_) => "bad_request",
            Self::Unauthorized(_) => "unauthorized",
            Self::Forbidden(_) => "forbidden",
            Self::NotFound(_) => "not_found",
            Self::Conflict(_) => "conflict",
            Self::Unprocessable(_) => "unprocessable",
            Self::TooManyRequests(_) | Self::CommentRateLimited(_) => "rate_limited",
            Self::ServiceUnavailable(_) => "unavailable",
            Self::Database(_) | Self::Internal(_) => "internal",
        }
    }
}

impl ResponseError for AppError {
    fn status_code(&self) -> StatusCode {
        match self {
            Self::BadRequest(_) => StatusCode::BAD_REQUEST,
            Self::Unauthorized(_) => StatusCode::UNAUTHORIZED,
            Self::Forbidden(_) => StatusCode::FORBIDDEN,
            Self::NotFound(_) => StatusCode::NOT_FOUND,
            Self::Conflict(_) => StatusCode::CONFLICT,
            Self::Unprocessable(_) => StatusCode::UNPROCESSABLE_ENTITY,
            Self::TooManyRequests(_) | Self::CommentRateLimited(_) => StatusCode::TOO_MANY_REQUESTS,
            Self::ServiceUnavailable(_) => StatusCode::SERVICE_UNAVAILABLE,
            Self::Database(_) | Self::Internal(_) => StatusCode::INTERNAL_SERVER_ERROR,
        }
    }

    fn error_response(&self) -> HttpResponse {
        if matches!(self, Self::Database(_) | Self::Internal(_)) {
            tracing::error!(error = %self, "request failed");
        }

        let mut response = HttpResponse::build(self.status_code());
        if let Self::CommentRateLimited(seconds) = self {
            response.insert_header(("Retry-After", seconds.to_string()));
        }
        response.json(ErrorBody {
            error: ErrorDetail {
                code: self.code(),
                message: if matches!(self, Self::Database(_) | Self::Internal(_)) {
                    "The service is temporarily unavailable. Please try again.".to_owned()
                } else {
                    self.to_string()
                },
            },
        })
    }
}

impl From<toasty::Error> for AppError {
    fn from(err: toasty::Error) -> Self {
        Self::Database(err.to_string())
    }
}

impl From<serde_json::Error> for AppError {
    fn from(err: serde_json::Error) -> Self {
        Self::Internal(err.to_string())
    }
}

impl From<toml::de::Error> for AppError {
    fn from(err: toml::de::Error) -> Self {
        Self::Internal(err.to_string())
    }
}

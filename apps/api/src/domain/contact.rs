use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Deserialize)]
#[cfg_attr(feature = "swagger", derive(utoipa::ToSchema))]
pub struct ContactRequest {
    pub name: String,
    pub email: String,
    pub message: String,
    /// Signed token issued by `POST /contact/form` when the form was rendered.
    #[serde(default)]
    pub form_token: String,
    /// Hidden field that people never fill in. Any value marks the submission as automated.
    #[serde(default)]
    pub website: String,
}

#[derive(Debug, Clone, Serialize)]
#[cfg_attr(feature = "swagger", derive(utoipa::ToSchema))]
pub struct ContactResponse {
    pub status: &'static str,
}

#[derive(Debug, Clone, Serialize)]
#[cfg_attr(feature = "swagger", derive(utoipa::ToSchema))]
pub struct ContactFormResponse {
    pub token: String,
    pub min_seconds: i64,
}

use serde::{Deserialize, Serialize};

/// The signed-in commenter as the current session sees them. `name` is the
/// profile display name and `avatar_url` is the proxied photo, present only
/// while the person chose to show it.
#[derive(Debug, Clone, Serialize)]
#[cfg_attr(feature = "swagger", derive(utoipa::ToSchema))]
pub struct CommenterIdentity {
    pub id: String,
    pub provider: String,
    pub name: String,
    pub email: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub avatar_url: Option<String>,
}

/// A provider account connected to a profile.
#[derive(Debug, Clone, Serialize)]
#[cfg_attr(feature = "swagger", derive(utoipa::ToSchema))]
pub struct LinkedAccount {
    pub identity_id: String,
    pub provider: String,
    pub name: String,
    pub email: String,
    /// True when the provider supplied a photo that can be shown.
    pub has_avatar: bool,
    /// True for the account used by the current session.
    pub current: bool,
}

/// One durable public identity per person, shared by every connected provider.
#[derive(Debug, Clone, Serialize)]
#[cfg_attr(feature = "swagger", derive(utoipa::ToSchema))]
pub struct CommenterProfile {
    pub id: String,
    pub display_name: String,
    pub show_avatar: bool,
    /// Proxied photo URL, present only when the photo is shown and available.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub avatar_url: Option<String>,
    /// Connected account whose photo is used.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub avatar_identity_id: Option<String>,
    pub linked: Vec<LinkedAccount>,
}

#[derive(Debug, Clone, Serialize)]
#[cfg_attr(feature = "swagger", derive(utoipa::ToSchema))]
pub struct CommenterSessionResponse {
    pub authenticated: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub identity: Option<CommenterIdentity>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub profile: Option<CommenterProfile>,
    /// Configured sign-in providers, for sign-in and connect buttons.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub providers: Option<Vec<String>>,
}

impl CommenterSessionResponse {
    pub fn signed_out(providers: Vec<String>) -> Self {
        Self {
            authenticated: false,
            identity: None,
            profile: None,
            providers: Some(providers),
        }
    }
}

#[derive(Debug, Clone, Deserialize, Default)]
#[cfg_attr(feature = "swagger", derive(utoipa::ToSchema))]
pub struct ProfileUpdate {
    #[serde(default)]
    pub display_name: Option<String>,
    #[serde(default)]
    pub show_avatar: Option<bool>,
    #[serde(default)]
    pub avatar_identity_id: Option<String>,
}

#[derive(Debug, Clone, Deserialize, Default)]
#[cfg_attr(feature = "swagger", derive(utoipa::IntoParams))]
pub struct ProfileDeleteQuery {
    /// Mark existing comments as removed instead of keeping them anonymized.
    #[serde(default)]
    pub remove_comments: bool,
}

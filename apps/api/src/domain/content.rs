use serde::{Deserialize, Serialize};
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[cfg_attr(feature = "swagger", derive(utoipa::ToSchema))]
#[serde(default)]
pub struct ContentMeta {
    pub id: String,
    pub discussion_slug: String,
    pub updated_at: String,
    pub archived: bool,
    pub has_unpublished_changes: bool,
    pub pending_slug: Option<String>,
    pub project_ids: Vec<String>,
    /// Projects explicitly related to this project (by id, so slug renames never break them).
    pub related_project_ids: Vec<String>,
    pub media_ids: Vec<String>,
    pub seo_title: String,
    pub seo_description: String,
    pub social_image: Option<String>,
    pub hero_alt: String,
    pub hero_caption: String,
    pub hero_image: Option<String>,
    pub demo_url: Option<String>,
}

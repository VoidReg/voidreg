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
    /// Topic of the project this post is filed under. The topic's project is always one of
    /// `project_ids`.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub topic_id: Option<String>,
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

pub const MAX_TAGS: usize = 20;
pub const MAX_TAG_LEN: usize = 40;

/// Normalizes a tag list for any content kind: trims, collapses inner whitespace, rejects
/// control characters and over-long tags, and de-duplicates case-insensitively (first spelling
/// wins). Order is preserved.
pub fn normalize_tags<I, S>(tags: I) -> Result<Vec<String>, crate::error::AppError>
where
    I: IntoIterator<Item = S>,
    S: AsRef<str>,
{
    let mut out: Vec<String> = Vec::new();
    for raw in tags {
        let raw = raw.as_ref();
        if raw.chars().any(char::is_control) {
            return Err(crate::error::AppError::Unprocessable(
                "tags cannot contain control characters".into(),
            ));
        }
        let tag = raw.split_whitespace().collect::<Vec<_>>().join(" ");
        if tag.is_empty() {
            continue;
        }
        if tag.chars().count() > MAX_TAG_LEN {
            return Err(crate::error::AppError::Unprocessable(format!(
                "a tag can be at most {MAX_TAG_LEN} characters"
            )));
        }
        if !out.iter().any(|t| t.to_lowercase() == tag.to_lowercase()) {
            out.push(tag);
        }
    }
    if out.len() > MAX_TAGS {
        return Err(crate::error::AppError::Unprocessable(format!(
            "use at most {MAX_TAGS} tags"
        )));
    }
    Ok(out)
}

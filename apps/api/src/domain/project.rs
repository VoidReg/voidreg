use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[cfg_attr(feature = "swagger", derive(utoipa::ToSchema))]
pub struct ContentSection {
    pub heading: Option<String>,
    pub body: String,
    pub kind: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[cfg_attr(feature = "swagger", derive(utoipa::ToSchema))]
pub struct MediaPlaceholder {
    pub label: String,
    pub text: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[cfg_attr(feature = "swagger", derive(utoipa::ToSchema))]
pub struct Project {
    #[serde(flatten)]
    pub meta: super::ContentMeta,
    #[serde(default = "initial_revision")]
    pub revision: i64,
    #[serde(default)]
    pub document: Option<serde_json::Value>,
    #[serde(default)]
    pub compiled: Option<serde_json::Value>,
    #[serde(default = "published")]
    pub status: String,
    pub slug: String,
    pub title: String,
    pub category: String,
    pub summary: String,
    pub tags: Vec<String>,
    pub has_detail_page: bool,
    pub featured: bool,
    pub sort_order: i64,
    pub sections: Vec<ContentSection>,
    pub hero: Option<MediaPlaceholder>,
    pub related_slugs: Vec<String>,
    pub repo_url: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[cfg_attr(feature = "swagger", derive(utoipa::ToSchema))]
pub struct ProjectListResponse {
    pub items: Vec<Project>,
}

impl Project {
    pub fn as_card(&self) -> Project {
        Self {
            document: None,
            compiled: None,
            sections: Vec::new(),
            hero: None,
            related_slugs: Vec::new(),
            repo_url: None,
            ..self.clone()
        }
    }
}

fn initial_revision() -> i64 {
    1
}
fn published() -> String {
    "published".into()
}

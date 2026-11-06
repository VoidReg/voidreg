//! Knowledge graph of projects and posts, built from the same snapshots the site serves.
//! Public graphs contain published content only; admin graphs include working copies so
//! the draft preview can show how a new link changes the map before publishing.
use super::*;
use serde_json::{Value, json};
use std::collections::{BTreeMap, BTreeSet, HashMap};

impl Db {
    pub async fn content_graph(&self, public: bool) -> Result<Value, AppError> {
        let projects = self.content_list("project", public).await?;
        let articles = self.content_list("article", public).await?;
        Ok(build_graph(projects, articles, !public))
    }
}

fn text(v: &Value, key: &str) -> String {
    v[key].as_str().unwrap_or("").to_owned()
}

fn strings(v: &Value, key: &str) -> Vec<String> {
    v[key]
        .as_array()
        .into_iter()
        .flatten()
        .filter_map(|s| s.as_str().map(str::to_owned))
        .collect()
}

/// Pure so it can be tested without a database. Edge kinds:
/// `post-project` (strong), `related` (explicit, symmetric) and `shared-tag` (derived, weight =
/// number of shared technologies, only between projects without an explicit link).
pub fn build_graph(projects: Vec<Value>, articles: Vec<Value>, include_drafts: bool) -> Value {
    let live = |v: &Value| v["archived"] != true && (include_drafts || v["status"] == "published");
    let mut projects: Vec<Value> = projects.into_iter().filter(live).collect();
    projects.sort_by(|a, b| {
        (a["sort_order"].as_i64(), text(a, "slug"))
            .cmp(&(b["sort_order"].as_i64(), text(b, "slug")))
    });
    let mut articles: Vec<Value> = articles.into_iter().filter(live).collect();
    articles.sort_by(|a, b| {
        text(b, "published_at")
            .cmp(&text(a, "published_at"))
            .then_with(|| text(a, "slug").cmp(&text(b, "slug")))
    });

    let project_ids: BTreeSet<String> = projects.iter().map(|p| text(p, "id")).collect();
    let mut nodes = Vec::new();
    for p in &projects {
        nodes.push(json!({
            "id": p["id"], "kind": "project", "slug": p["slug"], "title": p["title"],
            "category": p["category"], "tags": p["tags"], "published_at": p["published_at"],
            "draft": p["status"] != "published",
            "changed": include_drafts && p["has_unpublished_changes"] == true,
        }));
    }
    for a in &articles {
        nodes.push(json!({
            "id": a["id"], "kind": "post", "slug": a["slug"], "title": a["title"],
            "category": a["category"], "tags": a.get("tags").cloned().unwrap_or(json!([])), "published_at": a["published_at"],
            "draft": a["status"] != "published",
            "changed": include_drafts && a["has_unpublished_changes"] == true,
        }));
    }

    let mut edges = Vec::new();
    for a in &articles {
        for pid in strings(a, "project_ids") {
            if project_ids.contains(&pid) {
                edges.push(json!({
                    "source": a["id"], "target": pid, "kind": "post-project", "weight": 1
                }));
            }
        }
    }
    // Explicit relations count once per pair no matter which side declared them.
    let mut related: BTreeSet<(String, String)> = BTreeSet::new();
    for p in &projects {
        let me = text(p, "id");
        for other in strings(p, "related_project_ids") {
            if other != me && project_ids.contains(&other) {
                let pair = if me < other {
                    (me.clone(), other)
                } else {
                    (other, me.clone())
                };
                related.insert(pair);
            }
        }
    }
    for (a, b) in &related {
        edges.push(json!({"source": a, "target": b, "kind": "related", "weight": 1}));
    }
    // Shared technologies, case-insensitive, light edges only where nothing explicit exists.
    let tags: HashMap<String, BTreeSet<String>> = projects
        .iter()
        .map(|p| {
            (
                text(p, "id"),
                strings(p, "tags")
                    .into_iter()
                    .map(|t| t.to_lowercase())
                    .collect(),
            )
        })
        .collect();
    let ids: Vec<&String> = project_ids.iter().collect();
    let mut shared: BTreeMap<(String, String), usize> = BTreeMap::new();
    for (i, a) in ids.iter().enumerate() {
        for b in &ids[i + 1..] {
            let count = tags[*a].intersection(&tags[*b]).count();
            if count > 0 && !related.contains(&((*a).clone(), (*b).clone())) {
                shared.insert(((*a).clone(), (*b).clone()), count);
            }
        }
    }
    for ((a, b), weight) in shared {
        edges.push(json!({"source": a, "target": b, "kind": "shared-tag", "weight": weight}));
    }
    json!({ "nodes": nodes, "edges": edges, "draft": include_drafts })
}

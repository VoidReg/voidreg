//! Knowledge graph of projects and posts, built from the same snapshots the site serves.
//! Public graphs contain published content only; admin graphs include working copies so
//! the draft preview can show how a new link changes the map before publishing.
use super::*;
use serde_json::{Value, json};
use std::collections::{BTreeMap, BTreeSet, HashMap};

/// Above this many nodes the default response is a summary, so the map payload stays bounded.
pub const MAX_FULL_NODES: usize = 300;
/// Derived shared-technology links kept per project in small graphs.
const SHARED_CAP: usize = 5;
/// Derived links returned for one focused project.
const FOCUS_CAP: usize = 12;
/// Posts returned for one project before the rest are reported only as a count.
const PROJECT_POST_CAP: usize = 200;

#[derive(Debug, Default, Clone, serde::Deserialize)]
pub struct GraphQuery {
    /// Projects and per-category totals only, no posts.
    #[serde(default, deserialize_with = "flag")]
    pub summary: bool,
    /// One project (id or slug) with its posts and related projects.
    pub project: Option<String>,
    /// Set to `shared` together with `focus` to add derived shared-technology links.
    pub links: Option<String>,
    pub focus: Option<String>,
}

fn flag<'de, D: serde::Deserializer<'de>>(d: D) -> Result<bool, D::Error> {
    let v = Option::<String>::deserialize(d)?;
    Ok(matches!(v.as_deref(), Some("1" | "true")))
}
use serde::Deserialize;

impl Db {
    pub async fn content_graph(&self, public: bool, query: &GraphQuery) -> Result<Value, AppError> {
        let (projects, articles) = self.graph_rows(public).await?;
        build_graph_with(projects, articles, !public, query)
    }

    /// Only the fields the graph needs, selected in SQL so large documents are never loaded.
    async fn graph_rows(&self, public: bool) -> Result<(Vec<Value>, Vec<Value>), AppError> {
        let column = if public { "published" } else { "working" };
        let mut sql = format!(
            "SELECT e.kind, json_object('id', json_extract(e.{c}, '$.id'), 'slug', json_extract(e.{c}, '$.slug'), 'title', json_extract(e.{c}, '$.title'), 'category', json_extract(e.{c}, '$.category'), 'tags', json(json_extract(e.{c}, '$.tags')), 'published_at', json_extract(e.{c}, '$.published_at'), 'status', json_extract(e.{c}, '$.status'), 'sort_order', json_extract(e.{c}, '$.sort_order'), 'archived', json(CASE WHEN e.archived THEN 'true' ELSE 'false' END), 'has_unpublished_changes', json(CASE WHEN json_extract(e.{c}, '$.has_unpublished_changes') THEN 'true' ELSE 'false' END), 'project_ids', json(json_extract(e.{c}, '$.project_ids')), 'related_project_ids', json(json_extract(e.{c}, '$.related_project_ids'))) FROM content_entries e WHERE e.deleted = false",
            c = column
        );
        if public {
            sql.push_str(" AND e.published IS NOT NULL AND e.archived = false");
        }
        let mut db = self.inner.lock().await;
        let rows = toasty::sql::query(sql)
            .column_types([toasty::stmt::Type::String, toasty::stmt::Type::String])
            .exec(&mut *db)
            .await?;
        let (mut projects, mut articles) = (Vec::new(), Vec::new());
        for row in rows {
            if let toasty::stmt::Value::Record(r) = row
                && let [
                    toasty::stmt::Value::String(kind),
                    toasty::stmt::Value::String(json),
                ] = r.fields.as_slice()
            {
                let value: Value = serde_json::from_str(json)?;
                if kind == "project" {
                    projects.push(value);
                } else {
                    articles.push(value);
                }
            }
        }
        Ok((projects, articles))
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

/// Full graph with default options. Pure so it can be tested without a database.
pub fn build_graph(projects: Vec<Value>, articles: Vec<Value>, include_drafts: bool) -> Value {
    build_graph_with(projects, articles, include_drafts, &GraphQuery::default())
        .expect("default graph query cannot fail")
}

fn project_node(p: &Value, include_drafts: bool, posts: usize) -> Value {
    json!({
        "id": p["id"], "kind": "project", "slug": p["slug"], "title": p["title"],
        "category": p["category"], "tags": p["tags"], "published_at": p["published_at"],
        "draft": p["status"] != "published",
        "changed": include_drafts && p["has_unpublished_changes"] == true,
        "post_count": posts,
    })
}

fn post_node(a: &Value, include_drafts: bool) -> Value {
    json!({
        "id": a["id"], "kind": "post", "slug": a["slug"], "title": a["title"],
        "category": a["category"], "tags": a.get("tags").cloned().unwrap_or(json!([])),
        "published_at": a["published_at"],
        "draft": a["status"] != "published",
        "changed": include_drafts && a["has_unpublished_changes"] == true,
    })
}

/// Edge kinds: `post-project` (strong), `related` (explicit, symmetric) and `shared-tag`
/// (derived, weight = number of shared technologies, only between projects without an explicit
/// link). Linear in projects plus posts for the default modes. Shared links are bounded per
/// project, and over `MAX_FULL_NODES` nodes they appear only for one focused project.
///
/// Modes: `full` (small catalogues), `summary` (projects, category totals, related links) and
/// `project` (one project with its posts and related projects).
pub fn build_graph_with(
    projects: Vec<Value>,
    articles: Vec<Value>,
    include_drafts: bool,
    query: &GraphQuery,
) -> Result<Value, AppError> {
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

    let index: HashMap<String, usize> = projects
        .iter()
        .enumerate()
        .map(|(i, p)| (text(p, "id"), i))
        .collect();
    let mut post_counts = vec![0usize; projects.len()];
    for a in &articles {
        for pid in strings(a, "project_ids") {
            if let Some(&i) = index.get(&pid) {
                post_counts[i] += 1;
            }
        }
    }
    // Explicit relations count once per pair no matter which side declared them.
    let mut related: BTreeSet<(String, String)> = BTreeSet::new();
    for p in &projects {
        let me = text(p, "id");
        for other in strings(p, "related_project_ids") {
            if other != me && index.contains_key(&other) {
                related.insert(if me < other {
                    (me.clone(), other)
                } else {
                    (other, me.clone())
                });
            }
        }
    }
    let related_edges = |keep: &dyn Fn(&str, &str) -> bool| -> Vec<Value> {
        related
            .iter()
            .filter(|(a, b)| keep(a, b))
            .map(|(a, b)| json!({"source": a, "target": b, "kind": "related", "weight": 1}))
            .collect()
    };
    let totals = json!({"projects": projects.len(), "posts": articles.len()});

    // Technologies shared with other projects, best matches first. Walks only the tag lists of
    // the requested projects, so cost follows tag popularity, not catalogue size squared.
    let tag_index = {
        let mut map: HashMap<String, Vec<usize>> = HashMap::new();
        for (i, p) in projects.iter().enumerate() {
            let own: BTreeSet<String> = strings(p, "tags")
                .into_iter()
                .map(|t| t.to_lowercase())
                .collect();
            for tag in own {
                map.entry(tag).or_default().push(i);
            }
        }
        map
    };
    let shared_for = |i: usize, cap: usize| -> Vec<(usize, usize)> {
        let own: BTreeSet<String> = strings(&projects[i], "tags")
            .into_iter()
            .map(|t| t.to_lowercase())
            .collect();
        let mut counts: HashMap<usize, usize> = HashMap::new();
        for tag in &own {
            for &j in tag_index.get(tag).into_iter().flatten() {
                if j != i {
                    *counts.entry(j).or_default() += 1;
                }
            }
        }
        let me = text(&projects[i], "id");
        let mut ranked: Vec<(usize, usize)> = counts
            .into_iter()
            .filter(|(j, _)| {
                let other = text(&projects[*j], "id");
                let pair = if me < other {
                    (me.clone(), other)
                } else {
                    (other, me.clone())
                };
                !related.contains(&pair)
            })
            .collect();
        ranked.sort_by(|a, b| {
            b.1.cmp(&a.1)
                .then_with(|| text(&projects[a.0], "slug").cmp(&text(&projects[b.0], "slug")))
        });
        ranked.truncate(cap);
        ranked
    };
    let shared_edge = |a: &str, b: &str, weight: usize| {
        let (a, b) = if a < b { (a, b) } else { (b, a) };
        json!({"source": a, "target": b, "kind": "shared-tag", "weight": weight})
    };
    let resolve = |key: &str| {
        index
            .get(key)
            .copied()
            .or_else(|| projects.iter().position(|p| p["slug"] == key))
    };
    let focus_shared = |focus: Option<usize>| -> Vec<(usize, usize)> {
        match (query.links.as_deref(), focus) {
            (Some("shared"), Some(i)) => shared_for(i, FOCUS_CAP),
            _ => Vec::new(),
        }
    };

    if let Some(key) = query.project.as_deref().filter(|k| !k.is_empty()) {
        let Some(i) = resolve(key) else {
            return Err(AppError::NotFound("project not found".into()));
        };
        let me = text(&projects[i], "id");
        let neighbours: BTreeSet<String> = related
            .iter()
            .filter_map(|(a, b)| {
                if *a == me {
                    Some(b.clone())
                } else if *b == me {
                    Some(a.clone())
                } else {
                    None
                }
            })
            .collect();
        let linked: Vec<&Value> = articles
            .iter()
            .filter(|a| strings(a, "project_ids").contains(&me))
            .collect();
        let mut nodes = vec![project_node(&projects[i], include_drafts, post_counts[i])];
        let mut edges = Vec::new();
        for id in &neighbours {
            let j = index[id];
            nodes.push(project_node(&projects[j], include_drafts, post_counts[j]));
            edges.push(json!({"source": me.clone().min(id.clone()), "target": me.clone().max(id.clone()), "kind": "related", "weight": 1}));
        }
        for (j, weight) in focus_shared(Some(i)) {
            nodes.push(project_node(&projects[j], include_drafts, post_counts[j]));
            edges.push(shared_edge(&me, &text(&projects[j], "id"), weight));
        }
        for a in linked.iter().take(PROJECT_POST_CAP) {
            nodes.push(post_node(a, include_drafts));
            edges.push(
                json!({"source": a["id"], "target": me, "kind": "post-project", "weight": 1}),
            );
        }
        return Ok(json!({
            "mode": "project", "nodes": nodes, "edges": edges, "draft": include_drafts,
            "totals": totals, "project": me, "posts_total": linked.len(),
        }));
    }

    let node_total = projects.len() + articles.len();
    if query.summary || node_total > MAX_FULL_NODES {
        let mut categories: BTreeMap<String, (usize, usize)> = BTreeMap::new();
        for p in &projects {
            categories.entry(text(p, "category")).or_default().0 += 1;
        }
        let mut unlinked = 0;
        for a in &articles {
            categories.entry(text(a, "category")).or_default().1 += 1;
            if !strings(a, "project_ids")
                .iter()
                .any(|id| index.contains_key(id))
            {
                unlinked += 1;
            }
        }
        let focus = query.focus.as_deref().and_then(resolve);
        let mut nodes: Vec<Value> = projects
            .iter()
            .enumerate()
            .map(|(i, p)| project_node(p, include_drafts, post_counts[i]))
            .collect();
        let mut edges = related_edges(&|_, _| true);
        if let Some(f) = focus {
            for (j, weight) in focus_shared(Some(f)) {
                edges.push(shared_edge(
                    &text(&projects[f], "id"),
                    &text(&projects[j], "id"),
                    weight,
                ));
            }
        }
        nodes.shrink_to_fit();
        return Ok(json!({
            "mode": "summary", "nodes": nodes, "edges": edges, "draft": include_drafts,
            "totals": totals, "unlinked_posts": unlinked,
            "categories": categories.into_iter().map(|(name, (projects, posts))| json!({
                "name": name, "projects": projects, "posts": posts
            })).collect::<Vec<_>>(),
        }));
    }

    let mut nodes: Vec<Value> = projects
        .iter()
        .enumerate()
        .map(|(i, p)| project_node(p, include_drafts, post_counts[i]))
        .collect();
    nodes.extend(articles.iter().map(|a| post_node(a, include_drafts)));
    let mut edges = Vec::new();
    for a in &articles {
        for pid in strings(a, "project_ids") {
            if index.contains_key(&pid) {
                edges.push(
                    json!({"source": a["id"], "target": pid, "kind": "post-project", "weight": 1}),
                );
            }
        }
    }
    edges.extend(related_edges(&|_, _| true));
    let mut shared: BTreeMap<(String, String), usize> = BTreeMap::new();
    for i in 0..projects.len() {
        for (j, weight) in shared_for(i, SHARED_CAP) {
            let (a, b) = (text(&projects[i], "id"), text(&projects[j], "id"));
            shared.insert(if a < b { (a, b) } else { (b, a) }, weight);
        }
    }
    for ((a, b), weight) in shared {
        edges.push(shared_edge(&a, &b, weight));
    }
    Ok(json!({
        "mode": "full", "nodes": nodes, "edges": edges, "draft": include_drafts, "totals": totals
    }))
}

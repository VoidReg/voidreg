//! Shared tag vocabulary across projects (technologies) and posts.
use super::*;
use serde_json::{Value, json};
use std::collections::BTreeMap;

impl Db {
    /// Distinct tags with per-kind counts. `public` reads published snapshots, otherwise working
    /// copies. Results are ranked: names starting with `q` first, then by use, then by name.
    pub async fn tag_vocabulary(
        &self,
        public: bool,
        q: Option<&str>,
        limit: Option<i64>,
    ) -> Result<Value, AppError> {
        let column = if public { "published" } else { "working" };
        let mut conditions = vec!["e.deleted = false".to_owned()];
        if public {
            conditions.push("e.published IS NOT NULL AND e.archived = false".into());
        }
        let needle = q
            .map(|q| {
                q.split_whitespace()
                    .collect::<Vec<_>>()
                    .join(" ")
                    .to_lowercase()
            })
            .filter(|q| !q.is_empty());
        let mut sql = format!(
            "SELECT min(j.value), e.kind, count(*) FROM content_entries e, json_each(json_extract(e.{column}, '$.tags')) j WHERE {} AND typeof(j.value) = 'text'",
            conditions.join(" AND ")
        );
        if needle.is_some() {
            sql.push_str(" AND lower(j.value) LIKE ? ESCAPE '\\'");
        }
        sql.push_str(" GROUP BY lower(j.value), e.kind");
        let mut query = toasty::sql::query(sql);
        if let Some(needle) = &needle {
            let escaped = needle
                .replace('\\', "\\\\")
                .replace('%', "\\%")
                .replace('_', "\\_");
            query = query.bind(format!("%{escaped}%"));
        }
        let mut db = self.inner.lock().await;
        let rows = query
            .column_types([
                toasty::stmt::Type::String,
                toasty::stmt::Type::String,
                toasty::stmt::Type::I64,
            ])
            .exec(&mut *db)
            .await?;
        let mut tags: BTreeMap<String, (String, i64, i64)> = BTreeMap::new();
        for row in rows {
            if let toasty::stmt::Value::Record(r) = row
                && let [
                    toasty::stmt::Value::String(name),
                    toasty::stmt::Value::String(kind),
                    toasty::stmt::Value::I64(count),
                ] = r.fields.as_slice()
            {
                let entry = tags
                    .entry(name.to_lowercase())
                    .or_insert((name.clone(), 0, 0));
                if kind == "project" {
                    entry.1 += count;
                } else {
                    entry.2 += count;
                }
            }
        }
        let mut items: Vec<(String, i64, i64)> = tags.into_values().collect();
        items.sort_by(|a, b| {
            let starts = |t: &(String, i64, i64)| {
                needle
                    .as_deref()
                    .is_some_and(|n| t.0.to_lowercase().starts_with(n))
            };
            starts(b)
                .cmp(&starts(a))
                .then((b.1 + b.2).cmp(&(a.1 + a.2)))
                .then(a.0.to_lowercase().cmp(&b.0.to_lowercase()))
        });
        let limit = limit.unwrap_or(50).clamp(1, 100) as usize;
        let total = items.len();
        items.truncate(limit);
        Ok(json!({
            "items": items.into_iter().map(|(name, projects, posts)| json!({
                "name": name, "count_projects": projects, "count_posts": posts
            })).collect::<Vec<_>>(),
            "total": total
        }))
    }
}

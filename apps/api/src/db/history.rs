//! Revision history for content entries.
//!
//! Every revision bump writes one row in the same transaction as the change. Rows are keyed by
//! entry id (slugs can change). Snapshots omit `compiled`, which is regenerable and can be large.
//! Autosaves coalesce into one row while the editor keeps typing; milestones (create, publish,
//! unpublish, archive, revert) always keep their own row. Retention is bounded per entry.
use super::*;
use serde_json::{Value, json};
use toasty::stmt::Value as Cell;

/// Consecutive autosave rows closer than this replace each other.
pub const COALESCE_SECONDS: i64 = 300;
/// Autosave rows kept per entry.
pub const KEEP_SAVES: i64 = 50;
/// Milestone rows kept per entry (the newest `publish` row is always kept).
pub const KEEP_MILESTONES: i64 = 200;
const MAX_PAGE: i64 = 100;

fn blocks_and_words(document: &Value) -> (i64, i64) {
    fn words(value: &Value, key: &str, total: &mut i64) {
        match value {
            Value::String(text) if key == "value" => {
                *total += text.split_whitespace().count() as i64;
            }
            Value::Array(items) => items.iter().for_each(|v| words(v, "", total)),
            Value::Object(map) => map.iter().for_each(|(k, v)| words(v, k, total)),
            _ => {}
        }
    }
    let blocks = document["blocks"].as_array().map_or(0, Vec::len) as i64;
    let mut total = 0;
    words(&document["blocks"], "", &mut total);
    (blocks, total)
}

fn cells(row: Cell) -> Vec<Cell> {
    match row {
        Cell::Record(r) => r.fields.into_iter().collect(),
        _ => Vec::new(),
    }
}
fn text(cell: Option<&Cell>) -> String {
    match cell {
        Some(Cell::String(s)) => s.clone(),
        _ => String::new(),
    }
}
fn int(cell: Option<&Cell>) -> i64 {
    match cell {
        Some(Cell::I64(n)) => *n,
        _ => 0,
    }
}

impl Db {
    /// Records `revision` of an entry inside the caller's transaction.
    pub(super) async fn record_revision(
        db: &mut dyn toasty::Executor,
        entry: &uuid::Uuid,
        revision: i64,
        event: &str,
        working: &Value,
    ) -> Result<(), AppError> {
        let mut snapshot = working.clone();
        if let Some(map) = snapshot.as_object_mut() {
            map.remove("compiled");
        }
        let (blocks, words) = blocks_and_words(&snapshot["document"]);
        let id = entry.as_bytes().to_vec();
        if event == "save" {
            // Replace the previous autosave when it is the latest row and still fresh.
            toasty::sql::query(
                "DELETE FROM content_revisions WHERE entry_id = ? AND event = 'save' AND revision = (SELECT MAX(revision) FROM content_revisions WHERE entry_id = ?) AND (strftime('%s','now') - strftime('%s', created_at)) < ?",
            )
            .bind(id.clone())
            .bind(id.clone())
            .bind(COALESCE_SECONDS)
            .exec(&mut *db)
            .await?;
        }
        toasty::sql::query(
            "INSERT OR REPLACE INTO content_revisions (entry_id, revision, event, created_at, title, blocks, words, snapshot) VALUES (?,?,?,?,?,?,?,?)",
        )
        .bind(id.clone())
        .bind(revision)
        .bind(event.to_owned())
        .bind(crate::util::now_rfc3339())
        .bind(snapshot["title"].as_str().unwrap_or("").to_owned())
        .bind(blocks)
        .bind(words)
        .bind(snapshot.to_string())
        .exec(&mut *db)
        .await?;
        toasty::sql::query(
            "DELETE FROM content_revisions WHERE entry_id = ? AND event = 'save' AND revision NOT IN (SELECT revision FROM content_revisions WHERE entry_id = ? AND event = 'save' ORDER BY revision DESC LIMIT ?)",
        )
        .bind(id.clone())
        .bind(id.clone())
        .bind(KEEP_SAVES)
        .exec(&mut *db)
        .await?;
        toasty::sql::query(
            "DELETE FROM content_revisions WHERE entry_id = ? AND event <> 'save' AND revision NOT IN (SELECT revision FROM content_revisions WHERE entry_id = ? AND event <> 'save' ORDER BY revision DESC LIMIT ?) AND revision <> COALESCE((SELECT MAX(revision) FROM content_revisions WHERE entry_id = ? AND event = 'publish'), -1)",
        )
        .bind(id.clone())
        .bind(id.clone())
        .bind(KEEP_MILESTONES)
        .bind(id)
        .exec(&mut *db)
        .await?;
        Ok(())
    }

    /// Newest-first revision summaries. `before` pages backwards by revision number.
    pub async fn revisions_list(
        &self,
        kind: &str,
        slug: &str,
        before: Option<i64>,
        limit: Option<i64>,
    ) -> Result<Value, AppError> {
        let mut db = self.inner.lock().await;
        let row = Self::entry(&mut *db, kind, slug).await?;
        let limit = limit.unwrap_or(30).clamp(1, MAX_PAGE);
        let published: Option<Value> = row
            .published
            .as_deref()
            .map(serde_json::from_str)
            .transpose()?;
        let live = published.as_ref().and_then(|p| p["revision"].as_i64());
        let rows = toasty::sql::query(
            "SELECT revision, event, created_at, title, blocks, words FROM content_revisions WHERE entry_id = ? AND revision < ? ORDER BY revision DESC LIMIT ?",
        )
        .bind(row.id.as_bytes().to_vec())
        .bind(before.unwrap_or(i64::MAX))
        .bind(limit + 1)
        .column_types([
            toasty::stmt::Type::I64,
            toasty::stmt::Type::String,
            toasty::stmt::Type::String,
            toasty::stmt::Type::String,
            toasty::stmt::Type::I64,
            toasty::stmt::Type::I64,
        ])
        .exec(&mut *db)
        .await?;
        let mut items: Vec<Value> = rows
            .into_iter()
            .map(|r| {
                let c = cells(r);
                let revision = int(c.first());
                json!({
                    "revision": revision,
                    "event": text(c.get(1)),
                    "created_at": text(c.get(2)),
                    "title": text(c.get(3)),
                    "blocks": int(c.get(4)),
                    "words": int(c.get(5)),
                    "live": live == Some(revision),
                })
            })
            .collect();
        let has_more = items.len() as i64 > limit;
        items.truncate(limit as usize);
        Ok(json!({"items": items, "has_more": has_more, "current": row.revision}))
    }

    pub async fn revision_get(
        &self,
        kind: &str,
        slug: &str,
        revision: i64,
    ) -> Result<Value, AppError> {
        let mut db = self.inner.lock().await;
        let row = Self::entry(&mut *db, kind, slug).await?;
        Self::snapshot(&mut *db, &row.id, revision).await
    }

    async fn snapshot(
        db: &mut dyn toasty::Executor,
        entry: &uuid::Uuid,
        revision: i64,
    ) -> Result<Value, AppError> {
        let rows = toasty::sql::query(
            "SELECT event, created_at, snapshot FROM content_revisions WHERE entry_id = ? AND revision = ?",
        )
        .bind(entry.as_bytes().to_vec())
        .bind(revision)
        .column_types([
            toasty::stmt::Type::String,
            toasty::stmt::Type::String,
            toasty::stmt::Type::String,
        ])
        .exec(&mut *db)
        .await?;
        let c = cells(
            rows.into_iter()
                .next()
                .ok_or_else(|| AppError::NotFound("revision not found".into()))?,
        );
        let snapshot: Value = serde_json::from_str(&text(c.get(2)))?;
        Ok(json!({
            "revision": revision,
            "event": text(c.first()),
            "created_at": text(c.get(1)),
            "snapshot": snapshot,
        }))
    }

    /// Restores an old snapshot as a new working revision. The public copy is never touched.
    pub async fn revision_restore(
        &self,
        kind: &str,
        slug: &str,
        revision: i64,
        expected: i64,
    ) -> Result<Value, AppError> {
        let mut guard = self.inner.lock().await;
        let mut db = guard.transaction().await?;
        let row = Self::entry(&mut db, kind, slug).await?;
        if row.revision != expected {
            return Err(AppError::Conflict(
                "content changed; reload before restoring".into(),
            ));
        }
        if row.archived {
            return Err(AppError::Conflict(
                "restore archived content before editing".into(),
            ));
        }
        let mut value = Self::snapshot(&mut db, &row.id, revision).await?["snapshot"].clone();
        if !value.is_object() {
            return Err(AppError::Unprocessable("revision is unreadable".into()));
        }
        if !value["document"].is_null() {
            crate::domain::document::validate_document(&value["document"].to_string())?;
        }
        let old: Value = serde_json::from_str(&row.working)?;
        for key in [
            "id",
            "discussion_slug",
            "slug",
            "status",
            "published_at",
            "reading_time_minutes",
            "pending_slug",
        ] {
            value[key] = old[key].clone();
        }
        if let Some(map) = value.as_object_mut() {
            map.remove("compiled");
        }
        // The admin detail view deserializes into Article, which requires the field.
        value["content_hash"] = json!("");
        value["archived"] = json!(false);
        value["revision"] = json!(expected + 1);
        value["updated_at"] = json!(now_rfc3339());
        value["has_unpublished_changes"] = json!(true);
        content::validate_meta(&value)?;
        Self::check_related(&mut db, kind, Some(&row.id.to_string()), &mut value).await?;
        let changed = toasty::sql::query("UPDATE content_entries SET working = ?, revision = ? WHERE id = ? AND revision = ? RETURNING revision")
            .bind(value.to_string())
            .bind(expected + 1)
            .bind(row.id.as_bytes().to_vec())
            .bind(expected)
            .column_types([toasty::stmt::Type::I64])
            .exec(&mut db)
            .await?;
        if changed.is_empty() {
            return Err(AppError::Conflict("content changed; reload".into()));
        }
        Self::record_revision(&mut db, &row.id, expected + 1, "revert", &value).await?;
        db.commit().await?;
        Ok(value)
    }
}

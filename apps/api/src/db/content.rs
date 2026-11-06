//! Working copies and published snapshots share one atomic compare-and-swap row.
use super::*;
use serde_json::{Value, json};

impl ArticleFields {
    pub(super) fn into_value(self) -> Result<Value, AppError> {
        Ok(serde_json::to_value(Article {
            meta: self.meta,
            revision: self.revision,
            slug: self.slug,
            title: self.title,
            category: self.category,
            summary: self.summary,
            tags: self.tags,
            status: ArticleStatus::parse(&self.status).map_err(AppError::Internal)?,
            featured: self.featured,
            sort_order: self.sort_order,
            published_at: self.published_at,
            reading_time_minutes: self.reading_time_minutes,
            sections: serde_json::from_str(&self.sections)?,
            document: if self.document.is_empty() {
                None
            } else {
                Some(serde_json::from_str(&self.document)?)
            },
            compiled: if self.compiled.is_empty() {
                None
            } else {
                Some(serde_json::from_str(&self.compiled)?)
            },
            content_hash: self.content_hash,
        })?)
    }
}

impl Db {
    // Idempotent backfill runs under the same lock as reads and writes. Old tables
    // remain intact for rollback; tombstones prevent deleted records reappearing.
    pub(super) async fn backfill(db: &mut dyn toasty::Executor) -> Result<(), AppError> {
        let projects = models::Project::all().exec(&mut *db).await?;
        let articles = models::Article::all().exec(&mut *db).await?;
        let values = projects
            .into_iter()
            .map(|r| Ok(("project", serde_json::to_value(project_from_row(r)?)?)))
            .chain(
                articles
                    .into_iter()
                    .map(|r| Ok(("article", serde_json::to_value(article_from_row(r)?)?))),
            )
            .collect::<Result<Vec<(&str, Value)>, AppError>>()?;
        for (kind, mut value) in values {
            let name = format!("{kind}:{}", value["slug"].as_str().unwrap());
            if models::ContentAlias::filter_by_name(&name)
                .first()
                .exec(&mut *db)
                .await?
                .is_some()
            {
                continue;
            }
            if kind == "project" && value["document"].is_null() {
                let sections: Vec<crate::domain::ContentSection> =
                    serde_json::from_value(value["sections"].clone())?;
                value["document"] = crate::domain::document::from_sections(
                    value["title"].as_str().unwrap(),
                    &sections,
                );
            }
            value["discussion_slug"] = value["slug"].clone();
            let published = (value["status"] == "published").then(|| value.to_string());
            let id = parse_uuid(value["id"].as_str().unwrap())?;
            let revision = value["revision"].as_i64().unwrap_or(1);
            let public_order = value["sort_order"].as_i64().unwrap_or(0);
            let public_date = value["published_at"].as_str().unwrap_or("").to_owned();
            toasty::create!(models::ContentEntry {
                id,
                name: name.clone(),
                kind: kind.to_owned(),
                working: value.to_string(),
                published,
                revision,
                archived: false,
                deleted: false,
                public_order,
                public_date
            })
            .exec(&mut *db)
            .await?;
            toasty::create!(models::ContentAlias {
                name,
                owner: id.to_string()
            })
            .exec(&mut *db)
            .await?;
        }
        Self::backfill_relations(&mut *db).await
    }
    /// One-time, idempotent: turn legacy `related_slugs` into stable `related_project_ids`.
    async fn backfill_relations(db: &mut dyn toasty::Executor) -> Result<(), AppError> {
        let rows =
            models::ContentEntry::filter(models::ContentEntry::fields().kind().eq("project"))
                .exec(&mut *db)
                .await?;
        for row in rows.into_iter().filter(|r| !r.deleted) {
            let mut working: Value = serde_json::from_str(&row.working)?;
            // Only entries that still carry legacy slugs need work; the slugs are cleared
            // afterwards so clearing relations in the admin is never undone on restart.
            if working["related_slugs"]
                .as_array()
                .is_none_or(|slugs| slugs.is_empty())
            {
                continue;
            }
            let mut ids = Vec::new();
            for slug in working["related_slugs"].as_array().into_iter().flatten() {
                let Some(slug) = slug.as_str() else { continue };
                if let Some(alias) = models::ContentAlias::filter_by_name(format!("project:{slug}"))
                    .first()
                    .exec(&mut *db)
                    .await?
                    && alias.owner != row.id.to_string()
                    && !ids.contains(&alias.owner)
                {
                    ids.push(alias.owner);
                }
            }
            working["related_project_ids"] = json!(ids);
            working["related_slugs"] = json!([]);
            let published = row
                .published
                .as_deref()
                .map(serde_json::from_str::<Value>)
                .transpose()?
                .map(|mut v| {
                    v["related_project_ids"] = json!(ids);
                    v["related_slugs"] = json!([]);
                    v.to_string()
                });
            toasty::sql::query(
                "UPDATE content_entries SET working = ?, published = ? WHERE id = ?",
            )
            .bind(working.to_string())
            .bind_typed(published, toasty_core::schema::db::Type::Text)
            .bind(row.id.as_bytes().to_vec())
            .exec(&mut *db)
            .await?;
        }
        Ok(())
    }
    pub(super) async fn entry(
        db: &mut dyn toasty::Executor,
        kind: &str,
        slug: &str,
    ) -> Result<models::ContentEntry, AppError> {
        let alias = models::ContentAlias::filter_by_name(format!("{kind}:{slug}"))
            .first()
            .exec(&mut *db)
            .await?
            .ok_or_else(|| AppError::NotFound("content not found".into()))?;
        models::ContentEntry::filter_by_id(parse_uuid(&alias.owner)?)
            .first()
            .exec(&mut *db)
            .await?
            .filter(|r| !r.deleted)
            .ok_or_else(|| AppError::NotFound("content not found".into()))
    }
    /// Fill the read-only `related` list and derived `related_slugs` from published projects.
    pub async fn resolve_related(&self, value: &mut Value) -> Result<(), AppError> {
        let ids: Vec<String> = value["related_project_ids"]
            .as_array()
            .into_iter()
            .flatten()
            .filter_map(|v| v.as_str().map(str::to_owned))
            .collect();
        if ids.is_empty() {
            return Ok(());
        }
        let mut db = self.inner.lock().await;
        let mut related = Vec::new();
        for id in ids {
            let Ok(uuid) = parse_uuid(&id) else { continue };
            let Some(row) = models::ContentEntry::filter_by_id(uuid)
                .first()
                .exec(&mut *db)
                .await?
            else {
                continue;
            };
            if row.kind != "project" || row.deleted || row.archived {
                continue;
            }
            let Some(published) = row.published else {
                continue;
            };
            let p: Value = serde_json::from_str(&published)?;
            related.push(json!({
                "id": p["id"], "slug": p["slug"], "title": p["title"],
                "category": p["category"], "summary": p["summary"], "tags": p["tags"]
            }));
        }
        value["related_slugs"] = Value::Array(related.iter().map(|r| r["slug"].clone()).collect());
        value["related"] = Value::Array(related);
        Ok(())
    }
    /// Normalizes and validates project relations; articles never carry them.
    pub(super) async fn check_related(
        db: &mut dyn toasty::Executor,
        kind: &str,
        own_id: Option<&str>,
        value: &mut Value,
    ) -> Result<(), AppError> {
        if kind != "project" {
            value["related_project_ids"] = json!([]);
            return Ok(());
        }
        let mut ids: Vec<String> = Vec::new();
        for id in value["related_project_ids"]
            .as_array()
            .into_iter()
            .flatten()
        {
            let id = id
                .as_str()
                .ok_or_else(|| AppError::Unprocessable("related project ids must be text".into()))?
                .to_owned();
            if !ids.contains(&id) {
                ids.push(id);
            }
        }
        if ids.len() > 20 {
            return Err(AppError::Unprocessable("too many related projects".into()));
        }
        for id in &ids {
            if own_id == Some(id.as_str()) {
                return Err(AppError::Unprocessable(
                    "a project cannot be related to itself".into(),
                ));
            }
            let row = models::ContentEntry::filter_by_id(parse_uuid(id)?)
                .first()
                .exec(&mut *db)
                .await?;
            if row.is_none_or(|p| p.kind != "project" || p.deleted) {
                return Err(AppError::Unprocessable(
                    "related project does not exist".into(),
                ));
            }
        }
        value["related_project_ids"] = json!(ids);
        Ok(())
    }
    /// Validates the topic relations of a post or a topic. A post keeps at most one topic and its
    /// project is added to the post's project list, so the two can never disagree.
    pub(super) async fn check_topic(
        db: &mut dyn toasty::Executor,
        kind: &str,
        value: &mut Value,
    ) -> Result<(), AppError> {
        match kind {
            "topic" => {
                let id = value["project_id"].as_str().unwrap_or("").to_owned();
                let row = models::ContentEntry::filter_by_id(
                    parse_uuid(&id)
                        .map_err(|_| AppError::Unprocessable("a topic needs a project".into()))?,
                )
                .first()
                .exec(&mut *db)
                .await?;
                if row.is_none_or(|p| p.kind != "project" || p.deleted) {
                    return Err(AppError::Unprocessable(
                        "the topic's project does not exist".into(),
                    ));
                }
                value["related_project_ids"] = json!([]);
                value["project_ids"] = json!([]);
                for (key, max) in [("title", 120), ("summary", 400)] {
                    if value[key].as_str().is_some_and(|s| s.chars().count() > max) {
                        return Err(AppError::Unprocessable(format!(
                            "{key} can be at most {max} characters"
                        )));
                    }
                }
            }
            "article" => {
                let Some(id) = value["topic_id"]
                    .as_str()
                    .filter(|s| !s.is_empty())
                    .map(str::to_owned)
                else {
                    value["topic_id"] = Value::Null;
                    return Ok(());
                };
                let row = models::ContentEntry::filter_by_id(
                    parse_uuid(&id)
                        .map_err(|_| AppError::Unprocessable("topic does not exist".into()))?,
                )
                .first()
                .exec(&mut *db)
                .await?
                .filter(|t| t.kind == "topic" && !t.deleted)
                .ok_or_else(|| AppError::Unprocessable("topic does not exist".into()))?;
                let topic: Value = serde_json::from_str(&row.working)?;
                let project = topic["project_id"].clone();
                let mut ids = value["project_ids"].as_array().cloned().unwrap_or_default();
                if !ids.contains(&project) {
                    if ids.len() >= 100 {
                        return Err(AppError::Unprocessable(
                            "too many project associations".into(),
                        ));
                    }
                    ids.push(project);
                    value["project_ids"] = json!(ids);
                }
            }
            _ => {
                value["topic_id"] = Value::Null;
            }
        }
        Ok(())
    }
    pub async fn content_reserved(&self, kind: &str, slug: &str) -> Result<bool, AppError> {
        let mut db = self.inner.lock().await;
        Ok(
            models::ContentAlias::filter_by_name(format!("{kind}:{slug}"))
                .first()
                .exec(&mut *db)
                .await?
                .is_some(),
        )
    }
    pub async fn content_get(
        &self,
        kind: &str,
        slug: &str,
        public: bool,
    ) -> Result<Value, AppError> {
        let mut db = self.inner.lock().await;
        let row = Self::entry(&mut *db, kind, slug).await?;
        let raw = if public {
            row.published
                .filter(|_| !row.archived)
                .ok_or_else(|| AppError::NotFound("content not published".into()))?
        } else {
            row.working
        };
        Ok(serde_json::from_str(&raw)?)
    }
    /// One entry with the same cheap enrichment list items get (post counts, project, topic).
    pub async fn content_get_enriched(
        &self,
        kind: &str,
        slug: &str,
        public: bool,
    ) -> Result<Value, AppError> {
        let mut db = self.inner.lock().await;
        let row = Self::entry(&mut *db, kind, slug).await?;
        let raw = if public {
            row.published
                .filter(|_| !row.archived)
                .ok_or_else(|| AppError::NotFound("content not published".into()))?
        } else {
            row.working
        };
        let mut items = [serde_json::from_str::<Value>(&raw)?];
        Self::enrich_listing(&mut *db, kind, public, &mut items).await?;
        let [item] = items;
        Ok(item)
    }
    pub async fn discussion_key(&self, slug: &str) -> Result<String, AppError> {
        let value = self.content_get("article", slug, true).await?;
        Ok(value["discussion_slug"].as_str().unwrap_or(slug).to_owned())
    }
    pub async fn content_list(&self, kind: &str, public: bool) -> Result<Vec<Value>, AppError> {
        let mut db = self.inner.lock().await;
        let rows = models::ContentEntry::filter(toasty::stmt::Expr::and(
            models::ContentEntry::fields().kind().eq(kind),
            models::ContentEntry::fields().deleted().eq(false),
        ))
        .exec(&mut *db)
        .await?;
        rows.into_iter()
            .filter(|r| !public || (!r.archived && r.published.is_some()))
            .map(|r| {
                serde_json::from_str(if public {
                    r.published.as_ref().unwrap()
                } else {
                    &r.working
                })
                .map_err(AppError::from)
            })
            .collect()
    }
    pub async fn content_create(&self, kind: &str, mut value: Value) -> Result<Value, AppError> {
        let mut guard = self.inner.lock().await;
        let mut db = guard.transaction().await?;
        let slug = value["slug"]
            .as_str()
            .ok_or_else(|| AppError::Unprocessable("slug required".into()))?
            .to_owned();
        let name = alias_name(kind, &value, &slug);
        if models::ContentAlias::filter_by_name(&name)
            .first()
            .exec(&mut db)
            .await?
            .is_some()
        {
            return Err(AppError::Conflict("URL already reserved".into()));
        }
        validate_meta(&value)?;
        Self::check_related(&mut db, kind, None, &mut value).await?;
        Self::check_topic(&mut db, kind, &mut value).await?;
        let id = uuid::Uuid::new_v4();
        value["id"] = json!(id.to_string());
        value["discussion_slug"] = json!(slug);
        value["revision"] = json!(1);
        if value["status"].is_null() {
            value["status"] = json!("draft");
        }
        value["archived"] = json!(false);
        value["updated_at"] = json!(now_rfc3339());
        let published = (value["status"] == "published").then(|| value.to_string());
        toasty::create!(models::ContentEntry {
            id,
            name: name.clone(),
            kind: kind.to_owned(),
            working: value.to_string(),
            published,
            revision: 1,
            archived: false,
            deleted: false,
            public_order: 0,
            public_date: String::new()
        })
        .exec(&mut db)
        .await?;
        toasty::create!(models::ContentAlias {
            name,
            owner: id.to_string()
        })
        .exec(&mut db)
        .await?;
        Self::record_revision(&mut db, &id, 1, "create", &value).await?;
        db.commit().await?;
        Ok(value)
    }
    pub async fn content_save(
        &self,
        kind: &str,
        slug: &str,
        expected: i64,
        mut value: Value,
        draft_only: bool,
    ) -> Result<Value, AppError> {
        let mut guard = self.inner.lock().await;
        let mut db = guard.transaction().await?;
        let row = Self::entry(&mut db, kind, slug).await?;
        if row.revision != expected {
            return Err(AppError::Conflict(
                "content changed; reload before saving".into(),
            ));
        }
        if row.archived {
            return Err(AppError::Conflict(
                "restore archived content before editing".into(),
            ));
        }
        if draft_only && row.published.is_some() {
            return Err(AppError::Conflict("MCP can only edit drafts".into()));
        }
        let old: Value = serde_json::from_str(&row.working)?;
        value["id"] = old["id"].clone();
        value["discussion_slug"] = old["discussion_slug"].clone();
        value["slug"] = old["slug"].clone();
        if kind == "topic" {
            // A topic never moves between projects, because its URL lives under the project.
            value["project_id"] = old["project_id"].clone();
        }
        value["status"] = old["status"].clone();
        value["archived"] = json!(false);
        value["revision"] = json!(expected + 1);
        value["updated_at"] = json!(now_rfc3339());
        value["has_unpublished_changes"] = json!(true);
        validate_meta(&value)?;
        Self::check_related(&mut db, kind, Some(&row.id.to_string()), &mut value).await?;
        Self::check_topic(&mut db, kind, &mut value).await?;
        let id = row.id;
        let revision = expected + 1;
        let working = value.to_string();
        // One lock protects local read/modify/write; revision predicate protects
        // against external writers sharing the database.
        let changed = toasty::sql::query("UPDATE content_entries SET working = ?, revision = ? WHERE id = ? AND revision = ? RETURNING revision")
            .bind(working).bind(revision).bind(id.as_bytes().to_vec()).bind(expected).column_types([toasty::stmt::Type::I64]).exec(&mut db).await?;
        if changed.is_empty() {
            return Err(AppError::Conflict("content changed; reload".into()));
        }
        Self::record_revision(&mut db, &id, revision, "save", &value).await?;
        db.commit().await?;
        Ok(value)
    }
    /// Regenerate only an existing public artifact; never publish the working document.
    pub async fn refresh_publication(
        &self,
        kind: &str,
        slug: &str,
        expected: i64,
        compiled: Value,
    ) -> Result<Value, AppError> {
        crate::domain::document::validate_compiled(&compiled.to_string())?;
        let mut guard = self.inner.lock().await;
        let mut db = guard.transaction().await?;
        let row = Self::entry(&mut db, kind, slug).await?;
        if row.revision != expected {
            return Err(AppError::Conflict(
                "Content changed; retry publication refresh.".into(),
            ));
        }
        if row.archived || row.deleted {
            return Err(AppError::Conflict("Publication is not available.".into()));
        }
        let mut public: Value = serde_json::from_str(
            row.published
                .as_deref()
                .ok_or_else(|| AppError::NotFound("Content not published.".into()))?,
        )?;
        let mut working: Value = serde_json::from_str(&row.working)?;
        public["compiled"] = compiled.clone();
        public["revision"] = json!(expected + 1);
        public["content_hash"] = json!(sha256_hex(public.to_string().as_bytes()));
        if working["has_unpublished_changes"] == false
            && working["document"] == public["document"]
            && working["title"] == public["title"]
        {
            working["compiled"] = compiled;
        }
        working["revision"] = json!(expected + 1);
        working["content_hash"] = json!(sha256_hex(working.to_string().as_bytes()));
        let changed=toasty::sql::query("UPDATE content_entries SET working=?, published=?, revision=? WHERE id=? AND revision=? RETURNING revision")
            .bind(working.to_string()).bind(public.to_string()).bind(expected+1).bind(row.id.as_bytes().to_vec()).bind(expected)
            .column_types([toasty::stmt::Type::I64]).exec(&mut db).await?;
        if changed.is_empty() {
            return Err(AppError::Conflict(
                "Content changed; retry publication refresh.".into(),
            ));
        }
        Self::record_revision(&mut db, &row.id, expected + 1, "refresh", &working).await?;
        db.commit().await?;
        Ok(working)
    }
    pub async fn content_action(
        &self,
        kind: &str,
        slug: &str,
        expected: i64,
        action: &str,
    ) -> Result<Value, AppError> {
        self.content_action_compiled(kind, slug, expected, action, None)
            .await
    }
    pub async fn content_action_compiled(
        &self,
        kind: &str,
        slug: &str,
        expected: i64,
        action: &str,
        compiled: Option<Value>,
    ) -> Result<Value, AppError> {
        let mut guard = self.inner.lock().await;
        let mut db = guard.transaction().await?;
        let row = Self::entry(&mut db, kind, slug).await?;
        if row.revision != expected {
            return Err(AppError::Conflict("content changed; reload".into()));
        }
        let mut value: Value = serde_json::from_str(&row.working)?;
        if action == "publish"
            && let Some(compiled) = compiled
        {
            value["compiled"] = compiled;
        }
        let mut published = row.published;
        let mut archived = row.archived;
        let mut deleted = false;
        if action == "delete" && kind == "project" {
            let me = json!(row.id.to_string());
            for (other_kind, field, message) in [
                (
                    "article",
                    "project_ids",
                    "unlink this project from articles before deleting it",
                ),
                (
                    "project",
                    "related_project_ids",
                    "remove this project from other projects' related lists before deleting it",
                ),
            ] {
                for other in models::ContentEntry::filter(
                    models::ContentEntry::fields().kind().eq(other_kind),
                )
                .exec(&mut db)
                .await?
                .into_iter()
                .filter(|a| !a.deleted && a.id != row.id)
                {
                    for raw in [Some(other.working), other.published].into_iter().flatten() {
                        let linked: Value = serde_json::from_str(&raw)?;
                        if linked[field]
                            .as_array()
                            .is_some_and(|ids| ids.contains(&me))
                        {
                            return Err(AppError::Conflict(message.into()));
                        }
                    }
                }
            }
        }
        if action == "delete" && (kind == "topic" || kind == "project") {
            let (other_kind, field, message) = if kind == "topic" {
                (
                    "article",
                    "topic_id",
                    "move this topic's posts to another topic before deleting it",
                )
            } else {
                (
                    "topic",
                    "project_id",
                    "delete this project's topics before deleting the project",
                )
            };
            let sql = format!(
                "SELECT count(*) FROM content_entries WHERE kind = ? AND deleted = false AND json_extract(working, '$.{field}') = ?"
            );
            let me = row.id.to_string();
            let rows = toasty::sql::query(sql)
                .bind(other_kind.to_owned())
                .bind(me)
                .column_types([toasty::stmt::Type::I64])
                .exec(&mut db)
                .await?;
            let busy = matches!(
                rows.first(),
                Some(toasty::stmt::Value::Record(r))
                    if matches!(r.fields.first(), Some(toasty::stmt::Value::I64(n)) if *n > 0)
            );
            if busy {
                return Err(AppError::Conflict(message.into()));
            }
        }
        match action {
            "publish" => {
                if archived {
                    return Err(AppError::Conflict(
                        "restore content before publishing".into(),
                    ));
                }
                if value["title"].as_str().unwrap_or("").trim().is_empty()
                    || (kind != "topic"
                        && value["summary"].as_str().unwrap_or("").trim().is_empty())
                {
                    return Err(AppError::Unprocessable(
                        "title and summary are required to publish".into(),
                    ));
                }
                if kind != "topic" {
                    crate::domain::document::validate_document(&value["document"].to_string())?;
                    crate::domain::document::validate_compiled(&value["compiled"].to_string())?;
                }
                if kind == "topic" {
                    let owner = parse_uuid(value["project_id"].as_str().unwrap_or(""))?;
                    let project = models::ContentEntry::filter_by_id(owner)
                        .first()
                        .exec(&mut db)
                        .await?;
                    if project.is_none_or(|p| p.kind != "project" || p.deleted) {
                        return Err(AppError::Unprocessable(
                            "the topic's project does not exist".into(),
                        ));
                    }
                }
                for id in value["project_ids"].as_array().into_iter().flatten() {
                    let project =
                        models::ContentEntry::filter_by_id(parse_uuid(id.as_str().unwrap_or(""))?)
                            .first()
                            .exec(&mut db)
                            .await?;
                    if project.is_none_or(|p| p.kind != "project" || p.deleted) {
                        return Err(AppError::Unprocessable(
                            "linked project does not exist".into(),
                        ));
                    }
                }
                for field in ["hero_image", "social_image"] {
                    if let Some(url) = value[field].as_str().filter(|s| s.starts_with("/media/")) {
                        let asset = models::MediaAsset::filter_by_filename(&url[7..])
                            .first()
                            .exec(&mut db)
                            .await?
                            .ok_or_else(|| {
                                AppError::Unprocessable("selected media no longer exists".into())
                            })?;
                        if field == "hero_image" {
                            let media: Value = serde_json::from_str(&asset.metadata)?;
                            value["hero_alt"] = media["alt"].clone();
                            value["hero_caption"] = media["caption"].clone();
                        }
                    }
                }
                if kind == "article" && value["reading_time_minutes"].is_null() {
                    fn words(v: &Value) -> usize {
                        match v {
                            Value::Object(o) => o
                                .iter()
                                .map(|(k, v)| {
                                    if k == "value" {
                                        v.as_str()
                                            .map(|s| s.split_whitespace().count())
                                            .unwrap_or(0)
                                    } else {
                                        words(v)
                                    }
                                })
                                .sum(),
                            Value::Array(a) => a.iter().map(words).sum(),
                            _ => 0,
                        }
                    }
                    value["reading_time_minutes"] =
                        json!(words(&value["document"]).div_ceil(200).max(1));
                }
                value["status"] = json!("published");
                if value["published_at"].is_null() {
                    value["published_at"] = json!(now_rfc3339());
                }
                if let Some(new_slug) = value["pending_slug"].as_str().map(str::to_owned) {
                    validate_slug(&new_slug)?;
                    if new_slug != value["slug"] {
                        let name = alias_name(kind, &value, &new_slug);
                        if let Some(alias) = models::ContentAlias::filter_by_name(&name)
                            .first()
                            .exec(&mut db)
                            .await?
                        {
                            if alias.owner != row.id.to_string() {
                                return Err(AppError::Conflict("URL already reserved".into()));
                            }
                        } else {
                            toasty::create!(models::ContentAlias {
                                name,
                                owner: row.id.to_string()
                            })
                            .exec(&mut db)
                            .await?;
                        }
                        value["slug"] = json!(new_slug);
                    }
                    value["pending_slug"] = Value::Null;
                }
            }
            "unpublish" => {
                published = None;
                value["status"] = json!("draft");
            }
            "archive" => {
                archived = true;
                published = None;
                value["status"] = json!("draft");
            }
            "restore" => {
                archived = false;
                value["status"] = json!("draft");
            }
            "delete" => {
                deleted = true;
                published = None;
            }
            _ => return Err(AppError::Unprocessable("unknown content action".into())),
        }
        value["revision"] = json!(expected + 1);
        value["archived"] = json!(archived);
        value["updated_at"] = json!(now_rfc3339());
        value["content_hash"] = json!(sha256_hex(value.to_string().as_bytes()));
        if action == "publish" {
            value["has_unpublished_changes"] = json!(false);
            published = Some(value.to_string());
        }
        let public: Value = published
            .as_deref()
            .map(serde_json::from_str)
            .transpose()?
            .unwrap_or(json!({}));
        let public_order = public["sort_order"].as_i64().unwrap_or(0);
        let public_date = public["published_at"].as_str().unwrap_or("").to_owned();
        let changed = toasty::sql::query("UPDATE content_entries SET working=?, published=?, revision=?, archived=?, deleted=?, public_order=?, public_date=? WHERE id=? AND revision=? RETURNING revision")
            .bind(value.to_string()).bind_typed(published,toasty_core::schema::db::Type::Text).bind(expected+1).bind(archived).bind(deleted).bind(public_order).bind(public_date).bind(row.id.as_bytes().to_vec()).bind(expected)
            .column_types([toasty::stmt::Type::I64]).exec(&mut db).await?;
        if changed.is_empty() {
            return Err(AppError::Conflict("content changed; reload".into()));
        }
        if action == "delete" && kind == "topic" {
            // Unlike posts, a deleted topic frees its URL so the name can be reused in the project.
            toasty::sql::query("DELETE FROM content_aliases WHERE name = ?")
                .bind(row.name.clone())
                .exec(&mut db)
                .await?;
            toasty::sql::query("UPDATE content_entries SET name = ? WHERE id = ?")
                .bind(format!("deleted:{}", row.id))
                .bind(row.id.as_bytes().to_vec())
                .exec(&mut db)
                .await?;
        }
        if action != "delete" {
            let event = if action == "restore" {
                "restore-archive"
            } else {
                action
            };
            Self::record_revision(&mut db, &row.id, expected + 1, event, &value).await?;
        }
        db.commit().await?;
        Ok(value)
    }
}

#[derive(Debug, Default, serde::Deserialize)]
#[cfg_attr(feature = "swagger", derive(utoipa::IntoParams))]
pub struct ContentQuery {
    pub page: Option<i64>,
    pub per_page: Option<i64>,
    pub q: Option<String>,
    pub status: Option<String>,
    pub featured: Option<bool>,
    pub project_id: Option<String>,
    /// Project slug; resolved to an id so renamed projects keep their posts.
    pub project: Option<String>,
    /// Topic id, for posts.
    pub topic_id: Option<String>,
    /// Topic slug inside the project selected by `project` or `project_id`, for posts. The
    /// value `none` selects posts without a topic.
    pub topic: Option<String>,
    /// Technology tag, case-insensitive exact match.
    pub tag: Option<String>,
    /// Category, case-insensitive exact match.
    pub category: Option<String>,
    pub ids: Option<String>,
    /// Admin only: `title`, `category`, `status` or `date`. Anything else keeps the default order.
    pub sort: Option<String>,
    /// `desc` reverses the admin sort; any other value is ascending.
    pub dir: Option<String>,
}
impl Db {
    pub async fn content_page(
        &self,
        kind: &str,
        public: bool,
        query: &ContentQuery,
    ) -> Result<Value, AppError> {
        let mut db = self.inner.lock().await;
        let column = if public { "published" } else { "working" };
        let mut conditions = vec!["kind = ?".to_owned(), "deleted = false".into()];
        let mut args = vec![toasty::stmt::Value::from(kind.to_owned())];
        if public {
            conditions.push("published IS NOT NULL AND archived = false".into());
        }
        if let Some(q) = query.q.as_deref().filter(|q| !q.is_empty()) {
            conditions.push(format!("(lower(json_extract({column}, '$.title')) LIKE ? OR lower(json_extract({column}, '$.summary')) LIKE ?)"));
            let pattern = format!("%{}%", q.to_lowercase());
            args.push(pattern.clone().into());
            args.push(pattern.into());
        }
        if let Some(status) = query.status.as_deref().filter(|s| !s.is_empty()) {
            if status == "archived" {
                conditions.push("archived = true".into());
            } else {
                conditions.push(format!(
                    "archived = false AND json_extract({column}, '$.status') = ?"
                ));
                args.push(status.to_owned().into());
            }
        }
        if let Some(featured) = query.featured {
            conditions.push(format!("json_extract({column}, '$.featured') = ?"));
            args.push(featured.into());
        }
        let mut project_id = query.project_id.clone();
        if let Some(slug) = query.project.as_deref().filter(|s| !s.is_empty()) {
            // An unknown slug matches nothing instead of being ignored.
            project_id = Some(
                match models::ContentAlias::filter_by_name(format!("project:{slug}"))
                    .first()
                    .exec(&mut *db)
                    .await?
                {
                    Some(alias) => alias.owner,
                    None => String::new(),
                },
            );
        }
        if let Some(id) = &project_id {
            if kind == "topic" {
                conditions.push(format!("json_extract({column}, '$.project_id') = ?"));
            } else {
                conditions.push(format!("EXISTS (SELECT 1 FROM json_each(json_extract({column}, '$.project_ids')) WHERE value = ?)"));
            }
            args.push(id.clone().into());
        }
        let mut topic_id = query.topic_id.clone();
        // `topic=none` selects posts that are not filed under any topic ("Other posts").
        let no_topic = query.topic.as_deref() == Some("none");
        if no_topic {
            conditions.push(format!("json_extract({column}, '$.topic_id') IS NULL"));
        } else if let Some(slug) = query.topic.as_deref().filter(|s| !s.is_empty()) {
            // A topic slug only means something inside a project; unknown ones match nothing.
            topic_id = Some(match &project_id {
                Some(project) => {
                    match models::ContentAlias::filter_by_name(format!("topic:{project}:{slug}"))
                        .first()
                        .exec(&mut *db)
                        .await?
                    {
                        Some(alias) => alias.owner,
                        None => String::new(),
                    }
                }
                None => String::new(),
            });
        }
        if let Some(id) = &topic_id {
            conditions.push(format!("json_extract({column}, '$.topic_id') = ?"));
            args.push(id.clone().into());
        }
        if let Some(tag) = query.tag.as_deref().filter(|t| !t.is_empty()) {
            conditions.push(format!("EXISTS (SELECT 1 FROM json_each(json_extract({column}, '$.tags')) WHERE lower(value) = ?)"));
            args.push(tag.to_lowercase().into());
        }
        if let Some(category) = query.category.as_deref().filter(|c| !c.is_empty()) {
            conditions.push(format!("lower(json_extract({column}, '$.category')) = ?"));
            args.push(category.to_lowercase().into());
        }
        if let Some(ids) = &query.ids {
            let ids: Vec<_> = ids.split(',').take(100).collect();
            conditions.push(format!(
                "json_extract({column}, '$.id') IN ({})",
                vec!["?"; ids.len()].join(",")
            ));
            args.extend(ids.into_iter().map(|s| s.to_owned().into()));
        }
        let clause = conditions.join(" AND ");
        let mut count = toasty::sql::query(format!(
            "SELECT count(*) FROM content_entries WHERE {clause}"
        ));
        for arg in &args {
            count = count.bind(arg.clone());
        }
        let counts = count
            .column_types([toasty::stmt::Type::I64])
            .exec(&mut *db)
            .await?;
        let total = match counts.first() {
            Some(toasty::stmt::Value::Record(r)) => match r.fields.first() {
                Some(toasty::stmt::Value::I64(n)) => *n,
                _ => 0,
            },
            _ => 0,
        };
        let page = query.page.unwrap_or(1).clamp(1, 1_000_000);
        let per_page = query.per_page.unwrap_or(20).clamp(1, 100);
        let page = if public {
            page
        } else {
            page.min(((total + per_page - 1) / per_page).max(1))
        };
        let dir = if query.dir.as_deref() == Some("desc") {
            "DESC"
        } else {
            "ASC"
        };
        let chosen = if public {
            None
        } else {
            match query.sort.as_deref() {
                Some("title") => Some(format!("lower(json_extract({column}, '$.title')) {dir}")),
                Some("category") => {
                    Some(format!("lower(json_extract({column}, '$.category')) {dir}"))
                }
                Some("status") => Some(format!(
                    "archived {dir}, json_extract({column}, '$.status') {dir}"
                )),
                Some("date") => Some(format!("public_date {dir}")),
                _ => None,
            }
        };
        let order = match chosen {
            Some(order) => format!("{order}, name ASC"),
            None if kind == "article" => "public_date DESC, public_order ASC, name ASC".to_owned(),
            None => "public_order ASC, name ASC".to_owned(),
        };
        let mut select = toasty::sql::query(format!(
            "SELECT json_remove({column}, '$.document', '$.compiled', '$.sections') FROM content_entries WHERE {clause} ORDER BY {order} LIMIT ? OFFSET ?"
        ));
        for arg in args {
            select = select.bind(arg);
        }
        let rows = select
            .bind(per_page)
            .bind((page - 1) * per_page)
            .column_types([toasty::stmt::Type::String])
            .exec(&mut *db)
            .await?;
        let mut items = vec![];
        for row in rows {
            if let toasty::stmt::Value::Record(r) = row
                && let Some(toasty::stmt::Value::String(s)) = r.fields.first()
            {
                let mut v: Value = serde_json::from_str(s)?;
                v["sections"] = json!([]);
                items.push(v);
            }
        }
        Self::enrich_listing(&mut *db, kind, public, &mut items).await?;
        Ok(json!({"items":items,"page":page,"per_page":per_page,"total":total}))
    }
    /// Cheap, bounded enrichment so cards never need follow-up requests:
    /// articles list their projects; projects carry post counts.
    async fn enrich_listing(
        db: &mut dyn toasty::Executor,
        kind: &str,
        public: bool,
        items: &mut [Value],
    ) -> Result<(), AppError> {
        let column = if public { "published" } else { "working" };
        let visible = if public {
            "e.deleted = false AND e.published IS NOT NULL AND e.archived = false"
        } else {
            "e.deleted = false"
        };
        // Only the ids shown on this page are looked up, so cost follows the page size and
        // never the size of the catalogue.
        let page_ids: Vec<String> = if kind == "article" {
            items
                .iter()
                .flat_map(|item| item["project_ids"].as_array().into_iter().flatten())
                .filter_map(|id| id.as_str().map(str::to_owned))
                .collect::<std::collections::BTreeSet<_>>()
                .into_iter()
                .collect()
        } else {
            items
                .iter()
                .filter_map(|item| item["id"].as_str().map(str::to_owned))
                .collect()
        };
        if page_ids.is_empty() {
            if kind == "article" {
                for item in items.iter_mut() {
                    item["projects"] = json!([]);
                    item["topic"] = Value::Null;
                }
            } else if kind == "project" || kind == "topic" {
                for item in items.iter_mut() {
                    item["post_count"] = json!(0);
                    item["latest_post_at"] = Value::Null;
                }
            }
            return Ok(());
        }
        let marks = vec!["?"; page_ids.len()].join(",");
        if kind == "article" {
            let sql = format!(
                "SELECT json_object('id', json_extract(e.{column}, '$.id'), 'slug', json_extract(e.{column}, '$.slug'), 'title', json_extract(e.{column}, '$.title')) FROM content_entries e WHERE e.kind = 'project' AND {visible} AND json_extract(e.{column}, '$.id') IN ({marks})"
            );
            let mut query = toasty::sql::query(sql);
            for id in &page_ids {
                query = query.bind(id.clone());
            }
            let rows = query
                .column_types([toasty::stmt::Type::String])
                .exec(&mut *db)
                .await?;
            let mut lookup = std::collections::HashMap::<String, Value>::new();
            for row in rows {
                if let toasty::stmt::Value::Record(r) = row
                    && let Some(toasty::stmt::Value::String(raw)) = r.fields.first()
                {
                    let p: Value = serde_json::from_str(raw)?;
                    if let Some(id) = p["id"].as_str() {
                        lookup.insert(id.to_owned(), p.clone());
                    }
                }
            }
            for item in items.iter_mut() {
                let projects: Vec<Value> = item["project_ids"]
                    .as_array()
                    .into_iter()
                    .flatten()
                    .filter_map(|id| lookup.get(id.as_str()?).cloned())
                    .collect();
                item["projects"] = Value::Array(projects);
            }
            // Topics of the posts on this page, with their project's slug for links.
            let topic_ids: Vec<String> = items
                .iter()
                .filter_map(|item| item["topic_id"].as_str().map(str::to_owned))
                .collect::<std::collections::BTreeSet<_>>()
                .into_iter()
                .collect();
            let mut topics = std::collections::HashMap::<String, Value>::new();
            if !topic_ids.is_empty() {
                let marks = vec!["?"; topic_ids.len()].join(",");
                let sql = format!(
                    "SELECT json_object('id', json_extract(e.{column}, '$.id'), 'slug', json_extract(e.{column}, '$.slug'), 'title', json_extract(e.{column}, '$.title'), 'project_id', json_extract(e.{column}, '$.project_id')) FROM content_entries e WHERE e.kind = 'topic' AND {visible} AND json_extract(e.{column}, '$.id') IN ({marks})"
                );
                let mut query = toasty::sql::query(sql);
                for id in &topic_ids {
                    query = query.bind(id.clone());
                }
                let rows = query
                    .column_types([toasty::stmt::Type::String])
                    .exec(&mut *db)
                    .await?;
                for row in rows {
                    if let toasty::stmt::Value::Record(r) = row
                        && let Some(toasty::stmt::Value::String(raw)) = r.fields.first()
                    {
                        let t: Value = serde_json::from_str(raw)?;
                        if let (Some(id), Some(project)) = (
                            t["id"].as_str(),
                            t["project_id"].as_str().and_then(|p| lookup.get(p)),
                        ) {
                            topics.insert(
                                id.to_owned(),
                                json!({"id": t["id"], "slug": t["slug"], "title": t["title"], "project_slug": project["slug"]}),
                            );
                        }
                    }
                }
            }
            for item in items.iter_mut() {
                item["topic"] = item["topic_id"]
                    .as_str()
                    .and_then(|id| topics.get(id).cloned())
                    .unwrap_or(Value::Null);
            }
        } else if kind == "topic" {
            let sql = format!(
                "SELECT json_extract(e.{column}, '$.topic_id'), count(*), coalesce(max(json_extract(e.{column}, '$.published_at')), '') FROM content_entries e WHERE e.kind = 'article' AND {visible} AND json_extract(e.{column}, '$.topic_id') IN ({marks}) GROUP BY 1"
            );
            let mut query = toasty::sql::query(sql);
            for id in &page_ids {
                query = query.bind(id.clone());
            }
            let rows = query
                .column_types([
                    toasty::stmt::Type::String,
                    toasty::stmt::Type::I64,
                    toasty::stmt::Type::String,
                ])
                .exec(&mut *db)
                .await?;
            let mut stats = std::collections::HashMap::<String, (i64, String)>::new();
            for row in rows {
                if let toasty::stmt::Value::Record(r) = row
                    && let [
                        toasty::stmt::Value::String(id),
                        toasty::stmt::Value::I64(count),
                        toasty::stmt::Value::String(latest),
                    ] = r.fields.as_slice()
                {
                    stats.insert(id.clone(), (*count, latest.clone()));
                }
            }
            // Titles and slugs of the projects the listed topics belong to.
            let project_ids: Vec<String> = items
                .iter()
                .filter_map(|item| item["project_id"].as_str().map(str::to_owned))
                .collect::<std::collections::BTreeSet<_>>()
                .into_iter()
                .collect();
            let mut projects = std::collections::HashMap::<String, Value>::new();
            if !project_ids.is_empty() {
                let marks = vec!["?"; project_ids.len()].join(",");
                let sql = format!(
                    "SELECT json_object('id', json_extract(e.{column}, '$.id'), 'slug', json_extract(e.{column}, '$.slug'), 'title', json_extract(e.{column}, '$.title')) FROM content_entries e WHERE e.kind = 'project' AND {visible} AND json_extract(e.{column}, '$.id') IN ({marks})"
                );
                let mut query = toasty::sql::query(sql);
                for id in &project_ids {
                    query = query.bind(id.clone());
                }
                let rows = query
                    .column_types([toasty::stmt::Type::String])
                    .exec(&mut *db)
                    .await?;
                for row in rows {
                    if let toasty::stmt::Value::Record(r) = row
                        && let Some(toasty::stmt::Value::String(raw)) = r.fields.first()
                    {
                        let p: Value = serde_json::from_str(raw)?;
                        if let Some(id) = p["id"].as_str() {
                            projects.insert(id.to_owned(), p.clone());
                        }
                    }
                }
            }
            for item in items.iter_mut() {
                let (count, latest) = item["id"]
                    .as_str()
                    .and_then(|id| stats.get(id))
                    .cloned()
                    .unwrap_or_default();
                item["post_count"] = json!(count);
                item["latest_post_at"] = if latest.is_empty() {
                    Value::Null
                } else {
                    json!(latest)
                };
                item["project"] = item["project_id"]
                    .as_str()
                    .and_then(|id| projects.get(id).cloned())
                    .unwrap_or(Value::Null);
            }
        } else if kind == "project" {
            let published_only = if public {
                ""
            } else {
                " AND json_extract(e.working, '$.status') = 'published'"
            };
            let sql = format!(
                "SELECT j.value, count(*), coalesce(max(json_extract(e.{column}, '$.published_at')), '') FROM content_entries e, json_each(json_extract(e.{column}, '$.project_ids')) j WHERE e.kind = 'article' AND {visible}{published_only} AND typeof(j.value) = 'text' AND j.value IN ({marks}) GROUP BY j.value"
            );
            let mut query = toasty::sql::query(sql);
            for id in &page_ids {
                query = query.bind(id.clone());
            }
            let rows = query
                .column_types([
                    toasty::stmt::Type::String,
                    toasty::stmt::Type::I64,
                    toasty::stmt::Type::String,
                ])
                .exec(&mut *db)
                .await?;
            let mut stats = std::collections::HashMap::<String, (i64, String)>::new();
            for row in rows {
                if let toasty::stmt::Value::Record(r) = row
                    && let [
                        toasty::stmt::Value::String(id),
                        toasty::stmt::Value::I64(count),
                        toasty::stmt::Value::String(latest),
                    ] = r.fields.as_slice()
                {
                    stats.insert(id.clone(), (*count, latest.clone()));
                }
            }
            for item in items.iter_mut() {
                let (count, latest) = item["id"]
                    .as_str()
                    .and_then(|id| stats.get(id))
                    .cloned()
                    .unwrap_or_default();
                item["post_count"] = json!(count);
                item["latest_post_at"] = if latest.is_empty() {
                    Value::Null
                } else {
                    json!(latest)
                };
            }
        }
        Ok(())
    }
}

/// Alias that reserves a content URL. Topic URLs only need to be unique inside their project.
fn alias_name(kind: &str, value: &Value, slug: &str) -> String {
    if kind == "topic" {
        format!(
            "topic:{}:{slug}",
            value["project_id"].as_str().unwrap_or("")
        )
    } else {
        format!("{kind}:{slug}")
    }
}

fn validate_slug(slug: &str) -> Result<(), AppError> {
    if slug.is_empty()
        || slug.len() > 120
        || slug.starts_with('-')
        || slug.ends_with('-')
        || slug.contains("--")
        || !slug
            .bytes()
            .all(|b| b.is_ascii_lowercase() || b.is_ascii_digit() || b == b'-')
    {
        return Err(AppError::Unprocessable("invalid content URL".into()));
    }
    Ok(())
}
pub(super) fn validate_meta(v: &Value) -> Result<(), AppError> {
    validate_slug(v["slug"].as_str().unwrap_or(""))?;
    if let Some(slug) = v["pending_slug"].as_str() {
        validate_slug(slug)?;
    }
    for key in ["repo_url", "demo_url", "hero_image", "social_image"] {
        if let Some(_url) = v[key].as_str().filter(|url| {
            !url.is_empty()
                && !url.starts_with("https://")
                && !url.starts_with("http://")
                && !url.starts_with("/media/")
        }) {
            return Err(AppError::Unprocessable(format!(
                "{key} must be an HTTP or managed media URL"
            )));
        }
    }
    for key in [
        "title",
        "summary",
        "category",
        "seo_title",
        "seo_description",
    ] {
        if v[key].as_str().is_some_and(|s| s.len() > 16000) {
            return Err(AppError::Unprocessable(format!("{key} is too long")));
        }
    }
    if v["project_ids"].as_array().is_some_and(|a| a.len() > 100) {
        return Err(AppError::Unprocessable(
            "too many project associations".into(),
        ));
    }
    Ok(())
}

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
        Ok(())
    }
    async fn entry(
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
        let name = format!("{kind}:{slug}");
        if models::ContentAlias::filter_by_name(&name)
            .first()
            .exec(&mut db)
            .await?
            .is_some()
        {
            return Err(AppError::Conflict("URL already reserved".into()));
        }
        validate_meta(&value)?;
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
        let mut db = self.inner.lock().await;
        let row = Self::entry(&mut *db, kind, slug).await?;
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
        value["status"] = old["status"].clone();
        value["archived"] = json!(false);
        value["revision"] = json!(expected + 1);
        value["updated_at"] = json!(now_rfc3339());
        value["has_unpublished_changes"] = json!(true);
        validate_meta(&value)?;
        let id = row.id;
        let revision = expected + 1;
        let working = value.to_string();
        // One lock protects local read/modify/write; revision predicate protects
        // against external writers sharing the database.
        let changed = toasty::sql::query("UPDATE content_entries SET working = ?, revision = ? WHERE id = ? AND revision = ? RETURNING revision")
            .bind(working).bind(revision).bind(id.as_bytes().to_vec()).bind(expected).column_types([toasty::stmt::Type::I64]).exec(&mut *db).await?;
        if changed.is_empty() {
            return Err(AppError::Conflict("content changed; reload".into()));
        }
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
            for article in
                models::ContentEntry::filter(models::ContentEntry::fields().kind().eq("article"))
                    .exec(&mut db)
                    .await?
                    .into_iter()
                    .filter(|a| !a.deleted)
            {
                for raw in [Some(article.working), article.published]
                    .into_iter()
                    .flatten()
                {
                    let linked: Value = serde_json::from_str(&raw)?;
                    if linked["project_ids"]
                        .as_array()
                        .is_some_and(|ids| ids.contains(&json!(row.id.to_string())))
                    {
                        return Err(AppError::Conflict(
                            "unlink this project from articles before deleting it".into(),
                        ));
                    }
                }
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
                    || value["summary"].as_str().unwrap_or("").trim().is_empty()
                {
                    return Err(AppError::Unprocessable(
                        "title and summary are required to publish".into(),
                    ));
                }
                crate::domain::document::validate_document(&value["document"].to_string())?;
                crate::domain::document::validate_compiled(&value["compiled"].to_string())?;
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
                        let name = format!("{kind}:{new_slug}");
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
    pub ids: Option<String>,
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
        if let Some(id) = &query.project_id {
            conditions.push(format!("EXISTS (SELECT 1 FROM json_each(json_extract({column}, '$.project_ids')) WHERE value = ?)"));
            args.push(id.clone().into());
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
        let order = if kind == "article" {
            "public_date DESC, public_order ASC, name ASC"
        } else {
            "public_order ASC, name ASC"
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
        Ok(json!({"items":items,"page":page,"per_page":per_page,"total":total}))
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
fn validate_meta(v: &Value) -> Result<(), AppError> {
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

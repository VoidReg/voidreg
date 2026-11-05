//! Durable comment admission, moderation, and privacy-preserving source monitoring.
use super::*;
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
type SqlValue = toasty::stmt::Value;

pub const SCHEMA: &[&str] = &[
    "CREATE TABLE IF NOT EXISTS comment_ancestors (comment_id TEXT NOT NULL, ancestor_id TEXT NOT NULL, PRIMARY KEY(comment_id,ancestor_id))",
    "CREATE INDEX IF NOT EXISTS ancestors_reverse ON comment_ancestors(ancestor_id,comment_id)",
    "CREATE INDEX IF NOT EXISTS comments_discussion_page ON comments(article_slug,status,created_at,id)",
    "CREATE INDEX IF NOT EXISTS comments_reply_page ON comments(article_slug,thread_id,created_at,id)",
    "CREATE INDEX IF NOT EXISTS comments_identity ON comments(identity_id,created_at)",
    "CREATE TABLE IF NOT EXISTS comment_guard (id INTEGER PRIMARY KEY, revision INTEGER NOT NULL)",
    "INSERT OR IGNORE INTO comment_guard VALUES (1,0)",
    "CREATE TABLE IF NOT EXISTS comment_sources (source TEXT PRIMARY KEY, first_seen INTEGER NOT NULL, last_seen INTEGER NOT NULL)",
    "INSERT OR IGNORE INTO comment_sources SELECT ip_hash, CAST(strftime('%s',min(created_at)) AS INTEGER), CAST(strftime('%s',max(created_at)) AS INTEGER) FROM comments WHERE ip_hash != '' GROUP BY ip_hash",
    "CREATE TABLE IF NOT EXISTS comment_source_accounts (source TEXT NOT NULL, identity_id TEXT NOT NULL, first_seen INTEGER NOT NULL, last_seen INTEGER NOT NULL, PRIMARY KEY(source,identity_id))",
    "CREATE INDEX IF NOT EXISTS source_accounts_identity ON comment_source_accounts(identity_id,last_seen)",
    "INSERT OR IGNORE INTO comment_source_accounts SELECT ip_hash,identity_id,CAST(strftime('%s',min(created_at)) AS INTEGER),CAST(strftime('%s',max(created_at)) AS INTEGER) FROM comments WHERE identity_id IS NOT NULL GROUP BY ip_hash,identity_id",
    "CREATE TABLE IF NOT EXISTS comment_attempts (id TEXT PRIMARY KEY, source TEXT NOT NULL, identity_id TEXT, article TEXT NOT NULL, fingerprint TEXT NOT NULL, time INTEGER NOT NULL)",
    "CREATE INDEX IF NOT EXISTS attempts_expiry ON comment_attempts(time)",
    "CREATE INDEX IF NOT EXISTS attempts_source_time ON comment_attempts(source,time)",
    "CREATE INDEX IF NOT EXISTS attempts_identity_time ON comment_attempts(identity_id,time)",
    "CREATE TABLE IF NOT EXISTS comment_blocks (id TEXT PRIMARY KEY, kind TEXT NOT NULL, target TEXT NOT NULL, reason TEXT NOT NULL, actor TEXT NOT NULL, created_at INTEGER NOT NULL, expires_at INTEGER, revoked_at INTEGER)",
    "CREATE INDEX IF NOT EXISTS blocks_target ON comment_blocks(kind,target,revoked_at,expires_at)",
    "CREATE TABLE IF NOT EXISTS comment_moderation (comment_id TEXT PRIMARY KEY, reason TEXT NOT NULL, updated_at INTEGER NOT NULL)",
    "CREATE TABLE IF NOT EXISTS comment_abuse (source TEXT NOT NULL, identity_id TEXT NOT NULL, reason TEXT NOT NULL, bucket INTEGER NOT NULL, count INTEGER NOT NULL, PRIMARY KEY(source,identity_id,reason,bucket))",
    "CREATE INDEX IF NOT EXISTS abuse_retention ON comment_abuse(bucket)",
    "CREATE TABLE IF NOT EXISTS comment_audit (id TEXT PRIMARY KEY, action TEXT NOT NULL, target TEXT NOT NULL, actor TEXT NOT NULL, reason TEXT NOT NULL, time INTEGER NOT NULL)",
    "CREATE INDEX IF NOT EXISTS audit_time ON comment_audit(time,id)",
];

pub(super) async fn sql(
    db: &mut dyn toasty::Executor,
    statement: String,
    args: Vec<SqlValue>,
) -> Result<(), AppError> {
    let mut q = toasty::sql::query(statement);
    for a in args {
        q = if a.is_null() {
            q.bind_typed(a, toasty::schema::db::Type::Text)
        } else {
            q.bind(a)
        };
    }
    q.exec(db).await?;
    Ok(())
}
async fn rows(
    db: &mut dyn toasty::Executor,
    statement: String,
    args: Vec<SqlValue>,
) -> Result<Vec<Value>, AppError> {
    let mut q = toasty::sql::query(statement);
    for a in args {
        q = if a.is_null() {
            q.bind_typed(a, toasty::schema::db::Type::Text)
        } else {
            q.bind(a)
        };
    }
    let result = q
        .column_types([toasty::stmt::Type::String])
        .exec(db)
        .await?;
    result
        .into_iter()
        .map(|row| match row {
            SqlValue::Record(r) => match r.fields.into_iter().next() {
                Some(SqlValue::String(s)) => Ok(serde_json::from_str(&s)?),
                _ => Err(AppError::Internal("invalid moderation query result".into())),
            },
            _ => Err(AppError::Internal("invalid moderation query row".into())),
        })
        .collect()
}
fn uid(column: &str) -> String {
    format!(
        "CASE WHEN typeof({column})='blob' THEN lower(substr(hex({column}),1,8)||'-'||substr(hex({column}),9,4)||'-'||substr(hex({column}),13,4)||'-'||substr(hex({column}),17,4)||'-'||substr(hex({column}),21,12)) ELSE {column} END"
    )
}
fn now() -> i64 {
    time::OffsetDateTime::now_utc().unix_timestamp()
}
fn allowed(alias: &str) -> String {
    format!(
        "({alias}.status='approved' AND NOT EXISTS (SELECT 1 FROM comment_blocks b WHERE b.revoked_at IS NULL AND (b.expires_at IS NULL OR b.expires_at>unixepoch()) AND ((b.kind='source' AND b.target={alias}.ip_hash) OR (b.kind='user' AND b.target={alias}.identity_id))))"
    )
}
async fn lock(db: &mut dyn toasty::Executor) -> Result<(), AppError> {
    sql(
        db,
        "UPDATE comment_guard SET revision=revision+1 WHERE id=1".into(),
        vec![],
    )
    .await
}
async fn blocked(
    db: &mut dyn toasty::Executor,
    source: &str,
    identity: Option<&str>,
) -> Result<bool, AppError> {
    let result=rows(db,"SELECT json_object('count',count(*)) FROM comment_blocks WHERE revoked_at IS NULL AND (expires_at IS NULL OR expires_at>unixepoch()) AND ((kind='source' AND target=?) OR (kind='user' AND target=?))".into(),vec![source.into(),identity.unwrap_or("").into()]).await?;
    Ok(result[0]["count"].as_i64().unwrap_or(0) > 0)
}
async fn event(
    db: &mut dyn toasty::Executor,
    source: &str,
    identity: Option<&str>,
    reason: &str,
) -> Result<(), AppError> {
    sql(db,"INSERT INTO comment_abuse VALUES (?,?,?,?,1) ON CONFLICT(source,identity_id,reason,bucket) DO UPDATE SET count=count+1".into(),vec![source.into(),identity.unwrap_or("").into(),reason.into(),(now()/60*60).into()]).await
}
async fn audit(
    db: &mut dyn toasty::Executor,
    action: &str,
    target: &str,
    actor: &str,
    reason: &str,
) -> Result<(), AppError> {
    sql(
        db,
        "INSERT INTO comment_audit VALUES (?,?,?,?,?,?)".into(),
        vec![
            uuid::Uuid::new_v4().to_string().into(),
            action.into(),
            target.into(),
            actor.into(),
            reason.into(),
            now().into(),
        ],
    )
    .await
}

#[derive(Debug, Clone, Deserialize, Default)]
#[cfg_attr(feature = "swagger", derive(utoipa::IntoParams))]
pub struct ModerationQuery {
    pub page: Option<i64>,
    pub per_page: Option<i64>,
    pub status: Option<String>,
    pub q: Option<String>,
    pub user: Option<String>,
    pub source: Option<String>,
    pub article: Option<String>,
    pub since: Option<i64>,
    pub until: Option<i64>,
}
#[derive(Debug, Clone, Deserialize, Serialize)]
#[cfg_attr(feature = "swagger", derive(utoipa::ToSchema))]
pub struct BlockInput {
    pub kind: String,
    pub target: String,
    pub reason: String,
    pub hours: Option<i64>,
}

impl Db {
    /// The first write acquires the database transaction lock before checking admission.
    /// Quotas, block checks, parent validation, and the insert share one transaction.
    pub async fn admit_comment(
        &self,
        input: NewComment<'_>,
        honeypot: bool,
        config: &Config,
    ) -> Result<Option<CommentInfo>, AppError> {
        for attempt in 0..7 {
            match self.admit_comment_once(input, honeypot, config).await {
                Err(AppError::Database(message))
                    if message.contains("serialization failure")
                        || message.contains("database is locked") =>
                {
                    if attempt == 6 {
                        return Err(AppError::ServiceUnavailable(
                            "Comment submission is busy. Please try again.".into(),
                        ));
                    }
                    tokio::time::sleep(std::time::Duration::from_millis(5 << attempt)).await;
                }
                result => return result,
            }
        }
        unreachable!()
    }
    async fn admit_comment_once(
        &self,
        input: NewComment<'_>,
        honeypot: bool,
        config: &Config,
    ) -> Result<Option<CommentInfo>, AppError> {
        let mut db = self.inner.lock().await;
        let mut tx = db.transaction().await?;
        lock(&mut tx).await?;
        sql(
            &mut tx,
            "DELETE FROM comment_attempts WHERE time<?".into(),
            vec![(now() - 3600).into()],
        )
        .await?;
        sql(
            &mut tx,
            "DELETE FROM comment_abuse WHERE bucket<?".into(),
            vec![(now() - 30 * 86400).into()],
        )
        .await?;
        sql(&mut tx,"INSERT INTO comment_sources VALUES (?,?,?) ON CONFLICT(source) DO UPDATE SET last_seen=excluded.last_seen".into(),vec![input.ip_hash.into(),now().into(),now().into()]).await?;
        if let Some(identity) = input.identity_id {
            sql(&mut tx,"INSERT INTO comment_source_accounts VALUES (?,?,?,?) ON CONFLICT(source,identity_id) DO UPDATE SET last_seen=excluded.last_seen".into(), vec![input.ip_hash.into(),identity.into(),now().into(),now().into()]).await?;
        }
        if blocked(&mut tx, input.ip_hash, input.identity_id).await? {
            event(&mut tx, input.ip_hash, input.identity_id, "blocked").await?;
            tx.commit().await?;
            return Err(AppError::Forbidden(
                "Commenting is unavailable for this account or connection.".into(),
            ));
        }
        let identity = input.identity_id.unwrap_or("");
        let fingerprint = sha256_hex(
            input
                .body
                .split_whitespace()
                .collect::<Vec<_>>()
                .join(" ")
                .to_lowercase()
                .as_bytes(),
        );
        let counts=rows(&mut tx,"SELECT json_object('source',sum(source=?),'article',sum(source=? AND article=?),'account',sum(identity_id=?),'account_article',sum(identity_id=? AND article=?),'burst',sum(source=? AND time>?),'account_burst',sum(identity_id=? AND time>?),'duplicate',sum(time>? AND fingerprint=?)) FROM comment_attempts WHERE source=? OR (? != '' AND identity_id=?)".into(),vec![input.ip_hash.into(),input.ip_hash.into(),input.article_slug.into(),identity.into(),identity.into(),input.article_slug.into(),input.ip_hash.into(),(now()-10).into(),identity.into(),(now()-10).into(),(now()-600).into(),fingerprint.into(),input.ip_hash.into(),identity.into(),identity.into()]).await?;
        let count = &counts[0];
        let verified = input.identity_id.is_some();
        let hourly = if verified {
            config.comment_user_hourly
        } else {
            config.comment_anon_hourly
        };
        let article = if verified {
            config.comment_user_article_hourly
        } else {
            config.comment_anon_article_hourly
        };
        let reason = if count["burst"].as_i64().unwrap_or(0) >= config.comment_burst
            || (verified && count["account_burst"].as_i64().unwrap_or(0) >= config.comment_burst)
        {
            Some(("burst", 10))
        } else if count["source"].as_i64().unwrap_or(0) >= hourly
            || count["article"].as_i64().unwrap_or(0) >= article
            || (verified
                && (count["account"].as_i64().unwrap_or(0) >= config.comment_user_hourly
                    || count["account_article"].as_i64().unwrap_or(0)
                        >= config.comment_user_article_hourly))
        {
            Some(("hourly_limit", 3600))
        } else if count["duplicate"].as_i64().unwrap_or(0) > 0 {
            Some(("duplicate", 600))
        } else {
            None
        };
        if let Some((reason, retry)) = reason {
            event(&mut tx, input.ip_hash, input.identity_id, reason).await?;
            tx.commit().await?;
            return Err(AppError::CommentRateLimited(retry));
        }
        sql(
            &mut tx,
            "INSERT INTO comment_attempts VALUES (?,?,?,?,?,?)".into(),
            vec![
                uuid::Uuid::new_v4().to_string().into(),
                input.ip_hash.into(),
                input.identity_id.map(String::from).into(),
                input.article_slug.into(),
                sha256_hex(
                    input
                        .body
                        .split_whitespace()
                        .collect::<Vec<_>>()
                        .join(" ")
                        .to_lowercase()
                        .as_bytes(),
                )
                .into(),
                now().into(),
            ],
        )
        .await?;
        if honeypot {
            event(&mut tx, input.ip_hash, input.identity_id, "honeypot").await?;
            tx.commit().await?;
            return Ok(None);
        }
        let parent = if let Some(id) = input.parent_id {
            let row = models::Comment::filter_by_id(
                parse_uuid(id)
                    .map_err(|_| AppError::Unprocessable("reply target is unavailable".into()))?,
            )
            .first()
            .exec(&mut tx)
            .await?
            .filter(|c| c.article_slug == input.article_slug && c.status == "approved")
            .ok_or_else(|| AppError::Unprocessable("reply target is unavailable".into()))?;
            if blocked(&mut tx, &row.ip_hash, row.identity_id.as_deref()).await? {
                return Err(AppError::Unprocessable(
                    "reply target is unavailable".into(),
                ));
            }
            Some(row)
        } else {
            None
        };
        let status = if input.body.to_lowercase().matches("http://").count()
            + input.body.to_lowercase().matches("https://").count()
            >= 4
        {
            "spam"
        } else {
            input.status
        };
        let row = toasty::create!(models::Comment {
            article_slug: input.article_slug.to_owned(),
            identity_id: input.identity_id.map(str::to_owned),
            author_name: input.author_name.to_owned(),
            body: input.body.to_owned(),
            status: status.to_owned(),
            ip_hash: input.ip_hash.to_owned(),
            parent_id: input.parent_id.map(str::to_owned),
            thread_id: parent
                .as_ref()
                .map(|p| p.thread_id.clone().unwrap_or_else(|| p.id.to_string())),
            created_at: now_rfc3339()
        })
        .exec(&mut tx)
        .await?;
        record_ancestors(&mut tx, &row.id.to_string(), row.parent_id.as_deref()).await?;
        if status == "spam" {
            event(&mut tx, input.ip_hash, input.identity_id, "link_limit").await?;
            sql(
                &mut tx,
                "INSERT INTO comment_moderation VALUES (?,?,?)".into(),
                vec![
                    row.id.to_string().into(),
                    "Four or more HTTP(S) links".into(),
                    now().into(),
                ],
            )
            .await?;
        }
        tx.commit().await?;
        Ok(Some(comment_from_row(row)))
    }

    pub async fn moderation_page(
        &self,
        kind: &str,
        q: &ModerationQuery,
    ) -> Result<Value, AppError> {
        let mut db = self.inner.lock().await;
        sql(
            &mut *db,
            "DELETE FROM comment_abuse WHERE bucket<?".into(),
            vec![(now() - 30 * 86400).into()],
        )
        .await?;
        let c_id = uid("c.id");
        let i_id = uid("i.id");
        let p_id = uid("p.id");
        let block_status = "revoked_at IS NULL AND (expires_at IS NULL OR expires_at>unixepoch())";
        let comments = format!(
            "SELECT json_object('id',{c_id},'article_slug',c.article_slug,'author_name',c.author_name,'body',c.body,'status',c.status,'created_at',c.created_at,'identity_id',c.identity_id,'source',c.ip_hash,'parent_id',c.parent_id,'parent_author',p.author_name,'parent_body',p.body,'reason',m.reason,'email',i.email) AS data,c.created_at AS ordering FROM comments c LEFT JOIN comments p ON ({p_id})=c.parent_id LEFT JOIN identities i ON ({i_id})=c.identity_id LEFT JOIN comment_moderation m ON m.comment_id=({c_id})"
        );
        let users = format!(
            "SELECT json_object('id',{i_id},'kind','user','target',{i_id},'name',i.name,'email',i.email,'provider',i.provider,'last_seen',(SELECT max(last_seen) FROM comment_source_accounts a WHERE a.identity_id=({i_id})),'comments',(SELECT count(*) FROM comments c WHERE c.identity_id=({i_id})),'spam',(SELECT count(*) FROM comments c WHERE c.identity_id=({i_id}) AND status='spam'),'blocked',EXISTS(SELECT 1 FROM comment_blocks b WHERE b.kind='user' AND b.target=({i_id}) AND b.revoked_at IS NULL AND (b.expires_at IS NULL OR b.expires_at>unixepoch()))) AS data, i.name AS ordering FROM identities i"
        );
        let sources = "SELECT json_object('id',s.source,'kind','source','target',s.source,'name',substr(s.source,1,12),'first_seen',s.first_seen,'last_seen',s.last_seen,'comments',(SELECT count(*) FROM comments c WHERE c.ip_hash=s.source),'spam',(SELECT count(*) FROM comments c WHERE c.ip_hash=s.source AND c.status='spam'),'accounts_total',(SELECT count(*) FROM comment_source_accounts a WHERE a.source=s.source),'accounts',json((SELECT json_group_array(identity_id) FROM (SELECT identity_id FROM comment_source_accounts a WHERE a.source=s.source ORDER BY last_seen DESC,identity_id LIMIT 20))),'rejections',(SELECT coalesce(sum(count),0) FROM comment_abuse a WHERE a.source=s.source),'blocked',EXISTS(SELECT 1 FROM comment_blocks b WHERE b.kind='source' AND b.target=s.source AND b.revoked_at IS NULL AND (b.expires_at IS NULL OR b.expires_at>unixepoch()))) AS data,s.last_seen AS ordering FROM comment_sources s";
        let blocks = format!(
            "SELECT json_object('id',id,'kind',kind,'target',target,'reason',reason,'actor',actor,'created_at',created_at,'expires_at',expires_at,'revoked_at',revoked_at,'active',({block_status})) AS data,created_at AS ordering FROM comment_blocks"
        );
        let events = "SELECT json_object('source',source,'identity_id',identity_id,'reason',reason,'time',bucket,'count',count) AS data,bucket AS ordering FROM comment_abuse";
        let history = "SELECT json_object('id',id,'action',action,'target',target,'actor',actor,'reason',reason,'time',time) AS data,time AS ordering FROM comment_audit";
        let base = match kind {
            "comments" => comments,
            "users" => users,
            "sources" => sources.into(),
            "blocks" => blocks,
            "events" => events.into(),
            "audit" => history.into(),
            _ => return Err(AppError::NotFound("Unknown moderation collection".into())),
        };
        let mut conditions = vec!["1=1".to_owned()];
        let mut args = vec![];
        for (key, value) in [
            ("status", q.status.as_deref()),
            ("identity_id", q.user.as_deref()),
            ("source", q.source.as_deref()),
            ("article_slug", q.article.as_deref()),
        ] {
            if let Some(value) = value.filter(|v| !v.is_empty()) {
                if kind == "users" && key == "source" {
                    conditions.push("json_extract(data,'$.id') IN (SELECT identity_id FROM comment_source_accounts WHERE source=?)".into());
                } else {
                    conditions.push(format!("json_extract(data,'$.{key}')=?"));
                }
                args.push(value.into());
            }
        }
        if let Some(search) = q.q.as_deref().filter(|s| !s.is_empty()) {
            conditions.push("lower(data) LIKE ? ESCAPE '\\'".into());
            let escaped = search
                .to_lowercase()
                .replace('\\', "\\\\")
                .replace('%', "\\%")
                .replace('_', "\\_");
            args.push(format!("%{escaped}%").into());
        }
        for (op, value) in [(">=", q.since), ("<=", q.until)] {
            if let Some(value) = value {
                conditions.push(format!("coalesce(json_extract(data,'$.time'),CASE WHEN json_type(data,'$.created_at')='integer' THEN json_extract(data,'$.created_at') ELSE unixepoch(json_extract(data,'$.created_at')) END,json_extract(data,'$.last_seen')) {op} ?"));
                args.push(value.into());
            }
        }
        let filter = conditions.join(" AND ");
        let total = rows(
            &mut *db,
            format!("SELECT json_object('total',count(*)) FROM ({base}) WHERE {filter}"),
            args.clone(),
        )
        .await?[0]["total"]
            .as_i64()
            .unwrap_or(0);
        let per = q.per_page.unwrap_or(20).clamp(1, 100);
        let page = q
            .page
            .unwrap_or(1)
            .clamp(1, ((total + per - 1) / per).max(1));
        args.push(per.into());
        args.push(((page - 1) * per).into());
        let items=rows(&mut *db,format!("SELECT data FROM ({base}) WHERE {filter} ORDER BY ordering DESC,data ASC LIMIT ? OFFSET ?"),args).await?;
        Ok(json!({"items":items,"page":page,"per_page":per,"total":total}))
    }

    pub async fn moderation_summary(&self) -> Result<Value, AppError> {
        let mut db = self.inner.lock().await;
        Ok(rows(&mut *db,"SELECT json_object('pending',(SELECT count(*) FROM comments WHERE status='pending'),'spam',(SELECT count(*) FROM comments WHERE status='spam'),'hidden',(SELECT count(*) FROM comments WHERE status='hidden'),'users',(SELECT count(*) FROM identities),'sources',(SELECT count(*) FROM comment_sources),'blocks',(SELECT count(*) FROM comment_blocks WHERE revoked_at IS NULL AND (expires_at IS NULL OR expires_at>unixepoch())),'rejected_24h',(SELECT coalesce(sum(count),0) FROM comment_abuse WHERE bucket>unixepoch()-86400))".into(),vec![]).await?.remove(0))
    }

    pub async fn block_preview(&self, kind: &str, target: &str) -> Result<Value, AppError> {
        let column = match kind {
            "user" => "identity_id",
            "source" => "ip_hash",
            _ => return Err(AppError::Unprocessable("Invalid block kind".into())),
        };
        let mut db = self.inner.lock().await;
        Ok(rows(&mut *db,format!("SELECT json_object('comments',count(*),'visible',sum(status='approved')) FROM comments WHERE {column}=? AND status!='removed'"),vec![target.into()]).await?.remove(0))
    }

    pub async fn block_comments(&self, input: &BlockInput, actor: &str) -> Result<Value, AppError> {
        let mut normalized = input.clone();
        normalized.target = match normalized.kind.as_str() {
            "user" => parse_uuid(normalized.target.trim())?.to_string(),
            "source" => normalized.target.trim().to_ascii_lowercase(),
            _ => normalized.target.clone(),
        };
        let input = &normalized;
        if input.reason.trim().is_empty() || input.reason.len() > 1000 {
            return Err(AppError::Unprocessable(
                "A reason of 1-1000 bytes is required".into(),
            ));
        }
        if input.hours.is_some_and(|h| !(1..=8760).contains(&h)) {
            return Err(AppError::Unprocessable(
                "Block duration must be 1-8760 hours or permanent".into(),
            ));
        }
        let column = match input.kind.as_str() {
            "user" => "identity_id",
            "source" => "ip_hash",
            _ => return Err(AppError::Unprocessable("Invalid block kind".into())),
        };
        if input.kind == "source"
            && (input.target.len() != 64 || !input.target.bytes().all(|b| b.is_ascii_hexdigit()))
        {
            return Err(AppError::Unprocessable("Invalid source identifier".into()));
        }
        let mut db = self.inner.lock().await;
        let mut tx = db.transaction().await?;
        lock(&mut tx).await?;
        if input.kind == "user"
            && models::Identity::filter_by_id(parse_uuid(&input.target)?)
                .first()
                .exec(&mut tx)
                .await?
                .is_none()
        {
            return Err(AppError::NotFound("User not found".into()));
        }
        let existing=rows(&mut tx,"SELECT json_object('count',count(*)) FROM comment_blocks WHERE kind=? AND target=? AND revoked_at IS NULL AND (expires_at IS NULL OR expires_at>unixepoch())".into(),vec![input.kind.clone().into(),input.target.clone().into()]).await?;
        if existing[0]["count"].as_i64().unwrap_or(0) > 0 {
            return Err(AppError::Conflict(
                "This target already has an active block. Manage the existing block first.".into(),
            ));
        }
        let id = uuid::Uuid::new_v4().to_string();
        sql(
            &mut tx,
            "INSERT INTO comment_blocks VALUES (?,?,?,?,?,?,?,NULL)".into(),
            vec![
                id.clone().into(),
                input.kind.clone().into(),
                input.target.clone().into(),
                input.reason.trim().into(),
                actor.into(),
                now().into(),
                input.hours.map(|h| now() + h * 3600).into(),
            ],
        )
        .await?;
        if input.kind == "source" {
            sql(
                &mut tx,
                "INSERT OR IGNORE INTO comment_sources VALUES (?,?,?)".into(),
                vec![input.target.clone().into(), now().into(), now().into()],
            )
            .await?;
        }
        sql(&mut tx,format!("INSERT INTO comment_moderation SELECT {},?,? FROM comments c WHERE {column}=? AND status IN ('approved','pending') ON CONFLICT(comment_id) DO UPDATE SET reason=excluded.reason, updated_at=excluded.updated_at",uid("c.id")),vec![format!("Blocked {}: {}",input.kind,input.reason.trim()).into(),now().into(),input.target.clone().into()]).await?;
        sql(&mut tx,format!("UPDATE comments SET status='hidden' WHERE {column}=? AND status IN ('approved','pending')"),vec![input.target.clone().into()]).await?;
        audit(
            &mut tx,
            "block",
            &format!("{}:{}", input.kind, input.target),
            actor,
            input.reason.trim(),
        )
        .await?;
        tx.commit().await?;
        Ok(json!({"id":id}))
    }
    pub async fn revoke_comment_block(&self, id: &str, actor: &str) -> Result<(), AppError> {
        let mut db = self.inner.lock().await;
        let mut tx = db.transaction().await?;
        lock(&mut tx).await?;
        let block = rows(
            &mut tx,
            "SELECT json_object('target',target,'kind',kind) FROM comment_blocks WHERE id=?".into(),
            vec![id.into()],
        )
        .await?;
        if block.is_empty() {
            return Err(AppError::NotFound("Block not found".into()));
        }
        sql(
            &mut tx,
            "UPDATE comment_blocks SET revoked_at=? WHERE id=? AND revoked_at IS NULL".into(),
            vec![now().into(), id.into()],
        )
        .await?;
        audit(
            &mut tx,
            "unblock",
            &format!(
                "{}:{}",
                block[0]["kind"].as_str().unwrap_or(""),
                block[0]["target"].as_str().unwrap_or("")
            ),
            actor,
            "Existing contributions remain hidden for review",
        )
        .await?;
        tx.commit().await?;
        Ok(())
    }
    pub async fn moderate_comment(
        &self,
        id: &str,
        action: &str,
        actor: &str,
        reason: &str,
    ) -> Result<Value, AppError> {
        let status = match action {
            "approve" => "approved",
            "spam" => "spam",
            "hide" => "hidden",
            "restore" => "pending",
            "remove" => "removed",
            _ => return Err(AppError::Unprocessable("Invalid moderation action".into())),
        };
        let mut db = self.inner.lock().await;
        let mut tx = db.transaction().await?;
        lock(&mut tx).await?;
        let c = models::Comment::filter_by_id(parse_uuid(id)?)
            .first()
            .exec(&mut tx)
            .await?
            .ok_or_else(|| AppError::NotFound("Comment not found".into()))?;
        if c.status == "removed" {
            return Err(AppError::Unprocessable(
                "Removed comments cannot be restored".into(),
            ));
        }
        if matches!(action, "approve" | "restore")
            && blocked(&mut tx, &c.ip_hash, c.identity_id.as_deref()).await?
        {
            return Err(AppError::Conflict(
                "Unblock the account and source before restoring contributions".into(),
            ));
        }
        if action == "remove" {
            toasty::update!(models::Comment::filter_by_id(c.id){status:status.to_owned(),body:String::new(),author_name:"Removed comment".to_owned()}).exec(&mut tx).await?;
        } else {
            toasty::update!(models::Comment::filter_by_id(c.id){status:status.to_owned()})
                .exec(&mut tx)
                .await?;
        }
        sql(&mut tx,"INSERT INTO comment_moderation VALUES (?,?,?) ON CONFLICT(comment_id) DO UPDATE SET reason=excluded.reason,updated_at=excluded.updated_at".into(),vec![id.into(),reason.into(),now().into()]).await?;
        audit(&mut tx, action, id, actor, reason).await?;
        tx.commit().await?;
        Ok(json!({"id":id,"status":status}))
    }

    pub async fn public_comment_page(
        &self,
        slug: &str,
        root: Option<&str>,
        page: i64,
        per: i64,
    ) -> Result<Value, AppError> {
        let mut db = self.inner.lock().await;
        let cid = uid("c.id");
        let pid = uid("p.id");
        let permitted = allowed("c");
        // Ancestors are included as redacted placeholders, never with hidden text.
        let descendant_id = uid("d.id");
        let descendant_allowed = allowed("d");
        let cte = format!(
            "WITH visible_comments AS (SELECT c.* FROM comments c WHERE c.article_slug=? AND ({permitted} OR EXISTS(SELECT 1 FROM comments d WHERE d.article_slug=c.article_slug AND {descendant_allowed} AND (d.thread_id=({cid}) OR d.parent_id=({cid}) OR EXISTS(SELECT 1 FROM comment_ancestors a WHERE a.comment_id=({descendant_id}) AND a.ancestor_id=({cid}))))))"
        );
        let baseargs = vec![slug.into()];
        if let Some(root) = root {
            let mut a = baseargs.clone();
            a.push(root.into());
            let found=rows(&mut *db,format!("{cte} SELECT json_object('count',count(*)) FROM visible_comments c WHERE ({cid})=? AND parent_id IS NULL"),a).await?;
            if found[0]["count"] == 0 {
                return Err(AppError::NotFound("discussion not found".into()));
            }
        }
        let condition = if root.is_some() {
            "c.thread_id=?"
        } else {
            "c.parent_id IS NULL"
        };
        let mut args = baseargs;
        if let Some(root) = root {
            args.push(root.into());
        }
        let total=rows(&mut *db,format!("{cte} SELECT json_object('total',count(*)) FROM visible_comments c WHERE {condition}"),args.clone()).await?[0]["total"].as_i64().unwrap_or(0);
        let per = per.clamp(1, 50);
        let page = page.clamp(1, ((total + per - 1) / per).max(1));
        let direction = if root.is_some() { "ASC" } else { "DESC" };
        args.push(per.into());
        args.push(((page - 1) * per).into());
        let items=rows(&mut *db,format!("{cte} SELECT json_object('id',{cid},'parent_id',c.parent_id,'thread_id',c.thread_id,'replying_to',(SELECT CASE WHEN {} THEN p.author_name ELSE 'Hidden comment' END FROM comments p WHERE ({pid})=c.parent_id),'reply_count',(SELECT count(*) FROM visible_comments r WHERE r.thread_id=({cid})),'removed',json(CASE WHEN {permitted} THEN 'false' ELSE 'true' END),'author_name',CASE WHEN {permitted} THEN c.author_name ELSE CASE WHEN c.status='removed' THEN 'Removed comment' ELSE 'Hidden comment' END END,'body',CASE WHEN {permitted} THEN c.body ELSE '' END,'created_at',c.created_at,'verified',json(CASE WHEN {permitted} AND c.identity_id IS NOT NULL THEN 'true' ELSE 'false' END)) FROM visible_comments c WHERE {condition} ORDER BY c.created_at {direction},c.id {direction} LIMIT ? OFFSET ?",allowed("p")),args).await?;
        Ok(json!({"items":items,"page":page,"per_page":per,"total":total}))
    }
}

pub(super) async fn record_ancestors(
    db: &mut dyn toasty::Executor,
    id: &str,
    parent: Option<&str>,
) -> Result<(), AppError> {
    if let Some(parent) = parent {
        sql(
            db,
            "INSERT OR IGNORE INTO comment_ancestors VALUES (?,?)".into(),
            vec![id.into(), parent.into()],
        )
        .await?;
        sql(db,"INSERT OR IGNORE INTO comment_ancestors SELECT ?,ancestor_id FROM comment_ancestors WHERE comment_id=?".into(),vec![id.into(),parent.into()]).await?;
    }
    Ok(())
}
pub(super) async fn backfill_ancestors(db: &mut dyn toasty::Executor) -> Result<(), AppError> {
    let comments = models::Comment::all().exec(&mut *db).await?;
    let parents: std::collections::HashMap<_, _> = comments
        .iter()
        .map(|c| (c.id.to_string(), c.parent_id.clone()))
        .collect();
    for comment in &comments {
        let mut parent = comment.parent_id.clone();
        let mut seen = std::collections::HashSet::new();
        while let Some(id) = parent {
            if !seen.insert(id.clone()) {
                break;
            }
            sql(
                db,
                "INSERT OR IGNORE INTO comment_ancestors VALUES (?,?)".into(),
                vec![comment.id.to_string().into(), id.clone().into()],
            )
            .await?;
            parent = parents.get(&id).cloned().flatten();
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    #[tokio::test]
    async fn expiry_keeps_history_hidden_and_telemetry_expires() {
        let db = Db::memory().await.unwrap();
        db.migrate().await.unwrap();
        let config = Config::for_test();
        let source = "a".repeat(64);
        let comment = db
            .admit_comment(
                NewComment {
                    article_slug: "test",
                    identity_id: None,
                    author_name: "User",
                    body: "Question",
                    status: "approved",
                    ip_hash: &source,
                    parent_id: None,
                    thread_id: None,
                },
                false,
                &config,
            )
            .await
            .unwrap()
            .unwrap();
        let block = db
            .block_comments(
                &BlockInput {
                    kind: "source".into(),
                    target: source.clone(),
                    reason: "Spam".into(),
                    hours: Some(24),
                },
                "admin",
            )
            .await
            .unwrap();
        {
            let mut connection = db.inner.lock().await;
            sql(
                &mut *connection,
                "UPDATE comment_blocks SET expires_at=? WHERE id=?".into(),
                vec![(now() - 1).into(), block["id"].as_str().unwrap().into()],
            )
            .await
            .unwrap();
            sql(
                &mut *connection,
                "INSERT INTO comment_abuse VALUES (?,?,?, ?,1)".into(),
                vec![
                    source.clone().into(),
                    "".into(),
                    "old".into(),
                    (now() - 31 * 86400).into(),
                ],
            )
            .await
            .unwrap();
        }
        assert_eq!(
            db.get_comment(&comment.id).await.unwrap().unwrap().status,
            "hidden"
        );
        db.admit_comment(
            NewComment {
                article_slug: "test",
                identity_id: None,
                author_name: "User",
                body: "New question",
                status: "pending",
                ip_hash: &source,
                parent_id: None,
                thread_id: None,
            },
            false,
            &config,
        )
        .await
        .unwrap();
        assert_eq!(
            db.moderation_page("events", &ModerationQuery::default())
                .await
                .unwrap()["total"],
            0
        );
        assert_eq!(
            db.moderation_page("blocks", &ModerationQuery::default())
                .await
                .unwrap()["items"][0]["active"],
            0
        );
    }
}

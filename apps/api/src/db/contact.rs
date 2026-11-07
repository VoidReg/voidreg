//! Admission control for the contact form: per-source and global limits and duplicate detection.
//! Only salted hashes are stored, never addresses or message text.
use super::moderation::{rows, sql};
use super::*;

pub const SCHEMA: &[&str] = &[
    "CREATE TABLE IF NOT EXISTS contact_attempts (id TEXT PRIMARY KEY, source TEXT NOT NULL, fingerprint TEXT NOT NULL, time INTEGER NOT NULL, outcome TEXT NOT NULL)",
    "CREATE INDEX IF NOT EXISTS contact_attempts_source_time ON contact_attempts(source,time)",
    "CREATE INDEX IF NOT EXISTS contact_attempts_time ON contact_attempts(time)",
];

/// Messages one source may send per hour and per day, and all sources together per day.
pub const SOURCE_PER_HOUR: i64 = 3;
pub const SOURCE_PER_DAY: i64 = 8;
pub const GLOBAL_PER_DAY: i64 = 100;
/// Attempt records, which also show delivery failures, are kept this long.
const RETAIN_SECS: i64 = 30 * 86_400;

#[derive(Debug, PartialEq, Eq)]
pub enum ContactAdmission {
    /// The message may be stored and sent. Carries the attempt id.
    Admitted(String),
    /// The same message was already accepted from this source recently.
    Duplicate,
    RateLimited,
}

impl Db {
    pub async fn admit_contact(
        &self,
        source: &str,
        fingerprint: &str,
        now: i64,
    ) -> Result<ContactAdmission, AppError> {
        let mut db = self.inner.lock().await;
        let mut tx = db.transaction().await?;
        sql(
            &mut tx,
            "DELETE FROM contact_attempts WHERE time<?".into(),
            vec![(now - RETAIN_SECS).into()],
        )
        .await?;
        let counts = rows(
            &mut tx,
            "SELECT json_object('hour',coalesce(sum(source=? AND time>?),0),'day',coalesce(sum(source=?),0),'all',count(*),'duplicate',coalesce(sum(source=? AND fingerprint=?),0)) FROM contact_attempts WHERE time>?"
                .into(),
            vec![
                source.into(),
                (now - 3600).into(),
                source.into(),
                source.into(),
                fingerprint.into(),
                (now - 86_400).into(),
            ],
        )
        .await?;
        let count = |key: &str| counts[0][key].as_i64().unwrap_or(0);
        let verdict = if count("duplicate") > 0 {
            ContactAdmission::Duplicate
        } else if count("hour") >= SOURCE_PER_HOUR
            || count("day") >= SOURCE_PER_DAY
            || count("all") >= GLOBAL_PER_DAY
        {
            ContactAdmission::RateLimited
        } else {
            let id = uuid::Uuid::new_v4().to_string();
            sql(
                &mut tx,
                "INSERT INTO contact_attempts VALUES (?,?,?,?,'stored')".into(),
                vec![
                    id.as_str().into(),
                    source.into(),
                    fingerprint.into(),
                    now.into(),
                ],
            )
            .await?;
            ContactAdmission::Admitted(id)
        };
        tx.commit().await?;
        Ok(verdict)
    }

    /// Records whether the notification email went out: `delivered`, `skipped` or `failed`.
    pub async fn set_contact_outcome(&self, id: &str, outcome: &str) -> Result<(), AppError> {
        let mut db = self.inner.lock().await;
        sql(
            &mut *db,
            "UPDATE contact_attempts SET outcome=? WHERE id=?".into(),
            vec![outcome.into(), id.into()],
        )
        .await
    }

    /// Stored messages and the recorded outcome of each admitted attempt, oldest first.
    pub async fn contact_summary(&self) -> Result<(usize, Vec<String>), AppError> {
        let mut db = self.inner.lock().await;
        let mut tx = db.transaction().await?;
        let messages = rows(
            &mut tx,
            "SELECT json_object('n',count(*)) FROM contact_messages".into(),
            vec![],
        )
        .await?;
        let attempts = rows(
            &mut tx,
            "SELECT json_object('outcome',outcome) FROM contact_attempts ORDER BY time,rowid"
                .into(),
            vec![],
        )
        .await?;
        tx.commit().await?;
        Ok((
            messages[0]["n"].as_u64().unwrap_or(0) as usize,
            attempts
                .iter()
                .map(|row| row["outcome"].as_str().unwrap_or_default().to_owned())
                .collect(),
        ))
    }
}

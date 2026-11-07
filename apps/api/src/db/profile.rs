//! Commenter profiles: one durable public identity per person, shared by every
//! sign-in provider they connect. Provider logins stay in `identities`; this
//! module owns the display name, avatar choice, and provider linking.
use super::moderation::{rows, sql, uid};
use super::*;
use crate::domain::{CommenterIdentity, CommenterProfile, LinkedAccount, ProfileUpdate};
use serde_json::{Value, json};

pub const SCHEMA: &[&str] = &[
    "CREATE TABLE IF NOT EXISTS profiles (id TEXT PRIMARY KEY, display_name TEXT NOT NULL, show_avatar INTEGER NOT NULL DEFAULT 0, avatar_identity_id TEXT, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL)",
    "CREATE UNIQUE INDEX IF NOT EXISTS profiles_display_name ON profiles(display_name COLLATE NOCASE)",
    "CREATE TABLE IF NOT EXISTS identity_profiles (identity_id TEXT PRIMARY KEY, profile_id TEXT NOT NULL, verified_email TEXT NOT NULL DEFAULT '', linked_at INTEGER NOT NULL)",
    "CREATE INDEX IF NOT EXISTS identity_profiles_profile ON identity_profiles(profile_id,linked_at)",
    "CREATE INDEX IF NOT EXISTS identity_profiles_email ON identity_profiles(verified_email)",
];

/// Path prefix of the avatar proxy, shared with the public comment query.
pub const AVATAR_PATH: &str = "/api/v1/avatars/";
pub const DISPLAY_NAME_MIN: usize = 2;
pub const DISPLAY_NAME_MAX: usize = 40;

/// Names nobody may take: they would read as the site, its owner, or a system label.
const RESERVED_NAMES: &[&str] = &[
    "voidreg",
    "admin",
    "administrator",
    "owner",
    "moderator",
    "mod",
    "staff",
    "support",
    "system",
    "root",
    "official",
    "security",
    "webmaster",
    "author",
    "anonymous",
    "guest",
    "deleteduser",
    "removedcomment",
    "hiddencomment",
];

fn now() -> i64 {
    time::OffsetDateTime::now_utc().unix_timestamp()
}

fn reserved_key(name: &str) -> String {
    name.chars()
        .filter(|c| c.is_alphanumeric())
        .flat_map(char::to_lowercase)
        .collect()
}

/// True when a name would impersonate the site or a system label.
pub fn is_reserved_name(name: &str) -> bool {
    let key = reserved_key(name);
    RESERVED_NAMES.iter().any(|reserved| *reserved == key)
}

fn is_invisible(c: char) -> bool {
    c.is_control()
        || matches!(c, '\u{200B}'..='\u{200F}' | '\u{202A}'..='\u{202E}' | '\u{2060}'..='\u{2064}' | '\u{2066}'..='\u{2069}' | '\u{FEFF}')
}

fn collapse(raw: &str) -> String {
    raw.split_whitespace().collect::<Vec<_>>().join(" ")
}

/// Validates a display name chosen by the person. Uniqueness is checked separately.
pub fn validate_display_name(raw: &str) -> Result<String, AppError> {
    if raw.chars().any(is_invisible) {
        return Err(AppError::Unprocessable(
            "Display names cannot contain control or invisible characters".into(),
        ));
    }
    let name = collapse(raw);
    let length = name.chars().count();
    if !(DISPLAY_NAME_MIN..=DISPLAY_NAME_MAX).contains(&length) {
        return Err(AppError::Unprocessable(format!(
            "Display names must be {DISPLAY_NAME_MIN}-{DISPLAY_NAME_MAX} characters"
        )));
    }
    if !name.chars().any(char::is_alphanumeric) {
        return Err(AppError::Unprocessable(
            "Display names need at least one letter or number".into(),
        ));
    }
    let lower = name.to_lowercase();
    if lower.contains("http://") || lower.contains("https://") || lower.contains("www.") {
        return Err(AppError::Unprocessable(
            "Display names cannot contain links".into(),
        ));
    }
    if is_reserved_name(&name) {
        return Err(AppError::Unprocessable(
            "That display name is reserved".into(),
        ));
    }
    Ok(name)
}

/// Best-effort starting name from the provider's name; never fails.
fn default_display_name(provider_name: &str) -> String {
    let cleaned: String = provider_name
        .chars()
        .filter(|c| !is_invisible(*c))
        .collect();
    let name: String = collapse(&cleaned).chars().take(DISPLAY_NAME_MAX).collect();
    match validate_display_name(&name) {
        Ok(name) => name,
        Err(_) => "Reader".to_owned(),
    }
}

fn suffixed(base: &str) -> String {
    let suffix = uuid::Uuid::new_v4().as_u128() % 10_000;
    let room = DISPLAY_NAME_MAX - 5;
    let head: String = base.chars().take(room).collect();
    format!("{} {suffix:04}", head.trim_end())
}

fn placeholders(count: usize) -> String {
    vec!["?"; count].join(",")
}

async fn profile_of(
    db: &mut dyn toasty::Executor,
    identity_id: &str,
) -> Result<Option<String>, AppError> {
    let found = rows(
        db,
        "SELECT json_object('profile_id',profile_id) FROM identity_profiles WHERE identity_id=?"
            .into(),
        vec![identity_id.into()],
    )
    .await?;
    Ok(found
        .first()
        .and_then(|row| row["profile_id"].as_str())
        .map(str::to_owned))
}

async fn name_taken(
    db: &mut dyn toasty::Executor,
    name: &str,
    except_profile: &str,
) -> Result<bool, AppError> {
    let found = rows(
        db,
        "SELECT json_object('count',count(*)) FROM profiles WHERE display_name=? COLLATE NOCASE AND id!=?"
            .into(),
        vec![name.into(), except_profile.into()],
    )
    .await?;
    Ok(found[0]["count"].as_i64().unwrap_or(0) > 0)
}

async fn identity_ids(
    db: &mut dyn toasty::Executor,
    profile_id: &str,
) -> Result<Vec<String>, AppError> {
    let found = rows(
        db,
        "SELECT json_object('identity_id',identity_id) FROM identity_profiles WHERE profile_id=? ORDER BY linked_at,identity_id"
            .into(),
        vec![profile_id.into()],
    )
    .await?;
    Ok(found
        .iter()
        .filter_map(|row| row["identity_id"].as_str().map(str::to_owned))
        .collect())
}

/// True when any of the identities carries an active moderation block.
async fn any_active_block(
    db: &mut dyn toasty::Executor,
    identities: &[String],
) -> Result<bool, AppError> {
    if identities.is_empty() {
        return Ok(false);
    }
    let found = rows(
        db,
        format!(
            "SELECT json_object('count',count(*)) FROM comment_blocks WHERE kind='user' AND target IN ({}) AND revoked_at IS NULL AND (expires_at IS NULL OR expires_at>unixepoch())",
            placeholders(identities.len())
        ),
        identities.iter().map(|id| id.as_str().into()).collect(),
    )
    .await?;
    Ok(found[0]["count"].as_i64().unwrap_or(0) > 0)
}

async fn create_profile(
    db: &mut dyn toasty::Executor,
    identity: &IdentityInfo,
) -> Result<String, AppError> {
    let base = default_display_name(&identity.name);
    let mut name = base.clone();
    for attempt in 0..16 {
        if !is_reserved_name(&name) && !name_taken(db, &name, "").await? {
            break;
        }
        name = if attempt == 15 {
            format!("Reader {}", &uuid::Uuid::new_v4().simple().to_string()[..8])
        } else {
            suffixed(&base)
        };
    }
    let id = uuid::Uuid::new_v4().to_string();
    sql(
        db,
        "INSERT INTO profiles (id,display_name,show_avatar,avatar_identity_id,created_at,updated_at) VALUES (?,?,0,?,?,?)"
            .into(),
        vec![
            id.clone().into(),
            name.into(),
            identity.id.clone().into(),
            now().into(),
            now().into(),
        ],
    )
    .await?;
    Ok(id)
}

async fn link_identity(
    db: &mut dyn toasty::Executor,
    identity_id: &str,
    profile_id: &str,
    verified_email: &str,
) -> Result<(), AppError> {
    sql(
        db,
        "INSERT INTO identity_profiles (identity_id,profile_id,verified_email,linked_at) VALUES (?,?,?,?)"
            .into(),
        vec![
            identity_id.into(),
            profile_id.into(),
            verified_email.into(),
            now().into(),
        ],
    )
    .await?;
    sql(
        db,
        "UPDATE profiles SET avatar_identity_id=? WHERE id=? AND avatar_identity_id IS NULL".into(),
        vec![identity_id.into(), profile_id.into()],
    )
    .await
}

/// Finds or creates the profile for an identity. `link_to` is an explicit
/// request, made while signed in, to attach this provider to that profile.
async fn attach_in(
    db: &mut dyn toasty::Executor,
    identity: &IdentityInfo,
    verified_email: &str,
    link_to: Option<&str>,
) -> Result<String, AppError> {
    let existing = profile_of(db, &identity.id).await?;
    match (existing, link_to) {
        (Some(current), Some(target)) if current != target => Err(AppError::Conflict(
            "That account is already connected to another profile.".into(),
        )),
        (Some(current), _) => {
            sql(
                db,
                "UPDATE identity_profiles SET verified_email=? WHERE identity_id=?".into(),
                vec![verified_email.into(), identity.id.clone().into()],
            )
            .await?;
            Ok(current)
        }
        (None, Some(target)) => {
            let found = rows(
                db,
                "SELECT json_object('count',count(*)) FROM profiles WHERE id=?".into(),
                vec![target.into()],
            )
            .await?;
            if found[0]["count"].as_i64().unwrap_or(0) == 0 {
                return Err(AppError::NotFound("Profile not found".into()));
            }
            link_identity(db, &identity.id, target, verified_email).await?;
            Ok(target.to_owned())
        }
        (None, None) => {
            if !verified_email.is_empty() {
                let found = rows(
                    db,
                    "SELECT json_object('profile_id',profile_id) FROM identity_profiles WHERE verified_email=? AND identity_id!=? ORDER BY linked_at LIMIT 1"
                        .into(),
                    vec![verified_email.into(), identity.id.clone().into()],
                )
                .await?;
                if let Some(profile_id) = found.first().and_then(|row| row["profile_id"].as_str()) {
                    link_identity(db, &identity.id, profile_id, verified_email).await?;
                    return Ok(profile_id.to_owned());
                }
            }
            let profile_id = create_profile(db, identity).await?;
            link_identity(db, &identity.id, &profile_id, verified_email).await?;
            Ok(profile_id)
        }
    }
}

async fn load_profile(
    db: &mut dyn toasty::Executor,
    profile_id: &str,
    current_identity: Option<&str>,
) -> Result<Option<CommenterProfile>, AppError> {
    let head = rows(
        db,
        "SELECT json_object('id',id,'display_name',display_name,'show_avatar',json(CASE WHEN show_avatar=1 THEN 'true' ELSE 'false' END),'avatar_identity_id',avatar_identity_id,'updated_at',updated_at) FROM profiles WHERE id=?"
            .into(),
        vec![profile_id.into()],
    )
    .await?;
    let Some(head) = head.first() else {
        return Ok(None);
    };
    let accounts = rows(
        db,
        format!(
            "SELECT json_object('identity_id',ip.identity_id,'provider',i.provider,'name',i.name,'email',i.email,'has_avatar',json(CASE WHEN i.avatar_url IS NOT NULL AND i.avatar_url!='' THEN 'true' ELSE 'false' END)) FROM identity_profiles ip JOIN identities i ON ({})=ip.identity_id WHERE ip.profile_id=? ORDER BY ip.linked_at,ip.identity_id",
            uid("i.id")
        ),
        vec![profile_id.into()],
    )
    .await?;
    let linked: Vec<LinkedAccount> = accounts
        .iter()
        .map(|row| {
            let identity_id = row["identity_id"].as_str().unwrap_or_default().to_owned();
            LinkedAccount {
                current: current_identity == Some(identity_id.as_str()),
                identity_id,
                provider: row["provider"].as_str().unwrap_or_default().to_owned(),
                name: row["name"].as_str().unwrap_or_default().to_owned(),
                email: row["email"].as_str().unwrap_or_default().to_owned(),
                has_avatar: row["has_avatar"].as_bool().unwrap_or(false),
            }
        })
        .collect();
    let show_avatar = head["show_avatar"].as_bool().unwrap_or(false);
    let avatar_identity_id = head["avatar_identity_id"].as_str().map(str::to_owned);
    let avatar_ready = linked
        .iter()
        .any(|a| a.has_avatar && Some(&a.identity_id) == avatar_identity_id.as_ref());
    let id = head["id"].as_str().unwrap_or_default().to_owned();
    let avatar_url = (show_avatar && avatar_ready).then(|| {
        format!(
            "{AVATAR_PATH}{id}?v={}",
            head["updated_at"].as_i64().unwrap_or(0)
        )
    });
    Ok(Some(CommenterProfile {
        id,
        display_name: head["display_name"].as_str().unwrap_or_default().to_owned(),
        show_avatar,
        avatar_url,
        avatar_identity_id,
        linked,
    }))
}

/// Removes an identity row with everything that references it.
async fn purge_identity(db: &mut dyn toasty::Executor, identity_id: &str) -> Result<(), AppError> {
    for statement in [
        "DELETE FROM sessions WHERE identity_id=?",
        "DELETE FROM mcp_tokens WHERE identity_id=?",
        "DELETE FROM comment_source_accounts WHERE identity_id=?",
        "DELETE FROM comment_abuse WHERE identity_id=?",
        "UPDATE comment_attempts SET identity_id=NULL WHERE identity_id=?",
        "DELETE FROM identity_profiles WHERE identity_id=?",
    ] {
        sql(db, statement.into(), vec![identity_id.into()]).await?;
    }
    models::Identity::filter_by_id(parse_uuid(identity_id)?)
        .delete()
        .exec(db)
        .await?;
    Ok(())
}

impl Db {
    /// Links a signed-in identity to a profile, creating one when needed.
    /// Verified emails join an existing profile that holds the same verified
    /// email, so one person signing in with two providers stays one person.
    pub async fn attach_profile(
        &self,
        identity: &IdentityInfo,
        email_verified: bool,
        link_to: Option<&str>,
    ) -> Result<String, AppError> {
        let verified = if email_verified {
            identity.email.trim().to_lowercase()
        } else {
            String::new()
        };
        let mut db = self.inner.lock().await;
        let mut tx = db.transaction().await?;
        let id = attach_in(&mut tx, identity, &verified, link_to).await?;
        tx.commit().await?;
        Ok(id)
    }

    /// Resolves the commenter behind a session identity along with their
    /// profile, creating the profile for sessions that predate profiles.
    pub async fn commenter_by_identity(
        &self,
        identity_id: &str,
    ) -> Result<Option<(CommenterIdentity, CommenterProfile)>, AppError> {
        let Ok(uuid) = uuid::Uuid::parse_str(identity_id) else {
            return Ok(None);
        };
        let mut db = self.inner.lock().await;
        let Some(row) = models::Identity::filter_by_id(uuid)
            .first()
            .exec(&mut *db)
            .await?
        else {
            return Ok(None);
        };
        let info = identity_from_row(row);
        let profile_id = match profile_of(&mut *db, &info.id).await? {
            Some(id) => id,
            None => {
                let mut tx = db.transaction().await?;
                let id = attach_in(&mut tx, &info, "", None).await?;
                tx.commit().await?;
                id
            }
        };
        let Some(profile) = load_profile(&mut *db, &profile_id, Some(&info.id)).await? else {
            return Ok(None);
        };
        let identity = CommenterIdentity {
            id: info.id,
            provider: info.provider,
            name: profile.display_name.clone(),
            email: info.email,
            avatar_url: profile.avatar_url.clone(),
        };
        Ok(Some((identity, profile)))
    }

    /// Profile of the identity behind a live commenter session token hash.
    pub async fn profile_id_for_identity(
        &self,
        identity_id: &str,
    ) -> Result<Option<String>, AppError> {
        let mut db = self.inner.lock().await;
        profile_of(&mut *db, identity_id).await
    }

    pub async fn update_profile(
        &self,
        profile_id: &str,
        current_identity: &str,
        update: &ProfileUpdate,
    ) -> Result<CommenterProfile, AppError> {
        let name = update
            .display_name
            .as_deref()
            .map(validate_display_name)
            .transpose()?;
        let mut db = self.inner.lock().await;
        let mut tx = db.transaction().await?;
        if let Some(name) = &name {
            if name_taken(&mut tx, name, profile_id).await? {
                return Err(AppError::Conflict("That display name is taken.".into()));
            }
            sql(
                &mut tx,
                "UPDATE profiles SET display_name=? WHERE id=?".into(),
                vec![name.as_str().into(), profile_id.into()],
            )
            .await?;
        }
        if let Some(show) = update.show_avatar {
            sql(
                &mut tx,
                "UPDATE profiles SET show_avatar=? WHERE id=?".into(),
                vec![i64::from(show).into(), profile_id.into()],
            )
            .await?;
        }
        if let Some(source) = update.avatar_identity_id.as_deref() {
            if !identity_ids(&mut tx, profile_id)
                .await?
                .iter()
                .any(|id| id == source)
            {
                return Err(AppError::Unprocessable(
                    "That account is not connected to your profile".into(),
                ));
            }
            sql(
                &mut tx,
                "UPDATE profiles SET avatar_identity_id=? WHERE id=?".into(),
                vec![source.into(), profile_id.into()],
            )
            .await?;
        }
        sql(
            &mut tx,
            "UPDATE profiles SET updated_at=? WHERE id=?".into(),
            vec![now().into(), profile_id.into()],
        )
        .await?;
        let profile = load_profile(&mut tx, profile_id, Some(current_identity))
            .await?
            .ok_or_else(|| AppError::NotFound("Profile not found".into()))?;
        tx.commit().await?;
        Ok(profile)
    }

    /// Disconnects one provider account. Its comments move to the account the
    /// session uses, so they stay on the profile.
    pub async fn unlink_account(
        &self,
        profile_id: &str,
        current_identity: &str,
        identity_id: &str,
        protected: impl Fn(&str, &str) -> bool,
    ) -> Result<CommenterProfile, AppError> {
        let mut db = self.inner.lock().await;
        let mut tx = db.transaction().await?;
        let linked = identity_ids(&mut tx, profile_id).await?;
        if !linked.iter().any(|id| id == identity_id) {
            return Err(AppError::NotFound("Connected account not found".into()));
        }
        if linked.len() < 2 {
            return Err(AppError::Conflict(
                "Connect another account before disconnecting this one.".into(),
            ));
        }
        if identity_id == current_identity {
            return Err(AppError::Conflict(
                "Sign in with another connected account to disconnect this one.".into(),
            ));
        }
        let row = models::Identity::filter_by_id(parse_uuid(identity_id)?)
            .first()
            .exec(&mut tx)
            .await?
            .ok_or_else(|| AppError::NotFound("Connected account not found".into()))?;
        if protected(&row.provider, &row.subject) {
            return Err(AppError::Forbidden(
                "Site owner accounts cannot be disconnected here.".into(),
            ));
        }
        if any_active_block(&mut tx, &linked).await? {
            return Err(AppError::Forbidden(
                "Accounts under moderation review cannot be changed. Contact the site owner."
                    .into(),
            ));
        }
        sql(
            &mut tx,
            "UPDATE comments SET identity_id=? WHERE identity_id=?".into(),
            vec![current_identity.into(), identity_id.into()],
        )
        .await?;
        sql(
            &mut tx,
            "UPDATE profiles SET avatar_identity_id=? WHERE id=? AND avatar_identity_id=?".into(),
            vec![
                current_identity.into(),
                profile_id.into(),
                identity_id.into(),
            ],
        )
        .await?;
        sql(
            &mut tx,
            "UPDATE profiles SET updated_at=? WHERE id=?".into(),
            vec![now().into(), profile_id.into()],
        )
        .await?;
        purge_identity(&mut tx, identity_id).await?;
        let profile = load_profile(&mut tx, profile_id, Some(current_identity))
            .await?
            .ok_or_else(|| AppError::NotFound("Profile not found".into()))?;
        tx.commit().await?;
        Ok(profile)
    }

    /// Signs the person out on every device.
    pub async fn delete_profile_sessions(&self, profile_id: &str) -> Result<(), AppError> {
        let mut db = self.inner.lock().await;
        sql(
            &mut *db,
            "DELETE FROM sessions WHERE kind='commenter' AND identity_id IN (SELECT identity_id FROM identity_profiles WHERE profile_id=?)"
                .into(),
            vec![profile_id.into()],
        )
        .await
    }

    /// Everything stored about the person, for the export download.
    pub async fn export_profile(&self, profile_id: &str) -> Result<Value, AppError> {
        let mut db = self.inner.lock().await;
        let profile = load_profile(&mut *db, profile_id, None)
            .await?
            .ok_or_else(|| AppError::NotFound("Profile not found".into()))?;
        let identities = identity_ids(&mut *db, profile_id).await?;
        let comments = if identities.is_empty() {
            vec![]
        } else {
            rows(
                &mut *db,
                format!(
                    "SELECT json_object('id',{},'article',article_slug,'body',body,'status',status,'created_at',created_at) FROM comments WHERE identity_id IN ({}) ORDER BY created_at",
                    uid("comments.id"),
                    placeholders(identities.len())
                ),
                identities.iter().map(|id| id.as_str().into()).collect(),
            )
            .await?
        };
        Ok(json!({
            "profile": {
                "display_name": profile.display_name,
                "show_avatar": profile.show_avatar,
            },
            "accounts": profile.linked.iter().map(|a| json!({
                "provider": a.provider,
                "name": a.name,
                "email": a.email,
            })).collect::<Vec<_>>(),
            "comments": comments,
        }))
    }

    /// Deletes the profile and every connected account. Comments stay in their
    /// threads as "Deleted user", or are removed when asked.
    pub async fn delete_profile(
        &self,
        profile_id: &str,
        remove_comments: bool,
        protected: impl Fn(&str, &str) -> bool,
    ) -> Result<(), AppError> {
        let mut db = self.inner.lock().await;
        let mut tx = db.transaction().await?;
        let identities = identity_ids(&mut tx, profile_id).await?;
        for id in &identities {
            let row = models::Identity::filter_by_id(parse_uuid(id)?)
                .first()
                .exec(&mut tx)
                .await?;
            if row.is_some_and(|row| protected(&row.provider, &row.subject)) {
                return Err(AppError::Forbidden(
                    "Site owner accounts cannot be deleted here.".into(),
                ));
            }
        }
        if any_active_block(&mut tx, &identities).await? {
            return Err(AppError::Forbidden(
                "Accounts under moderation review cannot be deleted. Contact the site owner."
                    .into(),
            ));
        }
        if !identities.is_empty() {
            let statement = if remove_comments {
                "UPDATE comments SET status='removed',body='',author_name='Removed comment',identity_id=NULL"
            } else {
                "UPDATE comments SET author_name='Deleted user',identity_id=NULL"
            };
            sql(
                &mut tx,
                format!(
                    "{statement} WHERE identity_id IN ({})",
                    placeholders(identities.len())
                ),
                identities.iter().map(|id| id.as_str().into()).collect(),
            )
            .await?;
        }
        for id in &identities {
            purge_identity(&mut tx, id).await?;
        }
        sql(
            &mut tx,
            "DELETE FROM profiles WHERE id=?".into(),
            vec![profile_id.into()],
        )
        .await?;
        tx.commit().await?;
        Ok(())
    }

    /// Provider photo URL for the proxy, only while the person shows their photo.
    pub async fn avatar_source(&self, profile_id: &str) -> Result<Option<String>, AppError> {
        let mut db = self.inner.lock().await;
        let found = rows(
            &mut *db,
            format!(
                "SELECT json_object('url',i.avatar_url) FROM profiles p JOIN identities i ON ({})=p.avatar_identity_id WHERE p.id=? AND p.show_avatar=1",
                uid("i.id")
            ),
            vec![profile_id.into()],
        )
        .await?;
        Ok(found
            .first()
            .and_then(|row| row["url"].as_str())
            .filter(|url| !url.is_empty())
            .map(str::to_owned))
    }

    /// True when a signed-in member already uses this name.
    pub async fn display_name_in_use(&self, name: &str) -> Result<bool, AppError> {
        let mut db = self.inner.lock().await;
        name_taken(&mut *db, name.trim(), "").await
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn display_names_are_cleaned_and_policed() {
        assert_eq!(
            validate_display_name("  Ada   Lovelace ").unwrap(),
            "Ada Lovelace"
        );
        assert!(validate_display_name("A").is_err());
        assert!(validate_display_name(&"x".repeat(41)).is_err());
        assert!(validate_display_name("Ada\u{202E}evol").is_err());
        assert!(validate_display_name("***").is_err());
        assert!(validate_display_name("see https://spam.example").is_err());
        assert!(validate_display_name("Void-Reg").is_err());
        assert!(validate_display_name("ADMIN").is_err());
        assert!(validate_display_name("Deleted  User").is_err());
    }

    #[test]
    fn provider_names_fall_back_to_a_safe_default() {
        assert_eq!(default_display_name("Grace Hopper"), "Grace Hopper");
        assert_eq!(default_display_name(""), "Reader");
        assert_eq!(default_display_name("admin"), "Reader");
        assert!(default_display_name(&"y".repeat(100)).chars().count() <= DISPLAY_NAME_MAX);
        assert!(suffixed(&"z".repeat(40)).chars().count() <= DISPLAY_NAME_MAX);
    }
}

//! Trusted server-side compilation. Browser artifacts never authorize publication.
use crate::{config::Config, db::Db, error::AppError};
use serde_json::{Value, json};
use sha2::{Digest, Sha256};

fn url(config: &Config) -> &str {
    config.compiler_url.trim_end_matches('/')
}
fn client() -> Result<reqwest::Client, AppError> {
    reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(15))
        .build()
        .map_err(|e| AppError::Internal(e.to_string()))
}
fn key(config: &Config) -> Result<&str, AppError> {
    config.compiler_token.as_deref().ok_or_else(|| {
        AppError::ServiceUnavailable("Publishing compiler is not configured.".into())
    })
}
pub async fn request(config: &Config, path: &str, body: Option<&Value>) -> Result<Value, AppError> {
    let client = client()?;
    let endpoint = format!("{}{path}", url(config));
    let request = if let Some(value) = body {
        client.post(endpoint).json(value)
    } else {
        client.get(endpoint)
    };
    let response = request
        .header("X-Compiler-Key", key(config)?)
        .send()
        .await
        .map_err(|_| {
            AppError::ServiceUnavailable(
                "Publishing compiler is unavailable. Your draft is saved; retry compilation."
                    .into(),
            )
        })?;
    let status = response.status();
    let value: Value = response.json().await.map_err(|_| {
        AppError::ServiceUnavailable("Invalid publishing compiler response.".into())
    })?;
    if !status.is_success() {
        return Err(if status.as_u16() == 404 {
            AppError::NotFound("Compilation not found. Compile again.".into())
        } else if status.as_u16() == 429 {
            AppError::TooManyRequests("Compilation queue is full. Retry shortly.".into())
        } else {
            AppError::Unprocessable(
                value["error"]
                    .as_str()
                    .unwrap_or("Compilation failed.")
                    .into(),
            )
        });
    }
    Ok(value)
}
pub fn kind(value: &str) -> Result<&'static str, AppError> {
    match value {
        "articles" | "article" => Ok("article"),
        "projects" | "project" => Ok("project"),
        _ => Err(AppError::NotFound("Content kind not found.".into())),
    }
}
pub fn valid_id(id: &str) -> Result<(), AppError> {
    uuid::Uuid::parse_str(id)
        .map(|_| ())
        .map_err(|_| AppError::NotFound("Compilation not found.".into()))
}
pub fn valid_asset(name: &str) -> bool {
    name.strip_suffix(".png")
        .and_then(|s| s.rsplit_once('-'))
        .is_some_and(|(hash, mode)| {
            hash.len() == 64
                && hash
                    .bytes()
                    .all(|b| b.is_ascii_hexdigit() && !b.is_ascii_uppercase())
                && matches!(mode, "light" | "dark")
        })
}
pub async fn asset(config: &Config, name: &str) -> Result<Vec<u8>, AppError> {
    if !valid_asset(name) {
        return Err(AppError::NotFound("Image not found.".into()));
    }
    let response = client()?
        .get(format!("{}/assets/{name}", url(config)))
        .header("X-Compiler-Key", key(config)?)
        .send()
        .await
        .map_err(|_| AppError::ServiceUnavailable("Diagram image is unavailable.".into()))?;
    if !response.status().is_success() {
        return Err(AppError::NotFound("Image not found.".into()));
    }
    let bytes = response
        .bytes()
        .await
        .map_err(|e| AppError::Internal(e.to_string()))?;
    if bytes.len() > 4 * 1024 * 1024 {
        return Err(AppError::Internal(
            "Generated image exceeds size limit.".into(),
        ));
    }
    Ok(bytes.to_vec())
}
pub async fn start(
    config: &Config,
    db: &Db,
    kind: &str,
    slug: &str,
    revision: i64,
    published: bool,
) -> Result<Value, AppError> {
    let working = db.content_get(kind, slug, false).await?;
    if working["revision"].as_i64() != Some(revision) {
        return Err(AppError::Conflict(
            "Content changed. Save and compile again.".into(),
        ));
    }
    let source = if published {
        db.content_get(kind, slug, true).await?
    } else {
        working
    };
    request(config,"/jobs",Some(&json!({"kind":kind,"slug":slug,"revision":revision,"snapshot":if published {"published"} else {"working"},"title":source["title"],"document":source["document"]}))).await
}

pub fn private_preview(job: &mut Value) {
    if let Some(html) = job["artifact"]["html"].as_str() {
        let html = html.replace("/media/diagrams/", "/api/v1/admin/compilations/assets/");
        job["artifact"]["html"] = json!(html);
        let identity = job["artifact"]["identity"].as_str().unwrap_or_default();
        job["artifact"]["identity"] = json!(hex::encode(Sha256::digest(format!(
            "{identity}:private-preview"
        ))));
    }
}
pub async fn verified(
    config: &Config,
    db: &Db,
    kind: &str,
    slug: &str,
    revision: i64,
    id: Option<&str>,
) -> Result<Value, AppError> {
    let id = id.ok_or_else(|| {
        AppError::Unprocessable("Compile the saved draft before publishing.".into())
    })?;
    valid_id(id)?;
    let job = request(config, &format!("/jobs/{id}"), None).await?;
    let current = db.content_get(kind, slug, false).await?;
    if job["snapshot"] == "published"
        || current["revision"].as_i64() != Some(revision)
        || job["revision"].as_i64() != Some(revision)
        || job["kind"] != kind
        || job["slug"] != slug
        || job["document"] != current["document"]
        || job["title"] != current["title"]
    {
        return Err(AppError::Conflict(
            "Content changed after compilation. Save and compile again.".into(),
        ));
    }
    if job["state"] != "ready"
        || job["diagnostics"]
            .as_array()
            .is_none_or(|d| d.iter().any(|d| d["level"] == "error"))
    {
        return Err(AppError::Unprocessable(
            "Resolve compilation errors before publishing.".into(),
        ));
    }
    let artifact = job["artifact"].clone();
    crate::domain::document::validate_compiled(&artifact.to_string())?;
    Ok(artifact)
}

pub async fn verified_publication(
    config: &Config,
    db: &Db,
    kind: &str,
    slug: &str,
    revision: i64,
    id: &str,
) -> Result<Value, AppError> {
    valid_id(id)?;
    let job = request(config, &format!("/jobs/{id}"), None).await?;
    let working = db.content_get(kind, slug, false).await?;
    let published = db.content_get(kind, slug, true).await?;
    if working["revision"].as_i64() != Some(revision)
        || job["revision"].as_i64() != Some(revision)
        || job["snapshot"] != "published"
        || job["kind"] != kind
        || job["slug"] != slug
        || job["document"] != published["document"]
        || job["title"] != published["title"]
    {
        return Err(AppError::Conflict(
            "Publication changed. Compile its published snapshot again.".into(),
        ));
    }
    if job["state"] != "ready"
        || job["diagnostics"]
            .as_array()
            .is_none_or(|d| d.iter().any(|d| d["level"] == "error"))
    {
        return Err(AppError::Unprocessable(
            "Published snapshot compilation failed.".into(),
        ));
    }
    crate::domain::document::validate_compiled(&job["artifact"].to_string())?;
    Ok(job["artifact"].clone())
}

static PREVIEW_CACHE: std::sync::LazyLock<
    std::sync::Mutex<std::collections::HashMap<(String, i64), Value>>,
> = std::sync::LazyLock::new(Default::default);
const PREVIEW_CACHE_LIMIT: usize = 64;
const PREVIEW_POLL_ATTEMPTS: usize = 40;

/// Compiles the saved working copy with the trusted compiler for the private site preview.
/// Results are cached per `(id, revision)`, so every save naturally invalidates the cache.
/// Returns `{state: "ready", item, diagnostics}`, `{state: "failed", diagnostics}` or
/// `{state: "pending"}` when the compiler is slow; nothing here can publish content.
pub async fn preview(config: &Config, db: &Db, kind: &str, slug: &str) -> Result<Value, AppError> {
    let mut item = db.content_get(kind, slug, false).await?;
    let revision = item["revision"].as_i64().unwrap_or(0);
    let key = (item["id"].as_str().unwrap_or("").to_owned(), revision);
    let cached = PREVIEW_CACHE.lock().ok().and_then(|c| c.get(&key).cloned());
    let (artifact, diagnostics) = if let Some(artifact) = cached {
        (artifact, json!([]))
    } else {
        let started = start(config, db, kind, slug, revision, false).await?;
        let id = started["id"].as_str().unwrap_or_default().to_owned();
        valid_id(&id)?;
        // The start response is only a receipt; always read the job itself.
        let mut job = request(config, &format!("/jobs/{id}"), None).await?;
        for _ in 0..PREVIEW_POLL_ATTEMPTS {
            if job["state"] == "ready" || job["state"] == "failed" {
                break;
            }
            tokio::time::sleep(std::time::Duration::from_millis(250)).await;
            job = request(config, &format!("/jobs/{id}"), None).await?;
        }
        match job["state"].as_str() {
            Some("ready") => {
                private_preview(&mut job);
                let artifact = job["artifact"].clone();
                crate::domain::document::validate_compiled(&artifact.to_string())?;
                let has_errors = job["diagnostics"]
                    .as_array()
                    .is_some_and(|d| d.iter().any(|d| d["level"] == "error"));
                if !has_errors && let Ok(mut cache) = PREVIEW_CACHE.lock() {
                    if cache.len() >= PREVIEW_CACHE_LIMIT {
                        cache.clear();
                    }
                    cache.insert(key, artifact.clone());
                }
                (artifact, job["diagnostics"].clone())
            }
            Some("failed") => {
                return Ok(json!({"state": "failed", "diagnostics": job["diagnostics"]}));
            }
            _ => return Ok(json!({"state": "pending"})),
        }
    };
    item["compiled"] = artifact;
    Ok(json!({"state": "ready", "item": item, "diagnostics": diagnostics}))
}

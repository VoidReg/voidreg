//! Avatar proxy. Readers load commenter photos from this site, never from
//! GitHub or Google, so a provider cannot see who reads which discussion.
use std::collections::HashMap;
use std::sync::Mutex;
use std::time::{Duration, Instant};

use actix_web::http::header;
use actix_web::{HttpResponse, get, web};

use crate::config::Config;
use crate::db::Db;
use crate::error::AppError;

const MAX_AVATAR_BYTES: usize = 512 * 1024;
const AVATAR_SIZE: u32 = 160;
const CACHE_TTL: Duration = Duration::from_secs(3600);
const FAILURE_TTL: Duration = Duration::from_secs(60);
const CACHE_ENTRIES: usize = 256;
const BUILTIN_HOSTS: &[&str] = &[
    "avatars.githubusercontent.com",
    "lh3.googleusercontent.com",
    "lh4.googleusercontent.com",
    "lh5.googleusercontent.com",
    "lh6.googleusercontent.com",
];

struct Cached {
    at: Instant,
    image: Option<(Vec<u8>, &'static str)>,
}

/// Small in-memory cache keyed by profile and source URL, so a changed photo
/// or a different provider never serves a stale image.
#[derive(Default)]
pub struct AvatarCache {
    entries: Mutex<HashMap<String, Cached>>,
}

impl AvatarCache {
    fn get(&self, key: &str) -> Option<Option<(Vec<u8>, &'static str)>> {
        let entries = self.entries.lock().unwrap_or_else(|e| e.into_inner());
        let hit = entries.get(key)?;
        let ttl = if hit.image.is_some() {
            CACHE_TTL
        } else {
            FAILURE_TTL
        };
        (hit.at.elapsed() < ttl).then(|| hit.image.clone())
    }

    fn put(&self, key: String, image: Option<(Vec<u8>, &'static str)>) {
        let mut entries = self.entries.lock().unwrap_or_else(|e| e.into_inner());
        if entries.len() >= CACHE_ENTRIES {
            let now = Instant::now();
            entries.retain(|_, v| now.duration_since(v.at) < CACHE_TTL);
            if entries.len() >= CACHE_ENTRIES
                && let Some(oldest) = entries
                    .iter()
                    .min_by_key(|(_, v)| v.at)
                    .map(|(k, _)| k.clone())
            {
                entries.remove(&oldest);
            }
        }
        entries.insert(
            key,
            Cached {
                at: Instant::now(),
                image,
            },
        );
    }
}

fn is_loopback(host: &str) -> bool {
    matches!(host, "localhost" | "127.0.0.1" | "::1" | "[::1]")
}

/// Accepts only HTTPS URLs on known photo hosts. Extra hosts come from
/// `AVATAR_HOSTS`; plain HTTP is allowed only for loopback test servers.
fn allowed_source(config: &Config, url: &reqwest::Url) -> bool {
    let Some(host) = url.host_str() else {
        return false;
    };
    let host = host.to_ascii_lowercase();
    if !url.username().is_empty() || url.password().is_some() {
        return false;
    }
    if url.scheme() == "https" && url.port().is_none() && BUILTIN_HOSTS.contains(&host.as_str()) {
        return true;
    }
    let host_port = url.port().map_or(host.clone(), |p| format!("{host}:{p}"));
    let listed = config
        .avatar_hosts
        .iter()
        .any(|h| h.eq_ignore_ascii_case(&host_port) || h.eq_ignore_ascii_case(&host));
    listed && (url.scheme() == "https" || (url.scheme() == "http" && is_loopback(&host)))
}

/// Asks the provider for a small square rather than the full-size original.
fn sized(url: &reqwest::Url) -> reqwest::Url {
    let mut url = url.clone();
    match url.host_str() {
        Some("avatars.githubusercontent.com") => {
            let kept: Vec<(String, String)> = url
                .query_pairs()
                .filter(|(k, _)| k != "s")
                .map(|(k, v)| (k.into_owned(), v.into_owned()))
                .collect();
            url.query_pairs_mut()
                .clear()
                .extend_pairs(kept)
                .append_pair("s", &AVATAR_SIZE.to_string());
        }
        Some(host) if host.ends_with(".googleusercontent.com") => {
            let path = url.path().to_owned();
            let base = match path.rsplit_once('=') {
                Some((head, tail)) if tail.starts_with('s') => head.to_owned(),
                _ => path,
            };
            url.set_path(&format!("{base}=s{AVATAR_SIZE}-c"));
        }
        _ => {}
    }
    url
}

fn sniff(bytes: &[u8]) -> Option<&'static str> {
    if bytes.starts_with(b"\x89PNG\r\n\x1a\n") {
        Some("image/png")
    } else if bytes.starts_with(&[0xFF, 0xD8, 0xFF]) {
        Some("image/jpeg")
    } else if bytes.starts_with(b"GIF87a") || bytes.starts_with(b"GIF89a") {
        Some("image/gif")
    } else if bytes.len() > 12 && &bytes[..4] == b"RIFF" && &bytes[8..12] == b"WEBP" {
        Some("image/webp")
    } else {
        None
    }
}

async fn fetch(config: &Config, source: &str) -> Result<(Vec<u8>, &'static str), AppError> {
    let url = reqwest::Url::parse(source)
        .map_err(|_| AppError::NotFound("avatar unavailable".to_owned()))?;
    if !allowed_source(config, &url) {
        return Err(AppError::NotFound("avatar unavailable".to_owned()));
    }
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(8))
        .redirect(reqwest::redirect::Policy::none())
        .build()
        .map_err(|err| AppError::Internal(err.to_string()))?;
    let mut response = client
        .get(sized(&url))
        .header(reqwest::header::USER_AGENT, "voidreg-api")
        .header(
            reqwest::header::ACCEPT,
            "image/png,image/jpeg,image/webp,image/gif",
        )
        .send()
        .await
        .map_err(|_| AppError::NotFound("avatar unavailable".to_owned()))?;
    if !response.status().is_success()
        || response
            .content_length()
            .is_some_and(|len| len > MAX_AVATAR_BYTES as u64)
    {
        return Err(AppError::NotFound("avatar unavailable".to_owned()));
    }
    let mut body = Vec::new();
    while let Some(chunk) = response
        .chunk()
        .await
        .map_err(|_| AppError::NotFound("avatar unavailable".to_owned()))?
    {
        if body.len() + chunk.len() > MAX_AVATAR_BYTES {
            return Err(AppError::NotFound("avatar unavailable".to_owned()));
        }
        body.extend_from_slice(&chunk);
    }
    let kind = sniff(&body).ok_or_else(|| AppError::NotFound("avatar unavailable".to_owned()))?;
    Ok((body, kind))
}

#[cfg_attr(feature = "swagger", utoipa::path(
    get,
    path = "/api/v1/avatars/{profile_id}",
    tag = "comments",
    params(("profile_id" = String, Path, description = "Profile id")),
    responses(
        (status = 200, description = "Profile photo, only while the person shows it"),
        (status = 404, description = "No visible photo", body = crate::error::ErrorBody)
    )
))]
#[get("/avatars/{profile_id}")]
pub async fn show(
    db: web::Data<Db>,
    config: web::Data<Config>,
    cache: web::Data<AvatarCache>,
    path: web::Path<String>,
) -> Result<HttpResponse, AppError> {
    let profile_id = path.into_inner();
    let missing = || AppError::NotFound("avatar unavailable".to_owned());
    if uuid::Uuid::parse_str(&profile_id).is_err() {
        return Err(missing());
    }
    let source = db.avatar_source(&profile_id).await?.ok_or_else(missing)?;
    let key = format!("{profile_id}|{source}");
    let image = match cache.get(&key) {
        Some(hit) => hit,
        None => {
            let fetched = fetch(&config, &source).await.ok();
            cache.put(key, fetched.clone());
            fetched
        }
    };
    let (body, kind) = image.ok_or_else(missing)?;
    Ok(HttpResponse::Ok()
        .insert_header((header::CONTENT_TYPE, kind))
        .insert_header((header::CACHE_CONTROL, "public, max-age=86400"))
        .insert_header((header::X_CONTENT_TYPE_OPTIONS, "nosniff"))
        .insert_header((
            header::CONTENT_SECURITY_POLICY,
            "default-src 'none'; sandbox",
        ))
        .body(body))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn url(value: &str) -> reqwest::Url {
        reqwest::Url::parse(value).unwrap()
    }

    #[test]
    fn only_known_https_photo_hosts_are_fetched() {
        let mut config = Config::for_test();
        assert!(allowed_source(
            &config,
            &url("https://avatars.githubusercontent.com/u/1?v=4")
        ));
        assert!(allowed_source(
            &config,
            &url("https://lh3.googleusercontent.com/a/abc=s96-c")
        ));
        for blocked in [
            "http://avatars.githubusercontent.com/u/1",
            "https://evil.example/a.png",
            "https://avatars.githubusercontent.com.evil.example/a.png",
            "https://user:pw@avatars.githubusercontent.com/u/1",
            "https://avatars.githubusercontent.com:8443/u/1",
            "http://127.0.0.1:9/a.png",
            "https://169.254.169.254/latest",
        ] {
            assert!(!allowed_source(&config, &url(blocked)), "{blocked}");
        }
        config.avatar_hosts = vec!["127.0.0.1:9".to_owned()];
        assert!(allowed_source(&config, &url("http://127.0.0.1:9/a.png")));
        config.avatar_hosts = vec!["images.example".to_owned()];
        assert!(allowed_source(
            &config,
            &url("https://images.example/a.png")
        ));
        assert!(!allowed_source(
            &config,
            &url("http://images.example/a.png")
        ));
    }

    #[test]
    fn photos_are_requested_small() {
        assert_eq!(
            sized(&url("https://avatars.githubusercontent.com/u/7?v=4&s=460")).as_str(),
            "https://avatars.githubusercontent.com/u/7?v=4&s=160"
        );
        assert_eq!(
            sized(&url("https://lh3.googleusercontent.com/a/abc=s96-c")).path(),
            "/a/abc=s160-c"
        );
        assert_eq!(
            sized(&url("https://lh3.googleusercontent.com/a/abc")).path(),
            "/a/abc=s160-c"
        );
    }

    #[test]
    fn only_raster_images_pass_sniffing() {
        assert_eq!(sniff(b"\x89PNG\r\n\x1a\nrest"), Some("image/png"));
        assert_eq!(sniff(&[0xFF, 0xD8, 0xFF, 0xE0]), Some("image/jpeg"));
        assert_eq!(sniff(b"<svg xmlns='http://www.w3.org/2000/svg'/>"), None);
        assert_eq!(sniff(b"<html></html>"), None);
    }
}

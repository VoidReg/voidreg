use std::env;

use thiserror::Error;

#[derive(Debug, Clone)]
pub struct Config {
    pub host: String,
    pub port: u16,
    pub database_url: String,
    pub auth_token: String,
    pub cors_origins: Vec<String>,
    pub resend_api_key: String,
    pub resend_domain: String,
    pub resend_from_user: String,
    pub contact_to_email: String,
    pub admin_password_enabled: bool,
    pub admin_github_ids: Vec<String>,
    pub admin_google_subjects: Vec<String>,
    pub admin_password: Option<String>,
    pub admin_password_hash: Option<String>,
    pub admin_session_ttl_hours: i64,
    pub public_base_url: String,
    pub google_client_id: Option<String>,
    pub google_client_secret: Option<String>,
    pub github_client_id: Option<String>,
    pub github_client_secret: Option<String>,
    pub commenter_redirect_url: Option<String>,
    pub comment_ip_salt: String,
    pub trusted_proxy_cidrs: Vec<String>,
    pub comment_anon_hourly: i64,
    pub comment_anon_article_hourly: i64,
    pub comment_user_hourly: i64,
    pub comment_user_article_hourly: i64,
    pub comment_burst: i64,
    pub compiler_url: String,
    pub compiler_token: Option<String>,
}

#[derive(Debug, Error)]
pub enum ConfigError {
    #[error("{0}")]
    Missing(&'static str),
    #[error("invalid PORT value")]
    InvalidPort,
    #[error("invalid ADMIN_SESSION_TTL_HOURS value")]
    InvalidSessionTtl,
    #[error("comment limits must be integers between 1 and 10000")]
    InvalidCommentLimit,
    #[error("TRUSTED_PROXY_CIDRS contains an invalid address or CIDR")]
    InvalidTrustedProxy,
}

fn optional_env(key: &str) -> Option<String> {
    env::var(key)
        .ok()
        .map(|value| value.trim().to_owned())
        .filter(|value| !value.is_empty())
}

fn env_list(key: &str) -> Vec<String> {
    env::var(key)
        .unwrap_or_default()
        .split(',')
        .map(str::trim)
        .filter(|v| !v.is_empty())
        .map(str::to_owned)
        .collect()
}

impl Config {
    pub fn from_env() -> Result<Self, ConfigError> {
        let host = env::var("HOST").unwrap_or_else(|_| "0.0.0.0".to_owned());
        let port = env::var("PORT")
            .ok()
            .map(|value| value.parse::<u16>().map_err(|_| ConfigError::InvalidPort))
            .transpose()?
            .unwrap_or(8080);
        let database_url = env::var("TURSO_DATABASE_URL")
            .or_else(|_| env::var("DATABASE_URL"))
            .map_err(|_| ConfigError::Missing("TURSO_DATABASE_URL"))?;
        let auth_token = env::var("TURSO_AUTH_TOKEN").unwrap_or_default();
        let cors_origins = env::var("CORS_ORIGINS")
            .unwrap_or_else(|_| "http://localhost:3000,http://localhost:5173".to_owned())
            .split(',')
            .map(str::trim)
            .filter(|origin| !origin.is_empty())
            .map(ToOwned::to_owned)
            .collect();
        let resend_api_key =
            env::var("RESEND_API_KEY").map_err(|_| ConfigError::Missing("RESEND_API_KEY"))?;
        let resend_domain =
            env::var("RESEND_DOMAIN").map_err(|_| ConfigError::Missing("RESEND_DOMAIN"))?;
        let resend_from_user =
            env::var("RESEND_FROM_USER").map_err(|_| ConfigError::Missing("RESEND_FROM_USER"))?;
        let contact_to_email =
            env::var("CONTACT_TO_EMAIL").map_err(|_| ConfigError::Missing("CONTACT_TO_EMAIL"))?;
        let admin_session_ttl_hours = optional_env("ADMIN_SESSION_TTL_HOURS")
            .map(|value| {
                value
                    .parse::<i64>()
                    .map_err(|_| ConfigError::InvalidSessionTtl)
            })
            .transpose()?
            .unwrap_or(72);
        if admin_session_ttl_hours <= 0 {
            return Err(ConfigError::InvalidSessionTtl);
        }

        let comment_ip_salt = optional_env("COMMENT_IP_SALT").ok_or(ConfigError::Missing(
            "COMMENT_IP_SALT must be a stable nonempty secret",
        ))?;
        let trusted_proxy_cidrs = env_list("TRUSTED_PROXY_CIDRS");
        if trusted_proxy_cidrs
            .iter()
            .any(|v| crate::auth::parse_network(v).is_none())
        {
            return Err(ConfigError::InvalidTrustedProxy);
        }
        let limit = |key: &str, default: i64| -> Result<i64, ConfigError> {
            let value = optional_env(key)
                .map(|v| v.parse::<i64>())
                .transpose()
                .map_err(|_| ConfigError::InvalidCommentLimit)?
                .unwrap_or(default);
            if !(1..=10000).contains(&value) {
                return Err(ConfigError::InvalidCommentLimit);
            }
            Ok(value)
        };
        Ok(Self {
            host,
            port,
            database_url,
            auth_token,
            cors_origins,
            resend_api_key,
            resend_domain,
            resend_from_user,
            contact_to_email,
            admin_password_enabled: env::var("ADMIN_PASSWORD_ENABLED").is_ok_and(|v| v == "true"),
            admin_github_ids: env_list("ADMIN_GITHUB_IDS"),
            admin_google_subjects: env_list("ADMIN_GOOGLE_SUBJECTS"),
            admin_password: optional_env("ADMIN_PASSWORD"),
            admin_password_hash: optional_env("ADMIN_PASSWORD_HASH"),
            admin_session_ttl_hours,
            public_base_url: optional_env("PUBLIC_BASE_URL")
                .unwrap_or_else(|| "http://127.0.0.1:8080".to_owned()),
            google_client_id: optional_env("GOOGLE_CLIENT_ID"),
            google_client_secret: optional_env("GOOGLE_CLIENT_SECRET"),
            github_client_id: optional_env("GITHUB_CLIENT_ID"),
            github_client_secret: optional_env("GITHUB_CLIENT_SECRET"),
            commenter_redirect_url: optional_env("COMMENTER_REDIRECT_URL"),
            comment_ip_salt,
            trusted_proxy_cidrs,
            comment_anon_hourly: limit("COMMENT_ANON_HOURLY", 5)?,
            comment_anon_article_hourly: limit("COMMENT_ANON_ARTICLE_HOURLY", 2)?,
            comment_user_hourly: limit("COMMENT_USER_HOURLY", 60)?,
            comment_user_article_hourly: limit("COMMENT_USER_ARTICLE_HOURLY", 30)?,
            comment_burst: limit("COMMENT_BURST", 3)?,
            compiler_url: env::var("COMPILER_URL")
                .unwrap_or_else(|_| "http://127.0.0.1:18084".into()),
            compiler_token: optional_env("COMPILER_TOKEN"),
        })
    }

    pub fn for_test() -> Self {
        Self {
            host: "127.0.0.1".to_owned(),
            port: 8080,
            database_url: "memory".to_owned(),
            auth_token: String::new(),
            cors_origins: vec!["http://localhost:5173".to_owned()],
            resend_api_key: "re_test".to_owned(),
            resend_domain: "mail.example.com".to_owned(),
            resend_from_user: "form".to_owned(),
            contact_to_email: "admin@example.com".to_owned(),
            admin_password_enabled: true,
            admin_github_ids: vec![],
            admin_google_subjects: vec![],
            admin_password: Some("voidreg-test-admin".to_owned()),
            admin_password_hash: None,
            admin_session_ttl_hours: 72,
            public_base_url: "http://127.0.0.1:8080".to_owned(),
            google_client_id: None,
            google_client_secret: None,
            github_client_id: None,
            github_client_secret: None,
            commenter_redirect_url: None,
            comment_ip_salt: "test-comment-salt".to_owned(),
            trusted_proxy_cidrs: vec![],
            comment_anon_hourly: 5,
            comment_anon_article_hourly: 2,
            comment_user_hourly: 60,
            comment_user_article_hourly: 30,
            comment_burst: 3,
            compiler_url: "http://127.0.0.1:18084".into(),
            compiler_token: None,
        }
    }

    pub fn skips_outbound_mail(&self) -> bool {
        self.resend_api_key.is_empty() || self.resend_api_key == "re_test"
    }

    pub fn resend_from(&self) -> String {
        format!("Voidreg <{}@{}>", self.resend_from_user, self.resend_domain)
    }

    pub fn admin_auth_configured(&self) -> bool {
        self.admin_password_enabled
            && (self.admin_password.is_some() || self.admin_password_hash.is_some())
    }

    pub fn admin_identity_allowed(&self, provider: &str, subject: &str) -> bool {
        let allowed = match provider {
            "github" => &self.admin_github_ids,
            "google" => &self.admin_google_subjects,
            _ => return false,
        };
        !subject.is_empty() && allowed.iter().any(|id| id == subject)
    }

    pub fn oauth_provider(&self, provider: &str) -> Option<(&str, &str)> {
        match provider {
            "google" => Some((
                self.google_client_id.as_deref()?,
                self.google_client_secret.as_deref()?,
            )),
            "github" => Some((
                self.github_client_id.as_deref()?,
                self.github_client_secret.as_deref()?,
            )),
            _ => None,
        }
    }

    pub fn commenter_redirect(&self) -> String {
        self.commenter_redirect_url
            .clone()
            .unwrap_or_else(|| format!("{}/blog", self.public_base_url))
    }

    pub fn oauth_redirect_uri(&self, provider: &str) -> String {
        format!("{}/api/v1/auth/{provider}/callback", self.public_base_url)
    }
}

use serde::Deserialize;

#[derive(Clone, Debug, Deserialize)]
pub struct Config {
    #[serde(default = "default_database_url")]
    pub database_url: String,
    // Human: Meilisearch endpoint for future full-text search (see /api/v1/search stub).
    // Agent: READS MEILI_URL env; STORED on AppState; NOT yet used by search SDK calls.
    #[serde(default = "default_meili_url")]
    pub meili_url: String,
    // Human: Meilisearch API key paired with meili_url when search is implemented.
    // Agent: READS MEILI_MASTER_KEY env; STORED on AppState; NEVER exposed in HTTP responses.
    #[serde(default = "default_meili_master_key")]
    pub meili_master_key: String,
    #[serde(default = "default_jwt_secret")]
    pub jwt_secret: String,
    #[serde(default = "default_music_dir")]
    pub music_dir: String,
    #[serde(default = "default_bind_addr")]
    pub bind_addr: String,
    #[serde(default = "default_storage_mode")]
    pub storage_mode: String,
    #[serde(default = "default_object_storage_url")]
    pub object_storage_url: String,
    #[serde(default = "default_object_storage_public_url")]
    pub object_storage_public_url: String,
    #[serde(default = "default_object_storage_bucket")]
    pub object_storage_bucket: String,
    #[serde(default = "default_signing_secret")]
    pub signing_secret: String,
    #[serde(default = "default_object_storage_jwt_secret")]
    pub object_storage_jwt_secret: String,
    #[serde(default = "default_master_secret")]
    pub master_secret: String,
    #[serde(default = "default_url_expiry_seconds")]
    pub url_expiry_seconds: u64,
    /// `development`, `staging`, `production` — affects query parse error detail in API responses.
    #[serde(default = "default_aurora_environment")]
    pub aurora_environment: String,
    /// Optional build identifier (also read from `GIT_SHA` at runtime if unset).
    #[serde(default)]
    pub git_sha: Option<String>,
    /// Max admin aggregate listening requests per admin user per rolling minute.
    #[serde(default = "default_admin_listening_rpm")]
    pub admin_listening_rpm: u32,
}

impl Config {
    pub fn from_env() -> anyhow::Result<Self> {
        dotenvy::dotenv().ok();
        let cfg = envy::from_env()?;
        Ok(cfg)
    }
}

fn default_database_url() -> String {
    "sqlite://aurora.db".into()
}

fn default_meili_url() -> String {
    "http://localhost:7700".into()
}

fn default_meili_master_key() -> String {
    "aurora-master-key".into()
}

fn default_jwt_secret() -> String {
    "change-me-in-production".into()
}

fn default_music_dir() -> String {
    "/music".into()
}

fn default_storage_mode() -> String {
    "proxy".into()
}

fn default_object_storage_url() -> String {
    "http://localhost:9000".into()
}

fn default_object_storage_public_url() -> String {
    "http://localhost:9000".into()
}

fn default_object_storage_bucket() -> String {
    "music".into()
}

fn default_bind_addr() -> String {
    "0.0.0.0:3000".into()
}

fn default_signing_secret() -> String {
    "change-me-in-production".into()
}

fn default_object_storage_jwt_secret() -> String {
    "dev-nos-jwt-secret-change-me".into()
}

fn default_master_secret() -> String {
    "change-me-in-production".into()
}

fn default_url_expiry_seconds() -> u64 {
    3600
}

fn default_aurora_environment() -> String {
    "development".into()
}

fn default_admin_listening_rpm() -> u32 {
    120
}

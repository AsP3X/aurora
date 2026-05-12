use serde::Deserialize;

#[derive(Clone, Debug, Deserialize)]
pub struct Config {
    #[serde(default = "default_database_url")]
    pub database_url: String,
    #[allow(dead_code)]
    #[serde(default = "default_meili_url")]
    pub meili_url: String,
    #[allow(dead_code)]
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

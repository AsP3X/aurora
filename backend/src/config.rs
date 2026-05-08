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
}

impl Config {
    pub fn from_env() -> anyhow::Result<Self> {
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

fn default_bind_addr() -> String {
    "0.0.0.0:3000".into()
}

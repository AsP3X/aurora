mod config;

use anyhow::Result;

#[tokio::main]
async fn main() -> Result<()> {
    tracing_subscriber::fmt()
        .with_env_filter(tracing_subscriber::EnvFilter::from_default_env())
        .init();

    let cfg = config::NosConfig::from_env()?;
    tracing::info!(?cfg, "Configuration loaded");
    Ok(())
}

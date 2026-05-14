#[tokio::main]
async fn main() -> anyhow::Result<()> {
    aurora_backend::run().await
}

// Human: Thin Tokio entrypoint that delegates startup, routing, and shutdown to `aurora_backend::run`.
// Agent: CALLS aurora_backend::run; RETURNS process exit via anyhow Result; CONFIG none here.
#[tokio::main]
async fn main() -> anyhow::Result<()> {
    aurora_backend::run().await
}

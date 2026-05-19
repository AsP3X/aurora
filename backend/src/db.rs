// Human: Connect to SQLite or Postgres via SQLx Any pool, ensure the DB exists, enable FKs on SQLite, and run the backend-specific migration set.
// Agent: READS database_url prefix; WRITES schema via Migrator; RETURNS AnyPool; USES ./migrations/sqlite or ./migrations/postgres.
use sqlx::any::AnyPoolOptions;
use sqlx::migrate::{MigrateDatabase, Migrator};
use sqlx::AnyPool;
use std::path::PathBuf;

// Human: Classify a connection string so setup UI and migrations pick the right driver family.
// Agent: READS url prefix; RETURNS "postgres" | "sqlite" | None when unsupported.
pub fn driver_from_url(database_url: &str) -> Option<&'static str> {
    if database_url.starts_with("postgres://") || database_url.starts_with("postgresql://") {
        Some("postgres")
    } else if database_url.starts_with("sqlite:") {
        Some("sqlite")
    } else {
        None
    }
}

// Human: Verify the URL is reachable and migrations apply without keeping a long-lived pool (setup wizard test button).
// Agent: CALLS init_pool; DISCONNECTS implicitly when pool drops; PROPAGATES driver/migration errors.
pub async fn test_connection(database_url: &str) -> anyhow::Result<()> {
    let pool = init_pool(database_url).await?;
    sqlx::query("SELECT 1")
        .execute(&pool)
        .await?;
    Ok(())
}

// Human: Create the database file/cluster DB if missing, open a bounded pool, apply pragmas/migrations once at startup.
// Agent: CALLS create_database for sqlite/postgres URLs; RUNS migrations; PRAGMA foreign_keys ON for sqlite; DEFAULT max_connections 20.
pub async fn init_pool(database_url: &str) -> anyhow::Result<AnyPool> {
    if database_url.starts_with("postgres://") || database_url.starts_with("postgresql://") {
        if !sqlx::Postgres::database_exists(database_url).await.unwrap_or(false) {
            sqlx::Postgres::create_database(database_url).await?;
        }
    } else if database_url.starts_with("sqlite:") {
        if !sqlx::Sqlite::database_exists(database_url).await.unwrap_or(false) {
            sqlx::Sqlite::create_database(database_url).await?;
        }
    }

    let pool = AnyPoolOptions::new()
        .max_connections(20)
        .connect(database_url)
        .await?;

    if database_url.starts_with("sqlite:") {
        sqlx::query("PRAGMA foreign_keys = ON;")
            .execute(&pool)
            .await?;
    }

    // Human: Resolve migrations from the crate directory so systemd/Docker need not set CWD to `backend/`.
    // Agent: READS CARGO_MANIFEST_DIR/migrations/{sqlite|postgres}; OVERRIDE via AURORA_MIGRATIONS_DIR optional.
    let migrations_root = std::env::var("AURORA_MIGRATIONS_DIR")
        .map(PathBuf::from)
        .unwrap_or_else(|_| PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("migrations"));
    let migrations_dir = if database_url.starts_with("sqlite:") {
        migrations_root.join("sqlite")
    } else {
        migrations_root.join("postgres")
    };

    let migrator = Migrator::new(migrations_dir).await?;
    migrator.run(&pool).await?;

    Ok(pool)
}

// Human: Connect to SQLite or Postgres via SQLx Any pool, ensure the DB exists, enable FKs on SQLite, and run the backend-specific migration set.
// Agent: READS database_url prefix; WRITES schema via Migrator; RETURNS AnyPool; USES ./migrations/sqlite or ./migrations/postgres.
use sqlx::any::AnyPoolOptions;
use sqlx::migrate::{MigrateDatabase, Migrator};
use sqlx::AnyPool;
use std::path::Path;

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

    let migrations_dir = if database_url.starts_with("sqlite:") {
        "./migrations/sqlite"
    } else {
        "./migrations/postgres"
    };

    let migrator = Migrator::new(Path::new(migrations_dir)).await?;
    migrator.run(&pool).await?;

    Ok(pool)
}

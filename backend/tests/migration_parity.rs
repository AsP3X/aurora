//! IMP-014 — both sqlite and postgres migration directories apply without errors.

use sqlx::any::AnyPoolOptions;
use sqlx::migrate::{MigrateDatabase, Migrator};
use std::path::Path;

fn install_drivers() {
    sqlx::any::install_default_drivers();
}

// Human: Fresh SQLite file must run every migration under migrations/sqlite.
// Agent: CREATES temp db; RUNS Migrator; ASSERTS no Err from migrator.run.
#[tokio::test]
async fn sqlite_migrations_apply_cleanly() {
    install_drivers();
    let tmp = tempfile::tempdir().expect("tempdir");
    let db_path = tmp.path().join("migrate_test.db");
    let url = format!("sqlite:{}", db_path.display());

    sqlx::Sqlite::create_database(&url)
        .await
        .expect("create sqlite db");

    let pool = AnyPoolOptions::new()
        .max_connections(1)
        .connect(&url)
        .await
        .expect("connect");

    sqlx::query("PRAGMA foreign_keys = ON;")
        .execute(&pool)
        .await
        .expect("foreign keys");

    let migrator = Migrator::new(Path::new("./migrations/sqlite"))
        .await
        .expect("sqlite migrator");
    migrator.run(&pool).await.expect("sqlite migrations");
}

// Human: Postgres service in CI must run every migration under migrations/postgres.
// Agent: READS DATABASE_URL or POSTGRES_TEST_URL; SKIPS when unset; RUNS Migrator.
#[tokio::test]
async fn postgres_migrations_apply_cleanly() {
    let url = match std::env::var("POSTGRES_TEST_URL")
        .or_else(|_| std::env::var("DATABASE_URL"))
    {
        Ok(u) if u.starts_with("postgres://") || u.starts_with("postgresql://") => u,
        _ => {
            eprintln!("SKIP postgres_migrations_apply_cleanly: POSTGRES_TEST_URL or postgres DATABASE_URL not set");
            return;
        }
    };

    install_drivers();

    if !sqlx::Postgres::database_exists(&url)
        .await
        .unwrap_or(false)
    {
        sqlx::Postgres::create_database(&url)
            .await
            .expect("create postgres db");
    }

    let pool = AnyPoolOptions::new()
        .max_connections(2)
        .connect(&url)
        .await
        .expect("connect postgres");

    let migrator = Migrator::new(Path::new("./migrations/postgres"))
        .await
        .expect("postgres migrator");
    migrator.run(&pool).await.expect("postgres migrations");
}

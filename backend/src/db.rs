use sqlx::{migrate::MigrateDatabase, postgres::PgPoolOptions, PgPool};

pub async fn init_pool(database_url: &str) -> anyhow::Result<PgPool> {
    if !sqlx::Postgres::database_exists(database_url).await.unwrap_or(false) {
        sqlx::Postgres::create_database(database_url).await?;
    }

    let pool = PgPoolOptions::new()
        .max_connections(20)
        .connect(database_url)
        .await?;

    sqlx::migrate!("./migrations").run(&pool).await?;

    Ok(pool)
}

//! SQLite → Postgres migration validation helpers.

use sqlx::migrate::MigrateDatabase;

use aurora_backend::admin::database_migration::normalize_sqlite_url;
use aurora_backend::{config::Config, create_app_state, create_router};
use axum::body::Body;
use axum::http::{header, Request, StatusCode};
use serde_json::json;
use tower::ServiceExt;

fn test_config(db_url: &str, music_dir: &str) -> Config {
    Config {
        database_url: db_url.to_string(),
        meili_url: String::new(),
        meili_master_key: String::new(),
        jwt_secret: "test-jwt-secret-at-least-32-chars-long!!".to_string(),
        music_dir: music_dir.to_string(),
        bind_addr: "127.0.0.1:0".to_string(),
        storage_mode: "local".to_string(),
        object_storage_url: "http://localhost:9000".to_string(),
        object_storage_public_url: "http://localhost:9000".to_string(),
        object_storage_bucket: "music".to_string(),
        signing_secret: "test-signing-secret-not-default-value".to_string(),
        object_storage_jwt_secret: "test-nos-jwt-secret-not-default-value!!".to_string(),
        object_storage_metrics_token: String::new(),
        master_secret: "test-master-secret-not-default-value".to_string(),
        url_expiry_seconds: 3600,
        aurora_environment: "development".to_string(),
        git_sha: None,
        admin_listening_rpm: 120,
        auth_login_rpm: 15,
        auth_register_rpm: 5,
        upload_rpm: 20,
        hls_segment_rpm: 480,
        cors_allowed_origins: String::new(),
    }
}

#[tokio::test]
async fn validate_rejects_when_target_is_sqlite() {
    let tmp = tempfile::tempdir().unwrap();
    let db_path = tmp.path().join("target.db");
    let db_url = format!("sqlite:{}", db_path.display());
    let music_dir = tmp.path().join("music");
    std::fs::create_dir_all(&music_dir).unwrap();

    let cfg = test_config(&db_url, music_dir.to_str().unwrap());
    let state = create_app_state(&cfg).await.expect("app state");
    let app = create_router(state.clone());

    let admin_id = "e857822e-1cc4-470c-bfdd-91eddde96ffd";
    let ph = aurora_backend::auth::handlers::hash_password("password123").unwrap();
    sqlx::query(
        "INSERT INTO users (id, email, password_hash, role, enabled) VALUES ($1, $2, $3, 'admin', 1)",
    )
    .bind(admin_id)
    .bind("admin@test.local")
    .bind(&ph)
    .execute(&state.pool)
    .await
    .expect("admin");

    let token = aurora_backend::auth::handlers::create_token(
        admin_id.to_string(),
        "admin@test.local".to_string(),
        "admin".into(),
        &state.jwt_secret,
    )
    .unwrap();

    let source_path = tmp.path().join("source.db");
    let source_url = format!("sqlite:{}", source_path.display());
    sqlx::Sqlite::create_database(&source_url).await.unwrap();
    let src_pool = sqlx::sqlite::SqlitePoolOptions::new()
        .max_connections(1)
        .connect(&source_url)
        .await
        .unwrap();
    sqlx::migrate::Migrator::new(std::path::Path::new("./migrations/sqlite"))
        .await
        .unwrap()
        .run(&src_pool)
        .await
        .unwrap();
    sqlx::query(
        "INSERT INTO users (id, email, password_hash, role, enabled) VALUES ($1, $2, $3, 'admin', 1)",
    )
    .bind(admin_id)
    .bind("listener@test.local")
    .bind(&ph)
    .execute(&src_pool)
    .await
    .unwrap();

    let req = Request::builder()
        .method("POST")
        .uri("/api/v1/admin/database-migration/validate")
        .header(header::AUTHORIZATION, format!("Bearer {}", token))
        .header(header::CONTENT_TYPE, "application/json")
        .body(Body::from(
            json!({ "sqlite_database_url": source_url }).to_string(),
        ))
        .unwrap();

    let resp = app.oneshot(req).await.unwrap();
    assert_eq!(resp.status(), StatusCode::OK);
    let bytes = axum::body::to_bytes(resp.into_body(), usize::MAX)
        .await
        .unwrap();
    let body: serde_json::Value = serde_json::from_slice(&bytes).unwrap();
    assert_eq!(body["ready"], false);
    let checks = body["checks"].as_array().unwrap();
    let postgres_check = checks
        .iter()
        .find(|c| c["id"] == "target_postgres")
        .expect("target_postgres check");
    assert_eq!(postgres_check["ok"], false);
}

#[test]
fn normalize_sqlite_url_from_file_path() {
    let tmp = tempfile::tempdir().unwrap();
    let f = tmp.path().join("legacy.db");
    std::fs::write(&f, b"").unwrap();
    let url = normalize_sqlite_url(f.to_str().unwrap()).unwrap();
    assert!(url.starts_with("sqlite:"));
}

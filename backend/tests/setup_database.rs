//! Setup wizard database endpoints — connection test and info during first-run.

use aurora_backend::{config::Config, create_app_state, create_router};
use axum::body::Body;
use axum::http::{Request, StatusCode};
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
        master_secret: "test-master-secret-not-default-value".to_string(),
        url_expiry_seconds: 3600,
        aurora_environment: "development".to_string(),
        git_sha: None,
        admin_listening_rpm: 120,
        auth_login_rpm: 15,
        auth_register_rpm: 5,
        upload_rpm: 20,
        hls_segment_rpm: 480,
    }
}

// Human: Fresh DB should expose driver + URL on the setup database info route.
// Agent: GET /api/v1/setup/database; EXPECT 200 + sqlite driver.
#[tokio::test]
async fn setup_database_info_returns_startup_url() {
    let tmp = tempfile::tempdir().unwrap();
    let db_path = tmp.path().join("setup_info.db");
    let db_url = format!("sqlite:{}", db_path.display());
    let music_dir = tmp.path().join("music");
    std::fs::create_dir_all(&music_dir).unwrap();

    let cfg = test_config(&db_url, music_dir.to_str().unwrap());
    let state = create_app_state(&cfg).await.expect("app state");
    let app = create_router(state);

    let response = app
        .oneshot(
            Request::builder()
                .uri("/api/v1/setup/database")
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();

    assert_eq!(response.status(), StatusCode::OK);
    let body = axum::body::to_bytes(response.into_body(), usize::MAX)
        .await
        .unwrap();
    let json: serde_json::Value = serde_json::from_slice(&body).unwrap();
    assert_eq!(json["driver"], "sqlite");
    assert_eq!(json["database_url"], db_url);
}

// Human: Connection test accepts a valid sqlite URL before any user exists.
// Agent: POST /api/v1/setup/database/test; EXPECT ok true.
#[tokio::test]
async fn test_setup_database_accepts_sqlite_url() {
    let tmp = tempfile::tempdir().unwrap();
    let db_path = tmp.path().join("setup_test_target.db");
    let target_url = format!("sqlite:{}", db_path.display());
    let bootstrap_path = tmp.path().join("bootstrap.db");
    let bootstrap_url = format!("sqlite:{}", bootstrap_path.display());
    let music_dir = tmp.path().join("music");
    std::fs::create_dir_all(&music_dir).unwrap();

    let cfg = test_config(&bootstrap_url, music_dir.to_str().unwrap());
    let state = create_app_state(&cfg).await.expect("app state");
    let app = create_router(state);

    let response = app
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/api/v1/setup/database/test")
                .header("content-type", "application/json")
                .body(Body::from(
                    json!({ "database_url": target_url }).to_string(),
                ))
                .unwrap(),
        )
        .await
        .unwrap();

    assert_eq!(response.status(), StatusCode::OK);
    let body = axum::body::to_bytes(response.into_body(), usize::MAX)
        .await
        .unwrap();
    let json: serde_json::Value = serde_json::from_slice(&body).unwrap();
    assert_eq!(json["ok"], true);
    assert_eq!(json["driver"], "sqlite");
}

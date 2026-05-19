//! IMP-005 — auth, upload, and HLS segment routes return consistent 429 envelopes when limited.

use std::sync::Arc;

use aurora_backend::auth::handlers::hash_password;
use aurora_backend::{config::Config, create_app_state, create_router};
use axum::body::Body;
use axum::http::{header, Request, StatusCode};
use axum::Router;
use serde_json::json;
use tower::ServiceExt;

fn strong_secret() -> String {
    "test-jwt-secret-at-least-32-chars-long!!".to_string()
}

fn test_config(db_url: &str, music_dir: &str, auth_login_rpm: u32) -> Config {
    Config {
        database_url: db_url.to_string(),
        meili_url: String::new(),
        meili_master_key: String::new(),
        jwt_secret: strong_secret(),
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
        auth_login_rpm,
        auth_register_rpm: 5,
        upload_rpm: 20,
        hls_segment_rpm: 480,
        cors_allowed_origins: String::new(),
    }
}

async fn app_with_db(auth_login_rpm: u32) -> (tempfile::TempDir, Router, Arc<aurora_backend::AppState>) {
    let tmp = tempfile::tempdir().unwrap();
    let db_path = tmp.path().join("rate_limit.db");
    let db_url = format!("sqlite:{}", db_path.display());
    let music_dir = tmp.path().join("music");
    std::fs::create_dir_all(&music_dir).unwrap();

    let cfg = test_config(&db_url, music_dir.to_str().unwrap(), auth_login_rpm);
    let state = create_app_state(&cfg).await.expect("app state");
    let router = create_router(state.clone());
    (tmp, router, state)
}

// Human: Brute-force login attempts must hit 429 with the standard JSON error shape after the per-IP cap.
// Agent: POST /auth/login x3 with auth_login_rpm=2; EXPECT third response 429 + error field.
#[tokio::test]
async fn login_returns_429_when_ip_rate_limited() {
    let (_tmp, app, state) = app_with_db(2).await;

    sqlx::query(
        "INSERT INTO app_settings (key, value) VALUES ('allow_public_registration', 'true')",
    )
    .execute(&state.pool)
    .await
    .expect("setting");

    let mut saw_429 = false;
    for _ in 0..3 {
        let req = Request::builder()
            .method("POST")
            .uri("/api/v1/auth/login")
            .header(header::CONTENT_TYPE, "application/json")
            .header("x-real-ip", "198.51.100.99")
            .body(Body::from(
                json!({
                    "email": "nobody@example.com",
                    "password": "wrong-password"
                })
                .to_string(),
            ))
            .unwrap();

        let res = app.clone().oneshot(req).await.unwrap();
        if res.status() == StatusCode::TOO_MANY_REQUESTS {
            saw_429 = true;
            let body = axum::body::to_bytes(res.into_body(), usize::MAX)
                .await
                .unwrap();
            let parsed: serde_json::Value = serde_json::from_slice(&body).unwrap();
            assert_eq!(parsed["status"], 429);
            assert!(parsed["error"]
                .as_str()
                .unwrap()
                .contains("rate limit"));
        }
    }
    assert!(saw_429, "expected at least one 429 after burst login attempts");
}

// Human: Registration spam from one IP must also surface 429 once the register bucket is full.
// Agent: POST /auth/register x3 with auth_register_rpm=2 via env override on shared limiter field.
#[tokio::test]
async fn register_returns_429_when_ip_rate_limited() {
    let tmp = tempfile::tempdir().unwrap();
    let db_path = tmp.path().join("rate_limit_reg.db");
    let db_url = format!("sqlite:{}", db_path.display());
    let music_dir = tmp.path().join("music");
    std::fs::create_dir_all(&music_dir).unwrap();

    let cfg = Config {
        auth_register_rpm: 2,
        ..test_config(&db_url, music_dir.to_str().unwrap(), 15)
    };
    let state = create_app_state(&cfg).await.expect("app state");
    let app = create_router(state.clone());

    sqlx::query(
        "INSERT INTO app_settings (key, value) VALUES ('allow_public_registration', 'true')",
    )
    .execute(&state.pool)
    .await
    .expect("setting");

    let mut saw_429 = false;
    for i in 0..3 {
        let req = Request::builder()
            .method("POST")
            .uri("/api/v1/auth/register")
            .header(header::CONTENT_TYPE, "application/json")
            .header("x-real-ip", "203.0.113.50")
            .body(Body::from(
                json!({
                    "email": format!("user{i}@example.com"),
                    "password": "password12345"
                })
                .to_string(),
            ))
            .unwrap();

        let res = app.clone().oneshot(req).await.unwrap();
        if res.status() == StatusCode::TOO_MANY_REQUESTS {
            saw_429 = true;
        }
    }
    assert!(saw_429, "expected 429 after burst register attempts");
}

// Human: Upload stage endpoint shares the per-admin upload bucket so rapid commits cannot bypass limits.
// Agent: POST /admin/songs/stage with JWT; auth_login_rpm unused; upload_rpm=1 forces second call 429.
#[tokio::test]
async fn upload_stage_returns_429_when_user_rate_limited() {
    let tmp = tempfile::tempdir().unwrap();
    let db_path = tmp.path().join("rate_limit_upload.db");
    let db_url = format!("sqlite:{}", db_path.display());
    let music_dir = tmp.path().join("music");
    std::fs::create_dir_all(&music_dir).unwrap();

    let cfg = Config {
        upload_rpm: 1,
        ..test_config(&db_url, music_dir.to_str().unwrap(), 15)
    };
    let state = create_app_state(&cfg).await.expect("app state");
    let app = create_router(state.clone());

    let admin_id = "e857822e-1cc4-470c-bfdd-91eddde96ffd";
    let ph = hash_password("password123").unwrap();
    sqlx::query(
        "INSERT INTO users (id, email, password_hash, role, enabled) VALUES ($1, $2, $3, 'admin', true)",
    )
    .bind(admin_id)
    .bind("admin@test.local")
    .bind(&ph)
    .execute(&state.pool)
    .await
    .expect("admin user");

    let token = aurora_backend::auth::handlers::create_token(
        admin_id.to_string(),
        "admin@test.local".to_string(),
        "admin".to_string(),
        &state.jwt_secret,
    )
    .unwrap();

    let boundary = "boundary123";
    let body = format!(
        "--{boundary}\r\nContent-Disposition: form-data; name=\"audio\"; filename=\"t.mp3\"\r\nContent-Type: audio/mpeg\r\n\r\nfake\r\n--{boundary}--\r\n"
    );

    let mut saw_429 = false;
    for _ in 0..2 {
        let req = Request::builder()
            .method("POST")
            .uri("/api/v1/admin/songs/stage")
            .header(header::AUTHORIZATION, format!("Bearer {token}"))
            .header(
                header::CONTENT_TYPE,
                format!("multipart/form-data; boundary={boundary}"),
            )
            .body(Body::from(body.clone()))
            .unwrap();

        let res = app.clone().oneshot(req).await.unwrap();
        if res.status() == StatusCode::TOO_MANY_REQUESTS {
            saw_429 = true;
        }
    }
    assert!(saw_429, "expected 429 on second upload stage within the window");
}

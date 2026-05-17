//! Regression tests for findings in `docs/security-audit.md` (2026-05-10 review).

use std::sync::Arc;

use aurora_backend::auth::handlers::{create_token, hash_password};
use aurora_backend::redact;
use aurora_backend::secrets::{self, validate_startup_secrets};
use aurora_backend::{config::Config, create_app_state, create_router, AppState};
use axum::body::Body;
use axum::http::{header, Request, StatusCode};
use axum::Router;
use serde_json::json;
use tower::ServiceExt;

struct TestApp {
    _tmpdir: tempfile::TempDir,
    router: Router,
    state: Arc<AppState>,
}

fn strong_secret() -> String {
    "test-jwt-secret-at-least-32-chars-long!!".to_string()
}

// Human: Build config in-process so parallel tests do not race on process environment variables.
// Agent: RETURNS Config with local storage + non-default secrets; NO envy::from_env.
fn test_config(db_url: &str, music_dir: &str) -> Config {
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
        auth_login_rpm: 15,
        auth_register_rpm: 5,
        upload_rpm: 20,
        hls_segment_rpm: 480,
    }
}

async fn app_with_migrated_db() -> TestApp {
    let tmp = tempfile::tempdir().unwrap();
    let db_path = tmp.path().join("security.db");
    let db_url = format!("sqlite:{}", db_path.display());
    let music_dir = tmp.path().join("music");
    std::fs::create_dir_all(&music_dir).unwrap();

    let cfg = test_config(&db_url, music_dir.to_str().unwrap());
    let state = create_app_state(&cfg).await.expect("app state");
    let router = create_router(state.clone());
    TestApp {
        _tmpdir: tmp,
        router,
        state,
    }
}

// Human: Vuln 1 — registration must honor allow_public_registration=false in app_settings.
// Agent: POST /auth/register; READS app_settings; EXPECT 403 when value is false.
#[tokio::test]
async fn register_returns_forbidden_when_public_registration_disabled() {
    let TestApp { router: app, state, .. } = app_with_migrated_db().await;

    sqlx::query(
        "INSERT INTO app_settings (key, value) VALUES ('allow_public_registration', 'false')",
    )
    .execute(&state.pool)
    .await
    .expect("insert setting");

    let req = Request::builder()
        .method("POST")
        .uri("/api/v1/auth/register")
        .header(header::CONTENT_TYPE, "application/json")
        .body(Body::from(
            json!({
                "email": "blocked@example.com",
                "password": "password12345"
            })
            .to_string(),
        ))
        .unwrap();

    let res = app.oneshot(req).await.unwrap();
    assert_eq!(res.status(), StatusCode::FORBIDDEN);
}

// Human: Vuln 3 — users.manage alone must not allow role promotion; only role=admin may change roles.
// Agent: listener + user_permissions users.manage; PUT admin/users/{id}/role; EXPECT 403.
#[tokio::test]
async fn update_user_role_forbidden_for_listener_with_users_manage() {
    let TestApp { router: app, state, .. } = app_with_migrated_db().await;

    let moderator_id = "11111111-1111-1111-1111-111111111111";
    let target_id = "22222222-2222-2222-2222-222222222222";
    let ph = hash_password("password123").unwrap();

    sqlx::query(
        "INSERT INTO users (id, email, password_hash, role, enabled) VALUES ($1, $2, $3, 'listener', true)",
    )
    .bind(moderator_id)
    .bind("mod@test.local")
    .bind(&ph)
    .execute(&state.pool)
    .await
    .expect("insert moderator");

    sqlx::query(
        "INSERT INTO users (id, email, password_hash, role, enabled) VALUES ($1, $2, $3, 'listener', true)",
    )
    .bind(target_id)
    .bind("target@test.local")
    .bind(&ph)
    .execute(&state.pool)
    .await
    .expect("insert target");

    sqlx::query(
        "INSERT INTO user_permissions (id, user_id, permission_id) VALUES ($1, $2, '10000000-0000-0000-0000-000000000009')",
    )
    .bind("33333333-3333-3333-3333-333333333333")
    .bind(moderator_id)
    .execute(&state.pool)
    .await
    .expect("grant users.manage");

    let token = create_token(
        moderator_id.to_string(),
        "mod@test.local".into(),
        "listener".into(),
        &state.jwt_secret,
    )
    .expect("token");

    let req = Request::builder()
        .method("PUT")
        .uri(format!("/api/v1/admin/users/{}/role", target_id))
        .header(header::AUTHORIZATION, format!("Bearer {}", token))
        .header(header::CONTENT_TYPE, "application/json")
        .body(Body::from(json!({ "role": "admin" }).to_string()))
        .unwrap();

    let res = app.oneshot(req).await.unwrap();
    assert_eq!(res.status(), StatusCode::FORBIDDEN);

    let role: Option<(String,)> =
        sqlx::query_as("SELECT role FROM users WHERE id = $1")
            .bind(target_id)
            .fetch_optional(&state.pool)
            .await
            .expect("role query");
    assert_eq!(role.map(|(r,)| r), Some("listener".to_string()));
}

// Human: Vuln 3 — self role change must be rejected even for admins.
// Agent: PUT own user id; EXPECT 400 Bad Request.
#[tokio::test]
async fn update_user_role_rejects_self_targeting() {
    let TestApp { router: app, state, .. } = app_with_migrated_db().await;

    let admin_id = "44444444-4444-4444-4444-444444444444";
    let ph = hash_password("password123").unwrap();

    sqlx::query(
        "INSERT INTO users (id, email, password_hash, role, enabled) VALUES ($1, $2, $3, 'admin', true)",
    )
    .bind(admin_id)
    .bind("admin@test.local")
    .bind(&ph)
    .execute(&state.pool)
    .await
    .expect("insert admin");

    let token = create_token(
        admin_id.to_string(),
        "admin@test.local".into(),
        "admin".into(),
        &state.jwt_secret,
    )
    .expect("token");

    let req = Request::builder()
        .method("PUT")
        .uri(format!("/api/v1/admin/users/{}/role", admin_id))
        .header(header::AUTHORIZATION, format!("Bearer {}", token))
        .header(header::CONTENT_TYPE, "application/json")
        .body(Body::from(json!({ "role": "listener" }).to_string()))
        .unwrap();

    let res = app.oneshot(req).await.unwrap();
    assert_eq!(res.status(), StatusCode::BAD_REQUEST);
}

// Human: Vuln 2 — compose/code weak defaults must not pass startup validation.
// Agent: validate_startup_secrets + create_app_state; EXPECT Err for dev-jwt-secret-change-me.
#[test]
fn startup_rejects_compose_weak_jwt_default() {
    let cfg = Config {
        jwt_secret: "dev-jwt-secret-change-me".to_string(),
        ..test_config("sqlite::memory:", ".")
    };
    let err = validate_startup_secrets(&cfg).unwrap_err();
    assert!(err.to_string().contains("JWT_SECRET"));
}

#[test]
fn startup_rejects_legacy_change_me_jwt_default() {
    let cfg = Config {
        jwt_secret: "change-me-in-production".to_string(),
        ..test_config("sqlite::memory:", ".")
    };
    assert!(validate_startup_secrets(&cfg).is_err());
}

#[tokio::test]
async fn create_app_state_rejects_weak_signing_secret() {
    let tmp = tempfile::tempdir().unwrap();
    let db_url = format!("sqlite:{}", tmp.path().join("weak.db").display());
    let cfg = test_config(&db_url, tmp.path().to_str().unwrap());
    let weak = Config {
        signing_secret: "change-me-in-production".to_string(),
        ..cfg
    };
    match create_app_state(&weak).await {
        Err(e) => assert!(
            e.to_string().contains("SIGNING_SECRET"),
            "unexpected error: {e}"
        ),
        Ok(_) => panic!("weak signing secret must fail before serving"),
    }
}

// Human: IMP-004 — presigned URLs and stream tickets must not appear verbatim in log helpers.
// Agent: CALLS redact::url_for_log + stream_ticket_for_log; ASSERT no raw signature/ticket tail in output.
#[test]
fn log_redaction_strips_signatures_and_ticket_hmac() {
    let url = "https://cdn.example/music/key?signature=deadbeef&expires=1700000000";
    let redacted_url = redact::url_for_log(url);
    assert!(!redacted_url.contains("deadbeef"));
    assert!(redacted_url.contains("signature=[redacted]"));

    let ticket = "song-id.user-id.1700000000.cafebabe";
    let redacted_ticket = redact::stream_ticket_for_log(ticket);
    assert!(!redacted_ticket.contains("cafebabe"));
    assert!(redacted_ticket.contains("[sig-redacted]"));
}

#[test]
fn weak_secret_helper_covers_documented_defaults() {
    assert!(secrets::is_weak_secret("dev-master-secret-change-me"));
    assert!(secrets::is_weak_secret("GENERATE_ME"));
    assert!(!secrets::is_weak_secret(strong_secret().as_str()));
}

// Human: Vuln 1 — registration allowed when admin explicitly enables public signup.
// Agent: POST register with allow_public_registration true; EXPECT 200 + token shape.
#[tokio::test]
async fn register_succeeds_when_public_registration_enabled() {
    let TestApp { router: app, state, .. } = app_with_migrated_db().await;

    sqlx::query(
        "INSERT INTO app_settings (key, value) VALUES ('allow_public_registration', 'true')",
    )
    .execute(&state.pool)
    .await
    .expect("insert setting");

    let req = Request::builder()
        .method("POST")
        .uri("/api/v1/auth/register")
        .header(header::CONTENT_TYPE, "application/json")
        .body(Body::from(
            json!({
                "email": "allowed@example.com",
                "password": "password12345"
            })
            .to_string(),
        ))
        .unwrap();

    let res = app.oneshot(req).await.unwrap();
    assert_eq!(res.status(), StatusCode::OK);
}

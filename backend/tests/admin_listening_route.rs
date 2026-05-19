//! Hits the real Axum router for admin listening-by-song (GET + POST).

use aurora_backend::auth::handlers::create_token;
use aurora_backend::{create_app_state, create_router, config::Config};
use axum::body::Body;
use axum::http::{header, Request, StatusCode};
use serde_json::json;
use tower::ServiceExt;

fn strong_secret() -> String {
    "test-jwt-secret-at-least-32-chars-long!!".to_string()
}

async fn test_config(db_url: &str, music_dir: &str) -> Config {
    // envy reads env; set required non-default secrets for create_app_state path
    std::env::set_var("DATABASE_URL", db_url);
    std::env::set_var("MUSIC_DIR", music_dir);
    std::env::set_var("STORAGE_MODE", "local");
    std::env::set_var("JWT_SECRET", strong_secret());
    std::env::set_var("SIGNING_SECRET", "test-signing-secret-not-default-value");
    std::env::set_var("MASTER_SECRET", "test-master-secret-not-default-value");
    std::env::set_var(
        "OBJECT_STORAGE_JWT_SECRET",
        "test-object-storage-jwt-not-default-value",
    );
    std::env::set_var("AURORA_ENVIRONMENT", "development");
    std::env::set_var("MEILI_URL", "");
    std::env::set_var("MEILI_MASTER_KEY", "");
    Config::from_env().expect("test config")
}

#[tokio::test]
async fn admin_listening_by_song_get_and_post_return_200() {
    let tmp = tempfile::tempdir().unwrap();
    let db_path = tmp.path().join("t.db");
    let db_url = format!("sqlite:{}", db_path.display());
    let music_dir = tmp.path().join("music");
    std::fs::create_dir_all(&music_dir).unwrap();

    let cfg = test_config(&db_url, music_dir.to_str().unwrap()).await;
    let state = create_app_state(&cfg).await.expect("app state");

    let admin_id = "e857822e-1cc4-470c-bfdd-91eddde96ffd";
    let ph = aurora_backend::auth::handlers::hash_password("password123").unwrap();
    let ins = sqlx::query(
        "INSERT INTO users (id, email, password_hash, role, enabled) VALUES ($1, $2, $3, 'admin', true)",
    )
    .bind(admin_id)
    .bind("admin@test.local")
    .bind(&ph)
    .execute(&state.pool)
    .await
    .expect("insert admin");
    assert_eq!(ins.rows_affected(), 1);

    let n: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM users WHERE id = $1")
        .bind(admin_id)
        .fetch_one(&state.pool)
        .await
        .expect("count");
    assert_eq!(n, 1, "user must be visible to same id binding as middleware");

    let token = create_token(
        admin_id.to_string(),
        "admin@test.local".into(),
        "admin".into(),
        &state.jwt_secret,
    )
    .expect("token");
    let claims = aurora_backend::auth::handlers::decode_token(&token, &state.jwt_secret).expect("jwt must decode");
    let enabled: Option<(i64,)> = sqlx::query_as(
        "SELECT CAST(enabled AS INTEGER) AS enabled FROM users WHERE id = $1",
    )
    .bind(&claims.sub)
    .fetch_optional(&state.pool)
    .await
    .expect("enabled query");
    assert!(enabled.map(|(e,)| e != 0).unwrap_or(false), "middleware user lookup must succeed: {:?}", enabled);

    let app = create_router(state);
    let uid = admin_id;

    let get_req = Request::builder()
        .method("GET")
        .uri(format!(
            "/api/v1/admin/listening-by-song?user_ids={}&period=all&limit=500",
            uid
        ))
        .header(header::AUTHORIZATION, format!("Bearer {}", token))
        .body(Body::empty())
        .unwrap();

    let res = app.clone().oneshot(get_req).await.unwrap();
    assert_eq!(res.status(), StatusCode::OK);

    let post_req = Request::builder()
        .method("POST")
        .uri("/api/v1/admin/listening-by-song")
        .header(header::AUTHORIZATION, format!("Bearer {}", token))
        .header(header::CONTENT_TYPE, "application/json")
        .body(Body::from(
            json!({
                "user_ids": [uid],
                "period": "all",
                "limit": 500
            })
            .to_string(),
        ))
        .unwrap();

    let res = app.oneshot(post_req).await.unwrap();
    assert_eq!(res.status(), StatusCode::OK);
}

//! Stream tickets must not work after a song is disabled.

use aurora_backend::{config::Config, create_app_state, create_router};
use axum::body::Body;
use axum::http::{Request, StatusCode};
use tower::ServiceExt;
use uuid::Uuid;

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
        cors_allowed_origins: String::new(),
    }
}

// Human: After admin disables a song, ticket redemption on /stream must fail (404).
// Agent: INSERT enabled song; GENERATE ticket; SET enabled=false; GET stream EXPECT 404.
#[tokio::test]
async fn disabled_song_rejects_stream_ticket() {
    let tmp = tempfile::tempdir().unwrap();
    let db_path = tmp.path().join("stream_ticket.db");
    let db_url = format!("sqlite:{}", db_path.display());
    let music_dir = tmp.path().join("music");
    std::fs::create_dir_all(&music_dir).unwrap();

    let cfg = test_config(&db_url, music_dir.to_str().unwrap());
    let state = create_app_state(&cfg).await.expect("app state");
    let router = create_router(state.clone());

    let song_id = Uuid::new_v4().to_string();
    let user_id = Uuid::new_v4().to_string();

    sqlx::query(
        "INSERT INTO users (id, email, password_hash, role, enabled) VALUES ($1, $2, 'hash', 'admin', 1)",
    )
    .bind(&user_id)
    .bind("stream-ticket@test.local")
    .execute(&state.pool)
    .await
    .unwrap();

    sqlx::query(
        "INSERT INTO songs (id, title, artist, file_key, enabled, hls_ready, duration_seconds, file_size_bytes, file_format) VALUES ($1, 'T', 'A', 'files/x.mp3', 1, 0, 180, 1024, 'mp3')",
    )
    .bind(&song_id)
    .execute(&state.pool)
    .await
    .unwrap();

    let ticket = aurora_backend::stream_ticket::generate_ticket(
        &song_id,
        &user_id,
        &state.signing_secret,
        state.url_expiry_seconds,
    );

    sqlx::query("UPDATE songs SET enabled = 0 WHERE id = $1")
        .bind(&song_id)
        .execute(&state.pool)
        .await
        .unwrap();

    let uri = format!("/api/v1/songs/{song_id}/stream?ticket={ticket}");
    let response = router
        .oneshot(
            Request::builder()
                .uri(&uri)
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();

    assert_eq!(response.status(), StatusCode::NOT_FOUND);
}

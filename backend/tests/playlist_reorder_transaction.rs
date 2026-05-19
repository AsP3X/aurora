//! IMP-011 — playlist reorder applies all position updates atomically.

use aurora_backend::auth::handlers::create_token;
use aurora_backend::playlists::model::Playlist;
use aurora_backend::{config::Config, create_app_state, create_router};
use axum::body::Body;
use axum::http::{header, Request, StatusCode};
use serde_json::json;
use tower::ServiceExt;
use uuid::Uuid;

fn strong_secret() -> String {
    "test-jwt-secret-at-least-32-chars-long!!".to_string()
}

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
        auth_login_rpm: 60,
        auth_register_rpm: 5,
        upload_rpm: 20,
        hls_segment_rpm: 480,
        cors_allowed_origins: String::new(),
    }
}

// Human: Reorder endpoint should leave contiguous positions after swapping two tracks.
// Agent: SEEDS playlist_songs; PUT reorder; READS positions ordered ASC.
#[tokio::test]
async fn reorder_songs_updates_all_positions() {
    let tmp = tempfile::tempdir().unwrap();
    let db_path = tmp.path().join("reorder.db");
    let db_url = format!("sqlite:{}", db_path.display());
    let music_dir = tmp.path().join("music");
    std::fs::create_dir_all(&music_dir).unwrap();

    let state = create_app_state(&test_config(&db_url, music_dir.to_str().unwrap()))
        .await
        .expect("app state");
    let app = create_router(state.clone());

    let user_id = Uuid::new_v4().to_string();
    sqlx::query(
        "INSERT INTO users (id, email, password_hash, role, enabled) VALUES ($1, $2, $3, 'admin', 1)",
    )
    .bind(&user_id)
    .bind("reorder@test.local")
    .bind("hash")
    .execute(&state.pool)
    .await
    .expect("user");

    let playlist_id = Uuid::new_v4().to_string();
    sqlx::query("INSERT INTO playlists (id, user_id, name) VALUES ($1, $2, 'Test')")
        .bind(&playlist_id)
        .bind(&user_id)
        .execute(&state.pool)
        .await
        .expect("playlist");

    let song_a = Uuid::new_v4().to_string();
    let song_b = Uuid::new_v4().to_string();
    for (sid, title) in [(song_a.clone(), "A"), (song_b.clone(), "B")] {
        sqlx::query(
            "INSERT INTO songs (id, title, artist, duration_seconds, file_key, file_size_bytes, file_format, enabled)
             VALUES ($1, $2, 'Artist', 120, $3, 1, 'mp3', 1)",
        )
        .bind(&sid)
        .bind(title)
        .bind(format!("uploads/{sid}.mp3"))
        .execute(&state.pool)
        .await
        .expect("song");
    }

    let ps_a = Uuid::new_v4().to_string();
    let ps_b = Uuid::new_v4().to_string();
    sqlx::query(
        "INSERT INTO playlist_songs (id, playlist_id, song_id, position) VALUES ($1, $2, $3, 1)",
    )
    .bind(&ps_a)
    .bind(&playlist_id)
    .bind(&song_a)
    .execute(&state.pool)
    .await
    .expect("playlist song a");
    sqlx::query(
        "INSERT INTO playlist_songs (id, playlist_id, song_id, position) VALUES ($1, $2, $3, 2)",
    )
    .bind(&ps_b)
    .bind(&playlist_id)
    .bind(&song_b)
    .execute(&state.pool)
    .await
    .expect("playlist song b");

    let token = create_token(
        user_id.clone(),
        "admin@test.local".into(),
        "admin".into(),
        &state.jwt_secret,
    )
    .expect("token");

    let playlist_row: (String,) = sqlx::query_as("SELECT user_id FROM playlists WHERE id = $1")
        .bind(&playlist_id)
        .fetch_one(&state.pool)
        .await
        .expect("playlist row");
    assert_eq!(playlist_row.0, user_id, "owner id must match JWT sub");

    let existing: Vec<String> = sqlx::query_scalar(
        "SELECT song_id FROM playlist_songs WHERE playlist_id = $1",
    )
    .bind(&playlist_id)
    .fetch_all(&state.pool)
    .await
    .expect("existing songs");
    assert!(existing.contains(&song_a));
    assert!(existing.contains(&song_b));

    let _: Playlist = sqlx::query_as("SELECT * FROM playlists WHERE id = $1")
        .bind(&playlist_id)
        .fetch_one(&state.pool)
        .await
        .expect("playlist deserialize");

    let req = Request::builder()
        .method("PUT")
        .uri(format!("/api/v1/playlists/{playlist_id}/songs/reorder"))
        .header(header::CONTENT_TYPE, "application/json")
        .header(header::AUTHORIZATION, format!("Bearer {token}"))
        .body(Body::from(
            json!({ "song_ids": [song_b, song_a] }).to_string(),
        ))
        .unwrap();

    let resp = app.clone().oneshot(req).await.expect("response");
    assert_eq!(resp.status(), StatusCode::OK);

    let positions: Vec<(i32, String)> = sqlx::query_as(
        "SELECT position, song_id FROM playlist_songs WHERE playlist_id = $1 ORDER BY position ASC",
    )
    .bind(&playlist_id)
    .fetch_all(&state.pool)
    .await
    .expect("positions");

    assert_eq!(positions.len(), 2);
    assert_eq!(positions[0], (1, song_b));
    assert_eq!(positions[1], (2, song_a));
}

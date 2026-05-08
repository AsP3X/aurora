use axum::{
    extract::{Path, State},
    Json,
};
use serde::Deserialize;
use std::sync::Arc;
use uuid::Uuid;

use crate::{error::AppError, playlists::model::Playlist, AppState};

#[derive(Debug, Deserialize)]
pub struct CreatePlaylist {
    pub name: String,
    pub description: Option<String>,
}

pub async fn list_playlists(
    State(state): State<Arc<AppState>>,
    claims: axum::Extension<crate::auth::Claims>,
) -> Result<Json<Vec<Playlist>>, AppError> {
    let playlists = sqlx::query_as::<_, Playlist>(
        "SELECT * FROM playlists WHERE user_id = $1 ORDER BY created_at DESC"
    )
    .bind(claims.sub)
    .fetch_all(&state.pool)
    .await?;

    Ok(Json(playlists))
}

pub async fn create_playlist(
    State(state): State<Arc<AppState>>,
    claims: axum::Extension<crate::auth::Claims>,
    Json(body): Json<CreatePlaylist>,
) -> Result<Json<Playlist>, AppError> {
    let id = Uuid::new_v4();

    let playlist = sqlx::query_as::<_, Playlist>(
        "INSERT INTO playlists (id, user_id, name, description) VALUES ($1, $2, $3, $4) RETURNING *"
    )
    .bind(id)
    .bind(claims.sub)
    .bind(body.name)
    .bind(body.description)
    .fetch_one(&state.pool)
    .await?;

    Ok(Json(playlist))
}

pub async fn get_playlist(
    State(state): State<Arc<AppState>>,
    Path(id): Path<Uuid>,
) -> Result<Json<serde_json::Value>, AppError> {
    let playlist = sqlx::query_as::<_, Playlist>("SELECT * FROM playlists WHERE id = $1")
        .bind(id)
        .fetch_optional(&state.pool)
        .await?;

    let playlist = playlist.ok_or(AppError::NotFound)?;

    let songs = sqlx::query_as::<_, crate::songs::model::Song>(
        "SELECT s.* FROM songs s
         JOIN playlist_songs ps ON s.id = ps.song_id
         WHERE ps.playlist_id = $1
         ORDER BY ps.position"
    )
    .bind(id)
    .fetch_all(&state.pool)
    .await?;

    Ok(Json(serde_json::json!({
        "playlist": playlist,
        "songs": songs,
    })))
}

#[derive(Debug, Deserialize)]
pub struct AddSongBody {
    pub song_id: Uuid,
}

pub async fn add_song(
    State(state): State<Arc<AppState>>,
    Path(id): Path<Uuid>,
    Json(body): Json<AddSongBody>,
) -> Result<Json<serde_json::Value>, AppError> {
    let max_pos: Option<i32> = sqlx::query_scalar(
        "SELECT MAX(position) FROM playlist_songs WHERE playlist_id = $1"
    )
    .bind(id)
    .fetch_optional(&state.pool)
    .await?;

    let position = max_pos.unwrap_or(0) + 1;

    sqlx::query(
        "INSERT INTO playlist_songs (playlist_id, song_id, position) VALUES ($1, $2, $3)"
    )
    .bind(id)
    .bind(body.song_id)
    .bind(position)
    .execute(&state.pool)
    .await?;

    Ok(Json(serde_json::json!({"ok": true})))
}

pub async fn remove_song(
    State(state): State<Arc<AppState>>,
    Path((id, song_id)): Path<(Uuid, Uuid)>,
) -> Result<Json<serde_json::Value>, AppError> {
    sqlx::query("DELETE FROM playlist_songs WHERE playlist_id = $1 AND song_id = $2")
        .bind(id)
        .bind(song_id)
        .execute(&state.pool)
        .await?;

    Ok(Json(serde_json::json!({"ok": true})))
}

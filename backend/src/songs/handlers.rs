use axum::{
    extract::{Path, Query, State},
    response::IntoResponse,
    Json,
};
use serde::Deserialize;
use std::sync::Arc;
use uuid::Uuid;

use crate::{error::AppError, storage::Storage, AppState};

#[derive(Debug, Deserialize)]
pub struct ListParams {
    #[serde(default)]
    pub artist: Option<String>,
    #[serde(default)]
    pub album: Option<String>,
    #[serde(default = "default_limit")]
    pub limit: i64,
    #[serde(default)]
    pub offset: i64,
}

fn default_limit() -> i64 { 50 }

pub async fn list_songs(
    State(state): State<Arc<AppState>>,
    Query(params): Query<ListParams>,
) -> Result<Json<Vec<super::model::Song>>, AppError> {
    let songs = sqlx::query_as::<_, super::model::Song>(
        "SELECT * FROM songs
         WHERE ($1::text IS NULL OR artist ILIKE $1)
         AND ($2::text IS NULL OR album ILIKE $2)
         ORDER BY title
         LIMIT $3 OFFSET $4"
    )
    .bind(params.artist.map(|a| format!("%{}%", a)))
    .bind(params.album.map(|a| format!("%{}%", a)))
    .bind(params.limit)
    .bind(params.offset)
    .fetch_all(&state.pool)
    .await?;

    Ok(Json(songs))
}

pub async fn get_song(
    State(state): State<Arc<AppState>>,
    Path(id): Path<Uuid>,
) -> Result<Json<super::model::Song>, AppError> {
    let song = sqlx::query_as::<_, super::model::Song>("SELECT * FROM songs WHERE id = $1")
        .bind(id)
        .fetch_optional(&state.pool)
        .await?;

    song.map(Json).ok_or(AppError::NotFound)
}

pub async fn stream_song(
    State(state): State<Arc<AppState>>,
    Path(id): Path<Uuid>,
) -> Result<impl IntoResponse, AppError> {
    let row = sqlx::query_as::<_, (String,)>("SELECT file_key FROM songs WHERE id = $1")
        .bind(id)
        .fetch_optional(&state.pool)
        .await?;

    let (file_key,) = row.ok_or(AppError::NotFound)?;
    let (stream, size, mime) = state.storage.get_stream(&file_key).await.map_err(|e| AppError::Storage(e.to_string()))?;

    let headers: axum::http::HeaderMap = [
        (axum::http::header::CONTENT_TYPE, mime.parse::<axum::http::HeaderValue>().unwrap()),
        (axum::http::header::CONTENT_LENGTH, size.to_string().parse::<axum::http::HeaderValue>().unwrap()),
        (axum::http::header::ACCEPT_RANGES, "bytes".parse::<axum::http::HeaderValue>().unwrap()),
    ]
    .into_iter()
    .collect();

    Ok((headers, axum::body::Body::from_stream(stream)))
}

pub async fn get_artwork(
    State(state): State<Arc<AppState>>,
    Path(id): Path<Uuid>,
) -> Result<impl IntoResponse, AppError> {
    let row = sqlx::query_as::<_, (Option<String>,)>("SELECT artwork_key FROM songs WHERE id = $1")
        .bind(id)
        .fetch_optional(&state.pool)
        .await?;

    let (key,) = row.ok_or(AppError::NotFound)?;
    let key = key.ok_or(AppError::NotFound)?;

    let (stream, size, mime) = state.storage.get_stream(&key).await.map_err(|e| AppError::Storage(e.to_string()))?;

    let headers: axum::http::HeaderMap = [
        (axum::http::header::CONTENT_TYPE, mime.parse::<axum::http::HeaderValue>().unwrap()),
        (axum::http::header::CONTENT_LENGTH, size.to_string().parse::<axum::http::HeaderValue>().unwrap()),
    ]
    .into_iter()
    .collect();

    Ok((headers, axum::body::Body::from_stream(stream)))
}

#[derive(Debug, serde::Deserialize)]
pub struct LogHistoryBody {
    pub song_id: Uuid,
    pub duration_listened_seconds: Option<i32>,
    #[serde(default)]
    pub completed: bool,
}

pub async fn log_history(
    State(state): State<Arc<AppState>>,
    claims: axum::Extension<crate::auth::Claims>,
    Json(body): Json<LogHistoryBody>,
) -> Result<Json<serde_json::Value>, AppError> {
    sqlx::query(
        "INSERT INTO playback_history (user_id, song_id, duration_listened_seconds, completed) VALUES ($1, $2, $3, $4)"
    )
    .bind(claims.sub)
    .bind(body.song_id)
    .bind(body.duration_listened_seconds)
    .bind(body.completed)
    .execute(&state.pool)
    .await?;

    Ok(Json(serde_json::json!({"ok": true})))
}

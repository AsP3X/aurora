use axum::{
    extract::{Path, Query, State},
    http::StatusCode,
    response::IntoResponse,
    Json,
};

#[derive(Debug, serde::Deserialize)]
pub struct TicketParams {
    pub ticket: Option<String>,
}
use serde::Deserialize;
use std::sync::Arc;
use uuid::Uuid;

use crate::{
    error::AppError,
    permissions::require_permission,
    AppState,
};

#[derive(Debug, Deserialize)]
pub struct ListParams {
    #[serde(default)]
    pub artist: Option<String>,
    #[serde(default)]
    pub album: Option<String>,
    #[serde(default)]
    pub q: Option<String>,
    #[serde(default = "default_limit")]
    pub limit: i64,
    #[serde(default)]
    pub offset: i64,
    #[serde(default)]
    pub order_by: Option<String>,
}

fn default_limit() -> i64 { 50 }

#[derive(Debug, Deserialize)]
pub struct ValuesParams {
    pub field: String,
    #[serde(default)]
    pub q: Option<String>,
    #[serde(default = "default_values_limit")]
    pub limit: i64,
}

fn default_values_limit() -> i64 { 50 }

pub async fn list_values(
    State(state): State<Arc<AppState>>,
    claims: axum::Extension<crate::auth::Claims>,
    Query(params): Query<ValuesParams>,
) -> Result<Json<Vec<String>>, AppError> {
    require_permission(&state.pool, &claims.sub, "library.view").await?;

    if params.field == "genre" {
        let sql = format!(
            "SELECT name FROM genres
             WHERE ($1 IS NULL OR LOWER(name) LIKE LOWER('%' || $1 || '%'))
             ORDER BY name ASC
             LIMIT $2"
        );
        let values: Vec<(String,)> = sqlx::query_as(&sql)
            .bind(params.q)
            .bind(params.limit)
            .fetch_all(&state.pool)
            .await?;
        return Ok(Json(values.into_iter().map(|v| v.0).collect()));
    }

    let column = match params.field.as_str() {
        "artist" => "artist",
        "album" => "album",
        "album_artist" => "album_artist",
        "studio" => "studio",
        _ => return Err(AppError::BadRequest(format!("invalid field: {}", params.field))),
    };

    let sql = format!(
        "SELECT DISTINCT {} FROM songs
         WHERE ($1 IS NULL OR LOWER({}) LIKE LOWER('%' || $1 || '%'))
         AND {} IS NOT NULL
         ORDER BY {} ASC
         LIMIT $2",
        column, column, column, column
    );

    let values: Vec<(String,)> = sqlx::query_as(&sql)
        .bind(params.q)
        .bind(params.limit)
        .fetch_all(&state.pool)
        .await?;

    Ok(Json(values.into_iter().map(|v| v.0).collect()))
}

#[derive(Debug, Deserialize)]
pub struct AlbumCountParams {
    pub album: String,
}

pub async fn album_song_count(
    State(state): State<Arc<AppState>>,
    claims: axum::Extension<crate::auth::Claims>,
    Query(params): Query<AlbumCountParams>,
) -> Result<Json<serde_json::Value>, AppError> {
    require_permission(&state.pool, &claims.sub, "library.view").await?;

    let row: (i64,) = sqlx::query_as(
        "SELECT COUNT(*) FROM songs WHERE LOWER(album) = LOWER($1) AND enabled = true",
    )
    .bind(&params.album)
    .fetch_one(&state.pool)
    .await?;

    Ok(Json(serde_json::json!({ "count": row.0 })))
}

fn sanitize_order_by(order_by: Option<String>) -> &'static str {
    match order_by.as_deref() {
        Some("created_at") => "created_at DESC",
        Some("artist") => "artist, title",
        Some("album") => "album, track_number, title",
        Some("title") | _ => "title",
    }
}

pub async fn list_songs(
    State(state): State<Arc<AppState>>,
    claims: axum::Extension<crate::auth::Claims>,
    Query(params): Query<ListParams>,
) -> Result<Json<Vec<super::model::Song>>, AppError> {
    require_permission(&state.pool, &claims.sub, "library.view").await?;

    let order_clause = sanitize_order_by(params.order_by);
    let sql = format!(
        "SELECT * FROM songs
         WHERE ($1 IS NULL OR LOWER(artist) LIKE LOWER($1))
         AND ($2 IS NULL OR LOWER(album) LIKE LOWER($2))
         AND ($5 IS NULL OR LOWER(title) LIKE LOWER($5) OR LOWER(artist) LIKE LOWER($5) OR LOWER(album) LIKE LOWER($5))
         AND enabled = true
         ORDER BY {}
         LIMIT $3 OFFSET $4",
        order_clause
    );

    let songs_db = sqlx::query_as::<_, super::model::SongDb>(&sql)
        .bind(params.artist.map(|a| format!("%{}%", a)))
        .bind(params.album.map(|a| format!("%{}%", a)))
        .bind(params.limit)
        .bind(params.offset)
        .bind(params.q.map(|q| format!("%{}%", q)))
        .fetch_all(&state.pool)
        .await?;

    let mut songs: Vec<super::model::Song> = songs_db.into_iter().map(|db| db.into()).collect();
    super::model::populate_genres(&state.pool, &mut songs).await?;

    Ok(Json(songs))
}

pub async fn get_song(
    State(state): State<Arc<AppState>>,
    claims: axum::Extension<crate::auth::Claims>,
    Path(id): Path<Uuid>,
) -> Result<Json<super::model::Song>, AppError> {
    require_permission(&state.pool, &claims.sub, "library.view").await?;

    let song_db = sqlx::query_as::<_, super::model::SongDb>("SELECT * FROM songs WHERE id = $1 AND enabled = true")
        .bind(id.to_string())
        .fetch_optional(&state.pool)
        .await?;

    if let Some(db) = song_db {
        let mut song: super::model::Song = db.into();
        super::model::populate_genres_for_one(&state.pool, &mut song).await?;
        Ok(Json(song))
    } else {
        Err(AppError::NotFound)
    }
}

pub async fn get_stream_url(
    State(state): State<Arc<AppState>>,
    claims: axum::Extension<crate::auth::Claims>,
    Path(id): Path<Uuid>,
) -> Result<Json<serde_json::Value>, AppError> {
    require_permission(&state.pool, &claims.sub, "library.view").await?;

    let row = sqlx::query_as::<_, (String, Option<bool>)>(
        "SELECT file_key, hls_ready FROM songs WHERE id = $1 AND enabled = true"
    )
        .bind(id.to_string())
        .fetch_optional(&state.pool)
        .await?;

    let (_file_key, hls_ready) = row.ok_or(AppError::NotFound)?;

    if hls_ready.unwrap_or(false) {
        let playlist_url = format!("/api/v1/songs/{}/playlist", id);
        return Ok(Json(serde_json::json!({ "url": playlist_url })));
    }

    let ticket = crate::stream_ticket::generate_ticket(
        &id.to_string(),
        &claims.sub,
        &state.signing_secret,
        state.url_expiry_seconds,
    );
    let stream_url = format!("/api/v1/songs/{}/stream?ticket={}", id, ticket);
    Ok(Json(serde_json::json!({ "url": stream_url })))
}

pub async fn get_artwork_url(
    State(state): State<Arc<AppState>>,
    claims: axum::Extension<crate::auth::Claims>,
    Path(id): Path<Uuid>,
) -> Result<Json<serde_json::Value>, AppError> {
    require_permission(&state.pool, &claims.sub, "library.view").await?;

    let row = sqlx::query_as::<_, (Option<String>,)>("SELECT artwork_key FROM songs WHERE id = $1 AND enabled = true")
        .bind(id.to_string())
        .fetch_optional(&state.pool)
        .await?;

    let (key,) = row.ok_or(AppError::NotFound)?;
    if key.is_none() {
        return Ok(Json(serde_json::json!({ "url": null })));
    }

    let ticket = crate::stream_ticket::generate_ticket(
        &id.to_string(),
        &claims.sub,
        &state.signing_secret,
        state.url_expiry_seconds,
    );
    let artwork_url = format!("/api/v1/songs/{}/artwork?ticket={}", id, ticket);
    Ok(Json(serde_json::json!({ "url": artwork_url })))
}

pub async fn stream_song(
    State(state): State<Arc<AppState>>,
    Path(id): Path<Uuid>,
    Query(params): Query<TicketParams>,
) -> Result<impl IntoResponse, AppError> {
    let ticket = params.ticket.ok_or(AppError::Unauthorized)?;
    crate::stream_ticket::validate_ticket(&ticket, &id.to_string(), &state.signing_secret)?;

    let row = sqlx::query_as::<_, (String,)>("SELECT file_key FROM songs WHERE id = $1")
        .bind(id.to_string())
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
    Query(params): Query<TicketParams>,
) -> Result<axum::response::Response, AppError> {
    let ticket = params.ticket.ok_or(AppError::Unauthorized)?;
    crate::stream_ticket::validate_ticket(&ticket, &id.to_string(), &state.signing_secret)?;

    let row = sqlx::query_as::<_, (Option<String>,)>("SELECT artwork_key FROM songs WHERE id = $1")
        .bind(id.to_string())
        .fetch_optional(&state.pool)
        .await?;

    let (key,) = row.ok_or(AppError::NotFound)?;
    let Some(key) = key else {
        return Ok(StatusCode::NO_CONTENT.into_response());
    };

    let (stream, size, mime) = state.storage.get_stream(&key).await.map_err(|e| AppError::Storage(e.to_string()))?;

    let headers: axum::http::HeaderMap = [
        (axum::http::header::CONTENT_TYPE, mime.parse::<axum::http::HeaderValue>().unwrap()),
        (axum::http::header::CONTENT_LENGTH, size.to_string().parse::<axum::http::HeaderValue>().unwrap()),
    ]
    .into_iter()
    .collect();

    Ok((headers, axum::body::Body::from_stream(stream)).into_response())
}

#[derive(Debug, serde::Deserialize)]
pub struct LogHistoryBody {
    pub song_id: String,
    pub duration_listened_seconds: Option<i32>,
    #[serde(default)]
    pub completed: bool,
}

pub async fn log_history(
    State(state): State<Arc<AppState>>,
    claims: axum::Extension<crate::auth::Claims>,
    Json(body): Json<LogHistoryBody>,
) -> Result<Json<serde_json::Value>, AppError> {
    let history_id = Uuid::new_v4().to_string();
    sqlx::query(
        "INSERT INTO playback_history (id, user_id, song_id, duration_listened_seconds, completed) VALUES ($1, $2, $3, $4, $5)"
    )
    .bind(history_id)
    .bind(claims.sub.clone())
    .bind(body.song_id)
    .bind(body.duration_listened_seconds)
    .bind(body.completed)
    .execute(&state.pool)
    .await?;

    Ok(Json(serde_json::json!({"ok": true})))
}

pub async fn list_history(
    State(state): State<Arc<AppState>>,
    claims: axum::Extension<crate::auth::Claims>,
) -> Result<Json<Vec<super::model::HistoryEntry>>, AppError> {
    require_permission(&state.pool, &claims.sub, "history.view").await?;

    let entries = sqlx::query_as::<_, super::model::HistoryEntry>(
        "SELECT h.id, h.user_id, h.song_id, h.started_at, h.duration_listened_seconds, h.completed,
                s.title, s.artist, s.album, s.artwork_key, s.duration_seconds
         FROM playback_history h
         JOIN songs s ON h.song_id = s.id
         WHERE h.user_id = $1
         ORDER BY h.started_at DESC
         LIMIT 20"
    )
    .bind(&claims.sub)
    .fetch_all(&state.pool)
    .await?;

    Ok(Json(entries))
}

pub async fn get_stats(
    State(state): State<Arc<AppState>>,
    claims: axum::Extension<crate::auth::Claims>,
) -> Result<Json<super::model::LibraryStats>, AppError> {
    require_permission(&state.pool, &claims.sub, "library.view").await?;

    let row = sqlx::query_as::<_, super::model::LibraryStats>(
        "SELECT
            COUNT(*) as total_songs,
            COUNT(DISTINCT artist) as total_artists,
            COUNT(DISTINCT album) as total_albums,
            COALESCE(SUM(duration_seconds), 0) as total_duration_seconds
         FROM songs"
    )
    .fetch_one(&state.pool)
    .await?;

    Ok(Json(row))
}

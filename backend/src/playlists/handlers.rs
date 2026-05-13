use axum::{
    extract::{Path, State},
    Json,
};
use serde::Deserialize;
use std::sync::Arc;
use uuid::Uuid;

use crate::{
    error::AppError,
    permissions::check_permission,
    playlists::model::Playlist,
    AppState,
};

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
    .bind(&claims.sub)
    .fetch_all(&state.pool)
    .await?;

    Ok(Json(playlists))
}

pub async fn create_playlist(
    State(state): State<Arc<AppState>>,
    claims: axum::Extension<crate::auth::Claims>,
    Json(body): Json<CreatePlaylist>,
) -> Result<Json<Playlist>, AppError> {
    let id = Uuid::new_v4().to_string();

    let playlist = sqlx::query_as::<_, Playlist>(
        "INSERT INTO playlists (id, user_id, name, description) VALUES ($1, $2, $3, $4) RETURNING *"
    )
    .bind(&id)
    .bind(&claims.sub)
    .bind(body.name)
    .bind(body.description)
    .fetch_one(&state.pool)
    .await?;

    Ok(Json(playlist))
}

pub async fn get_playlist(
    State(state): State<Arc<AppState>>,
    claims: axum::Extension<crate::auth::Claims>,
    Path(id): Path<Uuid>,
) -> Result<Json<serde_json::Value>, AppError> {
    let id_str = id.to_string();
    let playlist = sqlx::query_as::<_, Playlist>("SELECT * FROM playlists WHERE id = $1")
        .bind(&id_str)
        .fetch_optional(&state.pool)
        .await?;

    let playlist = playlist.ok_or(AppError::NotFound)?;

    let is_owner = playlist.user_id == claims.sub;
    let can_view_all = check_permission(&state.pool, &claims.sub, "playlists.view_all").await;
    if !playlist.is_public && !is_owner && !can_view_all {
        return Err(AppError::Forbidden(
            "you do not have access to this playlist".into(),
        ));
    }

    let songs_db = sqlx::query_as::<_, crate::songs::model::SongDb>(
        "SELECT s.* FROM songs s
         JOIN playlist_songs ps ON s.id = ps.song_id
         WHERE ps.playlist_id = $1
         ORDER BY ps.position"
    )
    .bind(&id_str)
    .fetch_all(&state.pool)
    .await?;

    let mut songs: Vec<crate::songs::model::Song> = songs_db.into_iter().map(|db| db.into()).collect();
    crate::songs::model::populate_genres(&state.pool, &mut songs).await?;

    Ok(Json(serde_json::json!({
        "playlist": playlist,
        "songs": songs,
    })))
}

#[derive(Debug, Deserialize)]
pub struct UpdatePlaylist {
    pub name: Option<String>,
    pub description: Option<String>,
    pub is_public: Option<bool>,
}

pub async fn update_playlist(
    State(state): State<Arc<AppState>>,
    claims: axum::Extension<crate::auth::Claims>,
    Path(id): Path<Uuid>,
    Json(body): Json<UpdatePlaylist>,
) -> Result<Json<Playlist>, AppError> {
    let id_str = id.to_string();

    let playlist = sqlx::query_as::<_, Playlist>("SELECT * FROM playlists WHERE id = $1")
        .bind(&id_str)
        .fetch_optional(&state.pool)
        .await?;
    let playlist = playlist.ok_or(AppError::NotFound)?;

    let is_owner = playlist.user_id == claims.sub;
    let can_update = check_permission(&state.pool, &claims.sub, "playlists.update").await;
    if !is_owner && !can_update {
        return Err(AppError::Forbidden(
            "you do not have permission to modify this playlist".into(),
        ));
    }

    let name = body.name.unwrap_or(playlist.name);
    let description = body.description.unwrap_or(playlist.description.unwrap_or_default());
    let is_public = body.is_public.unwrap_or(playlist.is_public);

    let updated = sqlx::query_as::<_, Playlist>(
        "UPDATE playlists SET name = $1, description = $2, is_public = $3 WHERE id = $4 RETURNING *"
    )
    .bind(name)
    .bind(description)
    .bind(is_public)
    .bind(&id_str)
    .fetch_one(&state.pool)
    .await?;

    Ok(Json(updated))
}

pub async fn delete_playlist(
    State(state): State<Arc<AppState>>,
    claims: axum::Extension<crate::auth::Claims>,
    Path(id): Path<Uuid>,
) -> Result<Json<serde_json::Value>, AppError> {
    let id_str = id.to_string();

    let playlist = sqlx::query_as::<_, Playlist>("SELECT * FROM playlists WHERE id = $1")
        .bind(&id_str)
        .fetch_optional(&state.pool)
        .await?;
    let playlist = playlist.ok_or(AppError::NotFound)?;

    let is_owner = playlist.user_id == claims.sub;
    let can_delete = check_permission(&state.pool, &claims.sub, "playlists.delete").await;
    if !is_owner && !can_delete {
        return Err(AppError::Forbidden(
            "you do not have permission to delete this playlist".into(),
        ));
    }

    sqlx::query("DELETE FROM playlists WHERE id = $1")
        .bind(&id_str)
        .execute(&state.pool)
        .await?;

    Ok(Json(serde_json::json!({"ok": true})))
}

#[derive(Debug, Deserialize)]
pub struct AddSongBody {
    pub song_id: String,
}

pub async fn add_song(
    State(state): State<Arc<AppState>>,
    claims: axum::Extension<crate::auth::Claims>,
    Path(id): Path<Uuid>,
    Json(body): Json<AddSongBody>,
) -> Result<Json<serde_json::Value>, AppError> {
    let id_str = id.to_string();

    let playlist = sqlx::query_as::<_, Playlist>("SELECT * FROM playlists WHERE id = $1")
        .bind(&id_str)
        .fetch_optional(&state.pool)
        .await?;
    let playlist = playlist.ok_or(AppError::NotFound)?;

    let is_owner = playlist.user_id == claims.sub;
    let can_update = check_permission(&state.pool, &claims.sub, "playlists.update").await;
    if !is_owner && !can_update {
        return Err(AppError::Forbidden(
            "you do not have permission to modify this playlist".into(),
        ));
    }

    let max_pos: Option<i32> = sqlx::query_scalar::<_, Option<i32>>(
        "SELECT MAX(position) FROM playlist_songs WHERE playlist_id = $1"
    )
    .bind(&id_str)
    .fetch_one(&state.pool)
    .await?;

    let position = max_pos.unwrap_or(0) + 1;
    let ps_id = Uuid::new_v4().to_string();

    sqlx::query(
        "INSERT INTO playlist_songs (id, playlist_id, song_id, position) VALUES ($1, $2, $3, $4)"
    )
    .bind(&ps_id)
    .bind(&id_str)
    .bind(&body.song_id)
    .bind(position)
    .execute(&state.pool)
    .await?;

    Ok(Json(serde_json::json!({"ok": true})))
}

pub async fn remove_song(
    State(state): State<Arc<AppState>>,
    claims: axum::Extension<crate::auth::Claims>,
    Path((id, song_id)): Path<(Uuid, Uuid)>,
) -> Result<Json<serde_json::Value>, AppError> {
    let id_str = id.to_string();

    let playlist = sqlx::query_as::<_, Playlist>("SELECT * FROM playlists WHERE id = $1")
        .bind(&id_str)
        .fetch_optional(&state.pool)
        .await?;
    let playlist = playlist.ok_or(AppError::NotFound)?;

    let is_owner = playlist.user_id == claims.sub;
    let can_delete = check_permission(&state.pool, &claims.sub, "playlists.delete").await;
    if !is_owner && !can_delete {
        return Err(AppError::Forbidden(
            "you do not have permission to modify this playlist".into(),
        ));
    }

    sqlx::query("DELETE FROM playlist_songs WHERE playlist_id = $1 AND song_id = $2")
        .bind(&id_str)
        .bind(song_id.to_string())
        .execute(&state.pool)
        .await?;

    Ok(Json(serde_json::json!({"ok": true})))
}

#[derive(Debug, Deserialize)]
pub struct ReorderSongsBody {
    pub song_ids: Vec<String>,
}

pub async fn reorder_songs(
    State(state): State<Arc<AppState>>,
    claims: axum::Extension<crate::auth::Claims>,
    Path(id): Path<Uuid>,
    Json(body): Json<ReorderSongsBody>,
) -> Result<Json<serde_json::Value>, AppError> {
    let id_str = id.to_string();

    let playlist = sqlx::query_as::<_, Playlist>("SELECT * FROM playlists WHERE id = $1")
        .bind(&id_str)
        .fetch_optional(&state.pool)
        .await?;
    let playlist = playlist.ok_or(AppError::NotFound)?;

    let is_owner = playlist.user_id == claims.sub;
    let can_update = check_permission(&state.pool, &claims.sub, "playlists.update").await;
    if !is_owner && !can_update {
        return Err(AppError::Forbidden(
            "you do not have permission to modify this playlist".into(),
        ));
    }

    if body.song_ids.is_empty() {
        return Ok(Json(serde_json::json!({"ok": true})));
    }

    // Verify all song_ids belong to this playlist
    let existing: Vec<String> = sqlx::query_scalar(
        "SELECT song_id FROM playlist_songs WHERE playlist_id = $1"
    )
    .bind(&id_str)
    .fetch_all(&state.pool)
    .await?;

    let existing_set: std::collections::HashSet<String> = existing.into_iter().collect();
    for sid in &body.song_ids {
        if !existing_set.contains(sid) {
            return Err(AppError::BadRequest(format!("song {} is not in this playlist", sid)));
        }
    }

    // Reassign positions atomically in a transaction by using a temporary table or
    // by updating each row individually. Since sqlx::AnyPool doesn't support
    // native transactions cleanly across backends without type gymnastics,
    // we do individual updates. For small playlists this is fine.
    for (idx, song_id) in body.song_ids.iter().enumerate() {
        let position = (idx as i32) + 1;
        sqlx::query(
            "UPDATE playlist_songs SET position = $1 WHERE playlist_id = $2 AND song_id = $3"
        )
        .bind(position)
        .bind(&id_str)
        .bind(song_id)
        .execute(&state.pool)
        .await?;
    }

    Ok(Json(serde_json::json!({"ok": true})))
}

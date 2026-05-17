// Human: User playlist CRUD with ownership checks plus optional permission overrides (`playlists.view_all`, `playlists.update`, etc.).
// Agent: READS/WRITES playlists + playlist_songs; check_permission gates non-owner access; RETURNS nested songs with genres hydrated.
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
    playlists::model::{Playlist, PlaylistSong},
    AppState,
};

#[derive(Debug, Deserialize)]
pub struct CreatePlaylist {
    pub name: String,
    pub description: Option<String>,
}

// Human: Return every playlist owned by the caller ordered by recency—no public cross-user listing here.
// Agent: READS playlists WHERE user_id = claims.sub; NO permission join; RETURNS Vec<Playlist>.
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

// Human: Create an empty playlist shell the caller owns; songs are added via later endpoints.
// Agent: INSERT playlists RETURNING *; BINDS random UUID id; REQUIRES auth middleware only.
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

// Human: Fetch playlist metadata plus ordered song rows, enforcing either public visibility, ownership, or `playlists.view_all`.
// Agent: READS playlist row; MAY 403; JOIN songs via playlist_songs ordered by position; hydrates genres.
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
    if !playlist.is_public_bool() && !is_owner && !can_view_all {
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

// Human: Patch textual fields and visibility with owner-or-`playlists.update` authorization using coalescing defaults from the existing row.
// Agent: UPDATE playlists; REQUIRES owner or permission; RETURNS refreshed Playlist.
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
    let is_public = body
        .is_public
        .map(|v| if v { 1 } else { 0 })
        .unwrap_or(playlist.is_public);

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

// Human: Hard-delete a playlist and rely on FK cascades/triggers to drop join rows—guarded like update for non-owners.
// Agent: DELETE playlists WHERE id; REQUIRES owner or playlists.delete permission; HTTP 404 if row missing.
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

// Human: Append a song to the tail by allocating max(position)+1 with the same auth gates as updates.
// Agent: INSERT playlist_songs; VALIDATES playlist exists + auth; RETURNS inserted PlaylistSong row JSON.
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

    // Human: Persist the join row and return it so clients can show position without another round trip.
    // Agent: WRITES playlist_songs; RETURNS PlaylistSong via RETURNING; HTTP 200 { ok, entry }.
    let entry = sqlx::query_as::<_, PlaylistSong>(
        "INSERT INTO playlist_songs (id, playlist_id, song_id, position) VALUES ($1, $2, $3, $4) RETURNING *",
    )
    .bind(&ps_id)
    .bind(&id_str)
    .bind(&body.song_id)
    .bind(position)
    .fetch_one(&state.pool)
    .await?;

    Ok(Json(serde_json::json!({"ok": true, "entry": entry})))
}

// Human: Remove a single song association without reshuffling remaining positions (gaps allowed in this schema).
// Agent: DELETE playlist_songs scoped to playlist + song UUID; REQUIRES owner or playlists.delete-style permission path.
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

// Human: Reassign contiguous positions according to the client-supplied id list inside one DB transaction.
// Agent: READS existing song_id set; ERROR if unknown id; TX wraps all position UPDATEs; ROLLBACK on any failure.
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

    // Human: UNIQUE (playlist_id, position) means we cannot assign final slots in one pass—use high temp slots first.
    // Agent: TX phase1 offset positions 10_000+; TX phase2 contiguous 1..n; COMMIT rolls back all on failure.
    let mut tx = state.pool.begin().await?;
    for (idx, song_id) in body.song_ids.iter().enumerate() {
        let temp_position = 10_000 + (idx as i32);
        sqlx::query(
            "UPDATE playlist_songs SET position = $1 WHERE playlist_id = $2 AND song_id = $3",
        )
        .bind(temp_position)
        .bind(&id_str)
        .bind(song_id)
        .execute(&mut *tx)
        .await?;
    }
    for (idx, song_id) in body.song_ids.iter().enumerate() {
        let position = (idx as i32) + 1;
        sqlx::query(
            "UPDATE playlist_songs SET position = $1 WHERE playlist_id = $2 AND song_id = $3",
        )
        .bind(position)
        .bind(&id_str)
        .bind(song_id)
        .execute(&mut *tx)
        .await?;
    }
    tx.commit().await?;

    Ok(Json(serde_json::json!({"ok": true})))
}

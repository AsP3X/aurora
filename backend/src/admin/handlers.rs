use axum::{
    extract::{Path, Query, State},
    Json,
};
use serde::Deserialize;
use std::sync::Arc;
use uuid::Uuid;

use crate::{
    error::AppError,
    permissions::require_admin_access,
    AppState,
};

#[derive(Debug, Deserialize)]
pub struct ListParams {
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

fn sanitize_order_by(order_by: Option<String>) -> &'static str {
    match order_by.as_deref() {
        Some("created_at") => "created_at DESC",
        Some("artist") => "artist, title",
        Some("album") => "album, track_number, title",
        Some("title") | _ => "title",
    }
}

pub async fn list_admin_songs(
    State(state): State<Arc<AppState>>,
    claims: axum::Extension<crate::auth::Claims>,
    Query(params): Query<ListParams>,
) -> Result<Json<Vec<crate::songs::model::Song>>, AppError> {
    require_admin_access(&state.pool, &claims.sub, &claims.role).await?;

    let order_clause = sanitize_order_by(params.order_by);
    let sql = format!(
        "SELECT * FROM songs
         WHERE ($1 IS NULL OR LOWER(title) LIKE LOWER($1) OR LOWER(artist) LIKE LOWER($1) OR LOWER(album) LIKE LOWER($1))
         ORDER BY {}
         LIMIT $2 OFFSET $3",
        order_clause
    );

    let songs_db = sqlx::query_as::<_, crate::songs::model::SongDb>(&sql)
        .bind(params.q.map(|q| format!("%{}%", q)))
        .bind(params.limit)
        .bind(params.offset)
        .fetch_all(&state.pool)
        .await?;

    let mut songs: Vec<crate::songs::model::Song> = songs_db.into_iter().map(|db| db.into()).collect();
    crate::songs::model::populate_genres(&state.pool, &mut songs).await?;

    Ok(Json(songs))
}

pub async fn delete_song(
    State(state): State<Arc<AppState>>,
    claims: axum::Extension<crate::auth::Claims>,
    Path(id): Path<String>,
) -> Result<Json<serde_json::Value>, AppError> {
    require_admin_access(&state.pool, &claims.sub, &claims.role).await?;

    let row = sqlx::query_as::<_, (String, Option<String>)>(
        "SELECT file_key, artwork_key FROM songs WHERE id = $1"
    )
    .bind(&id)
    .fetch_optional(&state.pool)
    .await?;

    let (file_key, artwork_key) = row.ok_or(AppError::NotFound)?;

    state.storage.delete(&file_key).await.map_err(|e| AppError::Storage(e.to_string()))?;
    if let Some(art) = &artwork_key {
        let _ = state.storage.delete(art).await;
    }

    sqlx::query("DELETE FROM songs WHERE id = $1")
        .bind(&id)
        .execute(&state.pool)
        .await?;

    Ok(Json(serde_json::json!({"ok": true})))
}

#[derive(Debug, serde::Serialize, sqlx::FromRow)]
pub struct AdminPlaylist {
    pub id: String,
    pub user_id: String,
    pub name: String,
    pub description: Option<String>,
    pub is_public: i64,
    pub created_at: String,
    pub owner_email: String,
    pub song_count: i64,
}

pub async fn list_all_playlists(
    State(state): State<Arc<AppState>>,
    claims: axum::Extension<crate::auth::Claims>,
) -> Result<Json<Vec<AdminPlaylist>>, AppError> {
    require_admin_access(&state.pool, &claims.sub, &claims.role).await?;

    let playlists = sqlx::query_as::<_, AdminPlaylist>(
        "SELECT p.id, p.user_id, p.name, p.description, p.is_public, p.created_at,
                u.email as owner_email,
                COUNT(ps.id) as song_count
         FROM playlists p
         JOIN users u ON p.user_id = u.id
         LEFT JOIN playlist_songs ps ON ps.playlist_id = p.id
         GROUP BY p.id, u.email
         ORDER BY p.created_at DESC"
    )
    .fetch_all(&state.pool)
    .await?;

    Ok(Json(playlists))
}

pub async fn delete_playlist(
    State(state): State<Arc<AppState>>,
    claims: axum::Extension<crate::auth::Claims>,
    Path(id): Path<String>,
) -> Result<Json<serde_json::Value>, AppError> {
    require_admin_access(&state.pool, &claims.sub, &claims.role).await?;

    let result = sqlx::query("DELETE FROM playlists WHERE id = $1")
        .bind(&id)
        .execute(&state.pool)
        .await?;

    if result.rows_affected() == 0 {
        return Err(AppError::NotFound);
    }

    Ok(Json(serde_json::json!({"ok": true})))
}

#[derive(Debug, serde::Serialize)]
pub struct AdminStats {
    pub total_users: i64,
    pub total_songs: i64,
    pub total_playlists: i64,
    pub total_storage_bytes: i64,
}

pub async fn get_admin_stats(
    State(state): State<Arc<AppState>>,
    claims: axum::Extension<crate::auth::Claims>,
) -> Result<Json<AdminStats>, AppError> {
    require_admin_access(&state.pool, &claims.sub, &claims.role).await?;

    let total_users: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM users")
        .fetch_one(&state.pool)
        .await?;

    let total_songs: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM songs")
        .fetch_one(&state.pool)
        .await?;

    let total_playlists: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM playlists")
        .fetch_one(&state.pool)
        .await?;

    let total_storage_bytes: i64 = sqlx::query_scalar("SELECT COALESCE(SUM(file_size_bytes), 0) FROM songs")
        .fetch_one(&state.pool)
        .await?;

    Ok(Json(AdminStats {
        total_users,
        total_songs,
        total_playlists,
        total_storage_bytes,
    }))
}

#[derive(Debug, serde::Serialize, sqlx::FromRow)]
pub struct AppSetting {
    pub key: String,
    pub value: String,
    pub updated_at: String,
}

pub async fn list_settings(
    State(state): State<Arc<AppState>>,
    claims: axum::Extension<crate::auth::Claims>,
) -> Result<Json<Vec<AppSetting>>, AppError> {
    require_admin_access(&state.pool, &claims.sub, &claims.role).await?;

    let settings = sqlx::query_as::<_, AppSetting>(
        "SELECT key, value, updated_at FROM app_settings ORDER BY key"
    )
    .fetch_all(&state.pool)
    .await?;

    Ok(Json(settings))
}

#[derive(Debug, Deserialize)]
pub struct UpdateSetting {
    pub value: String,
}

pub async fn update_setting(
    State(state): State<Arc<AppState>>,
    claims: axum::Extension<crate::auth::Claims>,
    Path(key): Path<String>,
    Json(body): Json<UpdateSetting>,
) -> Result<Json<serde_json::Value>, AppError> {
    require_admin_access(&state.pool, &claims.sub, &claims.role).await?;

    let updated = sqlx::query("UPDATE app_settings SET value = $1 WHERE key = $2")
        .bind(&body.value)
        .bind(&key)
        .execute(&state.pool)
        .await?;

    if updated.rows_affected() == 0 {
        sqlx::query("INSERT INTO app_settings (key, value) VALUES ($1, $2)")
            .bind(&key)
            .bind(&body.value)
            .execute(&state.pool)
            .await?;
    }

    Ok(Json(serde_json::json!({"ok": true})))
}

#[derive(Debug, Deserialize)]
pub struct UpdateRole {
    pub role: String,
}

pub async fn update_user_role(
    State(state): State<Arc<AppState>>,
    claims: axum::Extension<crate::auth::Claims>,
    Path(user_id): Path<String>,
    Json(body): Json<UpdateRole>,
) -> Result<Json<serde_json::Value>, AppError> {
    require_admin_access(&state.pool, &claims.sub, &claims.role).await?;

    if claims.role != "admin" {
        return Err(AppError::Forbidden("only admins can change roles".into()));
    }

    if claims.sub == user_id {
        return Err(AppError::BadRequest("cannot change your own role".into()));
    }

    if body.role != "admin" && body.role != "listener" {
        return Err(AppError::BadRequest("invalid role".into()));
    }

    let current_role: Option<(String,)> = sqlx::query_as("SELECT role FROM users WHERE id = $1")
        .bind(&user_id)
        .fetch_optional(&state.pool)
        .await?;

    let (current_role,) = current_role.ok_or(AppError::NotFound)?;

    sqlx::query("UPDATE users SET role = $1 WHERE id = $2")
        .bind(&body.role)
        .bind(&user_id)
        .execute(&state.pool)
        .await?;

    if body.role == "admin" && current_role != "admin" {
        let membership_id = Uuid::new_v4().to_string();
        let _ = sqlx::query(
            "INSERT INTO group_memberships (id, user_id, group_id) VALUES ($1, $2, '00000000-0000-0000-0000-000000000002')"
        )
        .bind(&membership_id)
        .bind(&user_id)
        .execute(&state.pool)
        .await;
    } else if body.role != "admin" && current_role == "admin" {
        let _ = sqlx::query(
            "DELETE FROM group_memberships WHERE user_id = $1 AND group_id = '00000000-0000-0000-0000-000000000002'"
        )
        .bind(&user_id)
        .execute(&state.pool)
        .await;
    }

    Ok(Json(serde_json::json!({"ok": true})))
}

pub async fn delete_user(
    State(state): State<Arc<AppState>>,
    claims: axum::Extension<crate::auth::Claims>,
    Path(user_id): Path<String>,
) -> Result<Json<serde_json::Value>, AppError> {
    require_admin_access(&state.pool, &claims.sub, &claims.role).await?;

    if claims.sub == user_id {
        return Err(AppError::BadRequest("cannot delete yourself".into()));
    }

    sqlx::query("UPDATE songs SET publisher_id = NULL WHERE publisher_id = $1")
        .bind(&user_id)
        .execute(&state.pool)
        .await?;

    let result = sqlx::query("DELETE FROM users WHERE id = $1")
        .bind(&user_id)
        .execute(&state.pool)
        .await?;

    if result.rows_affected() == 0 {
        return Err(AppError::NotFound);
    }

    Ok(Json(serde_json::json!({"ok": true})))
}

#[derive(Debug, Deserialize)]
pub struct UpdateSongBody {
    pub title: Option<String>,
    pub artist: Option<String>,
    pub album: Option<String>,
    pub album_artist: Option<String>,
    pub track_number: Option<i32>,
    pub year: Option<i32>,
    pub genres: Option<Vec<String>>,
    pub studio: Option<String>,
}

pub async fn update_song(
    State(state): State<Arc<AppState>>,
    claims: axum::Extension<crate::auth::Claims>,
    Path(id): Path<String>,
    Json(body): Json<UpdateSongBody>,
) -> Result<Json<crate::songs::model::Song>, AppError> {
    require_admin_access(&state.pool, &claims.sub, &claims.role).await?;

    let mut tx = state.pool.begin().await?;

    let mut sets: Vec<String> = Vec::new();
    let mut binds: Vec<String> = Vec::new();

    if let Some(v) = body.title {
        sets.push(format!("title = ${}", sets.len() + 2));
        binds.push(v);
    }
    if let Some(v) = body.artist {
        sets.push(format!("artist = ${}", sets.len() + 2));
        binds.push(v);
    }
    if let Some(v) = body.album {
        sets.push(format!("album = ${}", sets.len() + 2));
        binds.push(v);
    }
    if let Some(v) = body.album_artist {
        sets.push(format!("album_artist = ${}", sets.len() + 2));
        binds.push(v);
    }
    if let Some(v) = body.track_number {
        sets.push(format!("track_number = ${}", sets.len() + 2));
        binds.push(v.to_string());
    }
    if let Some(v) = body.year {
        sets.push(format!("year = ${}", sets.len() + 2));
        binds.push(v.to_string());
    }
    if let Some(v) = body.studio {
        sets.push(format!("studio = ${}", sets.len() + 2));
        binds.push(v);
    }

    let song_db = if !sets.is_empty() {
        let sql = format!(
            "UPDATE songs SET {} WHERE id = $1 RETURNING *",
            sets.join(", ")
        );
        let mut query = sqlx::query_as::<_, crate::songs::model::SongDb>(&sql).bind(&id);
        for b in &binds {
            query = query.bind(b);
        }
        query.fetch_one(&mut *tx).await?
    } else {
        sqlx::query_as::<_, crate::songs::model::SongDb>("SELECT * FROM songs WHERE id = $1")
            .bind(&id)
            .fetch_one(&mut *tx)
            .await?
    };

    if let Some(genres) = body.genres {
        sqlx::query("DELETE FROM song_genres WHERE song_id = $1")
            .bind(&id)
            .execute(&mut *tx)
            .await?;

        let mut seen = std::collections::HashSet::new();
        for genre in genres {
            let genre_lower = genre.trim().to_lowercase();
            if genre_lower.is_empty() || !seen.insert(genre_lower.clone()) { continue; }

            let existing: Option<(i64,)> = sqlx::query_as("SELECT id FROM genres WHERE name = $1")
                .bind(&genre_lower)
                .fetch_optional(&mut *tx)
                .await?;

            if existing.is_none() {
                sqlx::query("INSERT INTO genres (name) VALUES ($1)")
                    .bind(&genre_lower)
                    .execute(&mut *tx)
                    .await?;
            }

            sqlx::query(
                "INSERT INTO song_genres (song_id, genre_id)
                 SELECT $1, id FROM genres WHERE name = $2"
            )
            .bind(&id)
            .bind(&genre_lower)
            .execute(&mut *tx)
            .await?;
        }
    }

    tx.commit().await?;

    let mut song: crate::songs::model::Song = song_db.into();
    crate::songs::model::populate_genres_for_one(&state.pool, &mut song).await?;
    Ok(Json(song))
}

#[derive(Debug, Deserialize)]
pub struct ToggleEnabledBody {
    pub enabled: bool,
}

pub async fn toggle_song_enabled(
    State(state): State<Arc<AppState>>,
    claims: axum::Extension<crate::auth::Claims>,
    Path(id): Path<String>,
    Json(body): Json<ToggleEnabledBody>,
) -> Result<Json<crate::songs::model::Song>, AppError> {
    require_admin_access(&state.pool, &claims.sub, &claims.role).await?;

    let song_db = sqlx::query_as::<_, crate::songs::model::SongDb>(
        "UPDATE songs SET enabled = $1 WHERE id = $2 RETURNING *"
    )
    .bind(body.enabled)
    .bind(&id)
    .fetch_one(&state.pool)
    .await?;

    let mut song: crate::songs::model::Song = song_db.into();
    crate::songs::model::populate_genres_for_one(&state.pool, &mut song).await?;
    Ok(Json(song))
}

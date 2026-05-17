// Human: Admin REST surface: searchable song views, destructive deletes, playlist management, settings, and user/role maintenance guarded by `require_admin_access`.
// Agent: READS/WRITES songs, playlists, app_settings, users, group_memberships; MULTIPART update_song; SQL ORDER BY whitelist via sanitize_order_by.
use axum::{
    extract::{FromRequest, Path as AxumPath, Query, State},
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
use axum::extract::Multipart;
use std::path::Path;

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

// Human: Only allow predictable ORDER BY fragments so dynamic SQL cannot pivot into arbitrary column injection.
// Agent: READS Option<String>; RETURNS static ORDER BY clause fragment; IGNORES unknown values → title ordering.
fn sanitize_order_by(order_by: Option<String>) -> &'static str {
    match order_by.as_deref() {
        Some("created_at") => "created_at DESC",
        Some("artist") => "artist, title",
        Some("album") => "album, track_number, title",
        Some("title") | _ => "title",
    }
}

// --- Admin song library ---

// Human: Paginated admin song search with optional text filter and safe `order_by` mapping, then hydrates genre arrays like public list endpoints.
// Agent: REQUIRES require_admin_access; READS songs; CALLS populate_genres; DYNAMIC SQL ORDER BY whitelist only.
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

// Human: Best-effort object delete for optional blobs so failed primary deletes do not leave orphan keys in logs only.
// Agent: CALLS Storage::delete; LOGS warn on failure; NO AppError propagation.
async fn delete_storage_key(storage: &dyn crate::storage::Storage, key: &str) {
    if let Err(e) = storage.delete(key).await {
        tracing::warn!(key = %key, error = %e, "Failed to delete storage key");
    }
}

pub async fn delete_song(
    State(state): State<Arc<AppState>>,
    claims: axum::Extension<crate::auth::Claims>,
    AxumPath(id): AxumPath<String>,
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

    let song_id = id.clone();
    let sync = state.search_sync.clone();
    tokio::spawn(async move {
        sync.notify_song_delete(&song_id).await;
    });

    Ok(Json(serde_json::json!({"ok": true})))
}

// --- Admin playlists & aggregates ---

#[derive(Debug, serde::Serialize, sqlx::FromRow)]
pub struct AdminPlaylist {
    pub id: String,
    pub user_id: String,
    pub name: String,
    pub description: Option<String>,
    #[serde(with = "crate::playlists::model::serde_is_public")]
    pub is_public: i64,
    pub created_at: String,
    pub owner_email: String,
    pub song_count: i64,
}

// Human: Cross-user playlist overview for support: owner email plus derived song counts per playlist.
// Agent: READS playlists JOIN users; GROUP BY; REQUIRES admin; RETURNS AdminPlaylist rows sorted recent-first.
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
    AxumPath(id): AxumPath<String>,
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

    let total_storage_bytes: i64 = sqlx::query_scalar("SELECT COALESCE(SUM(file_size_bytes), 0)::BIGINT FROM songs")
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

// Human: Merge persisted keys with documented defaults so fresh installs still expose registration toggles in the admin UI.
// Agent: READS app_settings; MERGES HashMap defaults; SORTS keys; HTTP requires admin via require_admin_access caller.
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

    let mut merged: std::collections::HashMap<String, AppSetting> =
        settings.into_iter().map(|s| (s.key.clone(), s)).collect();

    let defaults = [
        ("allow_public_registration", "false"),
        ("require_account_activation", "false"),
    ];

    let now = chrono::Utc::now().to_rfc3339();
    for (key, value) in &defaults {
        merged.entry(key.to_string()).or_insert(AppSetting {
            key: key.to_string(),
            value: value.to_string(),
            updated_at: now.clone(),
        });
    }

    let mut result: Vec<AppSetting> = merged.into_values().collect();
    result.sort_by(|a, b| a.key.cmp(&b.key));

    Ok(Json(result))
}

#[derive(Debug, Deserialize)]
pub struct UpdateSetting {
    pub value: String,
}

pub async fn update_setting(
    State(state): State<Arc<AppState>>,
    claims: axum::Extension<crate::auth::Claims>,
    AxumPath(key): AxumPath<String>,
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

pub async fn get_public_registration_setting(
    State(state): State<Arc<AppState>>,
) -> Result<Json<serde_json::Value>, AppError> {
    let value: Option<(String,)> = sqlx::query_as(
        "SELECT value FROM app_settings WHERE key = 'allow_public_registration'"
    )
    .fetch_optional(&state.pool)
    .await?;

    let enabled = value.map(|(v,)| v == "true").unwrap_or(true);
    Ok(Json(serde_json::json!({ "allow_public_registration": enabled })))
}

#[derive(Debug, Deserialize)]
pub struct UpdateRole {
    pub role: String,
}

// Human: Promote or demote roles while keeping the fixed Admin group membership row in sync with the new role.
// Agent: READS users.role; WRITES users; INSERT/DELETE group_memberships admin group UUID; HTTP 400 blocks self edits.
pub async fn update_user_role(
    State(state): State<Arc<AppState>>,
    claims: axum::Extension<crate::auth::Claims>,
    AxumPath(user_id): AxumPath<String>,
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
    AxumPath(user_id): AxumPath<String>,
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
    pub remove_artwork: Option<bool>,
}

// Human: Accept JSON or multipart (metadata + optional artwork) so admins can patch tags and cover art in one request shape.
// Agent: READS Content-Type; BUILDS dynamic UPDATE + binds; REWRITES song_genres; Storage put/delete for artwork_key rotation.
pub async fn update_song(
    State(state): State<Arc<AppState>>,
    claims: axum::Extension<crate::auth::Claims>,
    AxumPath(id): AxumPath<String>,
    req: axum::extract::Request,
) -> Result<Json<crate::songs::model::Song>, AppError> {
    require_admin_access(&state.pool, &claims.sub, &claims.role).await?;

    let content_type = req.headers().get("content-type").and_then(|v| v.to_str().ok()).unwrap_or("").to_string();

    let (body, artwork_bytes, art_ext): (UpdateSongBody, Option<Vec<u8>>, Option<String>) = if content_type.starts_with("multipart/form-data") {
        let mut multipart = Multipart::from_request(req, &state).await.map_err(|e| AppError::BadRequest(e.to_string()))?;
        let mut metadata_json: Option<String> = None;
        let mut artwork: Option<Vec<u8>> = None;
        let mut artwork_ext: Option<String> = None;

        while let Some(field) = multipart.next_field().await.map_err(|e| AppError::BadRequest(e.to_string()))? {
            let name = field.name().unwrap_or("").to_string();
            if name == "metadata" {
                let data = field.bytes().await.map_err(|e| AppError::BadRequest(e.to_string()))?;
                metadata_json = Some(String::from_utf8_lossy(&data).to_string());
            } else if name == "artwork" {
                let file_name = field.file_name().unwrap_or("").to_string();
                let ext = Path::new(&file_name)
                    .extension()
                    .and_then(|e| e.to_str())
                    .map(|e| e.to_lowercase());
                let data = field.bytes().await.map_err(|e| AppError::BadRequest(e.to_string()))?;
                artwork = Some(data.to_vec());
                artwork_ext = ext;
            }
        }

        let metadata_json = metadata_json.unwrap_or_else(|| "{}".to_string());
        let body: UpdateSongBody = serde_json::from_str(&metadata_json).map_err(|e| AppError::BadRequest(e.to_string()))?;
        (body, artwork, artwork_ext)
    } else {
        let body_bytes = axum::body::to_bytes(req.into_body(), usize::MAX).await.map_err(|e| AppError::BadRequest(e.to_string()))?;
        let body: UpdateSongBody = serde_json::from_slice(&body_bytes).map_err(|e| AppError::BadRequest(e.to_string()))?;
        (body, None, None)
    };

    if let Some(ref bytes) = artwork_bytes {
        if bytes.is_empty() {
            return Err(AppError::BadRequest("artwork file is empty".into()));
        }
    }

    let current_artwork_key: Option<Option<String>> = sqlx::query_scalar("SELECT artwork_key FROM songs WHERE id = $1")
        .bind(&id)
        .fetch_optional(&state.pool)
        .await?;
    let current_artwork_key = current_artwork_key.ok_or(AppError::NotFound)?;

    let mut should_clear_artwork = false;

    let new_artwork_key: Option<String> = if let Some(bytes) = artwork_bytes {
        let ext = art_ext.ok_or_else(|| AppError::BadRequest("artwork file missing extension".into()))?;
        let key = format!("artwork/{}.{}", id, ext);
        let mime = match ext.as_str() {
            "jpg" | "jpeg" => "image/jpeg",
            "png" => "image/png",
            "gif" => "image/gif",
            "webp" => "image/webp",
            _ => "application/octet-stream",
        };
        state.storage.put(&key, mime, bytes).await.map_err(|e| AppError::Storage(e.to_string()))?;
        should_clear_artwork = true;
        Some(key)
    } else if body.remove_artwork == Some(true) {
        should_clear_artwork = true;
        None
    } else {
        current_artwork_key.clone()
    };

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
    if should_clear_artwork {
        sets.push(format!("artwork_key = ${}", sets.len() + 2));
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
        if should_clear_artwork {
            query = query.bind(new_artwork_key.clone());
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

    if should_clear_artwork {
        if let Some(ref old_key) = current_artwork_key {
            delete_storage_key(&*state.storage, old_key).await;
        }
    }

    let mut song: crate::songs::model::Song = song_db.into();
    crate::songs::model::populate_genres_for_one(&state.pool, &mut song).await?;

    let song_id = song.id.clone();
    let sync = state.search_sync.clone();
    tokio::spawn(async move {
        sync.notify_song_upsert(&song_id).await;
    });

    Ok(Json(song))
}

#[derive(Debug, Deserialize)]
pub struct ToggleEnabledBody {
    pub enabled: bool,
}

pub async fn toggle_song_enabled(
    State(state): State<Arc<AppState>>,
    claims: axum::Extension<crate::auth::Claims>,
    AxumPath(id): AxumPath<String>,
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

    let song_id = song.id.clone();
    let sync = state.search_sync.clone();
    tokio::spawn(async move {
        sync.notify_song_upsert(&song_id).await;
    });

    Ok(Json(song))
}

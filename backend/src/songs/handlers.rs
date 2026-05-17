use axum::{
    extract::{Path, Query, State},
    extract::rejection::QueryRejection,
    http::StatusCode,
    response::{IntoResponse, Response},
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
    permissions::{require_admin_access, require_permission},
    AppState,
};

// Human: Library song routes (faceted search, metadata), ticket-signed media URLs, playback history writes, and user/admin listening analytics over `playback_history`.
// Agent: READS songs + playback_history; USES stream_ticket for tokenized GETs; REQUIRES library.view / history.view / stats.view; admin aggregate paths USE admin_listening_rl + tracing audit targets.
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

// --- Library discovery (filters & faceted values) ---

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

// --- Library listing & song detail ---

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

// --- Progressive streaming & artwork URLs (JWT auth at issue time) ---

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

// --- Ticket-gated full-file stream / artwork bytes ---

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

// --- Playback history (append, patch, list) ---

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
    let started_at = chrono::Utc::now().to_rfc3339();
    sqlx::query(
        "INSERT INTO playback_history (id, user_id, song_id, started_at, duration_listened_seconds, completed) VALUES ($1, $2, $3, $4, $5, $6)"
    )
    .bind(&history_id)
    .bind(&claims.sub)
    .bind(&body.song_id)
    .bind(&started_at)
    .bind(body.duration_listened_seconds)
    .bind(body.completed)
    .execute(&state.pool)
    .await?;

    Ok(Json(serde_json::json!({"id": history_id})))
}

#[derive(Debug, serde::Deserialize)]
pub struct UpdateHistoryBody {
    pub duration_listened_seconds: i32,
    pub completed: bool,
}

pub async fn update_history(
    State(state): State<Arc<AppState>>,
    claims: axum::Extension<crate::auth::Claims>,
    Path(id): Path<String>,
    Json(body): Json<UpdateHistoryBody>,
) -> Result<Json<serde_json::Value>, AppError> {
    let ended_at = chrono::Utc::now().to_rfc3339();
    let result = sqlx::query(
        "UPDATE playback_history SET duration_listened_seconds = $1, completed = $2, ended_at = $3, updated_at = $3 WHERE id = $4 AND user_id = $5"
    )
    .bind(body.duration_listened_seconds)
    .bind(body.completed)
    .bind(&ended_at)
    .bind(&id)
    .bind(&claims.sub)
    .execute(&state.pool)
    .await?;

    if result.rows_affected() == 0 {
        return Err(AppError::NotFound);
    }

    Ok(Json(serde_json::json!({"ok": true})))
}

#[derive(Debug, Deserialize)]
pub struct HistoryListParams {
    #[serde(default = "default_history_limit")]
    pub limit: i64,
}

fn default_history_limit() -> i64 { 20 }

pub async fn list_history(
    State(state): State<Arc<AppState>>,
    claims: axum::Extension<crate::auth::Claims>,
    Query(params): Query<HistoryListParams>,
) -> Result<Json<Vec<super::model::HistoryEntry>>, AppError> {
    require_permission(&state.pool, &claims.sub, "history.view").await?;

    let entries = sqlx::query_as::<_, super::model::HistoryEntry>(
        "SELECT h.id, h.user_id, h.song_id, h.started_at, h.ended_at, h.duration_listened_seconds, h.completed,
                s.title, s.artist, s.album, s.artwork_key, s.duration_seconds
         FROM playback_history h
         JOIN songs s ON h.song_id = s.id
         WHERE h.user_id = $1
           AND (h.duration_listened_seconds > 0 OR h.completed = true)
         ORDER BY h.started_at DESC
         LIMIT $2"
    )
    .bind(&claims.sub)
    .bind(params.limit)
    .fetch_all(&state.pool)
    .await?;

    Ok(Json(entries))
}

// --- Listening analytics helpers (dialect-aware SQL, shared by user + admin aggregates) ---

fn period_clause(dialect: &super::date_dialect::Dialect, period: &str) -> Option<String> {
    match period {
        "today" => Some(dialect.date_eq_today.to_string()),
        "week" => Some(dialect.date_gte_week_ago.to_string()),
        "month" => Some(dialect.date_gte_month_start.to_string()),
        _ => None,
    }
}

#[derive(Debug, Deserialize)]
pub struct ListeningTimeParams {
    #[serde(default = "default_period")]
    pub period: String,
}

fn default_period() -> String { "all".to_string() }

#[derive(Debug, Deserialize)]
pub struct ListeningBySongParams {
    #[serde(default = "default_period")]
    pub period: String,
    #[serde(default = "default_listening_by_song_limit")]
    pub limit: i64,
}

fn default_listening_by_song_limit() -> i64 {
    500
}

fn history_period_sql(dialect: &super::date_dialect::Dialect, period: &str) -> Option<String> {
    period_clause(dialect, period).map(|c| c.replace("started_at", "h.started_at"))
}

const MAX_LISTENING_USER_IDS: usize = 40;

fn parse_user_ids_csv(raw: &str) -> Result<Vec<String>, AppError> {
    let mut seen = std::collections::HashSet::new();
    let mut ids: Vec<String> = Vec::new();
    for part in raw.split(',') {
        let t = part.trim();
        if t.is_empty() {
            continue;
        }
        if seen.insert(t.to_string()) {
            ids.push(t.to_string());
        }
    }
    if ids.is_empty() {
        return Err(AppError::BadRequest("user_ids must list at least one id".into()));
    }
    if ids.len() > MAX_LISTENING_USER_IDS {
        return Err(AppError::BadRequest(format!(
            "at most {} users allowed",
            MAX_LISTENING_USER_IDS
        )));
    }
    Ok(ids)
}

async fn query_user_listening_by_song(
    pool: &sqlx::AnyPool,
    user_ids: &[String],
    period: &str,
    limit: i64,
) -> Result<Vec<super::model::UserSongListening>, AppError> {
    if user_ids.is_empty() {
        return Err(AppError::BadRequest("at least one user id required".into()));
    }
    if user_ids.len() > MAX_LISTENING_USER_IDS {
        return Err(AppError::BadRequest(format!(
            "at most {} users allowed",
            MAX_LISTENING_USER_IDS
        )));
    }
    let dialect = super::date_dialect::get(pool).await;
    let n = user_ids.len();
    let user_clause = if n == 1 {
        "h.user_id = $1".to_string()
    } else {
        let placeholders = (1..=n).map(|i| format!("${i}")).collect::<Vec<_>>().join(", ");
        format!("h.user_id IN ({placeholders})")
    };
    let lim_idx = n + 1;
    let mut sql = format!(
        "SELECT s.id as song_id, s.title, s.artist, s.album, s.artwork_key, s.duration_seconds, \
         COUNT(h.id) as play_count, \
         COALESCE(SUM(CASE WHEN COALESCE(h.duration_listened_seconds, 0) > 0 THEN h.duration_listened_seconds ELSE 0 END), 0) as total_listened_seconds \
         FROM playback_history h \
         JOIN songs s ON s.id = h.song_id \
         WHERE {user_clause}",
    );
    if let Some(clause) = history_period_sql(&dialect, period) {
        sql.push_str(" AND ");
        sql.push_str(&clause);
    }
    sql.push_str(&format!(
        " GROUP BY s.id, s.title, s.artist, s.album, s.artwork_key, s.duration_seconds \
          ORDER BY total_listened_seconds DESC, play_count DESC \
          LIMIT ${lim_idx}",
    ));

    let lim = limit.clamp(1, 2000);
    let mut q = sqlx::query_as::<_, super::model::UserSongListening>(&sql);
    for uid in user_ids {
        q = q.bind(uid);
    }
    q = q.bind(lim);
    Ok(q.fetch_all(pool).await?)
}

// --- Per-user listening breakdowns (songs & sessions) ---

pub async fn get_me_listening_by_song(
    State(state): State<Arc<AppState>>,
    claims: axum::Extension<crate::auth::Claims>,
    Query(params): Query<ListeningBySongParams>,
) -> Result<Json<Vec<super::model::UserSongListening>>, AppError> {
    require_permission(&state.pool, &claims.sub, "stats.view").await?;
    let ids = [claims.sub.clone()];
    let rows = query_user_listening_by_song(&state.pool, &ids, &params.period, params.limit).await?;
    Ok(Json(rows))
}

// --- Admin-visible listening for individual users ---

pub async fn get_admin_user_listening_by_song(
    State(state): State<Arc<AppState>>,
    claims: axum::Extension<crate::auth::Claims>,
    Path(user_id): Path<String>,
    Query(params): Query<ListeningBySongParams>,
) -> Result<Json<Vec<super::model::UserSongListening>>, AppError> {
    require_admin_access(&state.pool, &claims.sub, &claims.role).await?;
    let ids = [user_id];
    let rows = query_user_listening_by_song(&state.pool, &ids, &params.period, params.limit).await?;
    Ok(Json(rows))
}

#[derive(Debug, Deserialize)]
pub struct AdminMultiListeningBySongParams {
    pub user_ids: String,
    #[serde(default = "default_period")]
    pub period: String,
    #[serde(default = "default_listening_by_song_limit")]
    pub limit: i64,
}

#[derive(Debug, Deserialize)]
pub struct AdminListeningBySongBody {
    pub user_ids: Vec<String>,
    #[serde(default = "default_period")]
    pub period: String,
    #[serde(default = "default_listening_by_song_limit")]
    pub limit: i64,
}

// Human: Shared guard/audit path for multi-user analytics—rate limits admins and logs structured audit events without embedding user emails.
// Agent: REQUIRES admin; CALLS admin_listening_rl; READS user_ids CSV; EMITS tracing aurora_admin_listening + aurora_audit targets.
async fn admin_listening_by_song_multi_inner(
    state: Arc<AppState>,
    claims: crate::auth::Claims,
    params: AdminMultiListeningBySongParams,
) -> Result<Json<Vec<super::model::UserSongListening>>, AppError> {
    require_admin_access(&state.pool, &claims.sub, &claims.role).await?;
    state
        .admin_listening_rl
        .check(&claims.sub)
        .map_err(|_| AppError::RateLimited)?;
    let ids = parse_user_ids_csv(&params.user_ids)?;
    tracing::info!(
        target: "aurora_admin_listening",
        route = "admin_listening_by_song",
        admin_id = %claims.sub,
        subject_user_count = ids.len(),
        period = %params.period,
        limit = params.limit,
        "admin aggregate listening-by-song"
    );
    tracing::info!(
        target: "aurora_audit",
        event = "admin_listening_by_song",
        admin_id = %claims.sub,
        subject_user_count = ids.len(),
        period = %params.period,
        limit = params.limit,
        "admin queried aggregate listening by song"
    );
    let rows = query_user_listening_by_song(
        &state.pool,
        &ids,
        &params.period,
        params.limit,
    )
    .await?;
    Ok(Json(rows))
}

pub async fn get_admin_listening_by_song_multi(
    State(state): State<Arc<AppState>>,
    claims: axum::Extension<crate::auth::Claims>,
    query: Result<Query<AdminMultiListeningBySongParams>, QueryRejection>,
) -> Result<Json<Vec<super::model::UserSongListening>>, Response> {
    let params = match query {
        Ok(Query(p)) => p,
        Err(e) => return Err(crate::error::query_rejection_response(e, state.expose_query_errors)),
    };
    admin_listening_by_song_multi_inner(state, claims.0, params)
        .await
        .map_err(IntoResponse::into_response)
}

// --- Admin aggregate listening (many subjects per request, GET + POST + sessions variants) ---

pub async fn post_admin_listening_by_song_multi(
    State(state): State<Arc<AppState>>,
    claims: axum::Extension<crate::auth::Claims>,
    Json(body): Json<AdminListeningBySongBody>,
) -> Result<Json<Vec<super::model::UserSongListening>>, AppError> {
    let AdminListeningBySongBody {
        user_ids,
        period,
        limit,
    } = body;
    let joined = user_ids
        .into_iter()
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty())
        .collect::<Vec<_>>()
        .join(",");
    let params = AdminMultiListeningBySongParams {
        user_ids: joined,
        period,
        limit,
    };
    admin_listening_by_song_multi_inner(state, claims.0, params).await
}

#[derive(Debug, Deserialize)]
pub struct ListeningSessionsParams {
    #[serde(default = "default_period")]
    pub period: String,
    #[serde(default = "default_listening_sessions_limit")]
    pub limit: i64,
    #[serde(default)]
    pub song_id: Option<String>,
}

fn default_listening_sessions_limit() -> i64 {
    500
}

async fn query_listening_sessions(
    pool: &sqlx::AnyPool,
    user_ids: &[String],
    song_id: Option<&str>,
    period: &str,
    limit: i64,
) -> Result<Vec<super::model::ListeningSessionEntry>, AppError> {
    if user_ids.is_empty() {
        return Err(AppError::BadRequest("at least one user id required".into()));
    }
    if user_ids.len() > MAX_LISTENING_USER_IDS {
        return Err(AppError::BadRequest(format!(
            "at most {} users allowed",
            MAX_LISTENING_USER_IDS
        )));
    }
    let dialect = super::date_dialect::get(pool).await;
    let lim = limit.clamp(1, 5000);
    let period_part = history_period_sql(&dialect, period)
        .map(|c| format!(" AND {}", c))
        .unwrap_or_default();

    let n = user_ids.len();
    let user_clause = if n == 1 {
        "h.user_id = $1".to_string()
    } else {
        let placeholders = (1..=n).map(|i| format!("${i}")).collect::<Vec<_>>().join(", ");
        format!("h.user_id IN ({placeholders})")
    };

    let select = "SELECT h.id, h.user_id, h.song_id, h.started_at, h.ended_at, h.duration_listened_seconds, h.completed, \
         s.title, s.artist, s.album, s.duration_seconds as song_duration_seconds \
         FROM playback_history h \
         JOIN songs s ON s.id = h.song_id \
         WHERE ";

    let sql = if song_id.is_some() {
        format!(
            "{select}{user_clause} AND h.song_id = ${sp}{period_part} ORDER BY h.started_at DESC LIMIT ${lp}",
            select = select,
            user_clause = user_clause,
            sp = n + 1,
            lp = n + 2,
            period_part = period_part,
        )
    } else {
        format!(
            "{select}{user_clause}{period_part} ORDER BY h.started_at DESC LIMIT ${lp}",
            select = select,
            user_clause = user_clause,
            lp = n + 1,
            period_part = period_part,
        )
    };

    let mut q = sqlx::query_as::<_, super::model::ListeningSessionEntry>(&sql);
    for uid in user_ids {
        q = q.bind(uid);
    }
    if let Some(sid) = song_id {
        q = q.bind(sid);
    }
    q = q.bind(lim);
    Ok(q.fetch_all(pool).await?)
}

pub async fn get_me_listening_sessions(
    State(state): State<Arc<AppState>>,
    claims: axum::Extension<crate::auth::Claims>,
    Query(params): Query<ListeningSessionsParams>,
) -> Result<Json<Vec<super::model::ListeningSessionEntry>>, AppError> {
    require_permission(&state.pool, &claims.sub, "stats.view").await?;
    let sid = params.song_id.as_deref();
    let ids = [claims.sub.clone()];
    let rows = query_listening_sessions(
        &state.pool,
        &ids,
        sid,
        &params.period,
        params.limit,
    )
    .await?;
    Ok(Json(rows))
}

pub async fn get_admin_user_listening_sessions(
    State(state): State<Arc<AppState>>,
    claims: axum::Extension<crate::auth::Claims>,
    Path(user_id): Path<String>,
    Query(params): Query<ListeningSessionsParams>,
) -> Result<Json<Vec<super::model::ListeningSessionEntry>>, AppError> {
    require_admin_access(&state.pool, &claims.sub, &claims.role).await?;
    let sid = params.song_id.as_deref();
    let ids = [user_id];
    let rows = query_listening_sessions(&state.pool, &ids, sid, &params.period, params.limit).await?;
    Ok(Json(rows))
}

#[derive(Debug, Deserialize)]
pub struct AdminMultiListeningSessionsParams {
    pub user_ids: String,
    #[serde(default = "default_period")]
    pub period: String,
    #[serde(default = "default_listening_sessions_limit")]
    pub limit: i64,
    #[serde(default)]
    pub song_id: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct AdminListeningSessionsBody {
    pub user_ids: Vec<String>,
    #[serde(default = "default_period")]
    pub period: String,
    #[serde(default = "default_listening_sessions_limit")]
    pub limit: i64,
    #[serde(default)]
    pub song_id: Option<String>,
}

async fn admin_listening_sessions_multi_inner(
    state: Arc<AppState>,
    claims: crate::auth::Claims,
    params: AdminMultiListeningSessionsParams,
) -> Result<Json<Vec<super::model::ListeningSessionEntry>>, AppError> {
    require_admin_access(&state.pool, &claims.sub, &claims.role).await?;
    state
        .admin_listening_rl
        .check(&claims.sub)
        .map_err(|_| AppError::RateLimited)?;
    let ids = parse_user_ids_csv(&params.user_ids)?;
    let sid = params.song_id.as_deref();
    tracing::info!(
        target: "aurora_admin_listening",
        route = "admin_listening_sessions",
        admin_id = %claims.sub,
        subject_user_count = ids.len(),
        period = %params.period,
        limit = params.limit,
        song_id = ?params.song_id,
        "admin aggregate listening-sessions"
    );
    tracing::info!(
        target: "aurora_audit",
        event = "admin_listening_sessions",
        admin_id = %claims.sub,
        subject_user_count = ids.len(),
        period = %params.period,
        limit = params.limit,
        song_id = ?params.song_id,
        "admin queried aggregate listening sessions"
    );
    let rows = query_listening_sessions(
        &state.pool,
        &ids,
        sid,
        &params.period,
        params.limit,
    )
    .await?;
    Ok(Json(rows))
}

pub async fn get_admin_listening_sessions_multi(
    State(state): State<Arc<AppState>>,
    claims: axum::Extension<crate::auth::Claims>,
    query: Result<Query<AdminMultiListeningSessionsParams>, QueryRejection>,
) -> Result<Json<Vec<super::model::ListeningSessionEntry>>, Response> {
    let params = match query {
        Ok(Query(p)) => p,
        Err(e) => return Err(crate::error::query_rejection_response(e, state.expose_query_errors)),
    };
    admin_listening_sessions_multi_inner(state, claims.0, params)
        .await
        .map_err(IntoResponse::into_response)
}

pub async fn post_admin_listening_sessions_multi(
    State(state): State<Arc<AppState>>,
    claims: axum::Extension<crate::auth::Claims>,
    Json(body): Json<AdminListeningSessionsBody>,
) -> Result<Json<Vec<super::model::ListeningSessionEntry>>, AppError> {
    let AdminListeningSessionsBody {
        user_ids,
        period,
        limit,
        song_id,
    } = body;
    let joined = user_ids
        .into_iter()
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty())
        .collect::<Vec<_>>()
        .join(",");
    let params = AdminMultiListeningSessionsParams {
        user_ids: joined,
        period,
        limit,
        song_id,
    };
    admin_listening_sessions_multi_inner(state, claims.0, params).await
}

pub async fn get_listening_time(
    State(state): State<Arc<AppState>>,
    claims: axum::Extension<crate::auth::Claims>,
    Query(params): Query<ListeningTimeParams>,
) -> Result<Json<super::model::ListeningTimeResult>, AppError> {
    require_permission(&state.pool, &claims.sub, "stats.view").await?;
    let dialect = super::date_dialect::get(&state.pool).await;
    let mut sql = "SELECT COALESCE(SUM(duration_listened_seconds), 0) as total_seconds FROM playback_history WHERE user_id = $1 AND duration_listened_seconds > 0".to_string();
    if let Some(clause) = period_clause(&dialect, &params.period) {
        sql.push_str(" AND ");
        sql.push_str(&clause);
    }
    let row: super::model::ListeningTimeResult = sqlx::query_as(&sql)
        .bind(&claims.sub)
        .fetch_one(&state.pool)
        .await?;
    Ok(Json(row))
}

pub async fn get_listening_habits(
    State(state): State<Arc<AppState>>,
    claims: axum::Extension<crate::auth::Claims>,
) -> Result<Json<serde_json::Value>, AppError> {
    require_permission(&state.pool, &claims.sub, "stats.view").await?;
    let dialect = super::date_dialect::get(&state.pool).await;

    let hour_sql = format!(
        "SELECT {} as hour, COALESCE(SUM(duration_listened_seconds), 0) as total_seconds
         FROM playback_history
         WHERE user_id = $1 AND duration_listened_seconds > 0
         GROUP BY {}
         ORDER BY {}",
        dialect.hour_extract, dialect.hour_extract, dialect.hour_extract
    );
    let peak_hours: Vec<super::model::HourBucket> = sqlx::query_as(&hour_sql)
        .bind(&claims.sub)
        .fetch_all(&state.pool)
        .await?;

    let dow_sql = format!(
        "SELECT {} as day, COALESCE(SUM(duration_listened_seconds), 0) as total_seconds
         FROM playback_history
         WHERE user_id = $1 AND duration_listened_seconds > 0
         GROUP BY {}
         ORDER BY {}",
        dialect.dow_extract, dialect.dow_extract, dialect.dow_extract
    );
    let day_of_week: Vec<super::model::DayBucket> = sqlx::query_as(&dow_sql)
        .bind(&claims.sub)
        .fetch_all(&state.pool)
        .await?;

    Ok(Json(serde_json::json!({
        "peak_hours": peak_hours,
        "day_of_week": day_of_week,
    })))
}

pub async fn get_top_artists(
    State(state): State<Arc<AppState>>,
    claims: axum::Extension<crate::auth::Claims>,
    Query(params): Query<ListeningTimeParams>,
) -> Result<Json<Vec<super::model::TopArtist>>, AppError> {
    require_permission(&state.pool, &claims.sub, "stats.view").await?;
    let dialect = super::date_dialect::get(&state.pool).await;
    let mut sql = "SELECT s.artist, COALESCE(SUM(h.duration_listened_seconds), 0) as total_seconds, COUNT(*) as play_count
                   FROM playback_history h
                   JOIN songs s ON h.song_id = s.id
                   WHERE h.user_id = $1 AND h.duration_listened_seconds > 0".to_string();
    if let Some(clause) = period_clause(&dialect, &params.period) {
        sql.push_str(" AND ");
        sql.push_str(&clause);
    }
    sql.push_str(" GROUP BY s.artist ORDER BY total_seconds DESC LIMIT 20");

    let rows: Vec<super::model::TopArtist> = sqlx::query_as(&sql)
        .bind(&claims.sub)
        .fetch_all(&state.pool)
        .await?;
    Ok(Json(rows))
}

pub async fn get_top_albums(
    State(state): State<Arc<AppState>>,
    claims: axum::Extension<crate::auth::Claims>,
    Query(params): Query<ListeningTimeParams>,
) -> Result<Json<Vec<super::model::TopAlbum>>, AppError> {
    require_permission(&state.pool, &claims.sub, "stats.view").await?;
    let dialect = super::date_dialect::get(&state.pool).await;
    let mut sql = "SELECT s.album, s.album_artist, COALESCE(SUM(h.duration_listened_seconds), 0) as total_seconds, COUNT(*) as play_count
                   FROM playback_history h
                   JOIN songs s ON h.song_id = s.id
                   WHERE h.user_id = $1 AND h.duration_listened_seconds > 0 AND s.album IS NOT NULL".to_string();
    if let Some(clause) = period_clause(&dialect, &params.period) {
        sql.push_str(" AND ");
        sql.push_str(&clause);
    }
    sql.push_str(" GROUP BY s.album, s.album_artist ORDER BY total_seconds DESC LIMIT 20");

    let rows: Vec<super::model::TopAlbum> = sqlx::query_as(&sql)
        .bind(&claims.sub)
        .fetch_all(&state.pool)
        .await?;
    Ok(Json(rows))
}

pub async fn get_admin_listening_stats(
    State(state): State<Arc<AppState>>,
    claims: axum::Extension<crate::auth::Claims>,
) -> Result<Json<super::model::AdminListeningStats>, AppError> {
    require_admin_access(&state.pool, &claims.sub, &claims.role).await?;

    // Avoid AVG(integer) → NUMERIC on Postgres (sqlx/AnyPool often cannot decode that into f64).
    // Count every logged session as a play; time metrics use rows with measured listening only.
    let row: super::model::AdminListeningStats = sqlx::query_as(
        "SELECT
            COUNT(*) as total_plays,
            COUNT(DISTINCT CASE WHEN COALESCE(duration_listened_seconds, 0) > 0 THEN user_id END) as active_users,
            COALESCE(SUM(CASE WHEN COALESCE(duration_listened_seconds, 0) > 0 THEN duration_listened_seconds ELSE 0 END), 0) as total_listening_seconds,
            CASE
                WHEN SUM(CASE WHEN COALESCE(duration_listened_seconds, 0) > 0 THEN 1 ELSE 0 END) > 0 THEN
                    CAST(COALESCE(SUM(CASE WHEN COALESCE(duration_listened_seconds, 0) > 0 THEN duration_listened_seconds ELSE 0 END), 0) AS REAL)
                    / CAST(SUM(CASE WHEN COALESCE(duration_listened_seconds, 0) > 0 THEN 1 ELSE 0 END) AS REAL)
                ELSE CAST(0 AS REAL)
            END as avg_duration_seconds
         FROM playback_history"
    )
    .fetch_one(&state.pool)
    .await?;

    Ok(Json(row))
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

pub async fn get_play_count(
    State(state): State<Arc<AppState>>,
    claims: axum::Extension<crate::auth::Claims>,
    Path(id): Path<Uuid>,
) -> Result<Json<super::model::PlayCount>, AppError> {
    require_permission(&state.pool, &claims.sub, "library.view").await?;

    let row = sqlx::query_as::<_, (i64,)>(
        "SELECT COUNT(*) FROM playback_history WHERE user_id = $1 AND song_id = $2 AND completed IS TRUE"
    )
    .bind(&claims.sub)
    .bind(id.to_string())
    .fetch_one(&state.pool)
    .await?;

    Ok(Json(super::model::PlayCount {
        song_id: id.to_string(),
        play_count: row.0,
    }))
}

pub async fn get_top_plays(
    State(state): State<Arc<AppState>>,
    claims: axum::Extension<crate::auth::Claims>,
) -> Result<Json<Vec<super::model::TopPlay>>, AppError> {
    require_permission(&state.pool, &claims.sub, "history.view").await?;

    let entries = sqlx::query_as::<_, super::model::TopPlay>(
        "SELECT h.song_id, s.title, s.artist, s.album, s.artwork_key, s.duration_seconds,
                COUNT(*) as play_count, MAX(h.started_at) as last_played_at
         FROM playback_history h
         JOIN songs s ON h.song_id = s.id
         WHERE h.user_id = $1 AND h.completed IS TRUE
         GROUP BY h.song_id, s.title, s.artist, s.album, s.artwork_key, s.duration_seconds
         ORDER BY play_count DESC, last_played_at DESC
         LIMIT 20"
    )
    .bind(&claims.sub)
    .fetch_all(&state.pool)
    .await?;

    Ok(Json(entries))
}

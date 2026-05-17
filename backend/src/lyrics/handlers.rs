// Human: HTTP handlers for reading synced lyrics (library users) and admin create/update/delete.
// Agent: GET /songs/{id}/lyrics library.view; admin paths require_admin_access; UPSERT song_lyrics JSON.
use axum::{
    extract::{Path, State},
    Json,
};
use chrono::Utc;
use serde::Deserialize;
use std::sync::Arc;

use crate::{
    error::AppError,
    lyrics::model::{is_synced, LyricLine, SongLyrics},
    permissions::{require_admin_access, require_permission},
    AppState,
};

const MAX_LINES: usize = 1000;
const MAX_LINE_CHARS: usize = 1000;

// Human: Request body when admins save lyrics from the in-app editor.
// Agent: DESERIALIZES lines[]; VALIDATED by validate_lines before UPSERT.
#[derive(Debug, Deserialize)]
pub struct SaveLyricsBody {
    pub lines: Vec<LyricLine>,
}

// Human: Load lyrics JSON for a song or map missing row to 404.
// Agent: READS song_lyrics; DESERIALIZES lines_json; RETURNS SongLyrics.
async fn load_lyrics(pool: &sqlx::AnyPool, song_id: &str) -> Result<SongLyrics, AppError> {
    let row: Option<(String, String, String)> = sqlx::query_as(
        "SELECT song_id, lines_json, updated_at FROM song_lyrics WHERE song_id = $1",
    )
    .bind(song_id)
    .fetch_optional(pool)
    .await?;

    let (id, json, updated_at) = row.ok_or(AppError::NotFound)?;
    let lines: Vec<LyricLine> = serde_json::from_str(&json).map_err(|e| {
        tracing::error!(song_id = %id, error = %e, "corrupt lyrics JSON in database");
        AppError::Internal(anyhow::anyhow!("corrupt lyrics data"))
    })?;

    Ok(SongLyrics {
        song_id: id,
        synced: is_synced(&lines),
        lines,
        updated_at,
    })
}

// Human: Reject oversized or malformed lyric payloads before they hit the database.
// Agent: CHECKS line count, trim, char limits, start_ms range vs song duration; RETURNS BadRequest strings.
async fn validate_lines(
    pool: &sqlx::AnyPool,
    song_id: &str,
    lines: &[LyricLine],
) -> Result<Vec<LyricLine>, AppError> {
    if lines.is_empty() {
        return Err(AppError::BadRequest(
            "at least one lyric line is required".into(),
        ));
    }
    if lines.len() > MAX_LINES {
        return Err(AppError::BadRequest(format!(
            "too many lines (max {})",
            MAX_LINES
        )));
    }

    let duration_seconds: Option<(i32,)> =
        sqlx::query_as("SELECT duration_seconds FROM songs WHERE id = $1")
            .bind(song_id)
            .fetch_optional(pool)
            .await?;

    let duration_seconds = duration_seconds.ok_or(AppError::NotFound)?.0;
    let max_ms = i64::from(duration_seconds.saturating_add(30)) * 1000;

    let mut normalized = Vec::with_capacity(lines.len());
    let mut has_content = false;

    for line in lines {
        let text = line.text.trim().to_string();
        if text.is_empty() {
            normalized.push(LyricLine {
                text: String::new(),
                start_ms: line.start_ms,
            });
            continue;
        }
        if text.len() > MAX_LINE_CHARS {
            return Err(AppError::BadRequest(format!(
                "line exceeds {} characters",
                MAX_LINE_CHARS
            )));
        }
        if let Some(ms) = line.start_ms {
            if ms < 0 || ms > max_ms {
                return Err(AppError::BadRequest(
                    "timestamp out of range for this song".into(),
                ));
            }
        }
        has_content = true;
        normalized.push(LyricLine {
            text,
            start_ms: line.start_ms,
        });
    }

    if !has_content {
        return Err(AppError::BadRequest(
            "at least one non-empty lyric line is required".into(),
        ));
    }

    // Human: Synced timestamps should be stored in chronological order for karaoke lookup.
    // Agent: SORTS by start_ms ascending; NULL start_ms sorts last (stable within unsynced block).
    normalized.sort_by(|a, b| {
        let am = a.start_ms.unwrap_or(i64::MAX);
        let bm = b.start_ms.unwrap_or(i64::MAX);
        am.cmp(&bm)
    });

    Ok(normalized)
}

// Human: Library clients fetch synced lyrics for the now-playing view.
// Agent: GET; REQUIRES library.view; HTTP 404 when no lyrics row.
pub async fn get_song_lyrics(
    State(state): State<Arc<AppState>>,
    claims: axum::Extension<crate::auth::Claims>,
    Path(id): Path<String>,
) -> Result<Json<SongLyrics>, AppError> {
    require_permission(&state.pool, &claims.sub, "library.view").await?;
    let lyrics = load_lyrics(&state.pool, &id).await?;
    Ok(Json(lyrics))
}

// Human: Admins read the same lyrics document when opening the sync editor.
// Agent: GET admin path; REQUIRES require_admin_access; DELEGATES load_lyrics.
pub async fn admin_get_song_lyrics(
    State(state): State<Arc<AppState>>,
    claims: axum::Extension<crate::auth::Claims>,
    Path(id): Path<String>,
) -> Result<Json<SongLyrics>, AppError> {
    require_admin_access(&state.pool, &claims.sub, &claims.role).await?;
    let lyrics = load_lyrics(&state.pool, &id).await?;
    Ok(Json(lyrics))
}

// Human: Admins save lyric lines and timestamps from the in-app editor (upsert).
// Agent: PUT; VALIDATES body; UPSERT song_lyrics; SETS updated_by + updated_at RFC3339.
pub async fn admin_put_song_lyrics(
    State(state): State<Arc<AppState>>,
    claims: axum::Extension<crate::auth::Claims>,
    Path(id): Path<String>,
    Json(body): Json<SaveLyricsBody>,
) -> Result<Json<SongLyrics>, AppError> {
    require_admin_access(&state.pool, &claims.sub, &claims.role).await?;

    let lines = validate_lines(&state.pool, &id, &body.lines).await?;
    let json = serde_json::to_string(&lines).map_err(|e| AppError::Internal(e.into()))?;
    let updated_at = Utc::now().to_rfc3339();

    sqlx::query(
        r#"INSERT INTO song_lyrics (song_id, lines_json, updated_by, updated_at)
           VALUES ($1, $2, $3, $4)
           ON CONFLICT (song_id) DO UPDATE SET
             lines_json = excluded.lines_json,
             updated_by = excluded.updated_by,
             updated_at = excluded.updated_at"#,
    )
    .bind(&id)
    .bind(&json)
    .bind(&claims.sub)
    .bind(&updated_at)
    .execute(&state.pool)
    .await?;

    Ok(Json(SongLyrics {
        song_id: id,
        synced: is_synced(&lines),
        lines,
        updated_at,
    }))
}

// Human: Admins remove all lyrics for a song (e.g. wrong upload).
// Agent: DELETE song_lyrics row; HTTP 404 if missing; REQUIRES admin.
pub async fn admin_delete_song_lyrics(
    State(state): State<Arc<AppState>>,
    claims: axum::Extension<crate::auth::Claims>,
    Path(id): Path<String>,
) -> Result<Json<serde_json::Value>, AppError> {
    require_admin_access(&state.pool, &claims.sub, &claims.role).await?;

    let result = sqlx::query("DELETE FROM song_lyrics WHERE song_id = $1")
        .bind(&id)
        .execute(&state.pool)
        .await?;

    if result.rows_affected() == 0 {
        return Err(AppError::NotFound);
    }

    Ok(Json(serde_json::json!({ "ok": true })))
}
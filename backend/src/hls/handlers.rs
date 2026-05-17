// Human: Authenticated endpoints that synthesize `.m3u8` playlists, serve AES-128 keys, and proxy `.ts` segments for local storage mode.
// Agent: REQUIRES library.view; BRANCHES Nebula vs local via presigned_segment_url probe; READS songs.hls_ready + segment_count; Body streaming responses.
use axum::{
    extract::{Path, State},

    response::{IntoResponse, Response},
    body::Body,
};
use std::sync::Arc;
use uuid::Uuid;

use crate::{
    error::AppError,
    permissions::require_permission,
    AppState,
};

use super::playlist::PlaylistGenerator;

// Human: Produce either inline presigned single-bitrate playlist fallback or a rebuilt AES HLS manifest referencing app routes.
// Agent: READS songs row; MAY EMIT simple EXT-X-STREAM-INF; OTHERWISE builds segment list + PlaylistGenerator::generate; CACHE_CONTROL no-store.
pub async fn get_playlist(
    State(state): State<Arc<AppState>>,
    claims: axum::Extension<crate::auth::Claims>,
    Path(id): Path<Uuid>,
) -> Result<Response, AppError> {
    require_permission(&state.pool, &claims.sub, "library.view").await?;

    let song = sqlx::query_as::<_, (String, Option<bool>, Option<i32>)>(
        "SELECT file_key, hls_ready, segment_count FROM songs WHERE id = $1 AND enabled = true"
    )
    .bind(id.to_string())
    .fetch_optional(&state.pool)
    .await?;

    let (file_key, hls_ready, segment_count) = song.ok_or(AppError::NotFound)?;

    if !hls_ready.unwrap_or(false) {
        // Fallback: return the old presigned stream URL as a single-file playlist
        let url = state.storage.presigned_url(&file_key, state.url_expiry_seconds)
            .map_err(|e| AppError::Storage(e.to_string()))?;
        let body = format!("#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=192000\n{}\n", url);
        return Ok((
            [(axum::http::header::CONTENT_TYPE, "application/vnd.apple.mpegurl")],
            body,
        ).into_response());
    }

    // For NebulaStorage: inline presigned segment URLs
    // For LocalStorage: proxy through our own segment endpoint
    let is_nebula = state.storage.presigned_segment_url("test", 1).is_ok();

    let base_url = format!("/api/v1/songs/{}", id);
    let key_uri = format!("/api/v1/songs/{}/key", id);

    let prefix = format!("songs/{}/", id);
    let mut segment_files = Vec::new();
    let mut segment_durations = Vec::new();

    if is_nebula {
        let count = segment_count.unwrap_or(0) as usize;
        for i in 0..count {
            segment_files.push(format!("segments/{:04}.ts", i));
            segment_durations.push(4.0);
        }
    } else {
        let playlist_path = state.staging_dir.join(&prefix).join("stream.m3u8");
        let (files, durs) = PlaylistGenerator::scan_local_output(&playlist_path)
            .map_err(|e| AppError::Storage(e.to_string()))?;
        segment_files = files;
        segment_durations = durs;
    }

    let playlist = PlaylistGenerator::generate(
        &base_url,
        &segment_files,
        &segment_durations,
        &key_uri,
    );

    Ok((
        [
            (axum::http::header::CONTENT_TYPE, "application/vnd.apple.mpegurl"),
            (axum::http::header::CACHE_CONTROL, "no-store, no-cache, must-revalidate"),
        ],
        playlist,
    ).into_response())
}

// Human: Serve the raw 16-byte AES key referenced by the EXT-X-KEY URI after permission checks.
// Agent: READS hls_key_store blob; HTTP 404 if missing; RETURNS application/octet-stream bytes.
pub async fn get_key(
    State(state): State<Arc<AppState>>,
    claims: axum::Extension<crate::auth::Claims>,
    Path(id): Path<Uuid>,
) -> Result<Response, AppError> {
    require_permission(&state.pool, &claims.sub, "library.view").await?;

    let key = state.hls_key_store.get_key(id).await
        .map_err(|e| AppError::Storage(e.to_string()))?
        .ok_or(AppError::NotFound)?;

    Ok((
        [
            (axum::http::header::CONTENT_TYPE, "application/octet-stream"),
            (axum::http::header::CACHE_CONTROL, "no-store, no-cache, must-revalidate"),
        ],
        key.to_vec(),
    ).into_response())
}

// Human: Segment proxy for non-presigned storage modes—validates filename characters then streams from object storage or disk fallback.
// Agent: READS Storage::get_stream songs/{id}/segments/*; FALLBACK tokio::File under staging_dir; REJECTS weird segment_name; REQUIRES library.view.
pub async fn get_segment(
    State(state): State<Arc<AppState>>,
    claims: axum::Extension<crate::auth::Claims>,
    Path((id, segment_name)): Path<(Uuid, String)>,
) -> Result<Response, AppError> {
    require_permission(&state.pool, &claims.sub, "library.view").await?;

    let prefix = format!("songs/{}/segments/", id);
    let key = format!("{}{}", prefix, segment_name);

    // Security: validate segment_name is just a filename like 0000.ts
    if !segment_name.chars().all(|c| c.is_ascii_alphanumeric() || c == '.') {
        return Err(AppError::BadRequest("invalid segment name".to_string()));
    }

    // Try object storage first (covers both Nebula and LocalStorage via the Storage trait)
    if let Ok((stream, _, _)) = state.storage.get_stream(&key).await {
        return Ok((
            [
                (axum::http::header::CONTENT_TYPE, "video/mp2t"),
                (axum::http::header::CACHE_CONTROL, "no-store, no-cache, must-revalidate"),
            ],
            Body::from_stream(stream),
        ).into_response());
    }

    // Fallback: local filesystem (legacy local-storage mode)
    let path = state.staging_dir.join(&key);
    let file = tokio::fs::File::open(&path).await
        .map_err(|_| AppError::NotFound)?;
    let stream = tokio_util::io::ReaderStream::new(file);

    Ok((
        [
            (axum::http::header::CONTENT_TYPE, "video/mp2t"),
            (axum::http::header::CACHE_CONTROL, "no-store, no-cache, must-revalidate"),
        ],
        Body::from_stream(stream),
    ).into_response())
}

// Human: Admin endpoints to retry failed HLS encodes without re-uploading the source audio.
// Agent: POST /admin/songs/{id}/hls/retry; READS file_key; SPAWNS encode_job; REQUIRES admin access.

use std::sync::Arc;

use axum::{
    extract::{Path, State},
    Json,
};

use crate::{
    error::AppError,
    hls::encode_job::{self, HlsEncodeJob},
    permissions::require_admin_access,
    AppState,
};

// Human: Re-queue ffmpeg for a song whose prior transcode failed or never completed.
// Agent: HTTP 400 if already ready/processing; DOWNLOADS file_key to temp; SETS status pending.
pub async fn retry_hls_encode(
    State(state): State<Arc<AppState>>,
    claims: axum::Extension<crate::auth::Claims>,
    Path(id): Path<String>,
) -> Result<Json<serde_json::Value>, AppError> {
    require_admin_access(&state.pool, &claims.sub, &claims.role).await?;

    let row = sqlx::query_as::<_, (String, String, i32, Option<String>, Option<bool>)>(
        "SELECT file_key, file_format, duration_seconds, hls_encode_status, hls_ready FROM songs WHERE id = $1",
    )
    .bind(&id)
    .fetch_optional(&state.pool)
    .await?;

    let (file_key, file_format, duration_seconds, status, hls_ready) =
        row.ok_or(AppError::NotFound)?;

    if hls_ready.unwrap_or(false) {
        return Err(AppError::BadRequest("song already has HLS ready".into()));
    }
    if status.as_deref() == Some("processing") {
        return Err(AppError::BadRequest(
            "HLS encoding is already in progress".into(),
        ));
    }

    let (audio_stream, _, _) = state
        .storage
        .get_stream(&file_key)
        .await
        .map_err(|e| AppError::Storage(e.to_string()))?;
    let audio_data = crate::admin::upload::collect_stream(audio_stream).await?;

    let hls_tmp_dir = std::env::temp_dir().join(format!("aurora_hls_{}", id));
    tokio::fs::create_dir_all(&hls_tmp_dir)
        .await
        .map_err(|e| AppError::Storage(e.to_string()))?;
    let tmp_audio = hls_tmp_dir.join(format!("audio.{file_format}"));
    tokio::fs::write(&tmp_audio, &audio_data)
        .await
        .map_err(|e| AppError::Storage(e.to_string()))?;

    sqlx::query(
        "UPDATE songs SET hls_encode_status = 'pending', hls_encode_error = NULL, conversion_progress = 0 WHERE id = $1",
    )
    .bind(&id)
    .execute(&state.pool)
    .await?;

    encode_job::spawn_hls_encode_job(
        state.pool.clone(),
        state.storage.clone(),
        state.hls_key_store.clone(),
        HlsEncodeJob {
            song_id: id.clone(),
            tmp_audio,
            duration_seconds,
            staging_id: None,
            file_format: None,
        },
    );

    Ok(Json(serde_json::json!({ "ok": true, "song_id": id })))
}

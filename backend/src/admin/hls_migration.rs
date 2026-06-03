// Human: Background job to transcode legacy/direct-stream songs into AES-128 HLS with encrypted keys at rest.
// Agent: SPAWNS sequential encode jobs; WRITES app_settings hls_migration_*; READS songs.file_key; CALLS encode_job.

use std::sync::Arc;

use axum::{extract::State, Json};
use serde::Serialize;
use sqlx::AnyPool;

use crate::{
    admin::upload::collect_stream,
    error::AppError,
    hls::{
        encode_job::{self, HlsEncodeJob},
        playback::list_songs_needing_hls_migration,
    },
    permissions::require_admin_access,
    storage::Storage,
    AppState,
};

pub const SETTING_STATUS: &str = "hls_migration_status";
pub const SETTING_PROGRESS: &str = "hls_migration_progress";
pub const SETTING_PROCESSED: &str = "hls_migration_processed";
pub const SETTING_TOTAL: &str = "hls_migration_total";
pub const SETTING_FAILED: &str = "hls_migration_failed";
pub const SETTING_ERROR: &str = "hls_migration_error";
pub const SETTING_PENDING: &str = "hls_migration_pending";

#[derive(Debug, Clone, Serialize)]
pub struct HlsMigrationStatus {
    pub status: String,
    pub progress: i32,
    pub processed: i32,
    pub total: i32,
    pub failed: i32,
    pub pending_count: i32,
    pub error: Option<String>,
}

async fn upsert_setting(pool: &AnyPool, key: &str, value: &str) {
    let updated = sqlx::query("UPDATE app_settings SET value = $1 WHERE key = $2")
        .bind(value)
        .bind(key)
        .execute(pool)
        .await;

    if updated.map(|r| r.rows_affected()).unwrap_or(0) == 0 {
        let _ = sqlx::query("INSERT INTO app_settings (key, value) VALUES ($1, $2)")
            .bind(key)
            .bind(value)
            .execute(pool)
            .await;
    }
}

async fn read_setting(pool: &AnyPool, key: &str, default: &str) -> String {
    sqlx::query_scalar::<_, String>("SELECT value FROM app_settings WHERE key = $1")
        .bind(key)
        .fetch_optional(pool)
        .await
        .ok()
        .flatten()
        .unwrap_or_else(|| default.to_string())
}

pub async fn migration_status(state: &AppState) -> HlsMigrationStatus {
    let pool = state.pool().await;
    let status = read_setting(&pool, SETTING_STATUS, "idle").await;
    let progress = read_setting(&pool, SETTING_PROGRESS, "0")
        .await
        .parse()
        .unwrap_or(0);
    let processed = read_setting(&pool, SETTING_PROCESSED, "0")
        .await
        .parse()
        .unwrap_or(0);
    let total = read_setting(&pool, SETTING_TOTAL, "0")
        .await
        .parse()
        .unwrap_or(0);
    let failed = read_setting(&pool, SETTING_FAILED, "0")
        .await
        .parse()
        .unwrap_or(0);
    let error_raw = read_setting(&pool, SETTING_ERROR, "").await;
    let error = if error_raw.trim().is_empty() {
        None
    } else {
        Some(error_raw)
    };

    let pending_count = if status == "running" {
        read_setting(&pool, SETTING_PENDING, "0")
            .await
            .parse()
            .unwrap_or(0)
    } else {
        list_songs_needing_hls_migration(&pool, &state.hls_key_store, state.storage.as_ref())
            .await
            .len() as i32
    };

    HlsMigrationStatus {
        status,
        progress,
        processed,
        total,
        failed,
        pending_count,
        error,
    }
}

pub async fn get_hls_migration_status(
    State(state): State<Arc<AppState>>,
    claims: axum::Extension<crate::auth::Claims>,
) -> Result<Json<HlsMigrationStatus>, AppError> {
    require_admin_access(&state.pool().await, &claims.sub, &claims.role).await?;
    Ok(Json(migration_status(&state).await))
}

pub async fn start_hls_migration(
    State(state): State<Arc<AppState>>,
    claims: axum::Extension<crate::auth::Claims>,
) -> Result<Json<HlsMigrationStatus>, AppError> {
    require_admin_access(&state.pool().await, &claims.sub, &claims.role).await?;

    let current = migration_status(&state).await;
    if current.status == "running" {
        return Err(AppError::Conflict(
            "HLS encryption migration is already running".into(),
        ));
    }
    if current.pending_count == 0 {
        return Err(AppError::BadRequest(
            "All songs already have working AES-HLS encryption".into(),
        ));
    }

    upsert_setting(
        &state.pool().await,
        SETTING_PENDING,
        &current.pending_count.to_string(),
    )
    .await;
    upsert_setting(&state.pool().await, SETTING_STATUS, "running").await;
    upsert_setting(&state.pool().await, SETTING_PROGRESS, "0").await;
    upsert_setting(&state.pool().await, SETTING_PROCESSED, "0").await;
    upsert_setting(&state.pool().await, SETTING_TOTAL, &current.pending_count.to_string()).await;
    upsert_setting(&state.pool().await, SETTING_FAILED, "0").await;
    upsert_setting(&state.pool().await, SETTING_ERROR, "").await;

    let job_state = state.clone();
    tokio::spawn(async move {
        run_hls_migration(job_state).await;
    });

    Ok(Json(migration_status(&state).await))
}

async fn clear_song_hls_artifacts(
    pool: &AnyPool,
    storage: &dyn Storage,
    song_id: &str,
) {
    let segment_count: Option<i32> = sqlx::query_scalar(
        "SELECT segment_count FROM songs WHERE id = $1",
    )
    .bind(song_id)
    .fetch_optional(pool)
    .await
    .ok()
    .flatten();

    let cap = segment_count.unwrap_or(0).max(1).min(2048) as usize;
    for i in 0..cap {
        let key = format!("songs/{song_id}/segments/{i:04}.ts");
        if storage.exists(&key).await.unwrap_or(false) {
            let _ = storage.delete(&key).await;
        }
    }
    for suffix in ["stream.m3u8", "key.bin"] {
        let key = format!("songs/{song_id}/{suffix}");
        if storage.exists(&key).await.unwrap_or(false) {
            let _ = storage.delete(&key).await;
        }
    }

    // Clear the FK reference before deleting the encryption key row (PostgreSQL enforces songs_hls_key_id_fkey).
    let _ = sqlx::query(
        "UPDATE songs SET hls_ready = false, hls_key_id = NULL, segment_count = 0,
         hls_encode_status = 'pending', hls_encode_error = NULL, conversion_progress = 0
         WHERE id = $1",
    )
    .bind(song_id)
    .execute(pool)
    .await;
    let _ = sqlx::query("DELETE FROM song_encryption_keys WHERE song_id = $1")
        .bind(song_id)
        .execute(pool)
        .await;
}

async fn run_hls_migration(state: Arc<AppState>) {
    let pool = state.pool().await;
    let storage = state.storage.clone();
    let key_store = state.hls_key_store.clone();

    let songs =
        list_songs_needing_hls_migration(&pool, &key_store, storage.as_ref()).await;
    let total = songs.len().max(1);
    upsert_setting(&pool, SETTING_TOTAL, &total.to_string()).await;

    let mut processed = 0i32;
    let mut failed = 0i32;

    for (song_id, file_key, file_format, duration_seconds) in songs {
        clear_song_hls_artifacts(&pool, storage.as_ref(), &song_id).await;

        let encode_result = async {
            let (audio_stream, _, _) = storage
                .get_stream(&file_key)
                .await
                .map_err(|e| format!("read source audio: {e}"))?;
            let audio_data = collect_stream(audio_stream)
                .await
                .map_err(|e| format!("buffer source audio: {e}"))?;

            let hls_tmp_dir = std::env::temp_dir().join(format!("aurora_hls_migrate_{song_id}"));
            tokio::fs::create_dir_all(&hls_tmp_dir)
                .await
                .map_err(|e| format!("temp dir: {e}"))?;
            let tmp_audio = hls_tmp_dir.join(format!("audio.{file_format}"));
            tokio::fs::write(&tmp_audio, &audio_data)
                .await
                .map_err(|e| format!("write temp audio: {e}"))?;

            encode_job::run_hls_encode_job(
                pool.clone(),
                storage.clone(),
                key_store.clone(),
                HlsEncodeJob {
                    song_id: song_id.clone(),
                    tmp_audio,
                    duration_seconds,
                    staging_id: None,
                    file_format: None,
                    pending_artwork: false,
                },
            )
            .await;

            let ready: Option<bool> = sqlx::query_scalar(
                "SELECT hls_ready FROM songs WHERE id = $1",
            )
            .bind(&song_id)
            .fetch_optional(&pool)
            .await
            .ok()
            .flatten();
            if ready.unwrap_or(false) {
                Ok(())
            } else {
                let err: Option<String> = sqlx::query_scalar(
                    "SELECT hls_encode_error FROM songs WHERE id = $1",
                )
                .bind(&song_id)
                .fetch_optional(&pool)
                .await
                .ok()
                .flatten();
                Err(err.unwrap_or_else(|| "HLS encode did not complete".into()))
            }
        }
        .await;

        match encode_result {
            Ok(()) => processed += 1,
            Err(e) => {
                failed += 1;
                tracing::warn!(song_id = %song_id, error = %e, "HLS migration encode failed");
            }
        }

        let pct = ((processed + failed) * 100) / total as i32;
        upsert_setting(&pool, SETTING_PROCESSED, &processed.to_string()).await;
        upsert_setting(&pool, SETTING_FAILED, &failed.to_string()).await;
        upsert_setting(&pool, SETTING_PROGRESS, &pct.to_string()).await;
    }

    upsert_setting(&pool, SETTING_STATUS, "complete").await;
    upsert_setting(&pool, SETTING_PROGRESS, "100").await;
    if failed > 0 {
        upsert_setting(
            &pool,
            SETTING_ERROR,
            &format!("{failed} song(s) failed HLS encryption migration — retry from Admin → Library"),
        )
        .await;
    }
}

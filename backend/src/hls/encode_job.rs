// Human: Background HLS transcode + upload pipeline shared by commit and admin retry.
// Agent: SPAWNS tokio task; MUTATES songs.hls_* + conversion_progress; READS storage; CALLS HlsEncoder + KeyStore.

use std::path::{Path, PathBuf};
use std::sync::Arc;

use sqlx::AnyPool;
use uuid::Uuid;

use crate::hls::key_store::KeyStore;
use crate::storage::Storage;

/// Human: Inputs needed to run ffmpeg and upload segments outside the HTTP handler.
/// Agent: CLONEABLE job descriptor; tmp_audio must exist on disk until the task finishes.
#[derive(Clone)]
pub struct HlsEncodeJob {
    pub song_id: String,
    pub tmp_audio: PathBuf,
    pub duration_seconds: i32,
    pub staging_id: Option<String>,
    pub file_format: Option<String>,
}

// Human: Mark a song as actively transcoding before spawning the worker.
// Agent: UPDATE songs SET hls_encode_status=processing, clears prior error text.
pub async fn mark_processing(pool: &AnyPool, song_id: &str) {
    let _ = sqlx::query(
        "UPDATE songs SET hls_encode_status = 'processing', hls_encode_error = NULL WHERE id = $1",
    )
    .bind(song_id)
    .execute(pool)
    .await;
}

// Human: Persist a terminal failure admins can see in the library UI.
// Agent: UPDATE songs hls_encode_status=failed + error message; RESET conversion_progress.
pub async fn mark_failed(pool: &AnyPool, song_id: &str, message: &str) {
    let _ = sqlx::query(
        "UPDATE songs SET hls_encode_status = 'failed', hls_encode_error = $1, conversion_progress = 0 WHERE id = $2",
    )
    .bind(message)
    .bind(song_id)
    .execute(pool)
    .await;
}

// Human: Mirror ffmpeg/upload percent into `conversion_progress` for admin library polling.
// Agent: UPDATE songs.conversion_progress; BEST-EFFORT (errors ignored) during background job.
async fn set_progress(pool: &AnyPool, song_id: &str, progress: i32) {
    let _ = sqlx::query("UPDATE songs SET conversion_progress = $1 WHERE id = $2")
        .bind(progress)
        .bind(song_id)
        .execute(pool)
        .await;
}

// Human: Kick off the full encode/upload pipeline without blocking the caller.
// Agent: tokio::spawn; REQUIRES tmp_audio path valid; CLEANS temp dirs; optional staging key delete.
pub fn spawn_hls_encode_job(
    pool: AnyPool,
    storage: Arc<dyn Storage>,
    key_store: KeyStore,
    job: HlsEncodeJob,
) {
    tokio::spawn(async move {
        run_hls_encode_job(pool, storage, key_store, job).await;
    });
}

// Human: Run ffmpeg, upload playlist/key/segments, and flip hls_ready when everything succeeds.
// Agent: SEQUENTIAL pipeline; ON any hard failure CALLS mark_failed; DELETES staging keys when provided.
pub async fn run_hls_encode_job(
    pool: AnyPool,
    storage: Arc<dyn Storage>,
    key_store: KeyStore,
    job: HlsEncodeJob,
) {
    use crate::hls::encoder::HlsEncoder;

    let song_id = job.song_id.clone();
    let tmp_audio = job.tmp_audio.clone();
    let hls_tmp_dir = tmp_audio.parent().map(Path::to_path_buf).unwrap_or_else(|| {
        std::env::temp_dir().join(format!("aurora_hls_{}", song_id))
    });

    mark_processing(&pool, &song_id).await;

    let song_uuid = match Uuid::parse_str(&song_id) {
        Ok(u) => u,
        Err(e) => {
            mark_failed(&pool, &song_id, &format!("invalid song id: {e}")).await;
            let _ = tokio::fs::remove_dir_all(&hls_tmp_dir).await;
            return;
        }
    };

    let hls_output_dir = hls_tmp_dir
        .parent()
        .unwrap_or(&hls_tmp_dir)
        .join(format!("aurora_hls_out_{}", song_id));

    set_progress(&pool, &song_id, 5).await;

    match key_store.create_key_for_song(song_uuid).await {
        Ok((key_id, key)) => {
            // Human: Reserve 0–5% for setup and map ffmpeg 0–100% into 5–50% before upload phase.
            // Agent: watch channel from HlsEncoder; SCALES pct*0.45+5; WRITES conversion_progress until channel closes.
            let (progress_tx, mut progress_rx) = tokio::sync::watch::channel(0i32);
            let pool_for_progress = pool.clone();
            let song_id_for_progress = song_id.clone();
            let progress_handle = tokio::spawn(async move {
                loop {
                    let pct = *progress_rx.borrow_and_update();
                    let scaled = 5 + (pct as f64 * 0.45) as i32;
                    set_progress(&pool_for_progress, &song_id_for_progress, scaled).await;
                    if progress_rx.changed().await.is_err() {
                        break;
                    }
                }
            });

            let transcode_result = HlsEncoder::transcode(
                &tmp_audio,
                &hls_output_dir,
                &key,
                job.duration_seconds,
                Some(progress_tx),
            )
            .await;

            tokio::time::sleep(std::time::Duration::from_millis(200)).await;
            drop(progress_handle);

            match transcode_result {
                Ok(output) => {
                    set_progress(&pool, &song_id, 50).await;
                    let prefix = format!("songs/{}/", song_id);
                    let total_steps = 2 + output.segment_count;
                    let mut current_step = 0usize;

                    let playlist_data = match tokio::fs::read(&output.playlist_path).await {
                        Ok(data) => data,
                        Err(e) => {
                            mark_failed(&pool, &song_id, &format!("read playlist: {e}")).await;
                            cleanup_dirs(&hls_tmp_dir, &hls_output_dir).await;
                            return;
                        }
                    };
                    if let Err(e) = storage
                        .put(
                            &format!("{prefix}stream.m3u8"),
                            "application/vnd.apple.mpegurl",
                            playlist_data,
                        )
                        .await
                    {
                        mark_failed(&pool, &song_id, &format!("upload playlist: {e}")).await;
                        cleanup_dirs(&hls_tmp_dir, &hls_output_dir).await;
                        return;
                    }
                    current_step += 1;

                    let key_data = match tokio::fs::read(&output.key_path).await {
                        Ok(data) => data,
                        Err(e) => {
                            mark_failed(&pool, &song_id, &format!("read hls key: {e}")).await;
                            cleanup_dirs(&hls_tmp_dir, &hls_output_dir).await;
                            return;
                        }
                    };
                    if let Err(e) = storage
                        .put(
                            &format!("{prefix}key.bin"),
                            "application/octet-stream",
                            key_data,
                        )
                        .await
                    {
                        mark_failed(&pool, &song_id, &format!("upload hls key: {e}")).await;
                        cleanup_dirs(&hls_tmp_dir, &hls_output_dir).await;
                        return;
                    }
                    current_step += 1;

                    let mut segment_entries = match tokio::fs::read_dir(&output.segments_dir).await {
                        Ok(entries) => entries,
                        Err(e) => {
                            mark_failed(&pool, &song_id, &format!("read segments dir: {e}")).await;
                            cleanup_dirs(&hls_tmp_dir, &hls_output_dir).await;
                            return;
                        }
                    };
                    while let Ok(Some(entry)) = segment_entries.next_entry().await {
                        let path = entry.path();
                        if path.extension().and_then(|e| e.to_str()) != Some("ts") {
                            continue;
                        }
                        let name = path
                            .file_name()
                            .unwrap_or_default()
                            .to_string_lossy()
                            .to_string();
                        let data = match tokio::fs::read(&path).await {
                            Ok(d) => d,
                            Err(e) => {
                                tracing::error!(song_id = %song_id, segment = %name, error = %e, "Failed to read segment");
                                continue;
                            }
                        };
                        // Human: Log and continue when one segment fails so a partial library is still debuggable.
                        // Agent: ON upload Err TRACE error only; STILL advances progress; does not abort whole job.
                        if let Err(e) = storage
                            .put(
                                &format!("{prefix}segments/{name}"),
                                "video/mp2t",
                                data,
                            )
                            .await
                        {
                            tracing::error!(song_id = %song_id, segment = %name, error = %e, "Failed to upload segment");
                        }
                        current_step += 1;
                        let upload_pct =
                            50 + ((current_step as f64 / total_steps as f64) * 50.0) as i32;
                        set_progress(&pool, &song_id, upload_pct.min(99)).await;
                    }

                    set_progress(&pool, &song_id, 100).await;

                    if let Err(e) = sqlx::query(
                        "UPDATE songs SET hls_ready = true, hls_key_id = $1, segment_count = $2, hls_encode_status = 'ready', hls_encode_error = NULL WHERE id = $3",
                    )
                    .bind(key_id.to_string())
                    .bind(output.segment_count as i32)
                    .bind(&song_id)
                    .execute(&pool)
                    .await
                    {
                        mark_failed(&pool, &song_id, &format!("update hls status: {e}")).await;
                        cleanup_dirs(&hls_tmp_dir, &hls_output_dir).await;
                        return;
                    }

                    tracing::info!(
                        song_id = %song_id,
                        segment_count = output.segment_count,
                        "HLS encoding completed successfully"
                    );
                }
                Err(e) => {
                    tracing::error!(song_id = %song_id, error = %e, "HLS encoding failed");
                    mark_failed(&pool, &song_id, &format!("transcode: {e}")).await;
                }
            }
        }
        Err(e) => {
            tracing::error!(song_id = %song_id, error = %e, "Failed to create encryption key for HLS");
            mark_failed(&pool, &song_id, &format!("encryption key: {e}")).await;
        }
    }

    if let (Some(staging_id), Some(file_format)) = (job.staging_id, job.file_format) {
        delete_staging_keys(storage.as_ref(), &staging_id, &file_format).await;
    }

    cleanup_dirs(&hls_tmp_dir, &hls_output_dir).await;
}

async fn cleanup_dirs(hls_tmp_dir: &Path, hls_output_dir: &Path) {
    let _ = tokio::fs::remove_dir_all(hls_tmp_dir).await;
    let _ = tokio::fs::remove_dir_all(hls_output_dir).await;
}

// Human: Remove staged upload blobs after a successful commit encode path.
// Agent: DELETE staging/{id}/audio.* and artwork.* keys best-effort.
async fn delete_staging_keys(storage: &dyn Storage, staging_id: &str, file_format: &str) {
    let audio_key = format!("staging/{staging_id}/audio.{file_format}");
    if let Err(e) = storage.delete(&audio_key).await {
        tracing::warn!(key = %audio_key, error = %e, "Failed to delete staged audio");
    }
    for ext in ["jpg", "jpeg", "png", "webp"] {
        let art_key = format!("staging/{staging_id}/artwork.{ext}");
        if let Err(e) = storage.delete(&art_key).await {
            tracing::debug!(key = %art_key, error = %e, "Staged artwork delete skipped");
        }
    }
}

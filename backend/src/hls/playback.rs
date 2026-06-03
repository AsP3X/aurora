// Human: Decide whether a song can safely use AES-HLS playback (key decrypts and first segment exists).
// Agent: READS song_encryption_keys via KeyStore; PROBES storage for songs/{id}/segments/0000.ts; USED by stream-url + migration scan.

use sqlx::AnyPool;
use uuid::Uuid;

use crate::hls::key_store::KeyStore;
use crate::storage::Storage;

/// Human: True only when HLS is marked ready, the media key decrypts, and at least one segment blob exists.
pub async fn song_hls_is_playable(
    key_store: &KeyStore,
    storage: &dyn Storage,
    song_id: Uuid,
    hls_ready: bool,
) -> bool {
    if !hls_ready {
        return false;
    }
    match key_store.get_key(song_id).await {
        Ok(Some(_)) => {}
        _ => return false,
    }
    let first_segment = format!("songs/{song_id}/segments/0000.ts");
    storage.exists(&first_segment).await.unwrap_or(false)
}

/// Human: List library rows that still need HLS encryption/transcode before AES playback works.
pub async fn list_songs_needing_hls_migration(
    pool: &AnyPool,
    key_store: &KeyStore,
    storage: &dyn Storage,
) -> Vec<(String, String, String, i32)> {
    let rows: Vec<(String, String, String, Option<bool>)> = match sqlx::query_as(
        "SELECT id, file_key, file_format, hls_ready FROM songs ORDER BY created_at",
    )
    .fetch_all(pool)
    .await
    {
        Ok(r) => r,
        Err(e) => {
            tracing::warn!(error = %e, "list_songs_needing_hls_migration: query failed");
            return vec![];
        }
    };

    let mut out = Vec::new();
    for (id, file_key, file_format, hls_ready) in rows {
        if file_key.trim().is_empty() {
            continue;
        }
        let uuid = match Uuid::parse_str(&id) {
            Ok(u) => u,
            Err(_) => {
                out.push((id, file_key, file_format, 0));
                continue;
            }
        };
        if song_hls_is_playable(key_store, storage, uuid, hls_ready.unwrap_or(false)).await {
            continue;
        }
        let duration: i32 = sqlx::query_scalar(
            "SELECT COALESCE(duration_seconds, 0) FROM songs WHERE id = $1",
        )
        .bind(&id)
        .fetch_one(pool)
        .await
        .unwrap_or(0);
        out.push((id, file_key, file_format, duration));
    }
    out
}

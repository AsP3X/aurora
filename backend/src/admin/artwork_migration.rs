// Human: Background job to convert legacy single-file cover art into seeker/library/detail WebP variants.
// Agent: SPAWNS tokio task; WRITES app_settings artwork_migration_*; READS songs.artwork_key; CALLS artwork::migrate_legacy.

use std::sync::Arc;

use axum::{extract::State, Json};
use futures_util::TryStreamExt;
use serde::Serialize;
use sqlx::AnyPool;

use crate::{
    error::AppError,
    permissions::require_admin_access,
    storage::Storage,
    AppState,
};

pub const SETTING_STATUS: &str = "artwork_migration_status";
pub const SETTING_PROGRESS: &str = "artwork_migration_progress";
pub const SETTING_PROCESSED: &str = "artwork_migration_processed";
pub const SETTING_TOTAL: &str = "artwork_migration_total";
pub const SETTING_SKIPPED: &str = "artwork_migration_skipped";
pub const SETTING_FAILED: &str = "artwork_migration_failed";
pub const SETTING_ERROR: &str = "artwork_migration_error";
pub const SETTING_PENDING: &str = "artwork_migration_pending";

/// Human: API + settings payload for the admin migration card.
/// Agent: SERIALIZE status/progress/counts/pending_count/error; BUILT by migration_status().
#[derive(Debug, Clone, Serialize)]
pub struct ArtworkMigrationStatus {
    pub status: String,
    pub progress: i32,
    pub processed: i32,
    pub total: i32,
    pub skipped: i32,
    pub failed: i32,
    /// Human: Songs with cover art that still lack all three WebP variants (legacy or partial).
    /// Agent: SCAN storage when idle; FROZEN from SETTING_PENDING while status=running.
    pub pending_count: i32,
    pub error: Option<String>,
}

// Human: Upsert one `app_settings` row used to persist migration progress across polls.
// Agent: INSERT OR UPDATE app_settings; BEST-EFFORT for background job writes.
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

// Human: Read a setting key with a default when the row is missing (first run).
// Agent: READS app_settings; RETURNS owned String default.
async fn read_setting(pool: &AnyPool, key: &str, default: &str) -> String {
    sqlx::query_scalar::<_, String>("SELECT value FROM app_settings WHERE key = $1")
        .bind(key)
        .fetch_optional(pool)
        .await
        .ok()
        .flatten()
        .unwrap_or_else(|| default.to_string())
}

/// Human: Count songs that have artwork but not the full seeker/library/detail WebP set.
/// Agent: READS songs.artwork_key; CALLS has_optimized_variants per row; RETURNS pending i32.
pub async fn count_pending_migration(pool: &AnyPool, storage: &dyn Storage) -> i32 {
    let rows: Vec<(String,)> = match sqlx::query_as(
        "SELECT id FROM songs WHERE artwork_key IS NOT NULL AND TRIM(artwork_key) != ''",
    )
    .fetch_all(pool)
    .await
    {
        Ok(r) => r,
        Err(e) => {
            tracing::warn!(error = %e, "count_pending_migration: failed to list songs");
            return 0;
        }
    };

    let mut pending = 0i32;
    for (song_id,) in rows {
        if !crate::artwork::has_optimized_variants(storage, &song_id).await {
            pending += 1;
        }
    }
    pending
}

/// Human: Load current migration state for the admin settings page.
/// Agent: READS artwork_migration_* keys; SCANS pending when idle; RETURNS ArtworkMigrationStatus JSON.
pub async fn migration_status(pool: &AnyPool, storage: &dyn Storage) -> ArtworkMigrationStatus {
    let status = read_setting(pool, SETTING_STATUS, "idle").await;
    let progress = read_setting(pool, SETTING_PROGRESS, "0")
        .await
        .parse()
        .unwrap_or(0);
    let processed = read_setting(pool, SETTING_PROCESSED, "0")
        .await
        .parse()
        .unwrap_or(0);
    let total = read_setting(pool, SETTING_TOTAL, "0")
        .await
        .parse()
        .unwrap_or(0);
    let skipped = read_setting(pool, SETTING_SKIPPED, "0")
        .await
        .parse()
        .unwrap_or(0);
    let failed = read_setting(pool, SETTING_FAILED, "0")
        .await
        .parse()
        .unwrap_or(0);
    let error_raw = read_setting(pool, SETTING_ERROR, "").await;
    let error = if error_raw.trim().is_empty() {
        None
    } else {
        Some(error_raw)
    };

    let pending_count = if status == "running" {
        read_setting(pool, SETTING_PENDING, "0")
            .await
            .parse()
            .unwrap_or(0)
    } else {
        count_pending_migration(pool, storage).await
    };

    ArtworkMigrationStatus {
        status,
        progress,
        processed,
        total,
        skipped,
        failed,
        pending_count,
        error,
    }
}

// Human: GET handler — poll migration progress from the admin settings UI.
// Agent: HTTP GET /admin/artwork-migration/status; REQUIRES admin.
pub async fn get_artwork_migration_status(
    State(state): State<Arc<AppState>>,
    claims: axum::Extension<crate::auth::Claims>,
) -> Result<Json<ArtworkMigrationStatus>, AppError> {
    require_admin_access(&state.pool, &claims.sub, &claims.role).await?;
    Ok(Json(
        migration_status(&state.pool, state.storage.as_ref()).await,
    ))
}

// Human: POST handler — start the one-shot migration when not already running.
// Agent: HTTP POST /admin/artwork-migration/start; HTTP 409 if status=running; SPAWNS background task.
pub async fn start_artwork_migration(
    State(state): State<Arc<AppState>>,
    claims: axum::Extension<crate::auth::Claims>,
) -> Result<Json<ArtworkMigrationStatus>, AppError> {
    require_admin_access(&state.pool, &claims.sub, &claims.role).await?;

    let current = migration_status(&state.pool, state.storage.as_ref()).await;
    if current.status == "running" {
        return Err(AppError::BadRequest(
            "Artwork migration is already running".into(),
        ));
    }

    if current.pending_count == 0 {
        return Err(AppError::BadRequest(
            "No artwork needs migration — all covers already use WebP variants".into(),
        ));
    }

    upsert_setting(
        &state.pool,
        SETTING_PENDING,
        &current.pending_count.to_string(),
    )
    .await;
    upsert_setting(&state.pool, SETTING_STATUS, "running").await;
    upsert_setting(&state.pool, SETTING_PROGRESS, "0").await;
    upsert_setting(&state.pool, SETTING_PROCESSED, "0").await;
    upsert_setting(&state.pool, SETTING_SKIPPED, "0").await;
    upsert_setting(&state.pool, SETTING_FAILED, "0").await;
    upsert_setting(&state.pool, SETTING_ERROR, "").await;

    let pool = state.pool.clone();
    let storage = state.storage.clone();
    tokio::spawn(async move {
        run_artwork_migration(pool, storage).await;
    });

    Ok(Json(
        migration_status(&state.pool, state.storage.as_ref()).await,
    ))
}

// Human: Walk every song with artwork, re-encode legacy blobs to WebP triplets, update DB keys.
// Agent: READS songs; PER-ROW migrate_legacy; WRITES progress settings; SETS status complete|failed.
async fn run_artwork_migration(pool: AnyPool, storage: Arc<dyn Storage>) {
    let rows: Vec<(String, String)> = match sqlx::query_as(
        "SELECT id, artwork_key FROM songs WHERE artwork_key IS NOT NULL AND TRIM(artwork_key) != ''",
    )
    .fetch_all(&pool)
    .await
    {
        Ok(r) => r,
        Err(e) => {
            upsert_setting(&pool, SETTING_STATUS, "failed").await;
            upsert_setting(&pool, SETTING_ERROR, &format!("load songs: {e}")).await;
            return;
        }
    };

    let total = rows.len() as i32;
    upsert_setting(&pool, SETTING_TOTAL, &total.to_string()).await;

    let mut processed = 0i32;
    let mut skipped = 0i32;
    let mut failed = 0i32;

    for (song_id, legacy_key) in rows {
        match migrate_one_song(&pool, storage.as_ref(), &song_id, &legacy_key).await {
            Ok(MigrateOneOutcome::Migrated) => {}
            Ok(MigrateOneOutcome::Skipped) => {
                skipped += 1;
            }
            Err(e) => {
                failed += 1;
                tracing::warn!(song_id = %song_id, error = %e, "artwork migration failed for song");
            }
        }

        processed += 1;
        let progress = if total > 0 {
            ((processed as f64 / total as f64) * 100.0).round() as i32
        } else {
            100
        };
        upsert_setting(&pool, SETTING_PROCESSED, &processed.to_string()).await;
        upsert_setting(&pool, SETTING_SKIPPED, &skipped.to_string()).await;
        upsert_setting(&pool, SETTING_FAILED, &failed.to_string()).await;
        upsert_setting(&pool, SETTING_PROGRESS, &progress.to_string()).await;
    }

    upsert_setting(&pool, SETTING_PROGRESS, "100").await;
    if failed > 0 {
        upsert_setting(
            &pool,
            SETTING_ERROR,
            &format!("{failed} song(s) could not be migrated; check server logs"),
        )
        .await;
        upsert_setting(&pool, SETTING_STATUS, "failed").await;
    } else {
        upsert_setting(&pool, SETTING_ERROR, "").await;
        upsert_setting(&pool, SETTING_STATUS, "complete").await;
    }
}

enum MigrateOneOutcome {
    Migrated,
    Skipped,
}

// Human: Skip songs that already have all three WebP sizes; otherwise download legacy bytes and re-ingest.
// Agent: CALLS has_optimized_variants; READS legacy stream; CALLS ingest_artwork; UPDATE artwork_key; DELETE legacy blob.
async fn migrate_one_song(
    pool: &AnyPool,
    storage: &dyn Storage,
    song_id: &str,
    legacy_key: &str,
) -> Result<MigrateOneOutcome, String> {
    if crate::artwork::has_optimized_variants(storage, song_id).await {
        return Ok(MigrateOneOutcome::Skipped);
    }

    if !storage.exists(legacy_key).await.unwrap_or(false) {
        return Err(format!("legacy artwork missing at {legacy_key}"));
    }

    let (stream, _, _) = storage
        .get_stream(legacy_key)
        .await
        .map_err(|e| format!("read legacy artwork: {e}"))?;
    let bytes = collect_stream(stream).await?;

    let new_key = crate::artwork::ingest_artwork(storage, song_id, bytes)
        .await
        .map_err(|e| e.to_string())?;

    sqlx::query("UPDATE songs SET artwork_key = $1 WHERE id = $2")
        .bind(&new_key)
        .bind(song_id)
        .execute(pool)
        .await
        .map_err(|e| format!("update artwork_key: {e}"))?;

    if legacy_key != &new_key {
        let new_keys = [
            crate::artwork::storage_key(song_id, crate::artwork::ArtworkVariant::Seeker),
            crate::artwork::storage_key(song_id, crate::artwork::ArtworkVariant::Library),
            crate::artwork::storage_key(song_id, crate::artwork::ArtworkVariant::Detail),
        ];
        if !new_keys.iter().any(|k| k == legacy_key) {
            if let Err(e) = storage.delete(legacy_key).await {
                tracing::debug!(key = %legacy_key, error = %e, "legacy artwork delete skipped");
            }
        }
    }

    Ok(MigrateOneOutcome::Migrated)
}

async fn collect_stream(stream: crate::storage::StorageStream) -> Result<Vec<u8>, String> {
    let chunks: Vec<_> = stream
        .try_collect()
        .await
        .map_err(|e| e.to_string())?;
    Ok(chunks.into_iter().flat_map(|b| b.to_vec()).collect())
}

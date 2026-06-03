// Human: Admin-driven SQLite → Postgres library migration with dry-run validation, row-count verification, and progress in app_settings.
// Agent: READS sqlite file via secondary pool; WRITES into live postgres AppState pool; HTTP validate/start/status; SPAWNS background copy job.

use std::collections::HashSet;
use std::path::Path;
use std::sync::Arc;

use axum::{extract::State, Json};
use serde::{Deserialize, Serialize};
use sqlx::any::AnyRow;
use sqlx::{Row, AnyPool};
use uuid::Uuid;

use crate::{
    db,
    error::AppError,
    permissions::require_admin_access,
    setup::env_persist,
    storage::Storage,
    AppState,
};

pub const SETTING_STATUS: &str = "database_migration_status";
pub const SETTING_PROGRESS: &str = "database_migration_progress";
pub const SETTING_PHASE: &str = "database_migration_phase";
pub const SETTING_ERROR: &str = "database_migration_error";
pub const SETTING_SOURCE_URL: &str = "database_migration_source_sqlite_url";
pub const SETTING_COMPLETED_AT: &str = "database_migration_completed_at";
pub const SETTING_VERIFY_OK: &str = "database_migration_verify_ok";

/// Human: Tables copied in FK-safe order (parents before children).
const TABLES_IN_ORDER: &[&str] = &[
    "permissions",
    "groups",
    "users",
    "genres",
    "group_permissions",
    "user_permissions",
    "group_memberships",
    "songs",
    "song_genres",
    "song_lyrics",
    "song_encryption_keys",
    "playlists",
    "playlist_songs",
    "playback_history",
    "app_settings",
    "search_index_queue",
];

const CORE_EMPTY_TABLES: &[&str] = &[
    "users",
    "songs",
    "playlists",
    "playback_history",
];

const BOOL_COLUMNS: &[&str] = &[
    "enabled",
    "is_public",
    "completed",
    "hls_ready",
];

const CONFIRMATION_PHRASE: &str = "MIGRATE-DATABASE";

#[derive(Debug, Clone, Serialize)]
pub struct MigrationCheck {
    pub id: String,
    pub label: String,
    pub ok: bool,
    pub message: String,
}

#[derive(Debug, Clone, Serialize)]
pub struct TableCount {
    pub table: String,
    pub count: i64,
}

#[derive(Debug, Clone, Serialize)]
pub struct DatabaseMigrationStatus {
    pub status: String,
    pub progress: i32,
    pub phase: Option<String>,
    pub target_driver: String,
    pub source_sqlite_url: Option<String>,
    pub default_source_sqlite_url: String,
    pub checks: Vec<MigrationCheck>,
    pub source_counts: Vec<TableCount>,
    pub target_counts: Vec<TableCount>,
    pub verify_ok: Option<bool>,
    pub error: Option<String>,
    pub restart_recommended: bool,
}

#[derive(Debug, Deserialize)]
pub struct ValidateMigrationBody {
    pub sqlite_database_url: String,
}

#[derive(Debug, Deserialize)]
pub struct StartMigrationBody {
    pub sqlite_database_url: String,
    pub confirm_target_empty: bool,
    pub confirm_source_backup: bool,
    pub confirmation_phrase: String,
}

#[derive(Debug, Clone, Serialize)]
pub struct ValidateMigrationResponse {
    pub ready: bool,
    pub checks: Vec<MigrationCheck>,
    pub source_counts: Vec<TableCount>,
    pub target_counts: Vec<TableCount>,
}

// Human: Upsert one `app_settings` row used to persist migration progress across polls.
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

async fn read_setting(pool: &AnyPool, key: &str) -> Option<String> {
    sqlx::query_scalar::<_, String>("SELECT value FROM app_settings WHERE key = $1")
        .bind(key)
        .fetch_optional(pool)
        .await
        .ok()
        .flatten()
}

/// Human: Accept `sqlite:…`, `sqlite://…`, or a filesystem path from the admin UI.
pub fn normalize_sqlite_url(raw: &str) -> Result<String, AppError> {
    let trimmed = raw.trim();
    if trimmed.is_empty() {
        return Err(AppError::BadRequest("sqlite_database_url is required".into()));
    }
    if trimmed.starts_with("sqlite:") {
        return Ok(trimmed.to_string());
    }
    let path = Path::new(trimmed);
    if !path.exists() {
        return Err(AppError::BadRequest(format!(
            "SQLite database file not found: {}",
            path.display()
        )));
    }
    Ok(format!("sqlite:{}", path.display()))
}

fn is_id_column(name: &str) -> bool {
    name == "id" || name.ends_with("_id")
}

fn is_bool_column(name: &str) -> bool {
    BOOL_COLUMNS.contains(&name)
}

fn blob_to_uuid_string(bytes: &[u8]) -> Option<String> {
    if bytes.len() == 16 {
        return Uuid::from_bytes(bytes.try_into().ok()?).to_string().into();
    }
    None
}

fn normalize_id_value(raw: &str) -> String {
    let trimmed = raw.trim();
    if Uuid::parse_str(trimmed).is_ok() {
        return trimmed.to_string();
    }
    if let Ok(bytes) = hex::decode(trimmed.replace('-', "")) {
        if let Some(u) = blob_to_uuid_string(&bytes) {
            return u;
        }
    }
    trimmed.to_string()
}

async fn count_table(pool: &AnyPool, table: &str) -> Result<i64, sqlx::Error> {
    let sql = format!("SELECT COUNT(*) AS c FROM {table}");
    sqlx::query_scalar::<_, i64>(&sql).fetch_one(pool).await
}

async fn table_exists(pool: &AnyPool, table: &str) -> bool {
    count_table(pool, table).await.is_ok()
}

async fn sqlite_columns(pool: &AnyPool, table: &str) -> Result<Vec<String>, AppError> {
    let sql = format!("PRAGMA table_info({table})");
    let rows = sqlx::query(&sql).fetch_all(pool).await.map_err(AppError::Database)?;
    let mut cols = Vec::new();
    for row in rows {
        let name: String = row.try_get("name").map_err(AppError::Database)?;
        cols.push(name);
    }
    Ok(cols)
}

async fn postgres_columns(pool: &AnyPool, table: &str) -> Result<Vec<String>, AppError> {
    let rows = sqlx::query(
        "SELECT column_name FROM information_schema.columns
         WHERE table_schema = 'public' AND table_name = $1
         ORDER BY ordinal_position",
    )
    .bind(table)
    .fetch_all(pool)
    .await
    .map_err(AppError::Database)?;
    let mut cols = Vec::new();
    for row in rows {
        let name: String = row.try_get("column_name").map_err(AppError::Database)?;
        cols.push(name);
    }
    Ok(cols)
}

fn intersect_columns(src: &[String], dst: &[String]) -> Vec<String> {
    let dst_set: HashSet<_> = dst.iter().collect();
    src.iter()
        .filter(|c| dst_set.contains(c))
        .cloned()
        .collect()
}

async fn collect_counts(pool: &AnyPool, tables: &[&str]) -> Vec<TableCount> {
    let mut out = Vec::new();
    for table in tables {
        if table_exists(pool, table).await {
            if let Ok(count) = count_table(pool, table).await {
                out.push(TableCount {
                    table: (*table).to_string(),
                    count,
                });
            }
        }
    }
    out
}

fn read_cell_as_string(row: &AnyRow, col: &str, is_id: bool) -> Result<Option<String>, AppError> {
    if let Ok(v) = row.try_get::<Option<String>, _>(col) {
        return Ok(v.map(|s| if is_id { normalize_id_value(&s) } else { s }));
    }
    if let Ok(v) = row.try_get::<Option<Vec<u8>>, _>(col) {
        return Ok(v.map(|b| {
            if is_id {
                blob_to_uuid_string(&b).unwrap_or_else(|| hex::encode(&b))
            } else {
                hex::encode(b)
            }
        }));
    }
    if let Ok(v) = row.try_get::<Option<i64>, _>(col) {
        return Ok(v.map(|n| n.to_string()));
    }
    if let Ok(v) = row.try_get::<Option<i32>, _>(col) {
        return Ok(v.map(|n| n.to_string()));
    }
    Ok(None)
}

fn parse_boolish(s: &str) -> bool {
    let v = s.trim().to_lowercase();
    v == "1" || v == "true" || v == "yes" || v == "on"
}

async fn copy_table(
    src: &AnyPool,
    dst: &AnyPool,
    table: &str,
) -> Result<i64, AppError> {
    if !table_exists(src, table).await {
        return Ok(0);
    }
    if !table_exists(dst, table).await {
        return Err(AppError::BadRequest(format!(
            "target database is missing table `{table}` — run postgres migrations first"
        )));
    }

    let src_cols = sqlite_columns(src, table).await?;
    let dst_cols = postgres_columns(dst, table).await?;
    let cols = intersect_columns(&src_cols, &dst_cols);
    if cols.is_empty() {
        return Ok(0);
    }

    let select_sql = format!("SELECT {} FROM {table}", cols.join(", "));
    let rows = sqlx::query(&select_sql)
        .fetch_all(src)
        .await
        .map_err(AppError::Database)?;

    let mut copied = 0i64;
    for row in rows {
        let placeholders: Vec<String> = (1..=cols.len()).map(|i| format!("${i}")).collect();
        let insert_sql = format!(
            "INSERT INTO {table} ({}) VALUES ({}) ON CONFLICT DO NOTHING",
            cols.join(", "),
            placeholders.join(", ")
        );

        let mut q = sqlx::query(&insert_sql);
        for col in &cols {
            let is_id = is_id_column(col);
            if col == &"encrypted_key" {
                let bytes: Vec<u8> = row
                    .try_get(col.as_str())
                    .map_err(AppError::Database)?;
                q = q.bind(bytes);
                continue;
            }
            let raw = read_cell_as_string(&row, col, is_id)?
                .unwrap_or_default();
            if is_bool_column(col) {
                q = q.bind(parse_boolish(&raw));
            } else if col == &"file_size_bytes" || col == &"duration_listened_seconds" {
                q = q.bind(raw.parse::<i64>().unwrap_or(0));
            } else if matches!(
                col.as_str(),
                "position"
                    | "track_number"
                    | "year"
                    | "bitrate_kbps"
                    | "sample_rate_hz"
                    | "segment_count"
                    | "conversion_progress"
                    | "attempts"
                    | "duration_seconds"
            ) {
                q = q.bind(raw.parse::<i32>().unwrap_or(0));
            } else {
                q = q.bind(raw);
            }
        }
        q.execute(dst).await.map_err(|e| {
            tracing::error!(table, error = %e, "database migration insert failed");
            AppError::Storage(format!("failed copying row into `{table}`: {e}"))
        })?;
        copied += 1;
    }
    Ok(copied)
}

async fn verify_row_counts(src: &AnyPool, dst: &AnyPool) -> Result<bool, AppError> {
    for table in TABLES_IN_ORDER {
        if !table_exists(src, table).await {
            continue;
        }
        let src_n = count_table(src, table).await.unwrap_or(0);
        let dst_n = count_table(dst, table).await.unwrap_or(0);
        if src_n != dst_n {
            tracing::error!(
                table,
                src_n,
                dst_n,
                "database migration verify mismatch"
            );
            return Ok(false);
        }
    }
    Ok(true)
}

async fn sample_storage_keys(
    pool: &AnyPool,
    storage: &dyn Storage,
    limit: usize,
) -> MigrationCheck {
    let keys: Vec<String> = match sqlx::query_scalar(
        "SELECT file_key FROM songs ORDER BY created_at LIMIT $1",
    )
    .bind(limit as i32)
    .fetch_all(pool)
    .await
    {
        Ok(k) => k,
        Err(e) => {
            return MigrationCheck {
                id: "storage_sample".into(),
                label: "Object storage sample".into(),
                ok: false,
                message: format!("could not list songs: {e}"),
            };
        }
    };

    if keys.is_empty() {
        return MigrationCheck {
            id: "storage_sample".into(),
            label: "Object storage sample".into(),
            ok: true,
            message: "no song files to check (empty library)".into(),
        };
    }

    let mut missing = 0usize;
    for key in &keys {
        if !storage.exists(key).await.unwrap_or(false) {
            missing += 1;
        }
    }
    if missing > 0 {
        MigrationCheck {
            id: "storage_sample".into(),
            label: "Object storage sample".into(),
            ok: false,
            message: format!(
                "{missing} of {} sampled audio file(s) missing in current storage — fix STORAGE_MODE/paths before migrating",
                keys.len()
            ),
        }
    } else {
        MigrationCheck {
            id: "storage_sample".into(),
            label: "Object storage sample".into(),
            ok: true,
            message: format!("all {} sampled audio file(s) present in storage", keys.len()),
        }
    }
}

pub async fn build_checks(
    target: &AnyPool,
    target_driver: &str,
    source_url: &str,
    storage: &dyn Storage,
) -> Result<(Vec<MigrationCheck>, Vec<TableCount>, Vec<TableCount>), AppError> {
    let mut checks = Vec::new();

    checks.push(MigrationCheck {
        id: "target_postgres".into(),
        label: "Target database is PostgreSQL".into(),
        ok: target_driver == "postgres",
        message: if target_driver == "postgres" {
            "current Aurora process is connected to PostgreSQL".into()
        } else {
            format!("current driver is `{target_driver}`; migrate only into PostgreSQL")
        },
    });

    let sqlite_url = match normalize_sqlite_url(source_url) {
        Ok(u) => {
            checks.push(MigrationCheck {
                id: "source_url".into(),
                label: "SQLite source path".into(),
                ok: true,
                message: u.clone(),
            });
            u
        }
        Err(e) => {
            let msg = match &e {
                AppError::BadRequest(m) => m.clone(),
                _ => e.to_string(),
            };
            checks.push(MigrationCheck {
                id: "source_url".into(),
                label: "SQLite source path".into(),
                ok: false,
                message: msg,
            });
            return Ok((checks, vec![], collect_counts(target, TABLES_IN_ORDER).await));
        }
    };

    let source_pool = match db::init_pool(&sqlite_url).await {
        Ok(p) => {
            checks.push(MigrationCheck {
                id: "source_connect".into(),
                label: "SQLite source reachable".into(),
                ok: true,
                message: "connected and migrations applied".into(),
            });
            p
        }
        Err(e) => {
            checks.push(MigrationCheck {
                id: "source_connect".into(),
                label: "SQLite source reachable".into(),
                ok: false,
                message: format!("{e}"),
            });
            return Ok((checks, vec![], collect_counts(target, TABLES_IN_ORDER).await));
        }
    };

    let source_users = count_table(&source_pool, "users").await.unwrap_or(0);
    checks.push(MigrationCheck {
        id: "source_has_data".into(),
        label: "SQLite library has users".into(),
        ok: source_users > 0,
        message: if source_users > 0 {
            format!("found {source_users} user(s) in source")
        } else {
            "source has no users — nothing to migrate".into()
        },
    });

    let mut target_empty = true;
    for table in CORE_EMPTY_TABLES {
        let n = count_table(target, table).await.unwrap_or(0);
        if n > 0 {
            target_empty = false;
        }
    }
    checks.push(MigrationCheck {
        id: "target_empty".into(),
        label: "PostgreSQL target has no library data".into(),
        ok: target_empty,
        message: if target_empty {
            "users, songs, playlists, and history are empty on target".into()
        } else {
            "target already contains library rows — migration refuses to overwrite data".into()
        },
    });

    let status = read_setting(target, SETTING_STATUS).await.unwrap_or_default();
    checks.push(MigrationCheck {
        id: "not_running".into(),
        label: "No migration already running".into(),
        ok: status != "running",
        message: if status == "running" {
            "a migration job is already in progress".into()
        } else {
            format!("status is `{status}`")
        },
    });

    checks.push(sample_storage_keys(&source_pool, storage, 8).await);

    let source_counts = collect_counts(&source_pool, TABLES_IN_ORDER).await;
    let target_counts = collect_counts(target, TABLES_IN_ORDER).await;

    Ok((checks, source_counts, target_counts))
}

pub async fn migration_status(state: &AppState) -> DatabaseMigrationStatus {
    let default_source = db::default_sqlite_source_url().to_string();
    let target_driver = db::driver_from_url(&state.database_url().await)
        .unwrap_or("unknown")
        .to_string();
    let pool = state.pool().await;
    let source_url = read_setting(&pool, SETTING_SOURCE_URL).await;
    let effective_source = source_url
        .clone()
        .unwrap_or_else(|| default_source.clone());
    let status = read_setting(&pool, SETTING_STATUS)
        .await
        .unwrap_or_else(|| "idle".to_string());
    let progress = read_setting(&pool, SETTING_PROGRESS)
        .await
        .unwrap_or_else(|| "0".to_string())
        .parse::<i32>()
        .unwrap_or(0);
    let phase = read_setting(&pool, SETTING_PHASE).await;
    let error = read_setting(&pool, SETTING_ERROR).await.filter(|s| !s.is_empty());
    let verify_ok = read_setting(&pool, SETTING_VERIFY_OK)
        .await
        .map(|v| v == "true");

    let (checks, source_counts, target_counts) = build_checks(
        &pool,
        &target_driver,
        &effective_source,
        state.storage.as_ref(),
    )
    .await
    .unwrap_or_else(|_| (vec![], vec![], vec![]));

    DatabaseMigrationStatus {
        restart_recommended: false,
        status,
        progress,
        phase,
        target_driver,
        source_sqlite_url: Some(effective_source),
        default_source_sqlite_url: default_source,
        checks,
        source_counts,
        target_counts,
        verify_ok,
        error,
    }
}

pub async fn validate_migration(
    state: &AppState,
    body: ValidateMigrationBody,
) -> Result<Json<ValidateMigrationResponse>, AppError> {
    let target_driver = db::driver_from_url(&state.database_url().await)
        .unwrap_or("unknown")
        .to_string();
    let sqlite_url = normalize_sqlite_url(&body.sqlite_database_url)?;
    upsert_setting(&state.pool().await, SETTING_SOURCE_URL, &sqlite_url).await;

    let (checks, source_counts, target_counts) = build_checks(
        &state.pool().await,
        &target_driver,
        &sqlite_url,
        state.storage.as_ref(),
    )
    .await?;

    let ready = checks.iter().all(|c| c.ok);
    Ok(Json(ValidateMigrationResponse {
        ready,
        checks,
        source_counts,
        target_counts,
    }))
}

pub async fn get_database_migration_status(
    State(state): State<Arc<AppState>>,
    claims: axum::Extension<crate::auth::Claims>,
) -> Result<Json<DatabaseMigrationStatus>, AppError> {
    require_admin_access(&state.pool().await, &claims.sub, &claims.role).await?;
    Ok(Json(migration_status(&state).await))
}

pub async fn post_validate_database_migration(
    State(state): State<Arc<AppState>>,
    claims: axum::Extension<crate::auth::Claims>,
    Json(body): Json<ValidateMigrationBody>,
) -> Result<Json<ValidateMigrationResponse>, AppError> {
    require_admin_access(&state.pool().await, &claims.sub, &claims.role).await?;
    validate_migration(&state, body).await
}

pub async fn start_database_migration(
    State(state): State<Arc<AppState>>,
    claims: axum::Extension<crate::auth::Claims>,
    Json(body): Json<StartMigrationBody>,
) -> Result<Json<DatabaseMigrationStatus>, AppError> {
    require_admin_access(&state.pool().await, &claims.sub, &claims.role).await?;

    if body.confirmation_phrase.trim() != CONFIRMATION_PHRASE {
        return Err(AppError::BadRequest(format!(
            "confirmation_phrase must be exactly `{CONFIRMATION_PHRASE}`"
        )));
    }
    if !body.confirm_target_empty || !body.confirm_source_backup {
        return Err(AppError::BadRequest(
            "confirm_target_empty and confirm_source_backup must both be true".into(),
        ));
    }

    let sqlite_url = normalize_sqlite_url(&body.sqlite_database_url)?;
    upsert_setting(&state.pool().await, SETTING_SOURCE_URL, &sqlite_url).await;

    let target_driver = db::driver_from_url(&state.database_url().await)
        .ok_or_else(|| AppError::BadRequest("unsupported target database".into()))?;
    let (checks, _, _) = build_checks(
        &state.pool().await,
        target_driver,
        &sqlite_url,
        state.storage.as_ref(),
    )
    .await?;
    if !checks.iter().all(|c| c.ok) {
        return Err(AppError::BadRequest(
            "validation failed — run validate and fix all checks before starting".into(),
        ));
    }

    let current = read_setting(&state.pool().await, SETTING_STATUS)
        .await
        .unwrap_or_default();
    if current == "running" {
        return Err(AppError::Conflict(
            "database migration is already running".into(),
        ));
    }

    upsert_setting(&state.pool().await, SETTING_STATUS, "running").await;
    upsert_setting(&state.pool().await, SETTING_PROGRESS, "0").await;
    upsert_setting(&state.pool().await, SETTING_PHASE, "starting").await;
    upsert_setting(&state.pool().await, SETTING_ERROR, "").await;
    upsert_setting(&state.pool().await, SETTING_VERIFY_OK, "").await;

    let pool = state.pool().await;
    let postgres_url = state.database_url().await;
    let job_state = state.clone();
    tokio::spawn(async move {
        run_database_migration(job_state, pool, postgres_url, sqlite_url).await;
    });

    Ok(Json(migration_status(&state).await))
}

/// Human: After a verified copy, persist Postgres as the active database and hot-swap when still on SQLite.
async fn finalize_successful_migration(state: &AppState, postgres_url: &str) {
    let pool = state.pool().await;
    upsert_setting(&pool, "database_url", postgres_url).await;
    env_persist::try_persist_database_url(postgres_url);

    if db::driver_from_url(&state.database_url().await) == Some("sqlite") {
        if let Err(e) = state.db.switch_to(postgres_url).await {
            tracing::error!(error = %e, "failed to switch live database to postgres after migration");
        } else {
            tracing::info!("Live database connection switched to PostgreSQL after migration");
        }
    }
}

async fn run_database_migration(
    state: Arc<AppState>,
    pool: AnyPool,
    postgres_url: String,
    sqlite_url: String,
) {
    let result = run_database_migration_inner(&pool, &sqlite_url).await;
    match result {
        Ok(verify_ok) => {
            upsert_setting(&pool, SETTING_VERIFY_OK, if verify_ok { "true" } else { "false" }).await;
            upsert_setting(&pool, SETTING_STATUS, if verify_ok { "complete" } else { "failed" }).await;
            upsert_setting(&pool, SETTING_PROGRESS, "100").await;
            upsert_setting(&pool, SETTING_PHASE, "done").await;
            if verify_ok {
                let now = chrono::Utc::now().to_rfc3339();
                upsert_setting(&pool, SETTING_COMPLETED_AT, &now).await;
                finalize_successful_migration(&state, &postgres_url).await;
            } else {
                upsert_setting(
                    &pool,
                    SETTING_ERROR,
                    "row counts after copy did not match source — inspect logs and restore from backup",
                )
                .await;
            }
        }
        Err(e) => {
            let msg = e.to_string();
            tracing::error!(error = %msg, "database migration failed");
            upsert_setting(&pool, SETTING_STATUS, "failed").await;
            upsert_setting(&pool, SETTING_ERROR, &msg).await;
            upsert_setting(&pool, SETTING_PHASE, "failed").await;
        }
    }
}

async fn run_database_migration_inner(pool: &AnyPool, sqlite_url: &str) -> Result<bool, AppError> {
    let source = db::init_pool(sqlite_url).await.map_err(AppError::Internal)?;

    let total_tables = TABLES_IN_ORDER.len() as i32;
    for (idx, table) in TABLES_IN_ORDER.iter().enumerate() {
        let pct = ((idx as i32) * 100) / total_tables.max(1);
        upsert_setting(pool, SETTING_PROGRESS, &pct.to_string()).await;
        upsert_setting(pool, SETTING_PHASE, &format!("copy:{table}")).await;

        if table == &"app_settings" {
            copy_app_settings(&source, pool).await?;
        } else {
            copy_table(&source, pool, table).await?;
        }
    }

    upsert_setting(pool, SETTING_PHASE, "verify").await;
    upsert_setting(pool, SETTING_PROGRESS, "95").await;
    let verify_ok = verify_row_counts(&source, pool).await?;
    Ok(verify_ok)
}

/// Human: Copy app_settings but never overwrite in-flight migration keys on the target.
async fn copy_app_settings(src: &AnyPool, dst: &AnyPool) -> Result<i64, AppError> {
    let rows = sqlx::query("SELECT key, value, updated_at FROM app_settings")
        .fetch_all(src)
        .await
        .map_err(AppError::Database)?;
    let mut n = 0i64;
    for row in rows {
        let key: String = row.try_get("key").map_err(AppError::Database)?;
        if key.starts_with("database_migration_") || key.starts_with("artwork_migration_") {
            continue;
        }
        let value: String = row.try_get("value").map_err(AppError::Database)?;
        let updated_at: String = row.try_get("updated_at").map_err(AppError::Database)?;
        sqlx::query(
            "INSERT INTO app_settings (key, value, updated_at) VALUES ($1, $2, $3)
             ON CONFLICT (key) DO NOTHING",
        )
        .bind(&key)
        .bind(&value)
        .bind(&updated_at)
        .execute(dst)
        .await
        .map_err(AppError::Database)?;
        n += 1;
    }
    Ok(n)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn normalize_sqlite_url_accepts_prefix() {
        let u = normalize_sqlite_url("sqlite:./aurora.db").unwrap();
        assert!(u.starts_with("sqlite:"));
    }

    #[test]
    fn confirmation_phrase_is_stable() {
        assert_eq!(CONFIRMATION_PHRASE, "MIGRATE-DATABASE");
    }

    #[test]
    fn default_sqlite_source_uses_sqlite_prefix() {
        let url = db::default_sqlite_source_url();
        assert!(url.starts_with("sqlite:"));
    }
}

// Human: Expose build metadata and one-time tenant setup that mirrors register/login responses so the SPA can store a JWT immediately.
// Agent: READS users COUNT for gating; WRITES users + app_settings + admin group_memberships in TX; RETURNS AuthResponse on success only once.
use axum::{extract::State, Json};
use serde::{Deserialize, Serialize};
use sqlx::AnyPool;
use std::sync::Arc;
use uuid::Uuid;

use crate::{
    auth::handlers::{create_token, hash_password, AuthResponse, UserDto},
    db,
    error::AppError,
    permissions::get_user_permission_keys,
    setup::env_persist,
    AppState,
};

#[derive(Debug, Serialize)]
pub struct ReleaseInfo {
    pub version: &'static str,
    pub git_sha: String,
    pub environment: String,
}

// Human: Non-secret build fingerprint for `/api/v1` about screens—uses compile-time crate version plus runtime git SHA from AppState.
// Agent: READS state.git_sha, state.environment; RETURNS JSON ReleaseInfo; NO DB queries.
pub async fn release_info(State(state): State<Arc<AppState>>) -> Json<ReleaseInfo> {
    Json(ReleaseInfo {
        version: env!("CARGO_PKG_VERSION"),
        git_sha: state.git_sha.clone(),
        environment: state.environment.clone(),
    })
}

#[derive(Debug, Serialize)]
pub struct SetupStatus {
    pub setup_complete: bool,
}

#[derive(Debug, Serialize)]
pub struct SetupDatabaseInfo {
    pub driver: String,
    pub database_url: String,
}

#[derive(Debug, Deserialize)]
pub struct DatabaseUrlBody {
    pub database_url: String,
}

#[derive(Debug, Serialize)]
pub struct DatabaseTestResponse {
    pub ok: bool,
    pub driver: String,
}

#[derive(Debug, Deserialize)]
pub struct SetupRequest {
    pub email: String,
    pub password: String,
    pub instance_name: String,
    pub allow_public_registration: bool,
    pub music_dir: Option<String>,
    /// Target database for first-run data; defaults to the server's startup `DATABASE_URL`.
    pub database_url: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct SetupResponse {
    #[serde(flatten)]
    pub auth: AuthResponse,
    /// True when setup wrote to a different database than this process started with—restart with matching `DATABASE_URL`.
    #[serde(skip_serializing_if = "std::ops::Not::not")]
    pub restart_required: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub configured_database_url: Option<String>,
}

// Human: Tell the SPA whether any user row exists so it can route to setup vs login without probing protected endpoints.
// Agent: READS COUNT(*) FROM users; RETURNS setup_complete bool; NO AUTH middleware on route.
pub async fn setup_status(
    State(state): State<Arc<AppState>>,
) -> Result<Json<SetupStatus>, AppError> {
    let count: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM users")
        .fetch_one(&state.pool)
        .await?;

    Ok(Json(SetupStatus {
        setup_complete: count > 0,
    }))
}

// Human: Expose the live connection string during first-run so the wizard can pre-fill Docker or local defaults.
// Agent: READS state.database_url; DERIVES driver via db::driver_from_url; ONLY safe before setup_complete.
pub async fn setup_database_info(
    State(state): State<Arc<AppState>>,
) -> Result<Json<SetupDatabaseInfo>, AppError> {
    let count: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM users")
        .fetch_one(&state.pool)
        .await?;
    if count > 0 {
        return Err(AppError::Conflict("setup already completed".into()));
    }

    let driver = db::driver_from_url(&state.database_url)
        .unwrap_or("unknown")
        .to_string();

    Ok(Json(SetupDatabaseInfo {
        driver,
        database_url: state.database_url.clone(),
    }))
}

// Human: Let the setup wizard verify credentials before the admin account is created.
// Agent: VALIDATES url driver; CALLS db::test_connection; RETURNS ok + driver; HTTP 400 on bad url.
pub async fn test_setup_database(
    State(state): State<Arc<AppState>>,
    Json(body): Json<DatabaseUrlBody>,
) -> Result<Json<DatabaseTestResponse>, AppError> {
    let count: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM users")
        .fetch_one(&state.pool)
        .await?;
    if count > 0 {
        return Err(AppError::Conflict("setup already completed".into()));
    }

    let url = body.database_url.trim();
    if url.is_empty() {
        return Err(AppError::BadRequest("database_url is required".into()));
    }

    let driver = db::driver_from_url(url)
        .ok_or_else(|| AppError::BadRequest("unsupported database_url scheme".into()))?
        .to_string();

    db::test_connection(url).await.map_err(|e| {
        tracing::warn!(error = %e, "setup database connection test failed");
        AppError::BadRequest("could not connect to database; check host, credentials, and network".into())
    })?;

    let _ = &state;
    Ok(Json(DatabaseTestResponse { ok: true, driver }))
}

fn urls_equivalent(a: &str, b: &str) -> bool {
    a.trim() == b.trim()
}

// Human: Atomic first admin creation with default settings—rejects weak passwords or repeat calls once the users table is non-empty.
// Agent: WRITES users as role admin; INSERTS group admin UUID; SEEDS app_settings keys; RETURNS JWT via create_token; HTTP 409 if already initialized.
pub async fn setup(
    State(state): State<Arc<AppState>>,
    Json(body): Json<SetupRequest>,
) -> Result<Json<SetupResponse>, AppError> {
    let target_url = body
        .database_url
        .as_deref()
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .unwrap_or(state.database_url.as_str());

    if db::driver_from_url(target_url).is_none() {
        return Err(AppError::BadRequest("unsupported database_url scheme".into()));
    }

    let use_startup_pool = urls_equivalent(target_url, &state.database_url);
    let setup_pool: AnyPool = if use_startup_pool {
        state.pool.clone()
    } else {
        db::init_pool(target_url).await.map_err(|e| {
            tracing::warn!(error = %e, "setup could not open configured database");
            AppError::BadRequest(
                "could not connect to configured database; test the connection first".into(),
            )
        })?
    };

    let count: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM users")
        .fetch_one(&setup_pool)
        .await?;

    if count > 0 {
        return Err(AppError::Conflict("setup already completed".into()));
    }

    if body.password.len() < 8 {
        return Err(AppError::BadRequest(
            "password must be at least 8 characters".into(),
        ));
    }

    let password_hash =
        hash_password(&body.password).map_err(|e| AppError::Internal(anyhow::anyhow!(e)))?;
    let user_id = Uuid::new_v4().to_string();

    let mut tx = setup_pool.begin().await?;

    sqlx::query(
        "INSERT INTO users (id, email, password_hash, role, enabled) VALUES ($1, $2, $3, 'admin', true)",
    )
    .bind(&user_id)
    .bind(&body.email)
    .bind(&password_hash)
    .execute(&mut *tx)
    .await
    .map_err(|e| match e {
        sqlx::Error::Database(db_err) if db_err.is_unique_violation() => {
            AppError::Conflict("email already exists".into())
        }
        _ => AppError::Database(e),
    })?;

    let membership_id = Uuid::new_v4().to_string();
    sqlx::query(
        "INSERT INTO group_memberships (id, user_id, group_id) VALUES ($1, $2, '00000000-0000-0000-0000-000000000002')",
    )
    .bind(&membership_id)
    .bind(&user_id)
    .execute(&mut *tx)
    .await?;

    sqlx::query("INSERT INTO app_settings (key, value) VALUES ($1, $2)")
        .bind("instance_name")
        .bind(&body.instance_name)
        .execute(&mut *tx)
        .await?;

    sqlx::query("INSERT INTO app_settings (key, value) VALUES ($1, $2)")
        .bind("allow_public_registration")
        .bind(if body.allow_public_registration {
            "true"
        } else {
            "false"
        })
        .execute(&mut *tx)
        .await?;

    sqlx::query("INSERT INTO app_settings (key, value) VALUES ($1, $2)")
        .bind("require_account_activation")
        .bind("false")
        .execute(&mut *tx)
        .await?;

    sqlx::query("INSERT INTO app_settings (key, value) VALUES ($1, $2)")
        .bind("database_url")
        .bind(target_url)
        .execute(&mut *tx)
        .await?;

    if let Some(dir) = &body.music_dir {
        sqlx::query("INSERT INTO app_settings (key, value) VALUES ($1, $2)")
            .bind("music_dir")
            .bind(dir)
            .execute(&mut *tx)
            .await?;
    }

    tx.commit().await?;

    let restart_required = !use_startup_pool;
    if restart_required {
        env_persist::try_persist_database_url(target_url);
    }

    let token = create_token(user_id.clone(), body.email.clone(), "admin".into(), &state.jwt_secret)
        .map_err(|e| AppError::Internal(e.into()))?;

    let permissions = get_user_permission_keys(&setup_pool, &user_id).await;

    Ok(Json(SetupResponse {
        auth: AuthResponse {
            token: Some(token),
            pending_activation: false,
            user: UserDto {
                id: user_id,
                email: body.email,
                role: "admin".into(),
                enabled: true,
                permissions,
            },
        },
        restart_required,
        configured_database_url: if restart_required {
            Some(target_url.to_string())
        } else {
            None
        },
    }))
}

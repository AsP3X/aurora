// Human: Expose build metadata and one-time tenant setup that mirrors register/login responses so the SPA can store a JWT immediately.
// Agent: READS users COUNT for gating; WRITES users + app_settings + admin group_memberships in TX; RETURNS AuthResponse on success only once.
use axum::{extract::State, Json};
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use uuid::Uuid;

use crate::{
    auth::handlers::{create_token, hash_password, AuthResponse, UserDto},
    error::AppError,
    permissions::get_user_permission_keys,
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

#[derive(Debug, Deserialize)]
pub struct SetupRequest {
    pub email: String,
    pub password: String,
    pub instance_name: String,
    pub allow_public_registration: bool,
    pub music_dir: Option<String>,
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

// Human: Atomic first admin creation with default settings—rejects weak passwords or repeat calls once the users table is non-empty.
// Agent: WRITES users as role admin; INSERTS group admin UUID; SEEDS app_settings keys; RETURNS JWT via create_token; HTTP 409 if already initialized.
pub async fn setup(
    State(state): State<Arc<AppState>>,
    Json(body): Json<SetupRequest>,
) -> Result<Json<AuthResponse>, AppError> {
    // Check if setup is already done
    let count: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM users")
        .fetch_one(&state.pool)
        .await?;

    if count > 0 {
        return Err(AppError::Conflict("setup already completed".into()));
    }

    // Validate password length
    if body.password.len() < 8 {
        return Err(AppError::BadRequest(
            "password must be at least 8 characters".into(),
        ));
    }

    let password_hash =
        hash_password(&body.password).map_err(|e| AppError::Internal(anyhow::anyhow!(e)))?;
    let user_id = Uuid::new_v4().to_string();

    let mut tx = state.pool.begin().await?;

    // Create admin user
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

    // Add to Admin group
    let membership_id = Uuid::new_v4().to_string();
    sqlx::query(
        "INSERT INTO group_memberships (id, user_id, group_id) VALUES ($1, $2, '00000000-0000-0000-0000-000000000002')",
    )
    .bind(&membership_id)
    .bind(&user_id)
    .execute(&mut *tx)
    .await?;

    // Store settings
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

    if let Some(dir) = &body.music_dir {
        sqlx::query("INSERT INTO app_settings (key, value) VALUES ($1, $2)")
            .bind("music_dir")
            .bind(dir)
            .execute(&mut *tx)
            .await?;
    }

    tx.commit().await?;

    let token = create_token(user_id.clone(), body.email.clone(), "admin".into(), &state.jwt_secret)
        .map_err(|e| AppError::Internal(e.into()))?;

    let permissions = get_user_permission_keys(&state.pool, &user_id).await;

    Ok(Json(AuthResponse {
        token: Some(token),
        pending_activation: false,
        user: UserDto {
            id: user_id,
            email: body.email,
            role: "admin".into(),
            enabled: true,
            permissions,
        },
    }))
}

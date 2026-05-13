use argon2::{
    password_hash::{rand_core::OsRng, PasswordHash, PasswordHasher, PasswordVerifier, SaltString},
    Argon2,
};
use axum::{extract::State, Json};
use chrono::Utc;
use jsonwebtoken::{decode, encode, DecodingKey, EncodingKey, Header, Validation};
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use tracing::{info, warn};
use uuid::Uuid;

use crate::{error::AppError, permissions::get_user_permission_keys, AppState};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Claims {
    pub sub: String,
    pub email: String,
    pub role: String,
    pub exp: i64,
    pub iat: i64,
}

#[derive(Debug, Deserialize)]
pub struct RegisterRequest {
    pub email: String,
    pub password: String,
}

#[derive(Debug, Serialize)]
pub struct AuthResponse {
    pub token: String,
    pub user: UserDto,
}

#[derive(Debug, Serialize)]
pub struct UserDto {
    pub id: String,
    pub email: String,
    pub role: String,
    pub enabled: bool,
    pub permissions: Vec<String>,
}

pub fn hash_password(password: &str) -> Result<String, argon2::password_hash::Error> {
    let salt = SaltString::generate(&mut OsRng);
    let argon2 = Argon2::default();
    let password_hash = argon2
        .hash_password(password.as_bytes(), &salt)?
        .to_string();
    Ok(password_hash)
}

fn verify_password(password: &str, hash: &str) -> Result<bool, argon2::password_hash::Error> {
    let parsed_hash = PasswordHash::new(hash)?;
    let argon2 = Argon2::default();
    Ok(argon2
        .verify_password(password.as_bytes(), &parsed_hash)
        .is_ok())
}

pub fn create_token(user_id: String, email: String, role: String, secret: &str) -> anyhow::Result<String> {
    let now = Utc::now();
    let claims = Claims {
        sub: user_id,
        email,
        role,
        iat: now.timestamp(),
        exp: (now + chrono::Duration::try_hours(24).unwrap()).timestamp(),
    };

    let token = encode(
        &Header::default(),
        &claims,
        &EncodingKey::from_secret(secret.as_bytes()),
    )?;

    Ok(token)
}

pub fn decode_token(token: &str, secret: &str) -> anyhow::Result<Claims> {
    let validation = Validation::default();
    let token_data = decode::<Claims>(
        token,
        &DecodingKey::from_secret(secret.as_bytes()),
        &validation,
    )?;
    Ok(token_data.claims)
}

pub async fn register(
    State(state): State<Arc<AppState>>,
    Json(body): Json<RegisterRequest>,
) -> Result<Json<AuthResponse>, AppError> {
    info!(email = %body.email, "register attempt");

    let allow_public: Option<(String,)> = sqlx::query_as(
        "SELECT value FROM app_settings WHERE key = 'allow_public_registration'"
    )
    .fetch_optional(&state.pool)
    .await?;

    if let Some((value,)) = allow_public {
        if value == "false" {
            return Err(AppError::Forbidden("public registration is disabled".into()));
        }
    }

    let require_activation: Option<(String,)> = sqlx::query_as(
        "SELECT value FROM app_settings WHERE key = 'require_account_activation'"
    )
    .fetch_optional(&state.pool)
    .await?;

    let enabled = !require_activation.map(|(v,)| v == "true").unwrap_or(false);

    let password_hash = hash_password(&body.password).map_err(|e| AppError::Internal(anyhow::anyhow!(e)))?;
    let user_id = Uuid::new_v4().to_string();

    let mut tx = state.pool.begin().await?;

    let result = sqlx::query_as::<_, (String,)>(
        "INSERT INTO users (id, email, password_hash, role, enabled) VALUES ($1, $2, $3, 'listener', $4) RETURNING id",
    )
    .bind(&user_id)
    .bind(&body.email)
    .bind(&password_hash)
    .bind(enabled)
    .fetch_one(&mut *tx)
    .await;

    match result {
        Ok((id,)) => {
            let membership_id = Uuid::new_v4().to_string();
            sqlx::query(
                "INSERT INTO group_memberships (id, user_id, group_id) VALUES ($1, $2, '00000000-0000-0000-0000-000000000001')"
            )
            .bind(&membership_id)
            .bind(&user_id)
            .execute(&mut *tx)
            .await
            .map_err(|e| match e {
                sqlx::Error::Database(db_err) if db_err.is_unique_violation() => {
                    AppError::Conflict("user already in default group".into())
                }
                _ => AppError::Database(e),
            })?;

            tx.commit().await?;

            info!(user_id = %id, email = %body.email, "user registered");

            let token = create_token(id, body.email.clone(), "listener".into(), &state.jwt_secret)
                .map_err(|e| AppError::Internal(e.into()))?;

            let permissions = get_user_permission_keys(&state.pool, &user_id).await;

            Ok(Json(AuthResponse {
                token,
                user: UserDto {
                    id: user_id,
                    email: body.email,
                    role: "listener".into(),
                    enabled,
                    permissions,
                },
            }))
        }
        Err(sqlx::Error::Database(db_err)) if db_err.is_unique_violation() => {
            warn!(email = %body.email, "registration failed: email already exists");
            Err(AppError::Conflict("email already exists".into()))
        }
        Err(e) => {
            warn!(email = %body.email, error = %e, "registration failed");
            Err(AppError::Database(e))
        }
    }
}

pub async fn login(
    State(state): State<Arc<AppState>>,
    Json(body): Json<RegisterRequest>,
) -> Result<Json<AuthResponse>, AppError> {
    info!(email = %body.email, "login attempt");

    let row = sqlx::query_as::<_, (String, String, String, String, bool)>(
        "SELECT id, email, password_hash, role, enabled FROM users WHERE email = $1"
    )
    .bind(&body.email)
    .fetch_optional(&state.pool)
    .await?;

    let (id, email, hash, role, enabled) = row.ok_or(AppError::Unauthorized)?;
    let valid = verify_password(&body.password, &hash)
        .map_err(|_| AppError::Unauthorized)?;

    if !valid {
        warn!(email = %body.email, "login failed: invalid password");
        return Err(AppError::Unauthorized);
    }

    if !enabled {
        warn!(email = %body.email, "login failed: account disabled");
        return Err(AppError::Forbidden("account is disabled".into()));
    }

    info!(user_id = %id, email = %email, role = %role, "login success");

    let token = create_token(id.clone(), email.clone(), role.clone(), &state.jwt_secret)
        .map_err(|e| AppError::Internal(e.into()))?;

    let permissions = get_user_permission_keys(&state.pool, &id).await;

    Ok(Json(AuthResponse {
        token,
        user: UserDto {
            id,
            email,
            role,
            enabled,
            permissions,
        },
    }))
}

pub async fn me(
    State(state): State<Arc<AppState>>,
    claims: axum::Extension<Claims>,
) -> Result<Json<UserDto>, AppError> {
    let row = sqlx::query_as::<_, (String, String, String, bool)>(
        "SELECT id, email, role, enabled FROM users WHERE id = $1"
    )
    .bind(&claims.sub)
    .fetch_optional(&state.pool)
    .await?;

    let (id, email, role, enabled) = row.ok_or(AppError::NotFound)?;

    let permissions = get_user_permission_keys(&state.pool, &id).await;

    info!(user_id = %id, email = %email, "me request");

    Ok(Json(UserDto {
        id,
        email,
        role,
        enabled,
        permissions,
    }))
}

pub async fn oauth_placeholder(
    axum::extract::Path(provider): axum::extract::Path<String>,
) -> Result<Json<serde_json::Value>, AppError> {
    Ok(Json(serde_json::json!({
        "message": "OAuth not yet implemented. Use local auth for now.",
        "provider": provider
    })))
}

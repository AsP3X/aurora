use argon2::{
    password_hash::{rand_core::OsRng, PasswordHash, PasswordHasher, PasswordVerifier, SaltString},
    Argon2,
};
use axum::{extract::State, Json};
use chrono::{Duration, Utc};
use jsonwebtoken::{decode, encode, DecodingKey, EncodingKey, Header, Validation};
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use uuid::Uuid;

use crate::{error::AppError, AppState};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Claims {
    pub sub: Uuid,
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
    pub id: Uuid,
    pub email: String,
    pub role: String,
}

fn hash_password(password: &str) -> Result<String, argon2::password_hash::Error> {
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

fn create_token(user_id: Uuid, email: String, role: String, secret: &str) -> anyhow::Result<String> {
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
    let password_hash = hash_password(&body.password).map_err(|e| AppError::Internal(anyhow::anyhow!(e)))?;
    let user_id = Uuid::new_v4();

    let result = sqlx::query_as::<_, (Uuid,)>(
        "INSERT INTO users (id, email, password_hash, role) VALUES ($1, $2, $3, 'listener') RETURNING id",
    )
    .bind(user_id)
    .bind(&body.email)
    .bind(&password_hash)
    .fetch_one(&state.pool)
    .await;

    match result {
        Ok((id,)) => {
            let token = create_token(id, body.email.clone(), "listener".into(), &state.jwt_secret)
                .map_err(|e| AppError::Internal(e.into()))?;

            Ok(Json(AuthResponse {
                token,
                user: UserDto {
                    id,
                    email: body.email,
                    role: "listener".into(),
                },
            }))
        }
        Err(sqlx::Error::Database(db_err)) if db_err.is_unique_violation() => {
            Err(AppError::Conflict("email already exists".into()))
        }
        Err(e) => Err(AppError::Database(e)),
    }
}

pub async fn login(
    State(state): State<Arc<AppState>>,
    Json(body): Json<RegisterRequest>,
) -> Result<Json<AuthResponse>, AppError> {
    let row = sqlx::query_as::<_, (Uuid, String, String, String)>(
        "SELECT id, email, password_hash, role FROM users WHERE email = $1"
    )
    .bind(&body.email)
    .fetch_optional(&state.pool)
    .await?;

    let (id, email, hash, role) = row.ok_or(AppError::Unauthorized)?;
    let valid = verify_password(&body.password, &hash)
        .map_err(|_| AppError::Unauthorized)?;

    if !valid {
        return Err(AppError::Unauthorized);
    }

    let token = create_token(id, email.clone(), role.clone(), &state.jwt_secret)
        .map_err(|e| AppError::Internal(e.into()))?;

    Ok(Json(AuthResponse {
        token,
        user: UserDto {
            id,
            email,
            role,
        },
    }))
}

pub async fn me(
    State(state): State<Arc<AppState>>,
    claims: axum::Extension<Claims>,
) -> Result<Json<UserDto>, AppError> {
    let row = sqlx::query_as::<_, (Uuid, String, String)>(
        "SELECT id, email, role FROM users WHERE id = $1"
    )
    .bind(claims.sub)
    .fetch_optional(&state.pool)
    .await?;

    let (id, email, role) = row.ok_or(AppError::NotFound)?;

    Ok(Json(UserDto {
        id,
        email,
        role,
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

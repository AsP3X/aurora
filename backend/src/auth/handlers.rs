// Human: Registration, login, JWT issue/verify, and the /auth/me profile payload.
// Agent: WRITES users table; EMITS JWT Claims; RETURNS AuthResponse JSON; LOGS redacted emails only.
use argon2::{
    password_hash::{rand_core::OsRng, PasswordHash, PasswordHasher, PasswordVerifier, SaltString},
    Argon2,
};
use axum::{extract::State, http::HeaderMap, Json};
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
    /// Omitted when registration requires admin approval before first sign-in.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub token: Option<String>,
    pub user: UserDto,
    /// True when the account was created but is not yet enabled for login.
    #[serde(skip_serializing_if = "std::ops::Not::not")]
    pub pending_activation: bool,
}

#[derive(Debug, Serialize)]
pub struct UserDto {
    pub id: String,
    pub email: String,
    pub role: String,
    pub enabled: bool,
    pub permissions: Vec<String>,
}

// Human: Hash passwords with Argon2id defaults and a random salt so stored verifier strings are safe offline.
// Agent: USES Argon2 + SaltString::generate; RETURNS PHC string; WRITES nothing; ERRORS propagate as password_hash::Error.
pub fn hash_password(password: &str) -> Result<String, argon2::password_hash::Error> {
    let salt = SaltString::generate(&mut OsRng);
    let argon2 = Argon2::default();
    let password_hash = argon2
        .hash_password(password.as_bytes(), &salt)?
        .to_string();
    Ok(password_hash)
}

// Human: Check a candidate password against a PHC hash without logging either value.
// Agent: READS password bytes + stored hash string; RETURNS bool; USES Argon2::verify_password; NO DB.
fn verify_password(password: &str, hash: &str) -> Result<bool, argon2::password_hash::Error> {
    let parsed_hash = PasswordHash::new(hash)?;
    let argon2 = Argon2::default();
    Ok(argon2
        .verify_password(password.as_bytes(), &parsed_hash)
        .is_ok())
}

// Human: Mint a short-lived HS256 JWT embedding subject id, email snapshot, role, and standard iat/exp claims.
// Agent: WRITES JWT with EncodingKey from jwt_secret; RETURNS compact token string; TTL fixed ~24h via chrono.
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

// Human: Validate signature and decode claims using the same HS256 secret the issuer used—callers still must check DB state afterward.
// Agent: READS token + secret; USES jsonwebtoken decode Default Validation; RETURNS Claims; ERRORS bubble as anyhow.
pub fn decode_token(token: &str, secret: &str) -> anyhow::Result<Claims> {
    let validation = Validation::default();
    let token_data = decode::<Claims>(
        token,
        &DecodingKey::from_secret(secret.as_bytes()),
        &validation,
    )?;
    Ok(token_data.claims)
}

// Human: Create a listener account when policy allows, add default group membership, and return a ready-to-use JWT like login does.
// Agent: READS app_settings flags; WRITES users + group_memberships in TX; RETURNS 409 on duplicate email; LOGS redacted email only.
pub async fn register(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Json(body): Json<RegisterRequest>,
) -> Result<Json<AuthResponse>, AppError> {
    let ip = crate::rate_limit::client_ip_from_headers(&headers);
    crate::rate_limit::enforce(&state.auth_register_rl, &ip)?;

    info!(email_redacted = %crate::redact::email_for_log(&body.email), "register attempt");

    let email = normalize_registration_email(&body.email)?;
    validate_registration_password(&body.password)?;

    let allow_public: Option<(String,)> = sqlx::query_as(
        "SELECT value FROM app_settings WHERE key = 'allow_public_registration'"
    )
    .fetch_optional(&state.pool)
    .await?;

    if let Some((value,)) = allow_public {
        if crate::app_settings::value_is_false(&value) {
            return Err(AppError::Forbidden("public registration is disabled".into()));
        }
    }

    let require_activation: Option<(String,)> = sqlx::query_as(
        "SELECT value FROM app_settings WHERE key = 'require_account_activation'"
    )
    .fetch_optional(&state.pool)
    .await?;

    // Human: New accounts start disabled when activation is required — parse loosely so admin UI typos still work.
    // Agent: READS require_account_activation row; value_is_true → enabled false; DEFAULT enabled true when unset.
    let activation_required = require_activation
        .as_ref()
        .map(|(v,)| crate::app_settings::value_is_true(v))
        .unwrap_or(false);
    let enabled = !activation_required;

    let password_hash = hash_password(&body.password).map_err(|e| AppError::Internal(anyhow::anyhow!(e)))?;
    let user_id = Uuid::new_v4().to_string();

    let mut tx = state.pool.begin().await?;

    // Human: Bind `enabled` as bool — sqlx maps it to BOOLEAN (Postgres) or INTEGER 0/1 (SQLite).
    // Agent: WRITES users.enabled; BINDS bool; REQUIRES Any pool driver-specific encoding.
    let result = sqlx::query_as::<_, (String,)>(
        "INSERT INTO users (id, email, password_hash, role, enabled) VALUES ($1, $2, $3, 'listener', $4) RETURNING id",
    )
    .bind(&user_id)
    .bind(&email)
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

            info!(
                user_id = %id,
                email_redacted = %crate::redact::email_for_log(&body.email),
                enabled,
                "user registered"
            );

            let permissions = get_user_permission_keys(&state.pool, &user_id).await;

            // Human: Pending accounts must not receive a JWT — login and middleware already reject disabled users.
            // Agent: WHEN enabled THEN create_token Some; ELSE token None + pending_activation true.
            let token = if enabled {
                Some(
                    create_token(id, email.clone(), "listener".into(), &state.jwt_secret)
                        .map_err(|e| AppError::Internal(e.into()))?,
                )
            } else {
                None
            };

            Ok(Json(AuthResponse {
                token,
                pending_activation: !enabled,
                user: UserDto {
                    id: user_id,
                    email,
                    role: "listener".into(),
                    enabled,
                    permissions,
                },
            }))
        }
        Err(sqlx::Error::Database(db_err)) if db_err.is_unique_violation() => {
            warn!(email_redacted = %crate::redact::email_for_log(&body.email), "registration failed: email already exists");
            Err(AppError::Conflict("email already exists".into()))
        }
        Err(e) => {
            warn!(email_redacted = %crate::redact::email_for_log(&body.email), error = %e, "registration failed");
            Err(AppError::Database(e))
        }
    }
}

// Human: Authenticate against the stored Argon hash and issue a JWT only when the account is enabled.
// Agent: READS users by email; VERIFY password; RETURNS 401 bad creds; RETURNS 403 if disabled; EMITS token + permissions snapshot.
pub async fn login(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Json(body): Json<RegisterRequest>,
) -> Result<Json<AuthResponse>, AppError> {
    let ip = crate::rate_limit::client_ip_from_headers(&headers);
    crate::rate_limit::enforce(&state.auth_login_rl, &ip)?;

    info!(email_redacted = %crate::redact::email_for_log(&body.email), "login attempt");

    // Human: Cast enabled for SQLite INTEGER columns — same pattern as auth middleware.
    // Agent: READS users; CAST enabled AS INTEGER; MAPS 0 → disabled before password check completes.
    let row = sqlx::query_as::<_, (String, String, String, String, i64)>(
        "SELECT id, email, password_hash, role, CAST(enabled AS INTEGER) AS enabled FROM users WHERE email = $1",
    )
    .bind(&body.email)
    .fetch_optional(&state.pool)
    .await?;

    let (id, email, hash, role, enabled_raw) = row.ok_or(AppError::Unauthorized)?;
    let enabled = enabled_raw != 0;
    let valid = verify_password(&body.password, &hash)
        .map_err(|_| AppError::Unauthorized)?;

    if !valid {
        warn!(email_redacted = %crate::redact::email_for_log(&body.email), "login failed: invalid password");
        return Err(AppError::Unauthorized);
    }

    if !enabled {
        warn!(email_redacted = %crate::redact::email_for_log(&body.email), "login failed: account disabled");
        return Err(AppError::Forbidden(
            "account is not activated. Contact an administrator.".into(),
        ));
    }

    info!(user_id = %id, email_redacted = %crate::redact::email_for_log(&email), role = %role, "login success");

    let token = create_token(id.clone(), email.clone(), role.clone(), &state.jwt_secret)
        .map_err(|e| AppError::Internal(e.into()))?;

    let permissions = get_user_permission_keys(&state.pool, &id).await;

    Ok(Json(AuthResponse {
        token: Some(token),
        pending_activation: false,
        user: UserDto {
            id,
            email,
            role,
            enabled,
            permissions,
        },
    }))
}

// Human: Refresh the caller profile from the database so enabled flag, role label, and permission keys stay current versus JWT snapshot.
// Agent: READS users by claims.sub; JOINS permission helpers; HTTP 404 if user row missing; LOGS redacted email.
pub async fn me(
    State(state): State<Arc<AppState>>,
    claims: axum::Extension<Claims>,
) -> Result<Json<UserDto>, AppError> {
    let row = sqlx::query_as::<_, (String, String, String, i64)>(
        "SELECT id, email, role, CAST(enabled AS INTEGER) AS enabled FROM users WHERE id = $1",
    )
    .bind(&claims.sub)
    .fetch_optional(&state.pool)
    .await?;

    let (id, email, role, enabled_raw) = row.ok_or(AppError::NotFound)?;
    let enabled = enabled_raw != 0;

    let permissions = get_user_permission_keys(&state.pool, &id).await;

    info!(user_id = %id, email_redacted = %crate::redact::email_for_log(&email), "me request");

    Ok(Json(UserDto {
        id,
        email,
        role,
        enabled,
        permissions,
    }))
}

// Human: OAuth is not implemented yet — return 501 so clients do not treat this as a working login path.
// Agent: HTTP 501 NotImplemented; READS path provider; NO DB.
pub async fn oauth_placeholder(
    axum::extract::Path(provider): axum::extract::Path<String>,
) -> Result<Json<serde_json::Value>, AppError> {
    Err(AppError::NotImplemented(format!(
        "OAuth provider '{provider}' is not implemented. Use email/password login."
    )))
}

// Human: Normalize and sanity-check registration emails (trim, lowercase, basic shape).
// Agent: PURE; RETURNS trimmed lowercase email; ERRORS BadRequest when empty/invalid.
fn normalize_registration_email(email: &str) -> Result<String, AppError> {
    let email = email.trim().to_lowercase();
    if email.is_empty() || email.len() > 254 {
        return Err(AppError::BadRequest("invalid email".into()));
    }
    let parts: Vec<&str> = email.split('@').collect();
    if parts.len() != 2 || parts[0].is_empty() || parts[1].is_empty() || !parts[1].contains('.') {
        return Err(AppError::BadRequest("invalid email".into()));
    }
    Ok(email)
}

// Human: Match setup wizard policy — passwords must be at least eight characters.
// Agent: PURE; ERRORS BadRequest when len < 8.
fn validate_registration_password(password: &str) -> Result<(), AppError> {
    if password.len() < 8 {
        return Err(AppError::BadRequest(
            "password must be at least 8 characters".into(),
        ));
    }
    Ok(())
}

// Human: Re-export JWT helpers and implement the Axum layer that turns a `Bearer` token into `Claims` after JWT decode plus live account checks.
// Agent: READS Authorization header; CALLS decode_token; READS users.enabled FROM DB; INSERTS Claims into request extensions; HTTP 401/403 paths.
use axum::{
    extract::{Request, State},
    http::header,
    middleware::Next,
    response::Response,
};
use std::sync::Arc;

pub use handlers::{decode_token, Claims};

use crate::{error::AppError, AppState};

pub mod handlers;

// Human: Parse Bearer JWT, verify expiry, confirm the user row still exists and is enabled, then attach claims for downstream handlers.
// Agent: READS JWT + sqlite/postgres users; REQUIRES enabled=1; MUTATES Request extensions with Claims; CALLS next.run on success.
pub async fn auth_middleware(
    State(state): State<Arc<AppState>>,
    mut request: Request,
    next: Next,
) -> Result<Response, AppError> {
    let auth_header = request
        .headers()
        .get(header::AUTHORIZATION)
        .and_then(|value| value.to_str().ok())
        .and_then(|value| value.strip_prefix("Bearer "));

    let token = auth_header.ok_or(AppError::Unauthorized)?;

    let claims = decode_token(token, &state.jwt_secret).map_err(|_| {
        // Human: Decode failures are expected for bad clients; log only a redacted token prefix at debug.
        // Agent: EMITS debug with bearer_token_for_log; RETURNS Unauthorized; NO JWT body in logs.
        tracing::debug!(
            token_redacted = %crate::redact::bearer_token_for_log(token),
            "JWT decode failed in auth middleware"
        );
        AppError::Unauthorized
    })?;

    if chrono::Utc::now().timestamp() > claims.exp {
        return Err(AppError::Unauthorized);
    }

    let enabled: Option<(i64,)> = sqlx::query_as(
        "SELECT CAST(enabled AS INTEGER) AS enabled FROM users WHERE id = $1",
    )
    .bind(&claims.sub)
    .fetch_optional(&state.pool)
    .await
    .map_err(|_| AppError::Unauthorized)?;

    let (user_enabled,) = enabled.ok_or(AppError::Unauthorized)?;
    if user_enabled == 0 {
        return Err(AppError::Forbidden("account is disabled".into()));
    }

    request.extensions_mut().insert(claims);
    Ok(next.run(request).await)
}

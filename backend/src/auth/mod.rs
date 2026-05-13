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

    let claims = decode_token(token, &state.jwt_secret).map_err(|_| AppError::Unauthorized)?;

    if chrono::Utc::now().timestamp() > claims.exp {
        return Err(AppError::Unauthorized);
    }

    let enabled: Option<(bool,)> = sqlx::query_as("SELECT enabled FROM users WHERE id = $1")
        .bind(&claims.sub)
        .fetch_optional(&state.pool)
        .await
        .map_err(|_| AppError::Unauthorized)?;

    let (user_enabled,) = enabled.ok_or(AppError::Unauthorized)?;
    if !user_enabled {
        return Err(AppError::Forbidden("account is disabled".into()));
    }

    request.extensions_mut().insert(claims);
    Ok(next.run(request).await)
}

use axum::{
    extract::Request,
    http::{header, StatusCode},
    middleware::Next,
    response::Response,
};

pub use handlers::{decode_token, Claims, oauth_placeholder};

use crate::error::AppError;

pub mod handlers;

pub async fn auth_middleware(
    mut request: Request,
    next: Next,
) -> Result<Response, AppError> {
    let auth_header = request
        .headers()
        .get(header::AUTHORIZATION)
        .and_then(|value| value.to_str().ok())
        .and_then(|value| value.strip_prefix("Bearer "));

    let token = auth_header.ok_or(AppError::Unauthorized)?;

    let secret = std::env::var("JWT_SECRET").unwrap_or_else(|_| "change-me".into());

    let claims = decode_token(token, &secret).map_err(|_| AppError::Unauthorized)?;

    if chrono::Utc::now().timestamp() > claims.exp {
        return Err(AppError::Unauthorized);
    }

    request.extensions_mut().insert(claims);
    Ok(next.run(request).await)
}

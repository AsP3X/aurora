use axum::{
    extract::Request,
    http::StatusCode,
    middleware::Next,
    response::{IntoResponse, Response},
    Json,
};
use axum::http::header;
use jsonwebtoken::{decode, Algorithm, DecodingKey, Validation};
use serde::{Deserialize, Serialize};
use serde_json::json;
use std::sync::Arc;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Claims {
    pub sub: String,
    pub email: String,
    pub role: String,
    pub exp: i64,
    pub iat: i64,
}

pub struct JwtSecret(pub String);

pub async fn auth_middleware(
    secret: Arc<JwtSecret>,
    mut req: Request,
    next: Next,
) -> Response {
    let auth_header = req
        .headers()
        .get("authorization")
        .and_then(|h| h.to_str().ok());

    let token = match auth_header {
        Some(header) if header.starts_with("Bearer ") => &header[7..],
        _ => {
            return unauthorized();
        }
    };

    let mut validation = Validation::new(Algorithm::HS256);
    validation.validate_exp = true;
    validation.validate_nbf = false;

    match decode::<Claims>(token, &DecodingKey::from_secret(secret.0.as_bytes()), &validation) {
        Ok(token_data) => {
            req.extensions_mut().insert(token_data.claims);
            next.run(req).await
        }
        Err(_) => unauthorized(),
    }
}

fn unauthorized() -> Response {
    let body = Json(json!({"error": "unauthorized"}));
    let mut resp = (StatusCode::UNAUTHORIZED, body).into_response();
    resp.headers_mut().insert(
        header::WWW_AUTHENTICATE,
        "Bearer".parse().unwrap(),
    );
    resp
}

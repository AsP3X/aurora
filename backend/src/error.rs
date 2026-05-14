use axum::{
    extract::rejection::QueryRejection,
    http::StatusCode,
    response::{IntoResponse, Response},
    Json,
};
use serde_json::json;
use thiserror::Error;
use tracing::error;

pub fn query_rejection_response(rejection: QueryRejection, expose_details: bool) -> Response {
    let message = if expose_details {
        rejection.to_string()
    } else {
        "invalid query parameters".to_string()
    };
    let status = StatusCode::BAD_REQUEST;
    (status, Json(json!({ "error": message, "status": status.as_u16() }))).into_response()
}

#[derive(Error, Debug)]
pub enum AppError {
    #[error("database error: {0}")]
    Database(#[from] sqlx::Error),

    #[error("not found")]
    NotFound,

    #[error("unauthorized")]
    Unauthorized,

    #[error("forbidden: {0}")]
    Forbidden(String),

    #[error("bad request: {0}")]
    BadRequest(String),

    #[error("rate limit exceeded")]
    RateLimited,

    #[error("conflict: {0}")]
    Conflict(String),

    #[error("internal error: {0}")]
    Internal(#[from] anyhow::Error),

    #[error("storage error: {0}")]
    Storage(String),
}

impl IntoResponse for AppError {
    fn into_response(self) -> Response {
        let (status, message) = match &self {
            AppError::Database(e) => {
                error!("Database error: {}", e);
                (StatusCode::INTERNAL_SERVER_ERROR, "internal database error")
            }
            AppError::NotFound => (StatusCode::NOT_FOUND, "not found"),
            AppError::Unauthorized => (StatusCode::UNAUTHORIZED, "unauthorized"),
            AppError::Forbidden(msg) => (StatusCode::FORBIDDEN, msg.as_str()),
            AppError::BadRequest(msg) => (StatusCode::BAD_REQUEST, msg.as_str()),
            AppError::RateLimited => (StatusCode::TOO_MANY_REQUESTS, "rate limit exceeded; try again shortly"),
            AppError::Conflict(msg) => (StatusCode::CONFLICT, msg.as_str()),
            AppError::Internal(e) => {
                error!("Internal error: {}", e);
                (StatusCode::INTERNAL_SERVER_ERROR, "internal server error")
            }
            AppError::Storage(msg) => {
                error!("Storage error: {}", msg);
                (StatusCode::INTERNAL_SERVER_ERROR, "storage error")
            }
        };

        let body = Json(json!({
            "error": message,
            "status": status.as_u16(),
        }));

        (status, body).into_response()
    }
}

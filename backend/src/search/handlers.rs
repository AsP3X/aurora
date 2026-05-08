use axum::{extract::Query, Json};
use serde::Deserialize;

use crate::error::AppError;

#[derive(Debug, Deserialize)]
pub struct SearchQuery {
    pub q: String,
}

pub async fn search(
    claims: axum::Extension<crate::auth::Claims>,
) -> Result<Json<serde_json::Value>, AppError> {
    Ok(Json(serde_json::json!({
        "message": "Search not yet implemented. Use /songs with filters for now.",
        "user_id": claims.sub
    })))
}

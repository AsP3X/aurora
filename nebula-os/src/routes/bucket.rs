use axum::{
    extract::{Path, Query, State},
    http::StatusCode,
    response::IntoResponse,
    Json,
};
use serde::Deserialize;
use serde_json::json;
use std::sync::Arc;

use crate::routes::AppState;

#[derive(Debug, Deserialize)]
pub struct ListQuery {
    prefix: Option<String>,
    delimiter: Option<String>,
    limit: Option<u64>,
    start_after: Option<String>,
}

pub async fn list_objects(
    State(state): State<Arc<AppState>>,
    Path(bucket): Path<String>,
    Query(query): Query<ListQuery>,
) -> impl IntoResponse {
    match state
        .storage
        .list_objects(
            &bucket,
            query.prefix.as_deref(),
            query.delimiter.as_deref(),
            query.limit,
            query.start_after.as_deref(),
        )
        .await
    {
        Ok(result) => Json(result).into_response(),
        Err(e) => {
            tracing::error!("list_objects error: {}", e);
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({"error": e.to_string()})),
            )
                .into_response()
        }
    }
}

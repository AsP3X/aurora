use axum::{extract::State, Json};
use serde::Serialize;
use std::sync::Arc;

use crate::routes::AppState;

#[derive(Serialize)]
pub struct MetricsResponse {
    pub total_objects: i64,
    pub total_bytes: i64,
}

pub async fn metrics(State(state): State<Arc<AppState>>) -> Json<MetricsResponse> {
    let total_objects = state.storage.object_count().await.unwrap_or(0);
    let total_bytes = state.storage.total_bytes().await.unwrap_or(0);

    Json(MetricsResponse {
        total_objects,
        total_bytes,
    })
}

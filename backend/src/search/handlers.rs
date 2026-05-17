use std::sync::Arc;

use axum::{
    extract::{Query, State},
    Json,
};
use serde::Deserialize;

use crate::{
    error::AppError,
    permissions::require_admin_access,
    AppState,
};

// Human: Query string for GET /search; requires non-empty `q` when Meilisearch is active.
// Agent: DESERIALIZES q from query; VALIDATED by Axum before handler body runs.
#[derive(Debug, Deserialize)]
pub struct SearchQuery {
    pub q: String,
}

// Human: Full-text search via Meilisearch when configured; otherwise steer clients to SQL list filters.
// Agent: READS search_indexer; RETURNS hits + processingTimeMs; FALLBACK JSON when Meili absent.
pub async fn search(
    State(state): State<Arc<AppState>>,
    claims: axum::Extension<crate::auth::Claims>,
    Query(params): Query<SearchQuery>,
) -> Result<Json<serde_json::Value>, AppError> {
    let q = params.q.trim();
    if q.is_empty() {
        return Err(AppError::BadRequest("search query must not be empty".into()));
    }

    let Some(indexer) = &state.search_indexer else {
        return Ok(Json(serde_json::json!({
            "hits": [],
            "query": q,
            "meili_configured": false,
            "message": "Meilisearch is not configured. Use /api/v1/songs with filters for now.",
            "user_id": claims.sub,
        })));
    };

    let results = indexer.search(q, 50).await?;
    let hits: Vec<serde_json::Value> = results
        .hits
        .into_iter()
        .map(|hit| hit.result)
        .collect();

    Ok(Json(serde_json::json!({
        "hits": hits,
        "query": q,
        "meili_configured": true,
        "processing_time_ms": results.processing_time_ms,
        "estimated_total_hits": results.estimated_total_hits,
    })))
}

// Human: Admin visibility into Meilisearch backlog after DB commits succeeded.
// Agent: GET /admin/search/sync-status; REQUIRES admin; DELEGATES search_sync.admin_status.
pub async fn admin_search_sync_status(
    State(state): State<Arc<AppState>>,
    claims: axum::Extension<crate::auth::Claims>,
) -> Result<Json<serde_json::Value>, AppError> {
    require_admin_access(&state.pool, &claims.sub, &claims.role).await?;
    let status = state.search_sync.admin_status().await?;
    Ok(Json(status))
}

// Human: Force the retry worker to process queued index operations immediately.
// Agent: POST /admin/search/retry-sync; REQUIRES admin; RETURNS updated admin_status payload.
pub async fn admin_search_retry_sync(
    State(state): State<Arc<AppState>>,
    claims: axum::Extension<crate::auth::Claims>,
) -> Result<Json<serde_json::Value>, AppError> {
    require_admin_access(&state.pool, &claims.sub, &claims.role).await?;
    let status = state.search_sync.admin_retry_now().await?;
    Ok(Json(status))
}

use std::sync::Arc;

use axum::{
    extract::{Query, State},
    Json,
};
use serde::Deserialize;

use crate::{error::AppError, AppState};

// Human: Query string for GET /search; reserved until Meilisearch is wired to AppState.
// Agent: DESERIALIZES q from query; VALIDATED by Axum before handler body runs.
#[derive(Debug, Deserialize)]
pub struct SearchQuery {
    pub q: String,
}

pub async fn search(
    State(state): State<Arc<AppState>>,
    claims: axum::Extension<crate::auth::Claims>,
    Query(params): Query<SearchQuery>,
) -> Result<Json<serde_json::Value>, AppError> {
    // Human: Stub until meilisearch-sdk is connected; still accepts q and reports whether Meili env is set.
    // Agent: READS state.meili_url/key presence; RETURNS 200 JSON placeholder; NO external Meili HTTP yet.
    let meili_configured =
        !state.meili_url.is_empty() && !state.meili_master_key.is_empty();

    Ok(Json(serde_json::json!({
        "message": format!(
            "Search not yet implemented for {:?}. Use /songs with filters for now.",
            params.q
        ),
        "user_id": claims.sub,
        "meili_configured": meili_configured,
    })))
}

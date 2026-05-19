// Human: Operational probes for orchestrators — DB connectivity and optional Meilisearch reachability.
// Agent: GET /api/v1/health/ready; READS pool SELECT 1; OPTIONAL meili GET /health; RETURNS JSON status per dependency.

use std::sync::Arc;

use axum::{extract::State, Json};
use serde_json::json;

use crate::AppState;

// Human: Readiness aggregates dependency checks; returns 200 with `ready: false` when a required check fails.
// Agent: PUBLIC route; DB required; Meili only checked when indexer configured; NO auth.
pub async fn readiness(State(state): State<Arc<AppState>>) -> Json<serde_json::Value> {
    let db_ok = sqlx::query("SELECT 1")
        .execute(&state.pool)
        .await
        .is_ok();

    let meili_configured = state.search_indexer.is_some();
    let meili_ok = if meili_configured {
        let health_url = format!("{}/health", state.meili_url.trim_end_matches('/'));
        match reqwest::get(&health_url).await {
            Ok(resp) => resp.status().is_success(),
            Err(_) => false,
        }
    } else {
        true
    };

    let ready = db_ok && meili_ok;

    Json(json!({
        "ready": ready,
        "database": if db_ok { "ok" } else { "error" },
        "meilisearch": if !meili_configured {
            "not_configured"
        } else if meili_ok {
            "ok"
        } else {
            "error"
        },
        "environment": state.environment,
    }))
}

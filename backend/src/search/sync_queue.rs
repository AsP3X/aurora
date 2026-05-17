// Human: Retry queue when Meilisearch sync fails after the database commit already succeeded.
// Agent: TABLE search_index_queue; BACKOFF retries; SPAWNS worker from create_app_state; ADMIN status API.

use std::sync::Arc;
use std::time::Duration;

use chrono::{Duration as ChronoDuration, Utc};
use sqlx::AnyPool;
use uuid::Uuid;

use crate::error::AppError;
use crate::search::indexer::SearchIndexer;

const MAX_ATTEMPTS: i32 = 10;

// Human: Coordinates immediate index attempts and persisted retries.
// Agent: WRAPS Option<SearchIndexer>; METHODS notify_* enqueue on failure; spawn_worker polls DB.
#[derive(Clone)]
pub struct SearchSyncService {
    pool: AnyPool,
    indexer: Option<Arc<SearchIndexer>>,
}

impl SearchSyncService {
    pub fn new(pool: AnyPool, indexer: Option<Arc<SearchIndexer>>) -> Arc<Self> {
        Arc::new(Self { pool, indexer })
    }

    pub fn meili_configured(&self) -> bool {
        self.indexer.is_some()
    }

    // Human: After a song row is written, try Meili immediately; queue if unreachable.
    // Agent: CALLS indexer.upsert_song; ON Err INSERT search_index_queue upsert row.
    pub async fn notify_song_upsert(&self, song_id: &str) {
        let Some(indexer) = &self.indexer else {
            return;
        };
        if let Err(e) = indexer.upsert_song(song_id).await {
            tracing::warn!(song_id = %song_id, error = %e, "Meilisearch upsert failed; enqueueing retry");
            let _ = self
                .enqueue(song_id, "upsert", &e.to_string())
                .await;
        } else {
            let _ = self.dequeue_song(song_id).await;
        }
    }

    // Human: After a song row is deleted, try Meili immediately; queue if unreachable.
    // Agent: CALLS indexer.delete_song; ON Err INSERT search_index_queue delete row.
    pub async fn notify_song_delete(&self, song_id: &str) {
        let Some(indexer) = &self.indexer else {
            return;
        };
        if let Err(e) = indexer.delete_song(song_id).await {
            tracing::warn!(song_id = %song_id, error = %e, "Meilisearch delete failed; enqueueing retry");
            let _ = self
                .enqueue(song_id, "delete", &e.to_string())
                .await;
        } else {
            let _ = self.dequeue_song(song_id).await;
        }
    }

    // Human: Replace any prior queue row for this song so upsert/delete never stack conflicting operations.
    // Agent: DELETE BY song_id then INSERT fresh row; next_retry_at +30s; attempts reset to 0.
    async fn enqueue(&self, song_id: &str, operation: &str, error: &str) -> Result<(), sqlx::Error> {
        sqlx::query("DELETE FROM search_index_queue WHERE song_id = $1")
            .bind(song_id)
            .execute(&self.pool)
            .await?;

        let id = Uuid::new_v4().to_string();
        let next_retry = (Utc::now() + ChronoDuration::seconds(30)).to_rfc3339();
        sqlx::query(
            "INSERT INTO search_index_queue (id, song_id, operation, attempts, last_error, next_retry_at)
             VALUES ($1, $2, $3, 0, $4, $5)",
        )
        .bind(&id)
        .bind(song_id)
        .bind(operation)
        .bind(error)
        .bind(&next_retry)
        .execute(&self.pool)
        .await?;

        Ok(())
    }

    async fn dequeue_song(&self, song_id: &str) -> Result<(), sqlx::Error> {
        sqlx::query("DELETE FROM search_index_queue WHERE song_id = $1")
            .bind(song_id)
            .execute(&self.pool)
            .await?;
        Ok(())
    }

    // Human: Background loop that drains due queue rows with exponential backoff.
    // Agent: tokio::spawn from create_app_state; INTERVAL 30s; READS next_retry_at <= now.
    pub fn spawn_worker(self: Arc<Self>) {
        tokio::spawn(async move {
            let mut interval = tokio::time::interval(Duration::from_secs(30));
            loop {
                interval.tick().await;
                if let Err(e) = self.process_due_batch().await {
                    tracing::warn!(error = %e, "search index retry batch failed");
                }
            }
        });
    }

    async fn process_due_batch(&self) -> Result<(), AppError> {
        let Some(indexer) = &self.indexer else {
            return Ok(());
        };

        let now = Utc::now().to_rfc3339();
        let rows: Vec<(String, String, String, i32)> = sqlx::query_as(
            "SELECT id, song_id, operation, attempts FROM search_index_queue
             WHERE next_retry_at <= $1
             ORDER BY next_retry_at ASC
             LIMIT 20",
        )
        .bind(&now)
        .fetch_all(&self.pool)
        .await?;

        for (queue_id, song_id, operation, attempts) in rows {
            let result = match operation.as_str() {
                "delete" => indexer.delete_song(&song_id).await,
                _ => indexer.upsert_song(&song_id).await,
            };

            match result {
                Ok(()) => {
                    sqlx::query("DELETE FROM search_index_queue WHERE id = $1")
                        .bind(&queue_id)
                        .execute(&self.pool)
                        .await?;
                    tracing::info!(song_id = %song_id, operation = %operation, "search index sync recovered");
                }
                Err(e) => {
                    let next_attempts = attempts + 1;
                    if next_attempts >= MAX_ATTEMPTS {
                        tracing::error!(
                            song_id = %song_id,
                            operation = %operation,
                            attempts = next_attempts,
                            error = %e,
                            "search index sync abandoned after max attempts"
                        );
                        sqlx::query(
                            "UPDATE search_index_queue SET attempts = $1, last_error = $2 WHERE id = $3",
                        )
                        .bind(next_attempts)
                        .bind(e.to_string())
                        .bind(&queue_id)
                        .execute(&self.pool)
                        .await?;
                        continue;
                    }
                    // Human: Exponential backoff caps at one hour so a down Meili does not hot-loop the API.
                    // Agent: delay = 30 * 2^attempts (max 2^6) capped 3600s; WRITES next_retry_at.
                    let delay_secs = (30_i64 * (1_i64 << attempts.min(6))).min(3600);
                    let next_retry =
                        (Utc::now() + ChronoDuration::seconds(delay_secs)).to_rfc3339();
                    sqlx::query(
                        "UPDATE search_index_queue SET attempts = $1, last_error = $2, next_retry_at = $3 WHERE id = $4",
                    )
                    .bind(next_attempts)
                    .bind(e.to_string())
                    .bind(&next_retry)
                    .bind(&queue_id)
                    .execute(&self.pool)
                    .await?;
                }
            }
        }

        Ok(())
    }

    // Human: Admin dashboard payload describing backlog and configuration.
    // Agent: RETURNS JSON counts + sample errors; READS search_index_queue aggregates.
    pub async fn admin_status(&self) -> Result<serde_json::Value, AppError> {
        let pending: (i64,) = sqlx::query_as(
            "SELECT COUNT(*) FROM search_index_queue WHERE attempts < $1",
        )
        .bind(MAX_ATTEMPTS)
        .fetch_one(&self.pool)
        .await?;

        let failed: (i64,) = sqlx::query_as(
            "SELECT COUNT(*) FROM search_index_queue WHERE attempts >= $1",
        )
        .bind(MAX_ATTEMPTS)
        .fetch_one(&self.pool)
        .await?;

        let oldest: Option<(String,)> = sqlx::query_as(
            "SELECT created_at FROM search_index_queue ORDER BY created_at ASC LIMIT 1",
        )
        .fetch_optional(&self.pool)
        .await?;

        let sample_errors: Vec<(String, String, String)> = sqlx::query_as(
            "SELECT song_id, operation, last_error FROM search_index_queue
             WHERE last_error IS NOT NULL
             ORDER BY created_at DESC
             LIMIT 5",
        )
        .fetch_all(&self.pool)
        .await?;

        let samples: Vec<serde_json::Value> = sample_errors
            .into_iter()
            .map(|(song_id, operation, last_error)| {
                serde_json::json!({
                    "song_id": song_id,
                    "operation": operation,
                    "last_error": last_error,
                })
            })
            .collect();

        let warning: Option<&str> = if failed.0 > 0 {
            Some("Some songs could not be synced to Meilisearch. Library DB is authoritative; search results may be stale.")
        } else if pending.0 > 0 {
            Some("Search index sync is retrying in the background.")
        } else {
            None
        };

        Ok(serde_json::json!({
            "meili_configured": self.meili_configured(),
            "pending_count": pending.0,
            "failed_count": failed.0,
            "oldest_pending_at": oldest.map(|o| o.0),
            "sample_errors": samples,
            "warning": warning,
        }))
    }

    // Human: Let admins force an immediate retry pass (still respects per-row attempt caps).
    // Agent: CALLS process_due_batch after setting next_retry_at=now for pending rows.
    pub async fn admin_retry_now(&self) -> Result<serde_json::Value, AppError> {
        let now = Utc::now().to_rfc3339();
        sqlx::query(
            "UPDATE search_index_queue SET next_retry_at = $1 WHERE attempts < $2",
        )
        .bind(&now)
        .bind(MAX_ATTEMPTS)
        .execute(&self.pool)
        .await?;
        self.process_due_batch().await?;
        self.admin_status().await
    }
}

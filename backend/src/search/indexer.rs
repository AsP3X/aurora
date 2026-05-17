// Human: Meilisearch client wrapper for song documents and immediate upsert/delete attempts.
// Agent: READS songs+genres from pool; WRITES Meili index `songs`; NO-OP when URL/key unset.

use std::sync::Arc;

use meilisearch_sdk::client::Client;
use serde::Serialize;
use sqlx::AnyPool;

use crate::error::AppError;

const INDEX_UID: &str = "songs";

// Human: Document shape stored in Meilisearch (id is the primary key).
// Agent: SERIALIZE for add_documents; FIELDS title/artist/album/genres/enabled for ranking/filter.
#[derive(Debug, Serialize)]
pub struct SongSearchDoc {
    pub id: String,
    pub title: String,
    pub artist: String,
    pub album: Option<String>,
    pub genres: Vec<String>,
    pub enabled: bool,
}

// Human: Optional Meilisearch client — absent when env is not configured.
// Agent: WRAPS Client + pool; METHODS upsert_song/delete_song return Result for sync policy.
#[derive(Clone)]
pub struct SearchIndexer {
    client: Client,
    pool: AnyPool,
}

impl SearchIndexer {
    // Human: Build a live indexer when both Meili URL and master key are set.
    // Agent: RETURNS Some(Arc) on success; None when meili_url empty (search stays SQL-only).
    pub fn try_new(meili_url: &str, meili_master_key: &str, pool: AnyPool) -> Option<Arc<Self>> {
        if meili_url.trim().is_empty() || meili_master_key.trim().is_empty() {
            return None;
        }
        let client = Client::new(meili_url, Some(meili_master_key)).ok()?;
        Some(Arc::new(Self { client, pool }))
    }

    pub fn is_configured(&self) -> bool {
        true
    }

    // Human: Load library metadata from SQL and push one document to Meilisearch.
    // Agent: READS songs + song_genres; HTTP add_documents; ERRORS bubble to sync queue.
    pub async fn upsert_song(&self, song_id: &str) -> Result<(), AppError> {
        let doc = self.load_doc(song_id).await?;
        let index = self.client.index(INDEX_UID);
        index
            .add_documents(&[doc], Some("id"))
            .await
            .map_err(|e| AppError::Internal(anyhow::anyhow!("Meilisearch upsert failed: {e}")))?;
        Ok(())
    }

    // Human: Remove a song from the search index after DB delete.
    // Agent: HTTP delete_document on INDEX_UID; ERRORS bubble to sync queue.
    pub async fn delete_song(&self, song_id: &str) -> Result<(), AppError> {
        let index = self.client.index(INDEX_UID);
        index
            .delete_document(song_id)
            .await
            .map_err(|e| AppError::Internal(anyhow::anyhow!("Meilisearch delete failed: {e}")))?;
        Ok(())
    }

    // Human: Run a ranked full-text query against the songs index.
    // Agent: RETURNS hit ids + Meili processingTimeMs; LIMIT 50 default.
    pub async fn search(&self, query: &str, limit: usize) -> Result<meilisearch_sdk::search::SearchResults<serde_json::Value>, AppError> {
        let index = self.client.index(INDEX_UID);
        index
            .search()
            .with_query(query)
            .with_limit(limit)
            .execute::<serde_json::Value>()
            .await
            .map_err(|e| AppError::Internal(anyhow::anyhow!("Meilisearch search failed: {e}")))
    }

    async fn load_doc(&self, song_id: &str) -> Result<SongSearchDoc, AppError> {
        let row = sqlx::query_as::<_, (String, String, String, Option<String>, bool)>(
            "SELECT id, title, artist, album, enabled FROM songs WHERE id = $1",
        )
        .bind(song_id)
        .fetch_optional(&self.pool)
        .await?;

        let (id, title, artist, album, enabled) = row.ok_or(AppError::NotFound)?;

        let genres: Vec<(String,)> = sqlx::query_as(
            "SELECT g.name FROM song_genres sg JOIN genres g ON sg.genre_id = g.id WHERE sg.song_id = $1",
        )
        .bind(song_id)
        .fetch_all(&self.pool)
        .await?;

        Ok(SongSearchDoc {
            id,
            title,
            artist,
            album,
            genres: genres.into_iter().map(|g| g.0).collect(),
            enabled,
        })
    }
}

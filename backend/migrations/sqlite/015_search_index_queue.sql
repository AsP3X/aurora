-- Human: Persist Meilisearch sync failures so we can retry after DB commits succeed.
-- Agent: TABLE search_index_queue; INDEX next_retry_at; ops upsert|delete.
CREATE TABLE IF NOT EXISTS search_index_queue (
    id TEXT PRIMARY KEY,
    song_id TEXT NOT NULL,
    operation TEXT NOT NULL,
    attempts INTEGER NOT NULL DEFAULT 0,
    last_error TEXT,
    next_retry_at TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);

CREATE INDEX IF NOT EXISTS idx_search_index_queue_retry ON search_index_queue(next_retry_at);

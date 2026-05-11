CREATE TABLE IF NOT EXISTS song_encryption_keys (
    song_id         TEXT PRIMARY KEY REFERENCES songs(id) ON DELETE CASCADE,
    key_id          TEXT NOT NULL UNIQUE,
    encrypted_key   BYTEA NOT NULL,
    created_at      TEXT DEFAULT (now()::text) NOT NULL,
    rotated_at      TEXT
);

ALTER TABLE songs
    ADD COLUMN IF NOT EXISTS hls_ready     BOOLEAN DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS hls_key_id    TEXT REFERENCES song_encryption_keys(key_id),
    ADD COLUMN IF NOT EXISTS segment_count  INTEGER;

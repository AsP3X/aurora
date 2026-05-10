CREATE TABLE IF NOT EXISTS song_encryption_keys (
    song_id         BLOB PRIMARY KEY REFERENCES songs(id) ON DELETE CASCADE,
    key_id          BLOB NOT NULL UNIQUE,
    encrypted_key   BLOB NOT NULL,
    created_at      DATETIME DEFAULT CURRENT_TIMESTAMP NOT NULL,
    rotated_at      DATETIME
);

ALTER TABLE songs ADD COLUMN hls_ready INTEGER DEFAULT 0;
ALTER TABLE songs ADD COLUMN hls_key_id BLOB REFERENCES song_encryption_keys(key_id);
ALTER TABLE songs ADD COLUMN segment_count INTEGER;

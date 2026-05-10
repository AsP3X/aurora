CREATE TABLE IF NOT EXISTS song_encryption_keys (
    song_id         UUID PRIMARY KEY REFERENCES songs(id) ON DELETE CASCADE,
    key_id          UUID NOT NULL UNIQUE,
    encrypted_key   BYTEA NOT NULL,
    created_at      TIMESTAMPTZ DEFAULT now() NOT NULL,
    rotated_at      TIMESTAMPTZ
);

ALTER TABLE songs
    ADD COLUMN IF NOT EXISTS hls_ready     BOOLEAN DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS hls_key_id    UUID REFERENCES song_encryption_keys(key_id),
    ADD COLUMN IF NOT EXISTS segment_count  INTEGER;

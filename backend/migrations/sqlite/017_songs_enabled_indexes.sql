-- Human: Speed up library list queries that always filter enabled songs.
-- Agent: INDEX songs_enabled_artist ON songs(enabled, artist); INDEX songs_enabled_title ON songs(enabled, title).

CREATE INDEX IF NOT EXISTS idx_songs_enabled_artist ON songs(enabled, artist);
CREATE INDEX IF NOT EXISTS idx_songs_enabled_title ON songs(enabled, title);

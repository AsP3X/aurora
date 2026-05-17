-- Human: Store per-song synced lyric lines as JSON for in-app display and admin editing.
-- Agent: TABLE song_lyrics; FK songs ON DELETE CASCADE; lines_json TEXT NOT NULL.
CREATE TABLE IF NOT EXISTS song_lyrics (
    song_id TEXT PRIMARY KEY REFERENCES songs(id) ON DELETE CASCADE,
    lines_json TEXT NOT NULL,
    updated_by TEXT REFERENCES users(id),
    updated_at TEXT NOT NULL DEFAULT (now()::text)
);

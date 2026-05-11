CREATE TABLE users (
    id TEXT PRIMARY KEY,
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'listener',
    created_at TEXT DEFAULT (now()::text),
    updated_at TEXT DEFAULT (now()::text)
);

CREATE TABLE songs (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    artist TEXT NOT NULL,
    album TEXT,
    album_artist TEXT,
    track_number INT,
    year INT,
    genre TEXT,
    duration_seconds INT NOT NULL,
    file_key TEXT NOT NULL UNIQUE,
    file_size_bytes BIGINT NOT NULL,
    file_format TEXT NOT NULL,
    bitrate_kbps INT,
    sample_rate_hz INT,
    artwork_key TEXT,
    publisher_id TEXT REFERENCES users(id),
    created_at TEXT DEFAULT (now()::text),
    updated_at TEXT DEFAULT (now()::text)
);

CREATE TABLE playlists (
    id TEXT PRIMARY KEY,
    user_id TEXT REFERENCES users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    description TEXT,
    is_public BOOLEAN DEFAULT false,
    created_at TEXT DEFAULT (now()::text)
);

CREATE TABLE playlist_songs (
    id TEXT PRIMARY KEY,
    playlist_id TEXT REFERENCES playlists(id) ON DELETE CASCADE,
    song_id TEXT REFERENCES songs(id) ON DELETE CASCADE,
    position INT NOT NULL,
    added_at TEXT DEFAULT (now()::text),
    UNIQUE (playlist_id, position)
);

CREATE TABLE playback_history (
    id TEXT PRIMARY KEY,
    user_id TEXT REFERENCES users(id) ON DELETE CASCADE,
    song_id TEXT REFERENCES songs(id) ON DELETE CASCADE,
    started_at TEXT DEFAULT (now()::text),
    duration_listened_seconds INT,
    completed BOOLEAN DEFAULT false
);

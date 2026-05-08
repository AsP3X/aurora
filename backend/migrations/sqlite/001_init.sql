CREATE TABLE IF NOT EXISTS users (
    id BLOB PRIMARY KEY,
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'listener',
    created_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
    updated_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);

CREATE TABLE IF NOT EXISTS songs (
    id BLOB PRIMARY KEY,
    title TEXT NOT NULL,
    artist TEXT NOT NULL,
    album TEXT,
    album_artist TEXT,
    track_number INT,
    year INT,
    genre TEXT,
    duration_seconds INT NOT NULL,
    file_key TEXT NOT NULL UNIQUE,
    file_size_bytes INT NOT NULL,
    file_format TEXT NOT NULL,
    bitrate_kbps INT,
    sample_rate_hz INT,
    artwork_key TEXT,
    publisher_id BLOB REFERENCES users(id),
    created_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
    updated_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);

CREATE TABLE IF NOT EXISTS playlists (
    id BLOB PRIMARY KEY,
    user_id BLOB REFERENCES users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    description TEXT,
    is_public INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);

CREATE TABLE IF NOT EXISTS playlist_songs (
    id BLOB PRIMARY KEY,
    playlist_id BLOB REFERENCES playlists(id) ON DELETE CASCADE,
    song_id BLOB REFERENCES songs(id) ON DELETE CASCADE,
    position INT NOT NULL,
    added_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
    UNIQUE (playlist_id, position)
);

CREATE TABLE IF NOT EXISTS playback_history (
    id BLOB PRIMARY KEY,
    user_id BLOB REFERENCES users(id) ON DELETE CASCADE,
    song_id BLOB REFERENCES songs(id) ON DELETE CASCADE,
    started_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
    duration_listened_seconds INT,
    completed INTEGER DEFAULT 0
);

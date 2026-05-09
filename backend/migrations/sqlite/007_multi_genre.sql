CREATE TABLE IF NOT EXISTS genres (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS song_genres (
    song_id BLOB NOT NULL REFERENCES songs(id) ON DELETE CASCADE,
    genre_id INTEGER NOT NULL REFERENCES genres(id) ON DELETE CASCADE,
    PRIMARY KEY (song_id, genre_id)
);

INSERT OR IGNORE INTO genres (name)
SELECT DISTINCT LOWER(TRIM(genre)) FROM songs WHERE genre IS NOT NULL;

INSERT INTO song_genres (song_id, genre_id)
SELECT s.id, g.id
FROM songs s
JOIN genres g ON LOWER(TRIM(s.genre)) = g.name
WHERE s.genre IS NOT NULL;

ALTER TABLE songs DROP COLUMN genre;

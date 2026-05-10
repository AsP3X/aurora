# Multi-Genre Support Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the single `genre` string on songs with a many-to-many relationship via `genres` and `song_genres` tables, updating the upload flow, song editing, and all genre displays across the app.

**Architecture:** Add a junction table (`song_genres`) and lookup table (`genres`). Migrate existing single-genre data, drop the old `genre` column. Update Rust `Song` to no longer derive `FromRow` (since `genres` requires a join); introduce `SongDb` for DB rows and helper functions to populate genres. Frontend replaces the single-select `EntityField` for genre with a new `MultiGenreField` backed by an enhanced `EntityPickerDialog` with multi-select mode.

**Tech Stack:** Rust (Axum, sqlx AnyPool), SQLite/Postgres, React/TypeScript, Tailwind CSS

---

## File Structure

| File | Responsibility |
|------|--------------|
| `backend/migrations/sqlite/007_multi_genre.sql` | SQLite: create `genres`/`song_genres`, migrate data, drop `genre` |
| `backend/migrations/postgres/007_multi_genre.sql` | Postgres: same migration |
| `backend/src/songs/model.rs` | Add `SongDb` (FromRow), update `Song` (no FromRow, `genres: Vec<String>`), add `populate_genres` helpers |
| `backend/src/songs/handlers.rs` | Update `list_songs`, `get_song`, `list_values` to populate/fetch genres correctly |
| `backend/src/admin/upload.rs` | Update `SongDraft`, `CommitSongRequest`, metadata extraction, `commit_song` to write genres via junction table |
| `backend/src/admin/handlers.rs` | Update `UpdateSongBody`, `update_song`, `list_admin_songs`, `toggle_song_enabled` |
| `frontend/src/types/index.ts` | Change `Song.genre` and `SongDraft.genre` from `string \| null` to `genres: string[]` |
| `frontend/src/api/client.ts` | Update `updateAdminSong` type to use `genres` instead of `genre` |
| `frontend/src/components/admin/EntityPickerDialog.tsx` | Add `multiSelect`, `selectedValues`, `onMultiSelect` props; checkbox UI; "Done" button |
| `frontend/src/components/admin/MultiGenreField.tsx` | New component: chips + click-to-open multi-select dialog |
| `frontend/src/components/admin/SongMetadataForm.tsx` | Replace `EntityField` for genre with `MultiGenreField` |
| `frontend/src/pages/admin/AdminDashboard.tsx` | Update edit dialog genre input to `MultiGenreField`; `editForm` uses `string[]` |
| `frontend/src/pages/Player.tsx` | Render multiple genre tags instead of single genre tag |

---

## Task 1: Database Migrations

**Files:**
- Create: `backend/migrations/sqlite/007_multi_genre.sql`
- Create: `backend/migrations/postgres/007_multi_genre.sql`

- [ ] **Step 1: Write SQLite migration**

```sql
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
```

- [ ] **Step 2: Write Postgres migration**

```sql
CREATE TABLE IF NOT EXISTS genres (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS song_genres (
    song_id UUID NOT NULL REFERENCES songs(id) ON DELETE CASCADE,
    genre_id INTEGER NOT NULL REFERENCES genres(id) ON DELETE CASCADE,
    PRIMARY KEY (song_id, genre_id)
);

INSERT INTO genres (name)
SELECT DISTINCT LOWER(TRIM(genre)) FROM songs WHERE genre IS NOT NULL
ON CONFLICT (name) DO NOTHING;

INSERT INTO song_genres (song_id, genre_id)
SELECT s.id, g.id
FROM songs s
JOIN genres g ON LOWER(TRIM(s.genre)) = g.name
WHERE s.genre IS NOT NULL;

ALTER TABLE songs DROP COLUMN genre;
```

- [ ] **Step 3: Verify migrations are numbered correctly**

Run: `ls backend/migrations/sqlite/ && ls backend/migrations/postgres/`
Expected: `007_multi_genre.sql` appears after `006_add_enabled.sql` in both directories.

- [ ] **Step 4: Commit**

```bash
git add backend/migrations/sqlite/007_multi_genre.sql backend/migrations/postgres/007_multi_genre.sql
git commit -m "feat(db): add genres and song_genres tables, migrate and drop old genre column"
```

---

## Task 2: Backend Model & Genre Helper

**Files:**
- Modify: `backend/src/songs/model.rs`

- [ ] **Step 1: Replace `model.rs` contents**

```rust
use serde::{Deserialize, Serialize};
use sqlx::FromRow;
use std::collections::HashMap;

#[derive(Debug, FromRow)]
pub struct SongDb {
    pub id: String,
    pub title: String,
    pub artist: String,
    pub album: Option<String>,
    pub album_artist: Option<String>,
    pub track_number: Option<i32>,
    pub year: Option<i32>,
    pub studio: Option<String>,
    pub duration_seconds: i32,
    pub file_key: String,
    pub file_size_bytes: i64,
    pub file_format: String,
    pub bitrate_kbps: Option<i32>,
    pub sample_rate_hz: Option<i32>,
    pub artwork_key: Option<String>,
    pub publisher_id: Option<String>,
    pub enabled: i64,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct Song {
    pub id: String,
    pub title: String,
    pub artist: String,
    pub album: Option<String>,
    pub album_artist: Option<String>,
    pub track_number: Option<i32>,
    pub year: Option<i32>,
    pub genres: Vec<String>,
    pub studio: Option<String>,
    pub duration_seconds: i32,
    pub file_key: String,
    pub file_size_bytes: i64,
    pub file_format: String,
    pub bitrate_kbps: Option<i32>,
    pub sample_rate_hz: Option<i32>,
    pub artwork_key: Option<String>,
    pub publisher_id: Option<String>,
    pub enabled: i64,
    pub created_at: String,
    pub updated_at: String,
}

impl From<SongDb> for Song {
    fn from(db: SongDb) -> Self {
        Self {
            id: db.id,
            title: db.title,
            artist: db.artist,
            album: db.album,
            album_artist: db.album_artist,
            track_number: db.track_number,
            year: db.year,
            genres: Vec::new(),
            studio: db.studio,
            duration_seconds: db.duration_seconds,
            file_key: db.file_key,
            file_size_bytes: db.file_size_bytes,
            file_format: db.file_format,
            bitrate_kbps: db.bitrate_kbps,
            sample_rate_hz: db.sample_rate_hz,
            artwork_key: db.artwork_key,
            publisher_id: db.publisher_id,
            enabled: db.enabled,
            created_at: db.created_at,
            updated_at: db.updated_at,
        }
    }
}

pub async fn populate_genres(
    pool: &sqlx::AnyPool,
    songs: &mut [Song],
) -> Result<(), sqlx::Error> {
    if songs.is_empty() {
        return Ok(());
    }

    let ids: Vec<&str> = songs.iter().map(|s| s.id.as_str()).collect();
    let placeholders: Vec<String> = (1..=ids.len()).map(|i| format!("${}", i)).collect();

    let sql = format!(
        "SELECT song_id, g.name FROM song_genres sg JOIN genres g ON sg.genre_id = g.id WHERE song_id IN ({})",
        placeholders.join(", ")
    );

    let mut query = sqlx::query_as::<_, (String, String)>(&sql);
    for id in &ids {
        query = query.bind(id);
    }

    let rows = query.fetch_all(pool).await?;

    let mut genre_map: HashMap<String, Vec<String>> = HashMap::new();
    for (song_id, genre) in rows {
        genre_map.entry(song_id).or_default().push(genre);
    }

    for song in songs.iter_mut() {
        if let Some(genres) = genre_map.remove(&song.id) {
            song.genres = genres;
        }
    }

    Ok(())
}

pub async fn populate_genres_for_one(
    pool: &sqlx::AnyPool,
    song: &mut Song,
) -> Result<(), sqlx::Error> {
    let rows: Vec<(String,)> = sqlx::query_as(
        "SELECT g.name FROM song_genres sg JOIN genres g ON sg.genre_id = g.id WHERE sg.song_id = $1"
    )
    .bind(&song.id)
    .fetch_all(pool)
    .await?;

    song.genres = rows.into_iter().map(|r| r.0).collect();
    Ok(())
}

#[derive(Debug, FromRow, Serialize, Deserialize)]
pub struct HistoryEntry {
    pub id: String,
    pub user_id: String,
    pub song_id: String,
    pub started_at: String,
    pub duration_listened_seconds: Option<i32>,
    pub completed: bool,
    pub title: String,
    pub artist: String,
    pub album: Option<String>,
    pub artwork_key: Option<String>,
    pub duration_seconds: i32,
}

#[derive(Debug, FromRow, Serialize, Deserialize)]
pub struct LibraryStats {
    pub total_songs: i64,
    pub total_artists: i64,
    pub total_albums: i64,
    pub total_duration_seconds: i64,
}
```

- [ ] **Step 2: Verify the file compiles**

Run: `cd backend && cargo check`
Expected: compile succeeds (there will be errors in other files that still reference `Song` with `FromRow` — that is expected).

- [ ] **Step 3: Commit**

```bash
git add backend/src/songs/model.rs
git commit -m "feat(backend): add SongDb and genre population helpers"
```

---

## Task 3: Backend Song List/Get Handlers

**Files:**
- Modify: `backend/src/songs/handlers.rs`

- [ ] **Step 1: Update `list_values` for genre**

Replace the `list_values` function body (keep the signature). The genre field must now query the `genres` table instead of `songs.genre`:

```rust
pub async fn list_values(
    State(state): State<Arc<AppState>>,
    claims: axum::Extension<crate::auth::Claims>,
    Query(params): Query<ValuesParams>,
) -> Result<Json<Vec<String>>, AppError> {
    require_permission(&state.pool, &claims.sub, "library.view").await?;

    if params.field == "genre" {
        let sql = format!(
            "SELECT name FROM genres
             WHERE ($1 IS NULL OR LOWER(name) LIKE LOWER('%' || $1 || '%'))
             ORDER BY name ASC
             LIMIT $2"
        );
        let values: Vec<(String,)> = sqlx::query_as(&sql)
            .bind(params.q)
            .bind(params.limit)
            .fetch_all(&state.pool)
            .await?;
        return Ok(Json(values.into_iter().map(|v| v.0).collect()));
    }

    let column = match params.field.as_str() {
        "artist" => "artist",
        "album" => "album",
        "album_artist" => "album_artist",
        "studio" => "studio",
        _ => return Err(AppError::BadRequest(format!("invalid field: {}", params.field))),
    };

    let sql = format!(
        "SELECT DISTINCT {} FROM songs
         WHERE ($1 IS NULL OR LOWER({}) LIKE LOWER('%' || $1 || '%'))
         AND {} IS NOT NULL
         ORDER BY {} ASC
         LIMIT $2",
        column, column, column, column
    );

    let values: Vec<(String,)> = sqlx::query_as(&sql)
        .bind(params.q)
        .bind(params.limit)
        .fetch_all(&state.pool)
        .await?;

    Ok(Json(values.into_iter().map(|v| v.0).collect()))
}
```

- [ ] **Step 2: Update `list_songs` to populate genres**

Replace the `list_songs` function body. Change the return type and query to use `SongDb`, then convert and populate genres:

```rust
pub async fn list_songs(
    State(state): State<Arc<AppState>>,
    claims: axum::Extension<crate::auth::Claims>,
    Query(params): Query<ListParams>,
) -> Result<Json<Vec<super::model::Song>>, AppError> {
    require_permission(&state.pool, &claims.sub, "library.view").await?;

    let order_clause = sanitize_order_by(params.order_by);
    let sql = format!(
        "SELECT * FROM songs
         WHERE ($1 IS NULL OR LOWER(artist) LIKE LOWER($1))
         AND ($2 IS NULL OR LOWER(album) LIKE LOWER($2))
         AND ($5 IS NULL OR LOWER(title) LIKE LOWER($5) OR LOWER(artist) LIKE LOWER($5) OR LOWER(album) LIKE LOWER($5))
         AND enabled = 1
         ORDER BY {}
         LIMIT $3 OFFSET $4",
        order_clause
    );

    let mut songs_db = sqlx::query_as::<_, super::model::SongDb>(&sql)
        .bind(params.artist.map(|a| format!("%{}%", a)))
        .bind(params.album.map(|a| format!("%{}%", a)))
        .bind(params.limit)
        .bind(params.offset)
        .bind(params.q.map(|q| format!("%{}%", q)))
        .fetch_all(&state.pool)
        .await?;

    let mut songs: Vec<super::model::Song> = songs_db.into_iter().map(|db| db.into()).collect();
    super::model::populate_genres(&state.pool, &mut songs).await?;

    Ok(Json(songs))
}
```

- [ ] **Step 3: Update `get_song` to populate genres**

Replace the `get_song` function body:

```rust
pub async fn get_song(
    State(state): State<Arc<AppState>>,
    claims: axum::Extension<crate::auth::Claims>,
    Path(id): Path<Uuid>,
) -> Result<Json<super::model::Song>, AppError> {
    require_permission(&state.pool, &claims.sub, "library.view").await?;

    let song_db = sqlx::query_as::<_, super::model::SongDb>("SELECT * FROM songs WHERE id = $1 AND enabled = 1")
        .bind(id.to_string())
        .fetch_optional(&state.pool)
        .await?;

    if let Some(db) = song_db {
        let mut song: super::model::Song = db.into();
        super::model::populate_genres_for_one(&state.pool, &mut song).await?;
        Ok(Json(song))
    } else {
        Err(AppError::NotFound)
    }
}
```

- [ ] **Step 4: Verify compilation**

Run: `cd backend && cargo check`
Expected: Should compile. Errors in `admin/upload.rs` and `admin/handlers.rs` are expected.

- [ ] **Step 5: Commit**

```bash
git add backend/src/songs/handlers.rs
git commit -m "feat(backend): update list/get song handlers for multi-genre"
```

---

## Task 4: Backend Upload/Commit Handlers

**Files:**
- Modify: `backend/src/admin/upload.rs`

- [ ] **Step 1: Update structs and metadata extraction**

Replace the top portion of `upload.rs` (lines 1–134 approximately) with:

```rust
use axum::extract::{Multipart, State};
use serde::{Deserialize, Serialize};
use std::path::Path;
use std::sync::Arc;
use uuid::Uuid;

use crate::{
    error::AppError,
    permissions::require_admin_access,
    AppState,
};

const STAGING_DIR_NAME: &str = ".staging";

async fn ensure_parent_dir(path: &Path) -> Result<(), AppError> {
    if let Some(parent) = path.parent() {
        tokio::fs::create_dir_all(parent)
            .await
            .map_err(|e| AppError::Storage(e.to_string()))?;
    }
    Ok(())
}

#[derive(Debug, Serialize)]
pub struct SongDraft {
    pub staging_id: String,
    pub title: String,
    pub artist: String,
    pub album: Option<String>,
    pub album_artist: Option<String>,
    pub track_number: Option<i32>,
    pub year: Option<i32>,
    pub genres: Vec<String>,
    pub studio: Option<String>,
    pub duration_seconds: i32,
    pub file_format: String,
    pub bitrate_kbps: Option<i32>,
    pub sample_rate_hz: Option<i32>,
    pub has_artwork: bool,
}

#[derive(Debug, Deserialize)]
pub struct CommitSongRequest {
    pub staging_id: String,
    pub title: String,
    pub artist: String,
    pub album: Option<String>,
    pub album_artist: Option<String>,
    pub track_number: Option<i32>,
    pub year: Option<i32>,
    pub genres: Vec<String>,
    pub studio: Option<String>,
    pub duration_seconds: i32,
    pub file_format: String,
    pub bitrate_kbps: Option<i32>,
    pub sample_rate_hz: Option<i32>,
}

struct ExtractedMetadata {
    title: String,
    artist: String,
    album: Option<String>,
    album_artist: Option<String>,
    track_number: Option<i32>,
    year: Option<i32>,
    genres: Vec<String>,
    duration_seconds: i32,
    file_format: String,
    bitrate_kbps: Option<i32>,
    sample_rate_hz: Option<i32>,
}

fn extract_metadata(path: &Path) -> anyhow::Result<ExtractedMetadata> {
    use lofty::prelude::*;
    use lofty::tag::ItemKey;

    let tagged_file = lofty::read_from_path(path)?;
    let properties = tagged_file.properties();

    let (title, artist, album, album_artist, track_number, year, genres) =
        match tagged_file.primary_tag() {
            Some(tag) => {
                let genre_str = tag.genre().map(|v| v.to_string());
                let genres = genre_str
                    .map(|s| {
                        s.split(|c: char| c == '/' || c == ';' || c == ',')
                            .map(|g| g.trim().to_lowercase())
                            .filter(|g| !g.is_empty())
                            .collect::<Vec<String>>()
                    })
                    .unwrap_or_default();
                (
                    tag.title()
                        .as_deref()
                        .unwrap_or_else(|| {
                            path.file_stem()
                                .and_then(|s| s.to_str())
                                .unwrap_or("Unknown")
                        })
                        .to_string(),
                    tag.artist().as_deref().unwrap_or("Unknown Artist").to_string(),
                    tag.album().map(|v| v.to_string()),
                    tag.get_string(&ItemKey::AlbumArtist).map(|v| v.to_string()),
                    tag.track().map(|v| v as i32),
                    tag.year().map(|v| v as i32),
                    genres,
                )
            }
            None => (
                path.file_stem()
                    .and_then(|s| s.to_str())
                    .unwrap_or("Unknown")
                    .to_string(),
                "Unknown Artist".to_string(),
                None,
                None,
                None,
                None,
                Vec::new(),
            ),
        };

    let duration = properties.duration().as_secs().try_into().unwrap_or(i32::MAX);
    let file_format = path
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("unknown")
        .to_string();
    let bitrate = properties.audio_bitrate().map(|b| b as i32);
    let sample_rate = properties.sample_rate().map(|s| s as i32);

    Ok(ExtractedMetadata {
        title,
        artist,
        album,
        album_artist,
        track_number,
        year,
        genres,
        duration_seconds: duration,
        file_format,
        bitrate_kbps: bitrate,
        sample_rate_hz: sample_rate,
    })
}
```

Keep `extract_artwork` unchanged.

- [ ] **Step 2: Update `stage_song` to build `SongDraft` with `genres`**

In `stage_song`, replace the `draft` construction (around line 302) with:

```rust
    let draft = SongDraft {
        staging_id: staging_id.clone(),
        title: meta.title.clone(),
        artist: meta.artist.clone(),
        album: meta.album.clone(),
        album_artist: meta.album_artist.clone(),
        track_number: meta.track_number,
        year: meta.year,
        genres: meta.genres.clone(),
        studio: None,
        duration_seconds: meta.duration_seconds,
        file_format: meta.file_format.clone(),
        bitrate_kbps: meta.bitrate_kbps,
        sample_rate_hz: meta.sample_rate_hz,
        has_artwork,
    };
```

Keep the fallback `ExtractedMetadata` in the `unwrap_or_else` block (around line 263) — change `genre: None` to `genres: Vec::new()`.

- [ ] **Step 3: Update `commit_song` to insert genres via junction table**

In `commit_song`, replace the `song_result` query block (around line 477) with a transaction that inserts the song, then writes genres:

```rust
    let mut tx = state.pool.begin().await?;

    let song_db = sqlx::query_as::<_, crate::songs::model::SongDb>(
        "INSERT INTO songs (
            id, title, artist, album, album_artist, track_number, year, studio,
            duration_seconds, file_key, file_size_bytes, file_format, bitrate_kbps, sample_rate_hz, artwork_key, publisher_id
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
        RETURNING *"
    )
    .bind(&song_id)
    .bind(&req.title)
    .bind(&req.artist)
    .bind(&req.album)
    .bind(&req.album_artist)
    .bind(req.track_number)
    .bind(req.year)
    .bind(&req.studio)
    .bind(req.duration_seconds)
    .bind(&file_key)
    .bind(file_size)
    .bind(&req.file_format)
    .bind(req.bitrate_kbps)
    .bind(req.sample_rate_hz)
    .bind(&artwork_key)
    .bind(&claims.sub)
    .fetch_one(&mut *tx)
    .await?;

    for genre in &req.genres {
        let genre_lower = genre.trim().to_lowercase();
        if genre_lower.is_empty() { continue; }

        let existing: Option<(i64,)> = sqlx::query_as("SELECT id FROM genres WHERE name = $1")
            .bind(&genre_lower)
            .fetch_optional(&mut *tx)
            .await?;

        if existing.is_none() {
            sqlx::query("INSERT INTO genres (name) VALUES ($1)")
                .bind(&genre_lower)
                .execute(&mut *tx)
                .await?;
        }

        sqlx::query(
            "INSERT INTO song_genres (song_id, genre_id)
             SELECT $1, id FROM genres WHERE name = $2"
        )
        .bind(&song_id)
        .bind(&genre_lower)
        .execute(&mut *tx)
        .await?;
    }

    tx.commit().await?;

    let mut song: crate::songs::model::Song = song_db.into();
    crate::songs::model::populate_genres_for_one(&state.pool, &mut song).await?;
```

Then change the `match song_result` block to just clean up staging and return:

```rust
    if let Err(e) = tokio::fs::remove_dir_all(&staging_dir).await {
        tracing::warn!("Failed to remove staging directory: {}", e);
    }

    tracing::info!(
        song_id = %song.id,
        title = %req.title,
        artist = %req.artist,
        elapsed_ms = start.elapsed().as_millis(),
        "commit_song completed"
    );
    Ok(axum::Json(song))
```

And replace the `Err(e) => { ... }` error handling branch with cleanup on any earlier error (the transaction commit is already inside the try block). Actually, the existing error handling structure should be adjusted. Wrap the whole transaction logic in the try part, and on error, do cleanup:

Replace the whole `song_result` through the end of the `match` with:

```rust
    let result: Result<crate::songs::model::Song, AppError> = async {
        let mut tx = state.pool.begin().await?;

        let song_db = sqlx::query_as::<_, crate::songs::model::SongDb>(
            "INSERT INTO songs (
                id, title, artist, album, album_artist, track_number, year, studio,
                duration_seconds, file_key, file_size_bytes, file_format, bitrate_kbps, sample_rate_hz, artwork_key, publisher_id
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
            RETURNING *"
        )
        .bind(&song_id)
        .bind(&req.title)
        .bind(&req.artist)
        .bind(&req.album)
        .bind(&req.album_artist)
        .bind(req.track_number)
        .bind(req.year)
        .bind(&req.studio)
        .bind(req.duration_seconds)
        .bind(&file_key)
        .bind(file_size)
        .bind(&req.file_format)
        .bind(req.bitrate_kbps)
        .bind(req.sample_rate_hz)
        .bind(&artwork_key)
        .bind(&claims.sub)
        .fetch_one(&mut *tx)
        .await?;

        for genre in &req.genres {
            let genre_lower = genre.trim().to_lowercase();
            if genre_lower.is_empty() { continue; }

            let existing: Option<(i64,)> = sqlx::query_as("SELECT id FROM genres WHERE name = $1")
                .bind(&genre_lower)
                .fetch_optional(&mut *tx)
                .await?;

            if existing.is_none() {
                sqlx::query("INSERT INTO genres (name) VALUES ($1)")
                    .bind(&genre_lower)
                    .execute(&mut *tx)
                    .await?;
            }

            sqlx::query(
                "INSERT INTO song_genres (song_id, genre_id)
                 SELECT $1, id FROM genres WHERE name = $2"
            )
            .bind(&song_id)
            .bind(&genre_lower)
            .execute(&mut *tx)
            .await?;
        }

        tx.commit().await?;

        let mut song: crate::songs::model::Song = song_db.into();
        crate::songs::model::populate_genres_for_one(&state.pool, &mut song).await?;
        Ok(song)
    }.await;

    match result {
        Ok(song) => {
            if let Err(e) = tokio::fs::remove_dir_all(&staging_dir).await {
                tracing::warn!("Failed to remove staging directory: {}", e);
            }
            tracing::info!(
                song_id = %song.id,
                title = %req.title,
                artist = %req.artist,
                elapsed_ms = start.elapsed().as_millis(),
                "commit_song completed"
            );
            Ok(axum::Json(song))
        }
        Err(e) => {
            tracing::warn!(error = %e, "commit_song failed");
            if let Err(e) = tokio::fs::remove_file(&dest_path).await {
                tracing::warn!("Failed to clean up audio file after DB error: {}", e);
            }
            if let Some(ref key) = artwork_key {
                let art_path = state.storage.base_dir.join(key);
                if let Err(e) = tokio::fs::remove_file(&art_path).await {
                    tracing::warn!("Failed to clean up artwork file after DB error: {}", e);
                }
            }
            if let Err(e) = tokio::fs::remove_dir_all(&staging_dir).await {
                tracing::warn!("Failed to remove staging directory after DB error: {}", e);
            }
            Err(e)
        }
    }
```

- [ ] **Step 4: Verify compilation**

Run: `cd backend && cargo check`
Expected: Should compile. Errors in `admin/handlers.rs` only.

- [ ] **Step 5: Commit**

```bash
git add backend/src/admin/upload.rs
git commit -m "feat(backend): update upload/commit for multi-genre"
```

---

## Task 5: Backend Admin Handlers

**Files:**
- Modify: `backend/src/admin/handlers.rs`

- [ ] **Step 1: Update `list_admin_songs`**

Replace the body of `list_admin_songs`:

```rust
pub async fn list_admin_songs(
    State(state): State<Arc<AppState>>,
    claims: axum::Extension<crate::auth::Claims>,
    Query(params): Query<ListParams>,
) -> Result<Json<Vec<crate::songs::model::Song>>, AppError> {
    require_admin_access(&state.pool, &claims.sub, &claims.role).await?;

    let order_clause = sanitize_order_by(params.order_by);
    let sql = format!(
        "SELECT * FROM songs
         WHERE ($1 IS NULL OR LOWER(title) LIKE LOWER($1) OR LOWER(artist) LIKE LOWER($1) OR LOWER(album) LIKE LOWER($1))
         ORDER BY {}
         LIMIT $2 OFFSET $3",
        order_clause
    );

    let songs_db = sqlx::query_as::<_, crate::songs::model::SongDb>(&sql)
        .bind(params.q.map(|q| format!("%{}%", q)))
        .bind(params.limit)
        .bind(params.offset)
        .fetch_all(&state.pool)
        .await?;

    let mut songs: Vec<crate::songs::model::Song> = songs_db.into_iter().map(|db| db.into()).collect();
    crate::songs::model::populate_genres(&state.pool, &mut songs).await?;

    Ok(Json(songs))
}
```

- [ ] **Step 2: Update `UpdateSongBody` and `update_song`**

Replace `UpdateSongBody` definition and `update_song` function:

```rust
#[derive(Debug, Deserialize)]
pub struct UpdateSongBody {
    pub title: Option<String>,
    pub artist: Option<String>,
    pub album: Option<String>,
    pub album_artist: Option<String>,
    pub track_number: Option<i32>,
    pub year: Option<i32>,
    pub genres: Option<Vec<String>>,
    pub studio: Option<String>,
}

pub async fn update_song(
    State(state): State<Arc<AppState>>,
    claims: axum::Extension<crate::auth::Claims>,
    Path(id): Path<String>,
    Json(body): Json<UpdateSongBody>,
) -> Result<Json<crate::songs::model::Song>, AppError> {
    require_admin_access(&state.pool, &claims.sub, &claims.role).await?;

    let mut tx = state.pool.begin().await?;

    let mut sets: Vec<String> = Vec::new();
    let mut binds: Vec<String> = Vec::new();

    if let Some(v) = body.title {
        sets.push(format!("title = ${}", sets.len() + 2));
        binds.push(v);
    }
    if let Some(v) = body.artist {
        sets.push(format!("artist = ${}", sets.len() + 2));
        binds.push(v);
    }
    if let Some(v) = body.album {
        sets.push(format!("album = ${}", sets.len() + 2));
        binds.push(v);
    }
    if let Some(v) = body.album_artist {
        sets.push(format!("album_artist = ${}", sets.len() + 2));
        binds.push(v);
    }
    if let Some(v) = body.track_number {
        sets.push(format!("track_number = ${}", sets.len() + 2));
        binds.push(v.to_string());
    }
    if let Some(v) = body.year {
        sets.push(format!("year = ${}", sets.len() + 2));
        binds.push(v.to_string());
    }
    if let Some(v) = body.studio {
        sets.push(format!("studio = ${}", sets.len() + 2));
        binds.push(v);
    }

    let song_db = if !sets.is_empty() {
        let sql = format!(
            "UPDATE songs SET {} WHERE id = $1 RETURNING *",
            sets.join(", ")
        );
        let mut query = sqlx::query_as::<_, crate::songs::model::SongDb>(&sql).bind(&id);
        for b in &binds {
            query = query.bind(b);
        }
        query.fetch_one(&mut *tx).await?
    } else {
        sqlx::query_as::<_, crate::songs::model::SongDb>("SELECT * FROM songs WHERE id = $1")
            .bind(&id)
            .fetch_one(&mut *tx)
            .await?
    };

    if let Some(genres) = body.genres {
        sqlx::query("DELETE FROM song_genres WHERE song_id = $1")
            .bind(&id)
            .execute(&mut *tx)
            .await?;

        for genre in genres {
            let genre_lower = genre.trim().to_lowercase();
            if genre_lower.is_empty() { continue; }

            let existing: Option<(i64,)> = sqlx::query_as("SELECT id FROM genres WHERE name = $1")
                .bind(&genre_lower)
                .fetch_optional(&mut *tx)
                .await?;

            if existing.is_none() {
                sqlx::query("INSERT INTO genres (name) VALUES ($1)")
                    .bind(&genre_lower)
                    .execute(&mut *tx)
                    .await?;
            }

            sqlx::query(
                "INSERT INTO song_genres (song_id, genre_id)
                 SELECT $1, id FROM genres WHERE name = $2"
            )
            .bind(&id)
            .bind(&genre_lower)
            .execute(&mut *tx)
            .await?;
        }
    }

    tx.commit().await?;

    let mut song: crate::songs::model::Song = song_db.into();
    crate::songs::model::populate_genres_for_one(&state.pool, &mut song).await?;
    Ok(Json(song))
}
```

- [ ] **Step 3: Update `toggle_song_enabled`**

Replace the body:

```rust
pub async fn toggle_song_enabled(
    State(state): State<Arc<AppState>>,
    claims: axum::Extension<crate::auth::Claims>,
    Path(id): Path<String>,
    Json(body): Json<ToggleEnabledBody>,
) -> Result<Json<crate::songs::model::Song>, AppError> {
    require_admin_access(&state.pool, &claims.sub, &claims.role).await?;

    let song_db = sqlx::query_as::<_, crate::songs::model::SongDb>(
        "UPDATE songs SET enabled = $1 WHERE id = $2 RETURNING *"
    )
    .bind(body.enabled)
    .bind(&id)
    .fetch_one(&state.pool)
    .await?;

    let mut song: crate::songs::model::Song = song_db.into();
    crate::songs::model::populate_genres_for_one(&state.pool, &mut song).await?;
    Ok(Json(song))
}
```

- [ ] **Step 4: Verify backend compiles fully**

Run: `cd backend && cargo check`
Expected: Clean compile, zero errors.

- [ ] **Step 5: Commit**

```bash
git add backend/src/admin/handlers.rs
git commit -m "feat(backend): update admin handlers for multi-genre"
```

---

## Task 6: Frontend Types & API Client

**Files:**
- Modify: `frontend/src/types/index.ts`
- Modify: `frontend/src/api/client.ts`

- [ ] **Step 1: Update `Song` and `SongDraft` interfaces**

In `frontend/src/types/index.ts`, change `genre: string | null` to `genres: string[]` in both interfaces:

```typescript
export interface Song {
  id: string;
  title: string;
  artist: string;
  album: string | null;
  album_artist: string | null;
  track_number: number | null;
  year: number | null;
  genres: string[];
  studio: string | null;
  duration_seconds: number;
  file_key: string;
  file_size_bytes: number;
  file_format: string;
  bitrate_kbps: number | null;
  sample_rate_hz: number | null;
  artwork_key: string | null;
  publisher_id: string | null;
  enabled: number;
  created_at: string;
  updated_at: string;
}

export interface SongDraft {
  staging_id: string;
  title: string;
  artist: string;
  album: string | null;
  album_artist: string | null;
  track_number: number | null;
  year: number | null;
  genres: string[];
  studio: string | null;
  duration_seconds: number;
  file_format: string;
  bitrate_kbps: number | null;
  sample_rate_hz: number | null;
  has_artwork: boolean;
}
```

- [ ] **Step 2: Update `updateAdminSong` in `client.ts`**

Change the `updateAdminSong` signature to use `genres`:

```typescript
export async function updateAdminSong(id: string, body: Partial<Pick<Song, "title" | "artist" | "album" | "album_artist" | "track_number" | "year" | "genres" | "studio">>) {
  return apiFetch(`/admin/songs/${id}`, {
    method: "PUT",
    body: JSON.stringify(body),
  }) as Promise<Song>;
}
```

- [ ] **Step 3: Commit**

```bash
git add frontend/src/types/index.ts frontend/src/api/client.ts
git commit -m "feat(frontend): update Song/SongDraft types and API for genres array"
```

---

## Task 7: Frontend Multi-Genre Picker

**Files:**
- Modify: `frontend/src/components/admin/EntityPickerDialog.tsx`
- Create: `frontend/src/components/admin/MultiGenreField.tsx`
- Modify: `frontend/src/components/admin/SongMetadataForm.tsx`

- [ ] **Step 1: Update `EntityPickerDialog` for multi-select**

Replace the entire file with:

```tsx
import { useState, useEffect, useRef, useMemo } from "react";
import Fuse from "fuse.js";

interface EntityPickerDialogProps {
  open: boolean;
  onClose: () => void;
  onSelect: (value: string) => void;
  onMultiSelect?: (values: string[]) => void;
  title: string;
  existingValues: string[];
  currentValue: string | null;
  selectedValues?: string[];
  multiSelect?: boolean;
}

const inputClass =
  "w-full rounded-lg border border-surface-700 bg-surface-900 px-3 py-2 text-sm text-white placeholder-surface-500 focus:border-aurora-400 focus:outline-none";

export default function EntityPickerDialog({
  open,
  onClose,
  onSelect,
  onMultiSelect,
  title,
  existingValues,
  currentValue,
  selectedValues = [],
  multiSelect = false,
}: EntityPickerDialogProps) {
  const [query, setQuery] = useState("");
  const [localSelected, setLocalSelected] = useState<string[]>(selectedValues);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setQuery("");
      setLocalSelected(selectedValues);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open, selectedValues]);

  const fuse = useMemo(
    () =>
      new Fuse(existingValues, {
        threshold: 0.4,
        includeScore: false,
      }),
    [existingValues]
  );

  const results = useMemo(() => {
    if (!query.trim()) return existingValues;
    return fuse.search(query).map((r) => r.item);
  }, [query, existingValues, fuse]);

  const isSelected = (value: string) => localSelected.includes(value);

  const toggleSelection = (value: string) => {
    setLocalSelected((prev) =>
      prev.includes(value) ? prev.filter((v) => v !== value) : [...prev, value]
    );
  };

  const handleSelect = (value: string) => {
    onSelect(value);
    onClose();
  };

  const handleDone = () => {
    onMultiSelect?.(localSelected);
    onClose();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && query.trim()) {
      e.preventDefault();
      if (multiSelect) {
        const trimmed = query.trim();
        if (!localSelected.includes(trimmed)) {
          setLocalSelected((prev) => [...prev, trimmed]);
        }
        setQuery("");
      } else {
        if (results.length > 0) {
          handleSelect(results[0]);
        } else {
          handleSelect(query.trim());
        }
      }
    }
    if (e.key === "Escape") {
      onClose();
    }
  };

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      onClick={onClose}
    >
      <div
        className="flex max-h-[60vh] w-full max-w-md flex-col rounded-xl border border-surface-700 bg-surface-950 p-4 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="mb-3 text-sm font-semibold text-white">{title}</h3>

        <input
          ref={inputRef}
          className={inputClass}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Search or create new..."
        />

        <div className="mt-3 flex-1 overflow-y-auto">
          {results.length === 0 && (
            <div className="px-3 py-2 text-sm text-surface-500">
              No matches found.
            </div>
          )}

          <ul className="space-y-1">
            {results.map((value) => {
              const selected = isSelected(value);
              return (
                <li key={value}>
                  <button
                    onClick={() => {
                      if (multiSelect) {
                        toggleSelection(value);
                      } else {
                        handleSelect(value);
                      }
                    }}
                    className={`flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm transition-colors ${
                      !multiSelect && value === currentValue
                        ? "bg-aurora-600/20 text-aurora-400"
                        : selected
                        ? "bg-aurora-600/20 text-aurora-400"
                        : "text-white hover:bg-surface-800"
                    }`}
                  >
                    {multiSelect && (
                      <span
                        className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border ${
                          selected
                            ? "border-aurora-500 bg-aurora-500"
                            : "border-surface-600"
                        }`}
                      >
                        {selected && (
                          <svg className="h-3 w-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                          </svg>
                        )}
                      </span>
                    )}
                    {value}
                  </button>
                </li>
              );
            })}
          </ul>

          {query.trim() && !results.includes(query.trim()) && (
            <button
              onClick={() => {
                if (multiSelect) {
                  const trimmed = query.trim();
                  if (!localSelected.includes(trimmed)) {
                    setLocalSelected((prev) => [...prev, trimmed]);
                  }
                  setQuery("");
                } else {
                  handleSelect(query.trim());
                }
              }}
              className="mt-2 w-full rounded-lg px-3 py-2 text-left text-sm text-aurora-400 hover:bg-surface-800 hover:text-aurora-300"
            >
              Create &quot;{query.trim()}&quot;
            </button>
          )}
        </div>

        {multiSelect && (
          <div className="mt-3 flex justify-end gap-2 border-t border-surface-800 pt-3">
            <button
              onClick={onClose}
              className="rounded-md bg-surface-800 px-3 py-1.5 text-sm font-medium text-white hover:bg-surface-700"
            >
              Cancel
            </button>
            <button
              onClick={handleDone}
              className="rounded-md bg-aurora-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-aurora-500"
            >
              Done ({localSelected.length})
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Create `MultiGenreField`**

Create `frontend/src/components/admin/MultiGenreField.tsx`:

```tsx
import { useState } from "react";
import EntityPickerDialog from "./EntityPickerDialog";

interface MultiGenreFieldProps {
  label: string;
  values: string[];
  onChange: (values: string[]) => void;
  existingValues: string[];
}

const labelClass = "mb-1 block text-xs font-medium text-surface-300";

export default function MultiGenreField({
  label,
  values,
  onChange,
  existingValues,
}: MultiGenreFieldProps) {
  const [open, setOpen] = useState(false);

  const removeGenre = (genre: string) => {
    onChange(values.filter((v) => v !== genre));
  };

  return (
    <div>
      <label className={labelClass}>{label}</label>
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="rounded-lg border border-surface-700 bg-surface-900 px-3 py-2 text-left text-sm text-white transition-colors hover:border-surface-600 focus:border-aurora-400 focus:outline-none"
        >
          {values.length > 0 ? (
            <span className="text-white">{values.length} selected</span>
          ) : (
            <span className="text-surface-500">Select {label.toLowerCase()}...</span>
          )}
        </button>
        {values.map((genre) => (
          <span
            key={genre}
            className="inline-flex items-center gap-1 rounded-full bg-aurora-600/20 px-2.5 py-1 text-xs text-aurora-400"
          >
            {genre}
            <button
              type="button"
              onClick={() => removeGenre(genre)}
              className="text-aurora-400 hover:text-aurora-300"
              title="Remove"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className="h-3 w-3"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </span>
        ))}
      </div>

      <EntityPickerDialog
        open={open}
        onClose={() => setOpen(false)}
        onSelect={() => {}}
        onMultiSelect={onChange}
        title={`Select ${label}`}
        existingValues={existingValues}
        currentValue={null}
        selectedValues={values}
        multiSelect
      />
    </div>
  );
}
```

- [ ] **Step 3: Update `SongMetadataForm` to use `MultiGenreField`**

Replace the `EntityField` usage for genre in `SongMetadataForm.tsx` (lines 132–139) with `MultiGenreField`:

```tsx
      <div>
        <MultiGenreField
          label="Genre"
          values={draft.genres}
          onChange={(v) => update("genres", v)}
          existingValues={existingValues.genre}
        />
      </div>
```

Also add the import at the top:

```tsx
import MultiGenreField from "./MultiGenreField";
```

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/admin/EntityPickerDialog.tsx frontend/src/components/admin/MultiGenreField.tsx frontend/src/components/admin/SongMetadataForm.tsx
git commit -m "feat(frontend): add multi-genre picker with chips and checkbox dialog"
```

---

## Task 8: Frontend Admin Edit Dialog & Player Display

**Files:**
- Modify: `frontend/src/pages/admin/AdminDashboard.tsx`
- Modify: `frontend/src/pages/Player.tsx`

- [ ] **Step 1: Update `AdminDashboard.tsx` edit dialog for multi-genre**

Change the `editForm` state type and initialization in `AdminDashboard.tsx`:

```typescript
  const [editForm, setEditForm] = useState<{
    title: string;
    artist: string;
    album: string;
    album_artist: string;
    track_number: string;
    year: string;
    genres: string[];
    studio: string;
  }>({
    title: "",
    artist: "",
    album: "",
    album_artist: "",
    track_number: "",
    year: "",
    genres: [],
    studio: "",
  });
```

Update `openEditDialog`:

```typescript
  function openEditDialog(song: Song) {
    setEditingSong(song);
    setEditForm({
      title: song.title,
      artist: song.artist,
      album: song.album || "",
      album_artist: song.album_artist || "",
      track_number: song.track_number?.toString() || "",
      year: song.year?.toString() || "",
      genres: song.genres,
      studio: song.studio || "",
    });
  }
```

Update `handleSaveEdit`:

```typescript
  async function handleSaveEdit() {
    if (!editingSong) return;
    setSavingEdit(true);
    try {
      const updated = await updateAdminSong(editingSong.id, {
        title: editForm.title,
        artist: editForm.artist,
        album: editForm.album || undefined,
        album_artist: editForm.album_artist || undefined,
        track_number: editForm.track_number ? parseInt(editForm.track_number) : undefined,
        year: editForm.year ? parseInt(editForm.year) : undefined,
        genres: editForm.genres,
        studio: editForm.studio || undefined,
      });
      setSongs((prev) => prev.map((s) => (s.id === updated.id ? updated : s)));
      setEditingSong(null);
    } catch (e: any) {
      setError(e.message || "Failed to update song");
    } finally {
      setSavingEdit(false);
    }
  }
```

In the edit dialog JSX, replace the genre input field (around lines 1192–1198) with `MultiGenreField`. First add the import:

```tsx
import MultiGenreField from "../../components/admin/MultiGenreField";
```

Then replace:

```tsx
              <div>
                <label className="block text-xs text-surface-400 mb-1">Genre</label>
                <input
                  value={editForm.genre}
                  onChange={(e) => setEditForm((f) => ({ ...f, genre: e.target.value }))}
                  className="w-full bg-surface-800 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-1 focus:ring-aurora-500"
                />
              </div>
```

With:

```tsx
              <div className="col-span-2">
                <MultiGenreField
                  label="Genre"
                  values={editForm.genres}
                  onChange={(v) => setEditForm((f) => ({ ...f, genres: v }))}
                  existingValues={[]}
                />
              </div>
```

Note: we use `col-span-2` because the edit dialog grid is `grid-cols-2`. The genre picker spans both columns for better UX. Shift the Studio field to also be full width or keep it in the second column. Actually, since there are 8 fields (title, artist, album, album_artist, track_number, year, genre, studio) and genre now spans 2 cols, we can just place studio below:

```tsx
              <div className="col-span-2">
                <MultiGenreField
                  label="Genre"
                  values={editForm.genres}
                  onChange={(v) => setEditForm((f) => ({ ...f, genres: v }))}
                  existingValues={[]}
                />
              </div>
              <div>
                <label className="block text-xs text-surface-400 mb-1">Studio</label>
                <input
                  value={editForm.studio}
                  onChange={(e) => setEditForm((f) => ({ ...f, studio: e.target.value }))}
                  className="w-full bg-surface-800 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-1 focus:ring-aurora-500"
                />
              </div>
```

- [ ] **Step 2: Update `Player.tsx` to render multiple genre tags**

In `Player.tsx`, replace the single genre tag rendering (around lines 148–151):

```tsx
            <div className="flex flex-wrap items-center justify-center gap-2 mt-3">
              {currentSong.genres.map((genre) => (
                <span key={genre} className="text-xs font-medium bg-white/5 text-surface-400 px-2.5 py-1 rounded-full">
                  {genre}
                </span>
              ))}
              <span className="text-xs font-medium bg-white/5 text-surface-400 px-2.5 py-1 rounded-full uppercase">
                {currentSong.file_format}
              </span>
              {currentSong.bitrate_kbps && (
                <span className="text-xs font-medium bg-white/5 text-surface-400 px-2.5 py-1 rounded-full">
                  {currentSong.bitrate_kbps} kbps
                </span>
              )}
              {currentSong.studio && (
                <span className="text-xs font-medium bg-white/5 text-surface-400 px-2.5 py-1 rounded-full">
                  {currentSong.studio}
                </span>
              )}
            </div>
```

- [ ] **Step 3: Run frontend type check**

Run: `cd frontend && npx tsc --noEmit`
Expected: No type errors.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/pages/admin/AdminDashboard.tsx frontend/src/pages/Player.tsx
git commit -m "feat(frontend): update admin edit and player for multi-genre display"
```

---

## Self-Review

**Spec coverage:**
- Database schema with junction table — Task 1
- Migrate existing data and drop old column — Task 1
- Backend model changes (`genres: Vec<String>`) — Task 2
- Metadata extraction splitting delimiters — Task 4
- `commit_song` transactional genre insert — Task 4
- `update_song` transactional genre replacement — Task 5
- `list_values` queries `genres` table — Task 3
- `list_songs`, `get_song`, `list_admin_songs` populate genres — Tasks 3, 5
- Frontend types updated — Task 6
- `MultiGenreField` with chips + dialog — Task 7
- `EntityPickerDialog` multi-select mode — Task 7
- `SongMetadataForm` uses `MultiGenreField` — Task 7
- Admin edit dialog uses `MultiGenreField` — Task 8
- Player shows multiple genre tags — Task 8

**Placeholder scan:**
- No "TBD", "TODO", or "implement later" found.
- All code blocks contain actual implementation.
- No vague "add error handling" steps; error handling is inline in the shown code.

**Type consistency:**
- `Song.genres: Vec<String>` (Rust) and `genres: string[]` (TS) match.
- `SongDraft.genres: Vec<String>` (Rust) and `genres: string[]` (TS) match.
- `CommitSongRequest.genres: Vec<String>` matches frontend `SongDraft`.
- `UpdateSongBody.genres: Option<Vec<String>>` matches frontend API call.
- All backend query helpers use `SongDb` with `FromRow` and convert to `Song`.

**No gaps found.**

---

## Execution Handoff

**Plan complete and saved to `docs/superpowers/plans/2026-05-10-multi-genre.md`. Two execution options:**

**1. Subagent-Driven (recommended)** - I dispatch a fresh subagent per task, review between tasks, fast iteration

**2. Inline Execution** - Execute tasks in this session using executing-plans, batch execution with checkpoints for review

**Which approach?**

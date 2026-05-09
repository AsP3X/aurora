# Design: Multi-Genre Support for Songs

## Overview

Allow songs to be associated with multiple genres instead of a single genre string. This applies to the upload flow, song editing, and all genre displays across the app.

## Decisions Summary

| Decision | Choice |
|----------|--------|
| Storage | Junction table (`song_genres` + `genres`) |
| UI Picker | Chips in field + dialog for browsing/creating |
| Scope | Upload, edit, and display |
| Migration | Migrate existing genres to junction table, drop old `genre` column |

---

## 1. Database Schema

### New Tables

```sql
CREATE TABLE genres (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE
);

CREATE TABLE song_genres (
    song_id INTEGER NOT NULL REFERENCES songs(id) ON DELETE CASCADE,
    genre_id INTEGER NOT NULL REFERENCES genres(id) ON DELETE CASCADE,
    PRIMARY KEY (song_id, genre_id)
);
```

### Migration Plan

1. Create `genres` and `song_genres` tables.
2. Insert distinct existing `genre` values from `songs` into `genres`, normalized: trimmed and lowercased for deduplication. Genre names are stored lowercase in the database.
3. For each song with a non-null genre, insert a row into `song_genres` linking the song to the matching genre ID.
4. Drop the `genre` column from `songs`.

Both SQLite and Postgres get identical schema with dialect-specific migration files.

---

## 2. Backend API Changes

### Models & Types

- `Song` model: remove `genre: Option<String>`, add `genres: Vec<String>`.
- `SongDraft`: same change.
- `CommitSongRequest`: `genres: Vec<String>`.
- `UpdateSongBody`: `genres: Vec<String>`.
- `ExtractedMetadata`: `genres: Vec<String>`.

### Endpoints

| Endpoint | Change |
|----------|--------|
| `GET /api/v1/songs/values?field=genre` | Unchanged; still returns distinct genre names from the `genres` table. |
| `POST /api/v1/admin/songs/stage` | Metadata extraction: if ID3 `genre` tag contains delimiters (`/`, `;`, `,`), split into multiple strings; otherwise single-item array. |
| `POST /api/v1/admin/songs/commit` | Accepts `genres` array. Transactionally inserts into `genres` (if missing) and `song_genres`. |
| `PUT /api/v1/admin/songs/{id}` | Accepts `genres` array. Transactionally deletes old `song_genres` rows for this song, then re-inserts new ones with upsert into `genres`. |

### SQL Patterns

- **Fetch song genres:**
  ```sql
  SELECT g.name FROM genres g
  JOIN song_genres sg ON g.id = sg.genre_id
  WHERE sg.song_id = $1;
  ```

- **Update song genres (transaction):**
  1. `DELETE FROM song_genres WHERE song_id = $1`
  2. For each genre name in request:
     - `INSERT OR IGNORE INTO genres (name) VALUES ($name)`
     - `INSERT INTO song_genres (song_id, genre_id) VALUES ($1, last_insert_rowid() OR SELECT id FROM genres WHERE name = $name)`

---

## 3. Frontend UI Changes

### Type Updates

- `Song.genre: string | null` → `genres: string[]`
- `SongDraft.genre: string | null` → `genres: string[]`

### Components

#### `MultiGenreField` (new)
- Replaces `EntityField` usage for genre in `SongMetadataForm`.
- Shows selected genres as chips inside/below the input.
- Each chip has a remove button (`x`).
- Clicking the field opens `EntityPickerDialog` in multi-select mode.

#### `EntityPickerDialog` (updated)
- New prop: `multiSelect?: boolean`.
- When `multiSelect` is true:
  - Each item shows a checkbox.
  - Already-selected items are pre-checked when the dialog opens.
  - Selections toggle on click.
  - A "Done" button closes the dialog and returns the array of selected values.
- Free-text creation still works: type a new name, press Enter, and it becomes a selected chip.

### Display Updates

- **Admin Library table:** genres shown as comma-separated text (e.g. "rock, electronic").
- **Player / metadata views:** show all genres, comma-separated.

---

## 4. Data Flow

### Upload Flow

1. User uploads audio file.
2. Backend extracts metadata. If ID3 `genre` contains `/`, `;`, or `,`, split into multiple genre strings.
3. Frontend receives `SongDraft` with `genres: string[]`.
4. User reviews metadata in `UploadSongDialog`. They can add/remove genres via `MultiGenreField`.
5. On commit, frontend sends `genres` array in `CommitSongRequest`.
6. Backend transactionally inserts into `genres` and `song_genres`.

### Edit Flow

1. Admin clicks "Edit" on a song.
2. Frontend loads song with `genres: string[]`.
3. User modifies genres via `MultiGenreField`.
4. On save, frontend sends `genres` array in `UpdateSongBody`.
5. Backend replaces all genre associations for that song in a transaction.

---

## 5. Testing Considerations

- Upload a song with a single genre → stored correctly.
- Upload a song with delimited genres in ID3 tag → split and stored as multiple.
- Edit a song: remove all genres, add new ones, mix existing and new.
- Ensure `genres` table deduplication works (same name not inserted twice).
- Verify migration: existing songs retain their genre after migration.

---

## 6. Risks & Mitigations

| Risk | Mitigation |
|------|------------|
| Migration fails on large dataset | Test migration in a transaction; rollback on error. |
| Genre name case sensitivity | Normalize for deduplication; decide on display case. |
| ID3 genre splitting is ambiguous | Only split on explicit delimiters (`/`, `;`, `,`). |


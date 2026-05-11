# Upload Defaults Design

**Date:** 2026-05-11

## Overview

Three improvements to the song upload flow: title always defaults to the audio filename, artist and album artist share one suggestion pool, and the track number is auto-calculated from the album's existing song count with a "Single" badge when no album is set.

---

## 1. Title — Always Use Filename

### Current behavior
`extract_metadata()` in `backend/src/admin/upload.rs` reads `tag.title()` from the embedded audio tags and falls back to `path.file_stem()` only when no tag title is present.

### Change
Remove the `tag.title()` read. Always derive the title from `path.file_stem()` (the filename with the extension stripped). All other tag fields (artist, album artist, track number, year, genres) continue to be read from embedded tags unchanged.

### Files affected
- `backend/src/admin/upload.rs` — `extract_metadata()`, lines 84–91

---

## 2. Shared Artist / Album Artist Suggestion Pool

### Current behavior
`SongMetadataForm.tsx` fetches `fetchValues("artist")` and `fetchValues("album_artist")` independently and passes each list to its respective `EntityField` as `existingValues`.

### Change
After both lists are fetched, merge and deduplicate them into a single sorted array. Pass this merged list to both the Artist and Album Artist `EntityField` components. No backend changes needed — the `GET /api/v1/songs/values` endpoint and `fetchValues` client helper are unchanged.

### Files affected
- `frontend/src/components/admin/SongMetadataForm.tsx` — merge logic in the `useEffect` that fetches values

---

## 3. Track Number — Auto-Calculation and Single Badge

### 3a. New backend endpoint

Add `GET /api/v1/songs/album-song-count?album=<name>` (protected route).

**Handler:** `songs/handlers.rs` — new `album_song_count` handler
```
SELECT COUNT(*) FROM songs WHERE album = $1 AND enabled = true
```
Returns `{"count": N}` as JSON.

**Registration:** `main.rs` — add route under `protected_routes`

### 3b. Frontend auto-calculation

In `SongMetadataForm.tsx`, a `useEffect` watches `draft.album`:
- When album changes to a non-empty string: call the new endpoint, set `draft.track_number = count + 1`
- When album changes to null/empty: clear `draft.track_number` to null

### 3c. Display format

Change the track number `<input>` from `type="number"` to `type="text"`. Display stored integers zero-padded to 2 digits (e.g. `3` → `"03"`). On user input, parse the string back to an integer before updating the draft. The database column `track_number` remains `Option<i32>` — no schema migration needed.

### 3d. Single badge

When `draft.album` is null or empty string, hide the track number input and render a `"Single"` text badge in its place, styled consistently with the read-only info chips (duration, format, bitrate) at the bottom of the form. The input reappears immediately when an album is selected.

### Files affected
- `backend/src/songs/handlers.rs` — new `album_song_count` handler + `AlbumCountParams` struct
- `backend/src/main.rs` — register new route
- `frontend/src/api/client.ts` — new `fetchAlbumSongCount(album: string): Promise<number>` helper
- `frontend/src/components/admin/SongMetadataForm.tsx` — `useEffect` on album, text input with zero-pad, Single badge

---

## Data Flow

```
User selects file
  → backend stages file, title = file_stem (no tag read)
  → SongDraft returned to frontend

Form mounts
  → fetchValues("artist") + fetchValues("album_artist") fetched in parallel
  → results merged + deduped → both EntityFields receive merged list

User picks an album
  → GET /api/v1/songs/album-song-count?album=<name>
  → track_number set to count + 1, displayed as "0N"

User clears album
  → track_number cleared, "Single" badge shown
```

---

## Out of Scope

- Changing the DB schema for track_number (stays `Option<i32>`)
- Auto-copying artist into album artist (separate suggestion pool is sufficient)
- Any changes to the commit endpoint or other upload stages

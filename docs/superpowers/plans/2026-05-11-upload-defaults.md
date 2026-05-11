# Upload Defaults Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Three upload UX improvements — title always defaults to the filename, artist and album artist share one suggestion pool, and track number auto-calculates from album song count with a "Single" badge when no album is set.

**Architecture:** One backend change strips the tag-title read from `extract_metadata`; a new protected endpoint returns the song count for a given album; three frontend changes wire up the merged suggestion pool, the auto-calculated track number, and the Single badge.

**Tech Stack:** Rust / Axum / sqlx (backend), React / TypeScript (frontend), no existing test suite — verification via `cargo check` and `tsc --noEmit`.

---

## File Map

| File | Action | Responsibility |
|------|--------|----------------|
| `backend/src/admin/upload.rs` | Modify lines 84–91 | Always use `file_stem` for title |
| `backend/src/songs/handlers.rs` | Modify — add handler + struct | `album_song_count` endpoint |
| `backend/src/main.rs` | Modify — add route | Register `GET /api/v1/songs/album-song-count` |
| `frontend/src/api/client.ts` | Modify — add helper | `fetchAlbumSongCount` |
| `frontend/src/components/admin/SongMetadataForm.tsx` | Modify | Merged pool, auto track number, Single badge |

---

## Task 1: Title always from filename

**Files:**
- Modify: `backend/src/admin/upload.rs:84–91`

- [ ] **Step 1: Make the change**

In `backend/src/admin/upload.rs`, find the title extraction inside `extract_metadata`. The current code (lines 84–91) reads:

```rust
                    tag.title()
                        .as_deref()
                        .unwrap_or_else(|| {
                            path.file_stem()
                                .and_then(|s| s.to_str())
                                .unwrap_or("Unknown")
                        })
                        .to_string(),
```

Replace with:

```rust
                    path.file_stem()
                        .and_then(|s| s.to_str())
                        .unwrap_or("Unknown")
                        .to_string(),
```

The surrounding tuple structure does not change. Only the title expression is replaced. The artist, album, album_artist, track_number, year, and genres reads from `tag` remain exactly as they are.

- [ ] **Step 2: Type-check**

```bash
cd backend && cargo check
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add backend/src/admin/upload.rs
git commit -m "feat(upload): always use filename as default title, ignore embedded tag title"
```

---

## Task 2: Album song count endpoint

**Files:**
- Modify: `backend/src/songs/handlers.rs` — add struct + handler after the `list_values` function (after line 91)
- Modify: `backend/src/main.rs` — register route

- [ ] **Step 1: Add the params struct and handler**

In `backend/src/songs/handlers.rs`, after the closing `}` of `list_values` (after line 91), insert:

```rust
#[derive(Debug, Deserialize)]
pub struct AlbumCountParams {
    pub album: String,
}

pub async fn album_song_count(
    State(state): State<Arc<AppState>>,
    claims: axum::Extension<crate::auth::Claims>,
    Query(params): Query<AlbumCountParams>,
) -> Result<Json<serde_json::Value>, AppError> {
    require_permission(&state.pool, &claims.sub, "library.view").await?;

    let row: (i64,) = sqlx::query_as(
        "SELECT COUNT(*) FROM songs WHERE album = $1 AND enabled = true",
    )
    .bind(&params.album)
    .fetch_one(&state.pool)
    .await?;

    Ok(Json(serde_json::json!({ "count": row.0 })))
}
```

- [ ] **Step 2: Register the route**

In `backend/src/main.rs`, find the block of protected routes. The `values` route is already registered before the `{id}` wildcard — add `album-song-count` in the same position, immediately after the `values` route:

```rust
        .route("/api/v1/songs/values", get(songs::handlers::list_values))
        .route("/api/v1/songs/album-song-count", get(songs::handlers::album_song_count))
```

The `album-song-count` route must come before any `{id}` wildcard route so Axum does not treat the literal path segment as an id.

- [ ] **Step 3: Type-check**

```bash
cd backend && cargo check
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add backend/src/songs/handlers.rs backend/src/main.rs
git commit -m "feat(api): add GET /songs/album-song-count endpoint"
```

---

## Task 3: Frontend API helper

**Files:**
- Modify: `frontend/src/api/client.ts` — add `fetchAlbumSongCount` after `fetchValues`

- [ ] **Step 1: Add the helper**

In `frontend/src/api/client.ts`, immediately after the closing `}` of `fetchValues` (currently ending around line 362), insert:

```typescript
export async function fetchAlbumSongCount(album: string): Promise<number> {
  const qs = new URLSearchParams({ album });
  const result = await apiFetch(`/songs/album-song-count?${qs.toString()}`) as { count: number };
  return result.count;
}
```

- [ ] **Step 2: Type-check**

```bash
cd frontend && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/api/client.ts
git commit -m "feat(api): add fetchAlbumSongCount client helper"
```

---

## Task 4: Merged artist / album artist suggestion pool

**Files:**
- Modify: `frontend/src/components/admin/SongMetadataForm.tsx`

- [ ] **Step 1: Update the import**

At the top of `SongMetadataForm.tsx`, find the existing import line:

```typescript
import { fetchValues } from "../../api/client";
```

Replace with:

```typescript
import { fetchValues, fetchAlbumSongCount } from "../../api/client";
```

(`fetchAlbumSongCount` is needed here for Task 5 too — importing it now avoids a second edit.)

- [ ] **Step 2: Merge the artist lists**

Inside the `useEffect` in `SongMetadataForm.tsx`, find the `.then` callback:

```typescript
      .then(([artists, albums, albumArtists, genres, studios]) => {
        if (cancelled) return;
        setExistingValues({
          artist: artists,
          album: albums,
          album_artist: albumArtists,
          genre: genres,
          studio: studios,
        });
      })
```

Replace with:

```typescript
      .then(([artists, albums, albumArtists, genres, studios]) => {
        if (cancelled) return;
        const mergedArtists = Array.from(new Set([...artists, ...albumArtists])).sort();
        setExistingValues({
          artist: mergedArtists,
          album: albums,
          album_artist: mergedArtists,
          genre: genres,
          studio: studios,
        });
      })
```

- [ ] **Step 3: Type-check**

```bash
cd frontend && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/admin/SongMetadataForm.tsx
git commit -m "feat(upload): merge artist and album artist into shared suggestion pool"
```

---

## Task 5: Track number — auto-calculation, zero-pad display, Single badge

**Files:**
- Modify: `frontend/src/components/admin/SongMetadataForm.tsx`

- [ ] **Step 1: Add the album-change effect**

In `SongMetadataForm.tsx`, after the existing `useEffect` that fetches entity values (the one with the `Promise.all` + `cancelled` guard), insert a second `useEffect`:

```typescript
  useEffect(() => {
    let cancelled = false;

    if (!draft.album) {
      onChange({ ...draft, track_number: null });
      return;
    }

    fetchAlbumSongCount(draft.album)
      .then((count) => {
        if (!cancelled) {
          onChange({ ...draft, track_number: count + 1 });
        }
      })
      .catch(console.error);

    return () => {
      cancelled = true;
    };
  }, [draft.album]); // eslint-disable-line react-hooks/exhaustive-deps
```

- [ ] **Step 2: Replace the track number input with zero-pad + Single badge**

Find the current track number `<div>` in the JSX (lines 105–117):

```tsx
      <div>
        <label className={labelClass}>Track Number</label>
        <input
          className={inputClass}
          type="number"
          value={draft.track_number ?? ""}
          onChange={(e) => {
            const val = e.target.value ? parseInt(e.target.value, 10) : null;
            update("track_number", val);
          }}
          placeholder="Optional"
        />
      </div>
```

Replace with:

```tsx
      <div>
        {!draft.album ? (
          <div className="flex h-[38px] items-center">
            <span className="rounded-full bg-surface-800 px-2 py-0.5 text-xs font-medium text-surface-400">
              Single
            </span>
          </div>
        ) : (
          <>
            <label className={labelClass}>Track Number</label>
            <input
              className={inputClass}
              type="text"
              value={
                draft.track_number !== null && draft.track_number !== undefined
                  ? String(draft.track_number).padStart(2, "0")
                  : ""
              }
              onChange={(e) => {
                const val = parseInt(e.target.value, 10);
                update("track_number", isNaN(val) ? null : val);
              }}
              placeholder="01"
            />
          </>
        )}
      </div>
```

- [ ] **Step 3: Type-check**

```bash
cd frontend && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/admin/SongMetadataForm.tsx
git commit -m "feat(upload): auto-set track number from album count, zero-pad display, Single badge"
```

---

## Manual Verification Checklist

After all tasks are complete, start the app and verify:

- [ ] Upload a file that has an embedded title tag — confirm the title field shows the filename (without extension), not the embedded tag title
- [ ] Upload a file with no tags — confirm the title field shows the filename
- [ ] In the Artist field, type the name of an existing album artist — confirm it appears as a suggestion
- [ ] In the Album Artist field, type the name of an existing artist — confirm it appears as a suggestion
- [ ] Select an album that already has 3 songs — confirm Track Number auto-fills as `"04"` (count = 3, next track = 4)
- [ ] Clear the album — confirm the track number input disappears and "Single" badge appears
- [ ] Select an album, then manually change the track number — confirm the manually entered value is preserved
- [ ] Select an album with zero existing songs — confirm Track Number shows `"01"`

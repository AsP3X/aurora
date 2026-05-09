# Entity Picker Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace plain text inputs for Artist, Album, Album Artist, Genre, and Studio in `SongMetadataForm` with button-triggered fuzzy-search dialogs backed by a new `/songs/values` backend endpoint.

**Architecture:** A single backend endpoint (`GET /songs/values`) returns distinct column values from the `songs` table. The frontend fetches these on mount and passes them into a reusable `EntityPickerDialog` that uses `fuse.js` for client-side fuzzy filtering. Two new components — `EntityField` (button + clear) and `EntityPickerDialog` (search + list + create) — are wired into `SongMetadataForm`.

**Tech Stack:** Rust (axum + sqlx), React 19 + TypeScript, Tailwind CSS v4, fuse.js

---

## File Structure

| File | Action | Responsibility |
|------|--------|--------------|
| `backend/src/songs/handlers.rs` | Modify | Add `list_values` handler and `ValuesParams` struct |
| `backend/src/main.rs` | Modify | Register `GET /api/v1/songs/values` route in `protected_routes` |
| `frontend/src/api/client.ts` | Modify | Add `fetchValues` API helper |
| `frontend/package.json` | Modify | Add `fuse.js` dependency |
| `frontend/src/components/admin/EntityPickerDialog.tsx` | Create | Reusable fuzzy-search picker dialog |
| `frontend/src/components/admin/EntityField.tsx` | Create | Button-like field that opens the picker |
| `frontend/src/components/admin/SongMetadataForm.tsx` | Modify | Use `EntityField` for 5 metadata fields, fetch values on mount |

---

## Task 1: Backend `GET /api/v1/songs/values` endpoint

**Files:**
- Modify: `backend/src/songs/handlers.rs`
- Modify: `backend/src/main.rs`

- [ ] **Step 1: Add request struct and handler to `songs/handlers.rs`**

Add below the existing `ListParams` struct and before `list_songs`:

```rust
#[derive(Debug, Deserialize)]
pub struct ValuesParams {
    pub field: String,
    #[serde(default)]
    pub q: Option<String>,
    #[serde(default = "default_values_limit")]
    pub limit: i64,
}

fn default_values_limit() -> i64 { 50 }

pub async fn list_values(
    State(state): State<Arc<AppState>>,
    claims: axum::Extension<crate::auth::Claims>,
    Query(params): Query<ValuesParams>,
) -> Result<Json<Vec<String>>, AppError> {
    require_permission(&state.pool, &claims.sub, "library.view").await?;

    let column = match params.field.as_str() {
        "artist" => "artist",
        "album" => "album",
        "album_artist" => "album_artist",
        "genre" => "genre",
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

- [ ] **Step 2: Register the route in `main.rs`**

In `create_router`, inside `protected_routes`, add this line immediately after the `/api/v1/songs` route:

```rust
.route("/api/v1/songs/values", get(songs::handlers::list_values))
```

- [ ] **Step 3: Verify backend compiles**

Run:
```bash
cd backend && cargo check
```

Expected: no errors. If `AppError::BadRequest` doesn't exist, check `backend/src/error.rs` and add it if needed:

```rust
#[derive(Debug)]
pub enum AppError {
    // ... existing variants ...
    BadRequest(String),
}
```

And add the corresponding `IntoResponse` arm:

```rust
AppError::BadRequest(msg) => (
    StatusCode::BAD_REQUEST,
    Json(serde_json::json!({"error": msg})),
).into_response(),
```

- [ ] **Step 4: Commit**

```bash
git add backend/src/songs/handlers.rs backend/src/main.rs backend/src/error.rs
git commit -m "feat(api): add GET /songs/values endpoint for metadata entity picker"
```

---

## Task 2: Frontend API helper `fetchValues`

**Files:**
- Modify: `frontend/src/api/client.ts`

- [ ] **Step 1: Add `fetchValues` function**

Add to the bottom of `frontend/src/api/client.ts`, before the `stageSong` function:

```typescript
export async function fetchValues(
  field: "artist" | "album" | "album_artist" | "genre" | "studio",
  q?: string,
  limit?: number
) {
  const qs = new URLSearchParams();
  qs.set("field", field);
  if (q) qs.set("q", q);
  if (limit !== undefined) qs.set("limit", String(limit));
  return apiFetch(`/songs/values?${qs.toString()}`) as Promise<string[]>;
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/api/client.ts
git commit -m "feat(api): add fetchValues client helper"
```

---

## Task 3: Install `fuse.js`

**Files:**
- Modify: `frontend/package.json`
- Create: `pnpm-lock.yaml` (updated automatically)

- [ ] **Step 1: Install the dependency**

Run:
```bash
cd frontend && pnpm add fuse.js
```

Expected: `fuse.js` added to `dependencies` in `package.json`.

- [ ] **Step 2: Commit**

```bash
git add frontend/package.json frontend/pnpm-lock.yaml
git commit -m "chore(deps): add fuse.js for fuzzy search"
```

---

## Task 4: Create `EntityPickerDialog` component

**Files:**
- Create: `frontend/src/components/admin/EntityPickerDialog.tsx`

- [ ] **Step 1: Write the component**

```tsx
import { useState, useEffect, useRef, useMemo } from "react";
import Fuse from "fuse.js";

interface EntityPickerDialogProps {
  open: boolean;
  onClose: () => void;
  onSelect: (value: string) => void;
  title: string;
  existingValues: string[];
  currentValue: string | null;
}

const inputClass =
  "w-full rounded-lg border border-surface-700 bg-surface-900 px-3 py-2 text-sm text-white placeholder-surface-500 focus:border-aurora-400 focus:outline-none";

export default function EntityPickerDialog({
  open,
  onClose,
  onSelect,
  title,
  existingValues,
  currentValue,
}: EntityPickerDialogProps) {
  const [query, setQuery] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setQuery("");
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open]);

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

  const handleSelect = (value: string) => {
    onSelect(value);
    onClose();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && query.trim()) {
      e.preventDefault();
      if (results.length > 0) {
        handleSelect(results[0]);
      } else {
        handleSelect(query.trim());
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
            {results.map((value) => (
              <li key={value}>
                <button
                  onClick={() => handleSelect(value)}
                  className={`w-full rounded-lg px-3 py-2 text-left text-sm transition-colors ${
                    value === currentValue
                      ? "bg-aurora-600/20 text-aurora-400"
                      : "text-white hover:bg-surface-800"
                  }`}
                >
                  {value}
                </button>
              </li>
            ))}
          </ul>

          {query.trim() && !results.includes(query.trim()) && (
            <button
              onClick={() => handleSelect(query.trim())}
              className="mt-2 w-full rounded-lg px-3 py-2 text-left text-sm text-aurora-400 hover:bg-surface-800 hover:text-aurora-300"
            >
              Create &quot;{query.trim()}&quot;
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/components/admin/EntityPickerDialog.tsx
git commit -m "feat(ui): add EntityPickerDialog with fuse.js fuzzy search"
```

---

## Task 5: Create `EntityField` component

**Files:**
- Create: `frontend/src/components/admin/EntityField.tsx`

- [ ] **Step 1: Write the component**

```tsx
import { useState } from "react";
import EntityPickerDialog from "./EntityPickerDialog";

interface EntityFieldProps {
  label: string;
  value: string | null;
  onChange: (value: string | null) => void;
  entityType: "artist" | "album" | "album_artist" | "genre" | "studio";
  existingValues: string[];
}

const labelClass = "mb-1 block text-xs font-medium text-surface-300";

export default function EntityField({
  label,
  value,
  onChange,
  entityType,
  existingValues,
}: EntityFieldProps) {
  const [open, setOpen] = useState(false);

  return (
    <div>
      <label className={labelClass}>{label}</label>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="w-full rounded-lg border border-surface-700 bg-surface-900 px-3 py-2 text-left text-sm text-white transition-colors hover:border-surface-600 focus:border-aurora-400 focus:outline-none"
        >
          {value ?? (
            <span className="text-surface-500">
              Select {label.toLowerCase()}...
            </span>
          )}
        </button>
        {value && (
          <button
            type="button"
            onClick={() => onChange(null)}
            className="shrink-0 rounded-md p-1.5 text-surface-500 hover:bg-surface-800 hover:text-white"
            title="Clear"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="h-4 w-4"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        )}
      </div>

      <EntityPickerDialog
        open={open}
        onClose={() => setOpen(false)}
        onSelect={onChange}
        title={`Select ${label}`}
        existingValues={existingValues}
        currentValue={value}
      />
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/components/admin/EntityField.tsx
git commit -m "feat(ui): add EntityField button component with clear action"
```

---

## Task 6: Update `SongMetadataForm` to use entity fields

**Files:**
- Modify: `frontend/src/components/admin/SongMetadataForm.tsx`

- [ ] **Step 1: Import dependencies and add state**

Replace the top of `SongMetadataForm.tsx` with:

```tsx
import { useState, useEffect } from "react";
import type { SongDraft } from "../../types";
import EntityField from "./EntityField";
import { fetchValues } from "../../api/client";

interface SongMetadataFormProps {
  draft: SongDraft;
  onChange: (draft: SongDraft) => void;
}

const inputClass =
  "w-full rounded-lg border border-surface-700 bg-surface-900 px-3 py-2 text-sm text-white placeholder-surface-500 focus:border-aurora-400 focus:outline-none";

const labelClass = "mb-1 block text-xs font-medium text-surface-300";

type EntityType = "artist" | "album" | "album_artist" | "genre" | "studio";
```

- [ ] **Step 2: Add hook to fetch values**

Inside `SongMetadataForm`, before the `update` helper, add:

```tsx
  const [existingValues, setExistingValues] = useState<Record<EntityType, string[]>>({
    artist: [],
    album: [],
    album_artist: [],
    genre: [],
    studio: [],
  });

  useEffect(() => {
    let cancelled = false;

    Promise.all([
      fetchValues("artist"),
      fetchValues("album"),
      fetchValues("album_artist"),
      fetchValues("genre"),
      fetchValues("studio"),
    ])
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
      .catch((err) => {
        if (!cancelled) {
          console.error("Failed to fetch existing values:", err);
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);
```

- [ ] **Step 3: Replace the five metadata inputs with `EntityField`**

In the JSX, replace the `artist` input block:

```tsx
      <div className="sm:col-span-2">
        <label className={labelClass}>Artist *</label>
        <input
          className={inputClass}
          value={draft.artist}
          onChange={(e) => update("artist", e.target.value)}
          required
        />
      </div>
```

with:

```tsx
      <div className="sm:col-span-2">
        <EntityField
          label="Artist *"
          value={draft.artist}
          onChange={(v) => update("artist", v ?? "")}
          entityType="artist"
          existingValues={existingValues.artist}
        />
      </div>
```

Replace the `album` input block:

```tsx
      <div>
        <label className={labelClass}>Album</label>
        <input
          className={inputClass}
          value={draft.album ?? ""}
          onChange={(e) => update("album", e.target.value || null)}
          placeholder="Optional"
        />
      </div>
```

with:

```tsx
      <div>
        <EntityField
          label="Album"
          value={draft.album}
          onChange={(v) => update("album", v)}
          entityType="album"
          existingValues={existingValues.album}
        />
      </div>
```

Replace the `album_artist` input block:

```tsx
      <div>
        <label className={labelClass}>Album Artist</label>
        <input
          className={inputClass}
          value={draft.album_artist ?? ""}
          onChange={(e) => update("album_artist", e.target.value || null)}
          placeholder="Optional"
        />
      </div>
```

with:

```tsx
      <div>
        <EntityField
          label="Album Artist"
          value={draft.album_artist}
          onChange={(v) => update("album_artist", v)}
          entityType="album_artist"
          existingValues={existingValues.album_artist}
        />
      </div>
```

Replace the `genre` input block:

```tsx
      <div>
        <label className={labelClass}>Genre</label>
        <input
          className={inputClass}
          value={draft.genre ?? ""}
          onChange={(e) => update("genre", e.target.value || null)}
          placeholder="Optional"
        />
      </div>
```

with:

```tsx
      <div>
        <EntityField
          label="Genre"
          value={draft.genre}
          onChange={(v) => update("genre", v)}
          entityType="genre"
          existingValues={existingValues.genre}
        />
      </div>
```

Replace the `studio` input block:

```tsx
      <div>
        <label className={labelClass}>Studio / Label</label>
        <input
          className={inputClass}
          value={draft.studio ?? ""}
          onChange={(e) => update("studio", e.target.value || null)}
          placeholder="Optional"
        />
      </div>
```

with:

```tsx
      <div>
        <EntityField
          label="Studio / Label"
          value={draft.studio}
          onChange={(v) => update("studio", v)}
          entityType="studio"
          existingValues={existingValues.studio}
        />
      </div>
```

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/admin/SongMetadataForm.tsx
git commit -m "feat(ui): integrate EntityField into SongMetadataForm"
```

---

## Task 7: Verification

**Files:**
- None (manual check)

- [ ] **Step 1: Verify backend compiles**

Run:
```bash
cd backend && cargo check
```

Expected: clean compile.

- [ ] **Step 2: Verify frontend compiles**

Run:
```bash
cd frontend && pnpm run build
```

Expected: clean build with no TypeScript or lint errors.

- [ ] **Step 3: Manual end-to-end test**

1. Start the backend (`cargo run` in `backend/`).
2. Start the frontend (`pnpm dev` in `frontend/`).
3. Log in and upload a song.
4. On the metadata editing screen, click "Artist" — the `EntityPickerDialog` should open.
5. Type in the search box — existing artists should filter via fuzzy search.
6. Click an existing artist or "Create '...'" — the dialog closes and the button updates.
7. Verify the "×" clear button works.
8. Repeat for Album, Album Artist, Genre, and Studio.

---

## Spec Coverage Checklist

| Spec Requirement | Task |
|------------------|------|
| `GET /songs/values` endpoint with `field`, `q`, `limit` | Task 1 |
| Whitelist validation for `field` parameter | Task 1 |
| `400 Bad Request` for invalid field | Task 1 |
| `fetchValues` frontend helper | Task 2 |
| `fuse.js` dependency | Task 3 |
| `EntityPickerDialog` with fuzzy search | Task 4 |
| `EntityField` with button + clear icon | Task 5 |
| `SongMetadataForm` uses `EntityField` for 5 fields | Task 6 |
| Parallel fetch of all values on mount | Task 6 |
| Error handling (silent fail on fetch) | Task 6 |
| Dark theme styling | Tasks 4, 5 |
| Enter to select top result, Escape to close | Task 4 |

## Placeholder Scan

- No "TBD", "TODO", or vague steps.
- Every code block contains complete, copy-pasteable code.
- Exact file paths are provided for every step.
- Commands include expected output.

## Type Consistency Check

- `EntityPickerDialogProps.onSelect` receives `string` — matches `EntityField.onSelect` and `SongMetadataForm` update calls.
- `EntityFieldProps.entityType` union matches `fetchValues` field parameter.
- `SongDraft` fields (`artist`, `album`, `album_artist`, `genre`, `studio`) are correctly mapped.
- `AppError::BadRequest` is used in the handler and mapped to HTTP 400.

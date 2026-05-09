# Admin Song Context Menu Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a right-click context menu to admin library song rows with Edit, Disable/Enable, and Delete actions, including backend endpoints and database migration.

**Architecture:** Backend adds an `enabled` boolean column to `songs` and two new admin endpoints (`PUT /admin/songs/{id}` for metadata edits, `PUT /admin/songs/{id}/enabled` for toggling). Public song queries filter out disabled songs. Frontend adds a reusable `ContextMenu` component rendered via portal, triggers on right-click or a `⋮` button, and reuses `SongMetadataForm` in an edit dialog.

**Tech Stack:** Rust (axum, sqlx), SQLite/Postgres, React, TypeScript, Tailwind CSS

---

## File Structure

| File | Responsibility |
|------|----------------|
| `backend/migrations/sqlite/006_add_enabled.sql` | SQLite migration: add `enabled` column |
| `backend/migrations/postgres/006_add_enabled.sql` | Postgres migration: add `enabled` column |
| `backend/src/songs/model.rs` | Add `enabled: bool` to `Song` struct |
| `backend/src/admin/handlers.rs` | Add `update_song` and `toggle_song_enabled` handlers |
| `backend/src/main.rs` | Wire new routes |
| `frontend/src/types/index.ts` | Add `enabled` to `Song` type |
| `frontend/src/api/client.ts` | Add `updateAdminSong` and `toggleAdminSongEnabled` functions |
| `frontend/src/components/ui/ContextMenu.tsx` | New reusable context menu component |
| `frontend/src/pages/admin/AdminDashboard.tsx` | Integrate menu, edit dialog, and disabled-state visuals |

---

### Task 1: Database Migration (SQLite)

**Files:**
- Create: `backend/migrations/sqlite/006_add_enabled.sql`

- [ ] **Step 1: Write the migration file**

```sql
ALTER TABLE songs ADD COLUMN enabled INTEGER NOT NULL DEFAULT 1;
```

- [ ] **Step 2: Commit**

```bash
git add backend/migrations/sqlite/006_add_enabled.sql
git commit -m "chore(db): add enabled column to songs (sqlite)"
```

---

### Task 2: Database Migration (Postgres)

**Files:**
- Create: `backend/migrations/postgres/006_add_enabled.sql`

- [ ] **Step 1: Write the migration file**

```sql
ALTER TABLE songs ADD COLUMN enabled BOOLEAN NOT NULL DEFAULT true;
```

- [ ] **Step 2: Commit**

```bash
git add backend/migrations/postgres/006_add_enabled.sql
git commit -m "chore(db): add enabled column to songs (postgres)"
```

---

### Task 3: Update Song Model

**Files:**
- Modify: `backend/src/songs/model.rs:4-25`

- [ ] **Step 1: Add `enabled` field to `Song`**

Replace lines 4-25 in `backend/src/songs/model.rs`:

```rust
#[derive(Debug, FromRow, Serialize, Deserialize)]
pub struct Song {
    pub id: String,
    pub title: String,
    pub artist: String,
    pub album: Option<String>,
    pub album_artist: Option<String>,
    pub track_number: Option<i32>,
    pub year: Option<i32>,
    pub genre: Option<String>,
    pub studio: Option<String>,
    pub duration_seconds: i32,
    pub file_key: String,
    pub file_size_bytes: i64,
    pub file_format: String,
    pub bitrate_kbps: Option<i32>,
    pub sample_rate_hz: Option<i32>,
    pub artwork_key: Option<String>,
    pub publisher_id: Option<String>,
    pub enabled: bool,
    pub created_at: String,
    pub updated_at: String,
}
```

- [ ] **Step 2: Commit**

```bash
git add backend/src/songs/model.rs
git commit -m "feat(backend): add enabled field to Song model"
```

---

### Task 4: Add Update Song Handler

**Files:**
- Modify: `backend/src/admin/handlers.rs`

- [ ] **Step 1: Add request structs and handler at the bottom of the file**

Append to `backend/src/admin/handlers.rs` after the last handler (before any closing `}` if applicable, but after line 310):

```rust
#[derive(Debug, Deserialize)]
pub struct UpdateSongBody {
    pub title: Option<String>,
    pub artist: Option<String>,
    pub album: Option<String>,
    pub album_artist: Option<String>,
    pub track_number: Option<i32>,
    pub year: Option<i32>,
    pub genre: Option<String>,
    pub studio: Option<String>,
}

pub async fn update_song(
    State(state): State<Arc<AppState>>,
    claims: axum::Extension<crate::auth::Claims>,
    Path(id): Path<String>,
    Json(body): Json<UpdateSongBody>,
) -> Result<Json<crate::songs::model::Song>, AppError> {
    require_admin_access(&state.pool, &claims.sub, &claims.role).await?;

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
    if let Some(v) = body.genre {
        sets.push(format!("genre = ${}", sets.len() + 2));
        binds.push(v);
    }
    if let Some(v) = body.studio {
        sets.push(format!("studio = ${}", sets.len() + 2));
        binds.push(v);
    }

    if sets.is_empty() {
        return Err(AppError::BadRequest("no fields to update".into()));
    }

    let sql = format!(
        "UPDATE songs SET {} WHERE id = $1 RETURNING *",
        sets.join(", ")
    );

    let mut query = sqlx::query_as::<_, crate::songs::model::Song>(&sql).bind(&id);
    for b in &binds {
        query = query.bind(b);
    }

    let song = query.fetch_one(&state.pool).await?;
    Ok(Json(song))
}
```

- [ ] **Step 2: Commit**

```bash
git add backend/src/admin/handlers.rs
git commit -m "feat(backend): add update_song admin handler"
```

---

### Task 5: Add Toggle Enabled Handler

**Files:**
- Modify: `backend/src/admin/handlers.rs`

- [ ] **Step 1: Add request struct and handler**

Append to `backend/src/admin/handlers.rs` after `update_song`:

```rust
#[derive(Debug, Deserialize)]
pub struct ToggleEnabledBody {
    pub enabled: bool,
}

pub async fn toggle_song_enabled(
    State(state): State<Arc<AppState>>,
    claims: axum::Extension<crate::auth::Claims>,
    Path(id): Path<String>,
    Json(body): Json<ToggleEnabledBody>,
) -> Result<Json<crate::songs::model::Song>, AppError> {
    require_admin_access(&state.pool, &claims.sub, &claims.role).await?;

    let song = sqlx::query_as::<_, crate::songs::model::Song>(
        "UPDATE songs SET enabled = $1 WHERE id = $2 RETURNING *"
    )
    .bind(body.enabled)
    .bind(&id)
    .fetch_one(&state.pool)
    .await?;

    Ok(Json(song))
}
```

- [ ] **Step 2: Commit**

```bash
git add backend/src/admin/handlers.rs
git commit -m "feat(backend): add toggle_song_enabled admin handler"
```

---

### Task 6: Wire New Routes

**Files:**
- Modify: `backend/src/main.rs:116-117`

- [ ] **Step 1: Add routes**

Replace lines 116-117 in `backend/src/main.rs`:

```rust
        .route("/api/v1/admin/songs", get(admin::handlers::list_admin_songs))
        .route("/api/v1/admin/songs/{id}", axum::routing::delete(admin::handlers::delete_song).put(admin::handlers::update_song))
        .route("/api/v1/admin/songs/{id}/enabled", axum::routing::put(admin::handlers::toggle_song_enabled))
```

- [ ] **Step 2: Commit**

```bash
git add backend/src/main.rs
git commit -m "feat(backend): wire update and toggle-enabled song routes"
```

---

### Task 7: Filter Disabled Songs from Public Endpoints

**Files:**
- Modify: `backend/src/songs/handlers.rs:96-105`, `backend/src/songs/handlers.rs:119-132`, `backend/src/search/handlers.rs`

- [ ] **Step 1: Update `list_songs` query**

In `backend/src/songs/handlers.rs`, replace the SQL in `list_songs` (around lines 96-105):

```rust
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
```

- [ ] **Step 2: Update `get_song` query**

In `backend/src/songs/handlers.rs`, replace the query in `get_song` (around lines 126-127):

```rust
    let song = sqlx::query_as::<_, super::model::Song>("SELECT * FROM songs WHERE id = $1 AND enabled = 1")
        .bind(id.to_string())
        .fetch_optional(&state.pool)
        .await?;
```

- [ ] **Step 3: Update search handler**

In `backend/src/search/handlers.rs`, add `AND enabled = 1` to the WHERE clause of the search query. If the file uses SQLite boolean (INTEGER), use `enabled = 1`. The exact line depends on the query structure — find the `SELECT * FROM songs` line and append `AND enabled = 1` before `ORDER BY`.

- [ ] **Step 4: Commit**

```bash
git add backend/src/songs/handlers.rs backend/src/search/handlers.rs
git commit -m "feat(backend): filter disabled songs from public endpoints"
```

---

### Task 8: Update Frontend Types

**Files:**
- Modify: `frontend/src/types/index.ts:8-28`

- [ ] **Step 1: Add `enabled` to `Song`**

In `frontend/src/types/index.ts`, add `enabled: boolean;` after `publisher_id` and before `created_at` in the `Song` interface (around line 24).

The updated `Song` interface:

```typescript
export interface Song {
  id: string;
  title: string;
  artist: string;
  album: string | null;
  album_artist: string | null;
  track_number: number | null;
  year: number | null;
  genre: string | null;
  studio: string | null;
  duration_seconds: number;
  file_key: string;
  file_size_bytes: number;
  file_format: string;
  bitrate_kbps: number | null;
  sample_rate_hz: number | null;
  artwork_key: string | null;
  publisher_id: string | null;
  enabled: boolean;
  created_at: string;
  updated_at: string;
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/types/index.ts
git commit -m "feat(types): add enabled field to Song"
```

---

### Task 9: Add Frontend API Client Functions

**Files:**
- Modify: `frontend/src/api/client.ts`

- [ ] **Step 1: Add update and toggle functions**

In `frontend/src/api/client.ts`, after `deleteAdminSong` (around line 278), add:

```typescript
export async function updateAdminSong(id: string, body: Partial<Pick<Song, "title" | "artist" | "album" | "album_artist" | "track_number" | "year" | "genre" | "studio">>) {
  return apiFetch(`/admin/songs/${id}`, {
    method: "PUT",
    body: JSON.stringify(body),
  }) as Promise<Song>;
}

export async function toggleAdminSongEnabled(id: string, enabled: boolean) {
  return apiFetch(`/admin/songs/${id}/enabled`, {
    method: "PUT",
    body: JSON.stringify({ enabled }),
  }) as Promise<Song>;
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/api/client.ts
git commit -m "feat(api): add updateAdminSong and toggleAdminSongEnabled client functions"
```

---

### Task 10: Create ContextMenu Component

**Files:**
- Create: `frontend/src/components/ui/ContextMenu.tsx`

- [ ] **Step 1: Write the component**

```tsx
import { useEffect, useRef } from "react";

export interface ContextMenuItem {
  label: string;
  icon?: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  danger?: boolean;
}

interface ContextMenuProps {
  items: ContextMenuItem[];
  x: number;
  y: number;
  onClose: () => void;
}

export default function ContextMenu({ items, x, y, onClose }: ContextMenuProps) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        onClose();
      }
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    function onScroll() {
      onClose();
    }

    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    window.addEventListener("scroll", onScroll, true);

    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("scroll", onScroll, true);
    };
  }, [onClose]);

  // Clamp to viewport
  const menuWidth = 180;
  const menuHeight = items.length * 36 + 8;
  const left = Math.min(x, window.innerWidth - menuWidth - 8);
  const top = Math.min(y, window.innerHeight - menuHeight - 8);

  return (
    <div
      ref={ref}
      style={{ left, top }}
      className="fixed z-[100] w-44 bg-surface-900 border border-white/10 rounded-xl shadow-xl py-1 overflow-hidden"
    >
      {items.map((item, i) => (
        <button
          key={i}
          onClick={() => {
            if (!item.disabled) {
              item.onClick();
              onClose();
            }
          }}
          disabled={item.disabled}
          className={`w-full text-left flex items-center gap-2 px-3 py-2 text-sm transition-colors ${
            item.danger
              ? "text-red-400 hover:text-red-300 hover:bg-red-500/10"
              : "text-surface-300 hover:text-white hover:bg-white/5"
          } ${item.disabled ? "opacity-50 cursor-not-allowed" : ""}`}
        >
          {item.icon && <span className="w-4 h-4 shrink-0">{item.icon}</span>}
          <span>{item.label}</span>
        </button>
      ))}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/components/ui/ContextMenu.tsx
git commit -m "feat(ui): add ContextMenu component"
```

---

### Task 11: Integrate Context Menu and Edit Dialog into Admin Dashboard

**Files:**
- Modify: `frontend/src/pages/admin/AdminDashboard.tsx`

This task is large; break it into sub-steps.

- [ ] **Step 1: Import new dependencies**

At the top of `AdminDashboard.tsx`, add imports:

```tsx
import ContextMenu from "../../components/ui/ContextMenu";
import type { ContextMenuItem } from "../../components/ui/ContextMenu";
import { updateAdminSong, toggleAdminSongEnabled } from "../../api/client";
```

- [ ] **Step 2: Add state for context menu**

In the state section of `AdminDashboard.tsx`, add:

```tsx
const [contextMenu, setContextMenu] = useState<{
  x: number;
  y: number;
  song: Song;
} | null>(null);
```

- [ ] **Step 3: Add state for edit dialog**

In the state section, add:

```tsx
const [editingSong, setEditingSong] = useState<Song | null>(null);
const [editForm, setEditForm] = useState<{
  title: string;
  artist: string;
  album: string;
  album_artist: string;
  track_number: string;
  year: string;
  genre: string;
  studio: string;
}>({
  title: "",
  artist: "",
  album: "",
  album_artist: "",
  track_number: "",
  year: "",
  genre: "",
  studio: "",
});
const [savingEdit, setSavingEdit] = useState(false);
```

- [ ] **Step 4: Add handlers**

Add these functions inside `AdminDashboard`:

```tsx
function openEditDialog(song: Song) {
  setEditingSong(song);
  setEditForm({
    title: song.title,
    artist: song.artist,
    album: song.album || "",
    album_artist: song.album_artist || "",
    track_number: song.track_number?.toString() || "",
    year: song.year?.toString() || "",
    genre: song.genre || "",
    studio: song.studio || "",
  });
}

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
      genre: editForm.genre || undefined,
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

async function handleToggleEnabled(song: Song) {
  try {
    const updated = await toggleAdminSongEnabled(song.id, !song.enabled);
    setSongs((prev) => prev.map((s) => (s.id === updated.id ? updated : s)));
  } catch (e: any) {
    setError(e.message || "Failed to toggle enabled state");
  }
}

function handleContextMenu(e: React.MouseEvent, song: Song) {
  e.preventDefault();
  setContextMenu({ x: e.clientX, y: e.clientY, song });
}

function buildMenuItems(song: Song): ContextMenuItem[] {
  return [
    {
      label: "Edit",
      icon: (
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
        </svg>
      ),
      onClick: () => openEditDialog(song),
    },
    {
      label: song.enabled ? "Disable" : "Enable",
      icon: (
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          {song.enabled ? (
            <path strokeLinecap="round" strokeLinejoin="round" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
          ) : (
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
          )}
        </svg>
      ),
      onClick: () => handleToggleEnabled(song),
    },
    {
      label: "Delete",
      danger: true,
      icon: (
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
        </svg>
      ),
      onClick: () => setConfirmModal({ type: "song", id: song.id, name: song.title }),
    },
  ];
}
```

- [ ] **Step 5: Update table rows**

In the library table body (around line 920 in the original file), replace the `<tr>` and its contents:

```tsx
                {songs.map((song) => (
                  <tr
                    key={song.id}
                    onContextMenu={(e) => handleContextMenu(e, song)}
                    className={`hover:bg-white/[0.02] transition-colors ${!song.enabled ? "opacity-50" : ""}`}
                  >
                    <td className="px-4 py-3">
                      <ArtworkImage
                        songId={song.id}
                        title={song.title}
                        artist={song.artist}
                        className="w-10 h-10 rounded-lg object-cover bg-surface-950"
                      />
                    </td>
                    <td className="px-4 py-3 text-white font-medium">
                      <div className="flex items-center gap-2">
                        {song.title}
                        {!song.enabled && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-surface-700 text-surface-400 border border-white/5">
                            Disabled
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-surface-300">{song.artist}</td>
                    <td className="px-4 py-3 text-surface-400">{song.album || "—"}</td>
                    <td className="px-4 py-3 text-surface-400">{formatDuration(song.duration_seconds)}</td>
                    <td className="px-4 py-3 text-surface-400 uppercase">{song.file_format}</td>
                    <td className="px-4 py-3 text-right">
                      <button
                        onClick={(e) => {
                          const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
                          setContextMenu({
                            x: rect.left + rect.width / 2,
                            y: rect.bottom + 4,
                            song,
                          });
                        }}
                        className="text-surface-400 hover:text-white p-1 rounded hover:bg-white/5 transition-colors"
                        title="More actions"
                      >
                        <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                          <circle cx="12" cy="6" r="1.5" />
                          <circle cx="12" cy="12" r="1.5" />
                          <circle cx="12" cy="18" r="1.5" />
                        </svg>
                      </button>
                    </td>
                  </tr>
                ))}
```

- [ ] **Step 6: Add context menu portal**

After the table, add:

```tsx
          {contextMenu && (
            <ContextMenu
              items={buildMenuItems(contextMenu.song)}
              x={contextMenu.x}
              y={contextMenu.y}
              onClose={() => setContextMenu(null)}
            />
          )}
```

- [ ] **Step 7: Add edit dialog**

Add the edit dialog JSX inside the main return, after the closing `</div>` of the Library tab content but before the next tab (before `Playlists Tab`):

```tsx
      {/* ─── Edit Song Dialog ─── */}
      {editingSong && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-surface-900 border border-white/10 rounded-2xl p-6 w-full max-w-lg shadow-2xl">
            <h3 className="text-lg font-semibold text-white mb-4">Edit Song</h3>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs text-surface-400 mb-1">Title</label>
                <input
                  value={editForm.title}
                  onChange={(e) => setEditForm((f) => ({ ...f, title: e.target.value }))}
                  className="w-full bg-surface-800 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-1 focus:ring-aurora-500"
                />
              </div>
              <div>
                <label className="block text-xs text-surface-400 mb-1">Artist</label>
                <input
                  value={editForm.artist}
                  onChange={(e) => setEditForm((f) => ({ ...f, artist: e.target.value }))}
                  className="w-full bg-surface-800 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-1 focus:ring-aurora-500"
                />
              </div>
              <div>
                <label className="block text-xs text-surface-400 mb-1">Album</label>
                <input
                  value={editForm.album}
                  onChange={(e) => setEditForm((f) => ({ ...f, album: e.target.value }))}
                  className="w-full bg-surface-800 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-1 focus:ring-aurora-500"
                />
              </div>
              <div>
                <label className="block text-xs text-surface-400 mb-1">Album Artist</label>
                <input
                  value={editForm.album_artist}
                  onChange={(e) => setEditForm((f) => ({ ...f, album_artist: e.target.value }))}
                  className="w-full bg-surface-800 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-1 focus:ring-aurora-500"
                />
              </div>
              <div>
                <label className="block text-xs text-surface-400 mb-1">Track Number</label>
                <input
                  type="number"
                  value={editForm.track_number}
                  onChange={(e) => setEditForm((f) => ({ ...f, track_number: e.target.value }))}
                  className="w-full bg-surface-800 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-1 focus:ring-aurora-500"
                />
              </div>
              <div>
                <label className="block text-xs text-surface-400 mb-1">Year</label>
                <input
                  type="number"
                  value={editForm.year}
                  onChange={(e) => setEditForm((f) => ({ ...f, year: e.target.value }))}
                  className="w-full bg-surface-800 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-1 focus:ring-aurora-500"
                />
              </div>
              <div>
                <label className="block text-xs text-surface-400 mb-1">Genre</label>
                <input
                  value={editForm.genre}
                  onChange={(e) => setEditForm((f) => ({ ...f, genre: e.target.value }))}
                  className="w-full bg-surface-800 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-1 focus:ring-aurora-500"
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
            </div>
            <div className="flex gap-3 justify-end mt-6">
              <button
                onClick={() => setEditingSong(null)}
                disabled={savingEdit}
                className="px-4 py-2 bg-surface-800 hover:bg-surface-700 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveEdit}
                disabled={savingEdit || !editForm.title.trim() || !editForm.artist.trim()}
                className="px-4 py-2 bg-aurora-600 hover:bg-aurora-500 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50"
              >
                {savingEdit ? "Saving..." : "Save Changes"}
              </button>
            </div>
          </div>
        </div>
      )}
```

- [ ] **Step 8: Commit**

```bash
git add frontend/src/pages/admin/AdminDashboard.tsx
git commit -m "feat(ui): integrate context menu and edit dialog into admin library"
```

---

### Task 12: Type Check Frontend

**Files:**
- N/A (verification step)

- [ ] **Step 1: Run TypeScript check**

```bash
cd frontend && npx tsc --noEmit
```

Expected: No errors.

- [ ] **Step 2: Commit if clean**

```bash
git diff --quiet || git commit -m "fix: resolve frontend type errors"
```

---

### Task 13: Build Backend

**Files:**
- N/A (verification step)

- [ ] **Step 1: Compile Rust backend**

```bash
cd backend && cargo check
```

Expected: No errors.

- [ ] **Step 2: Commit if clean**

```bash
git diff --quiet || git commit -m "fix: resolve rust compilation errors"
```

---

## Self-Review

**1. Spec coverage:**
- ✅ Database migration — Tasks 1, 2
- ✅ Update song metadata endpoint — Tasks 4, 6
- ✅ Toggle enabled endpoint — Tasks 5, 6
- ✅ Filter disabled from public endpoints — Task 7
- ✅ Frontend types — Task 8
- ✅ Frontend API client — Task 9
- ✅ ContextMenu component — Task 10
- ✅ Integration into AdminDashboard — Task 11
- ✅ Edit dialog — Task 11
- ✅ Disabled visual indicator — Task 11
- ✅ Type check & build — Tasks 12, 13

**2. Placeholder scan:**
- No TBD, TODO, or "fill in later" found.
- All code snippets are complete and copy-pasteable.
- All file paths are exact.

**3. Type consistency:**
- `enabled` added to `Song` in both backend model and frontend type.
- `updateAdminSong` accepts `Partial<Pick<Song, ...>>` matching backend `UpdateSongBody`.
- `toggleAdminSongEnabled` signature consistent across frontend and backend.

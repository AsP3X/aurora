---
name: Admin Song Context Menu Design
description: Right-click context menu for admin library song rows with edit, disable/enable, and delete actions
---

# Admin Song Context Menu — Design

## Overview

Add a context menu (right-click + ⋮ button) to song rows in the admin Library tab.
Actions: Edit, Disable/Enable, Delete.

## Backend

### Migration

Add `enabled INTEGER NOT NULL DEFAULT 1` to the `songs` table (SQLite & Postgres).

### New Endpoints

| Method | Path | Body | Description |
|--------|------|------|-------------|
| `PUT` | `/api/v1/admin/songs/{id}` | `{ title, artist, album, album_artist, track_number, year, genre, studio }` | Update song metadata |
| `PUT` | `/api/v1/admin/songs/{id}/enabled` | `{ enabled: bool }` | Toggle enabled state |

### Updated Queries

- Public song endpoints (`list_songs`, `get_song`, `stream_song`, `search`) filter out `enabled = 0` songs.
- Admin endpoints (`list_admin_songs`) show all songs regardless of enabled state.

### Data Model

- `Song` model gains `enabled: bool`.
- `SongDraft` gains `enabled: bool` (for consistency, though not used in upload).

## Frontend

### New Component: `ContextMenu`

- **Props:** `items: MenuItem[], x: number, y: number, onClose: () => void`
- **Styling:** `bg-surface-900 border border-white/10 rounded-xl shadow-xl z-50`
- **Behavior:**
  - Rendered via React portal to `document.body`
  - Closes on click outside, Escape key, or window scroll
  - Position clamped to viewport bounds
  - Item hover: `hover:bg-white/5 transition-colors`
  - Disabled items: `opacity-50 cursor-not-allowed`

### Menu Items (per song)

| Label | Icon | Action |
|-------|------|--------|
| Edit | Pencil | Open edit dialog |
| Disable / Enable | Eye-off / Eye | Toggle `enabled` via API |
| Delete | Trash | Open `ConfirmModal` |

### Library Tab Changes (`AdminDashboard.tsx`)

- Replace inline "Delete" button with `⋮` more-actions button in Actions column.
- Add `onContextMenu` to each `<tr>` to open the same menu at cursor coordinates.
- Add edit dialog state and inline form (reuse `SongMetadataForm`).

### Edit Dialog

- Pre-populate with current song values.
- Use existing `SongMetadataForm` component.
- Allow artwork replacement or keep existing.
- On save: call `PUT /admin/songs/{id}`, refresh song list, close dialog.

## Error Handling

- Menu disabled during async operations.
- Preserve search/filter state across mutations.
- Artwork upload errors handled same as upload flow.
- Admin permission checks are server-side; no additional client gating.

## Testing (manual)

1. Right-click a song row → menu appears at cursor.
2. Click `⋮` → menu appears below button.
3. Edit a song → values update in table after save.
4. Disable a song → song hidden from public library, still visible in admin.
5. Enable a disabled song → song reappears in public library.
6. Delete a song → confirm modal, then removed from table.

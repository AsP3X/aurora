# Admin Song Upload with Artwork Cropping — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a two-step song upload flow to the admin dashboard: stage audio file (extract metadata + artwork via `lofty`), edit in a dialog with a 1:1 artwork cropper, then commit to the library.

**Architecture:** Two-step staging flow. Backend temp-stages files in `<music_dir>/.staging/<uuid>/`, extracts metadata and embedded cover art via `lofty`, returns a `SongDraft`. Frontend opens an edit dialog with metadata form + `react-image-crop` cropper. Admin edits and commits; backend moves files to final locations, inserts DB record, cleans up staging.

**Tech Stack:** Rust (Axum, SQLx, lofty, tokio), React 19 + TypeScript, Tailwind CSS v4, `react-image-crop`.

---

## File Structure

| File | Action | Responsibility |
|------|--------|----------------|
| `backend/migrations/sqlite/005_add_studio.sql` | Create | SQLite migration: add `studio` to `songs` |
| `backend/migrations/postgres/005_add_studio.sql` | Create | Postgres migration: add `studio` to `songs` |
| `backend/src/songs/model.rs` | Modify | Add `studio: Option<String>` to `Song` struct |
| `backend/src/admin/upload.rs` | Create | `stage_song` and `commit_song` handlers + metadata extraction helpers |
| `backend/src/admin/mod.rs` | Modify | Export new `upload` submodule |
| `backend/src/main.rs` | Modify | Wire `/admin/songs/stage` and `/admin/songs/commit` routes |
| `frontend/src/types/index.ts` | Modify | Add `studio` to `Song`, add `SongDraft` interface |
| `frontend/src/api/client.ts` | Modify | Add `stageSong` and `commitSong` API functions |
| `frontend/src/components/admin/SongMetadataForm.tsx` | Create | Editable metadata form (title, artist, album, year, genre, studio, etc.) |
| `frontend/src/components/admin/ArtworkCropper.tsx` | Create | 1:1 image cropper using `react-image-crop` |
| `frontend/src/components/admin/UploadSongDialog.tsx` | Create | Orchestrates the full upload flow (idle → uploading → editing → committing → done) |
| `frontend/src/pages/admin/AdminDashboard.tsx` | Modify | Add "Upload Song" button to Library tab, integrate dialog |

---

## Task 1: Database Migration — Add `studio` Column

**Files:**
- Create: `backend/migrations/sqlite/005_add_studio.sql`
- Create: `backend/migrations/postgres/005_add_studio.sql`

- [ ] **Step 1: Write SQLite migration**

```sql
ALTER TABLE songs ADD COLUMN studio TEXT;
```

- [ ] **Step 2: Write PostgreSQL migration**

```sql
ALTER TABLE songs ADD COLUMN studio TEXT;
```

- [ ] **Step 3: Verify migration numbering**

Ensure both directories have migrations numbered `001` through `004`. The new files must be `005_add_studio.sql` in both `backend/migrations/sqlite/` and `backend/migrations/postgres/`.

- [ ] **Step 4: Commit**

```bash
git add backend/migrations/
git commit -m "feat: add studio column to songs table"
```

---

## Task 2: Add `studio` Field to Rust `Song` Model

**Files:**
- Modify: `backend/src/songs/model.rs`

- [ ] **Step 1: Add `studio` field to `Song` struct**

Replace the `Song` struct in `backend/src/songs/model.rs` with:

```rust
use serde::{Deserialize, Serialize};
use sqlx::FromRow;

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
    pub created_at: String,
    pub updated_at: String,
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

- [ ] **Step 2: Check compilation**

```bash
cd backend && cargo check
```

Expected: compiles cleanly (the new field is `Option<String>`, so existing queries that use `query_as::<_, Song>` with `SELECT *` will automatically pick it up as `NULL` for existing rows).

- [ ] **Step 3: Commit**

```bash
git add backend/src/songs/model.rs
git commit -m "feat: add studio field to Song model"
```

---

## Task 3: Create Backend Upload Module

**Files:**
- Create: `backend/src/admin/upload.rs`
- Modify: `backend/src/admin/mod.rs`

- [ ] **Step 1: Write the upload module**

Create `backend/src/admin/upload.rs`:

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

#[derive(Debug, Serialize)]
pub struct SongDraft {
    pub staging_id: String,
    pub title: String,
    pub artist: String,
    pub album: Option<String>,
    pub album_artist: Option<String>,
    pub track_number: Option<i32>,
    pub year: Option<i32>,
    pub genre: Option<String>,
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
    pub genre: Option<String>,
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
    genre: Option<String>,
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

    let (title, artist, album, album_artist, track_number, year, genre) =
        match tagged_file.primary_tag() {
            Some(tag) => (
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
                tag.genre().map(|v| v.to_string()),
            ),
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
                None,
            ),
        };

    let duration = properties.duration().as_secs() as i32;
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
        genre,
        duration_seconds: duration,
        file_format,
        bitrate_kbps: bitrate,
        sample_rate_hz: sample_rate,
    })
}

async fn extract_artwork(
    path: &Path,
    staging_dir: &Path,
) -> anyhow::Result<bool> {
    use lofty::prelude::*;

    let tagged_file = lofty::read_from_path(path)?;
    let tag = match tagged_file.primary_tag() {
        Some(t) => t,
        None => return Ok(false),
    };

    let pictures = tag.pictures();
    if pictures.is_empty() {
        return Ok(false);
    }

    if let Some(pic) = pictures.first() {
        let ext = match pic.mime_type().as_str() {
            "image/png" => "png",
            "image/webp" => "webp",
            _ => "jpg",
        };
        let art_path = staging_dir.join(format!("artwork.{}", ext));
        tokio::fs::write(&art_path, pic.data()).await?;
        return Ok(true);
    }

    Ok(false)
}

pub async fn stage_song(
    State(state): State<Arc<AppState>>,
    claims: axum::Extension<crate::auth::Claims>,
    mut multipart: Multipart,
) -> Result<axum::Json<SongDraft>, AppError> {
    require_admin_access(&state.pool, &claims.sub, &claims.role).await?;

    // Extract audio file from multipart
    let mut audio_bytes: Option<Vec<u8>> = None;
    let mut filename = String::new();

    while let Some(field) = multipart
        .next_field()
        .await
        .map_err(|e| AppError::BadRequest(e.to_string()))?
    {
        let name = field.name().unwrap_or("").to_string();
        if name == "audio" {
            filename = field.file_name().unwrap_or("unknown").to_string();
            let bytes = field
                .bytes()
                .await
                .map_err(|e| AppError::BadRequest(e.to_string()))?
                .to_vec();
            audio_bytes = Some(bytes);
            break;
        }
    }

    let audio_bytes = audio_bytes.ok_or_else(|| AppError::BadRequest("No audio file provided".into()))?;

    // Validate extension
    let ext = Path::new(&filename)
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("")
        .to_lowercase();
    let allowed = ["mp3", "flac", "ogg", "opus", "m4a", "aac", "wma"];
    if !allowed.contains(&ext.as_str()) {
        return Err(AppError::BadRequest(format!(
            "Unsupported audio format: {}. Allowed: {:?}",
            ext, allowed
        )));
    }

    // Save to staging directory
    let staging_id = Uuid::new_v4().to_string();
    let staging_dir = state.storage.base_dir.join(".staging").join(&staging_id);
    tokio::fs::create_dir_all(&staging_dir)
        .await
        .map_err(|e| AppError::Storage(e.to_string()))?;

    let audio_path = staging_dir.join(format!("audio.{}", ext));
    tokio::fs::write(&audio_path, &audio_bytes)
        .await
        .map_err(|e| AppError::Storage(e.to_string()))?;

    // Extract metadata
    let meta = extract_metadata(&audio_path).map_err(|e| {
        AppError::BadRequest(format!("Failed to read metadata: {}", e))
    })?;

    // Extract embedded artwork
    let has_artwork = extract_artwork(&audio_path, &staging_dir)
        .await
        .unwrap_or(false);

    let draft = SongDraft {
        staging_id,
        title: meta.title,
        artist: meta.artist,
        album: meta.album,
        album_artist: meta.album_artist,
        track_number: meta.track_number,
        year: meta.year,
        genre: meta.genre,
        studio: None,
        duration_seconds: meta.duration_seconds,
        file_format: meta.file_format,
        bitrate_kbps: meta.bitrate_kbps,
        sample_rate_hz: meta.sample_rate_hz,
        has_artwork,
    };

    Ok(axum::Json(draft))
}

pub async fn commit_song(
    State(state): State<Arc<AppState>>,
    claims: axum::Extension<crate::auth::Claims>,
    mut multipart: Multipart,
) -> Result<axum::Json<crate::songs::model::Song>, AppError> {
    require_admin_access(&state.pool, &claims.sub, &claims.role).await?;

    // Parse multipart form
    let mut metadata_json = String::new();
    let mut artwork_bytes: Option<Vec<u8>> = None;
    let mut artwork_ext = "jpg".to_string();

    while let Some(field) = multipart
        .next_field()
        .await
        .map_err(|e| AppError::BadRequest(e.to_string()))?
    {
        let name = field.name().unwrap_or("").to_string();
        match name.as_str() {
            "metadata" => {
                metadata_json = String::from_utf8(
                    field
                        .bytes()
                        .await
                        .map_err(|e| AppError::BadRequest(e.to_string()))?
                        .to_vec(),
                )
                .map_err(|_| AppError::BadRequest("Invalid metadata encoding".into()))?;
            }
            "artwork" => {
                artwork_ext = field
                    .file_name()
                    .and_then(|f| Path::new(f).extension().and_then(|e| e.to_str()))
                    .unwrap_or("jpg")
                    .to_lowercase();
                artwork_bytes = Some(
                    field
                        .bytes()
                        .await
                        .map_err(|e| AppError::BadRequest(e.to_string()))?
                        .to_vec(),
                );
            }
            _ => {}
        }
    }

    let req: CommitSongRequest = serde_json::from_str(&metadata_json)
        .map_err(|e| AppError::BadRequest(format!("Invalid metadata JSON: {}", e)))?;

    if req.title.trim().is_empty() || req.artist.trim().is_empty() {
        return Err(AppError::BadRequest("Title and artist are required".into()));
    }

    // Locate staging directory
    let staging_dir = state.storage.base_dir.join(".staging").join(&req.staging_id);
    if !staging_dir.exists() {
        return Err(AppError::NotFound);
    }

    // Find the staged audio file
    let mut entries = tokio::fs::read_dir(&staging_dir)
        .await
        .map_err(|e| AppError::Storage(e.to_string()))?;
    let mut audio_path = None;
    while let Some(entry) = entries
        .next_entry()
        .await
        .map_err(|e| AppError::Storage(e.to_string()))?
    {
        let name = entry.file_name().to_string_lossy().to_string();
        if name.starts_with("audio.") {
            audio_path = Some(entry.path());
            break;
        }
    }
    let audio_path = audio_path.ok_or(AppError::NotFound)?;

    // Move audio to final location
    let song_id = Uuid::new_v4().to_string();
    let file_key = format!(
        "uploads/{}_{}",
        &song_id,
        audio_path.file_name().unwrap().to_string_lossy()
    );
    let dest_path = state.storage.base_dir.join(&file_key);
    if let Some(parent) = dest_path.parent() {
        tokio::fs::create_dir_all(parent)
            .await
            .map_err(|e| AppError::Storage(e.to_string()))?;
    }
    tokio::fs::rename(&audio_path, &dest_path)
        .await
        .map_err(|e| AppError::Storage(e.to_string()))?;

    let file_size = std::fs::metadata(&dest_path)
        .map_err(|e| AppError::Storage(e.to_string()))?
        .len() as i64;

    // Handle artwork
    let mut artwork_key: Option<String> = None;

    if let Some(bytes) = artwork_bytes {
        // Admin provided a new/cropped artwork
        let art_ext = if matches!(artwork_ext.as_str(), "png" | "jpg" | "jpeg" | "webp") {
            artwork_ext
        } else {
            "jpg".to_string()
        };
        let art_key = format!("artwork/{}.{}", song_id, art_ext);
        let art_path = state.storage.base_dir.join(&art_key);
        if let Some(parent) = art_path.parent() {
            tokio::fs::create_dir_all(parent)
                .await
                .map_err(|e| AppError::Storage(e.to_string()))?;
        }
        tokio::fs::write(&art_path, bytes)
            .await
            .map_err(|e| AppError::Storage(e.to_string()))?;
        artwork_key = Some(art_key);
    } else {
        // Check if staged artwork exists (admin kept the extracted one)
        let mut art_entries = tokio::fs::read_dir(&staging_dir)
            .await
            .map_err(|e| AppError::Storage(e.to_string()))?;
        while let Some(entry) = art_entries
            .next_entry()
            .await
            .map_err(|e| AppError::Storage(e.to_string()))?
        {
            let name = entry.file_name().to_string_lossy().to_string();
            if name.starts_with("artwork.") {
                let ext = Path::new(&name)
                    .extension()
                    .and_then(|e| e.to_str())
                    .unwrap_or("jpg");
                let art_key = format!("artwork/{}.{}", song_id, ext);
                let art_path = state.storage.base_dir.join(&art_key);
                if let Some(parent) = art_path.parent() {
                    tokio::fs::create_dir_all(parent)
                        .await
                        .map_err(|e| AppError::Storage(e.to_string()))?;
                }
                tokio::fs::rename(entry.path(), &art_path)
                    .await
                    .map_err(|e| AppError::Storage(e.to_string()))?;
                artwork_key = Some(art_key);
                break;
            }
        }
    }

    // Insert into database
    let song = sqlx::query_as::<_, crate::songs::model::Song>(
        "INSERT INTO songs (
            id, title, artist, album, album_artist, track_number, year, genre, studio,
            duration_seconds, file_key, file_size_bytes, file_format, bitrate_kbps, sample_rate_hz, artwork_key, publisher_id
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)
        RETURNING *"
    )
    .bind(&song_id)
    .bind(&req.title)
    .bind(&req.artist)
    .bind(&req.album)
    .bind(&req.album_artist)
    .bind(req.track_number)
    .bind(req.year)
    .bind(&req.genre)
    .bind(&req.studio)
    .bind(req.duration_seconds)
    .bind(&file_key)
    .bind(file_size)
    .bind(&req.file_format)
    .bind(req.bitrate_kbps)
    .bind(req.sample_rate_hz)
    .bind(&artwork_key)
    .bind(&claims.sub)
    .fetch_one(&state.pool)
    .await?;

    // Clean up staging directory
    let _ = tokio::fs::remove_dir_all(&staging_dir).await;

    Ok(axum::Json(song))
}
```

- [ ] **Step 2: Export the upload module from `admin/mod.rs`**

Replace `backend/src/admin/mod.rs` with:

```rust
pub mod handlers;
pub mod upload;
```

- [ ] **Step 3: Check compilation**

```bash
cd backend && cargo check
```

Expected: compiles cleanly.

- [ ] **Step 4: Commit**

```bash
git add backend/src/admin/
git commit -m "feat: add admin song upload handlers (stage + commit)"
```

---

## Task 4: Wire New Routes into Backend Router

**Files:**
- Modify: `backend/src/main.rs`

- [ ] **Step 1: Add the two new routes to `protected_routes`**

In `backend/src/main.rs`, find the existing admin song routes (around line 114-115):

```rust
        .route("/api/v1/admin/songs", get(admin::handlers::list_admin_songs))
        .route("/api/v1/admin/songs/{id}", axum::routing::delete(admin::handlers::delete_song))
```

Insert the new routes directly after those two lines:

```rust
        .route("/api/v1/admin/songs/stage", post(admin::upload::stage_song))
        .route("/api/v1/admin/songs/commit", post(admin::upload::commit_song))
```

- [ ] **Step 2: Check compilation**

```bash
cd backend && cargo check
```

Expected: compiles cleanly.

- [ ] **Step 3: Commit**

```bash
git add backend/src/main.rs
git commit -m "feat: wire admin song upload routes"
```

---

## Task 5: Update Frontend Types

**Files:**
- Modify: `frontend/src/types/index.ts`

- [ ] **Step 1: Add `studio` to `Song` and create `SongDraft`**

Replace the contents of `frontend/src/types/index.ts` with:

```typescript
export interface User {
  id: string;
  email: string;
  role: string;
  permissions: string[];
}

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
  genre: string | null;
  studio: string | null;
  duration_seconds: number;
  file_format: string;
  bitrate_kbps: number | null;
  sample_rate_hz: number | null;
  has_artwork: boolean;
}

export interface Playlist {
  id: string;
  user_id: string;
  name: string;
  description: string | null;
  is_public: boolean;
  created_at: string;
}

export interface AuthResponse {
  token: string;
  user: User;
}
```

- [ ] **Step 2: Verify no TypeScript errors**

```bash
cd frontend && pnpm tsc -b --noEmit
```

Expected: no errors (the new `studio` field is `string | null`, so existing consumers won't break).

- [ ] **Step 3: Commit**

```bash
git add frontend/src/types/index.ts
git commit -m "feat: add studio to Song and introduce SongDraft type"
```

---

## Task 6: Add API Client Functions

**Files:**
- Modify: `frontend/src/api/client.ts`

- [ ] **Step 1: Add `stageSong` and `commitSong` functions**

Insert the following two functions at the end of `frontend/src/api/client.ts`, just before the closing of the file (after the last `updateAdminSetting` function):

```typescript
export async function stageSong(file: File) {
  const form = new FormData();
  form.append("audio", file);

  const token = getToken();
  const url = `${API_BASE}/admin/songs/stage`;

  const res = await fetch(url, {
    method: "POST",
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body: form,
  });

  if (res.status === 401) {
    localStorage.removeItem("aurora_token");
    window.location.href = "/login";
    throw new Error("Unauthorized");
  }

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `HTTP ${res.status}`);
  }

  return res.json() as Promise<import("../types").SongDraft>;
}

export async function commitSong(draft: import("../types").SongDraft, artworkBlob?: Blob) {
  const form = new FormData();
  form.append(
    "metadata",
    new Blob([JSON.stringify(draft)], { type: "application/json" })
  );
  if (artworkBlob) {
    form.append("artwork", artworkBlob, "artwork.jpg");
  }

  const token = getToken();
  const url = `${API_BASE}/admin/songs/commit`;

  const res = await fetch(url, {
    method: "POST",
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body: form,
  });

  if (res.status === 401) {
    localStorage.removeItem("aurora_token");
    window.location.href = "/login";
    throw new Error("Unauthorized");
  }

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `HTTP ${res.status}`);
  }

  return res.json() as Promise<import("../types").Song>;
}
```

- [ ] **Step 2: Verify no TypeScript errors**

```bash
cd frontend && pnpm tsc -b --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/api/client.ts
git commit -m "feat: add stageSong and commitSong API client functions"
```

---

## Task 7: Install Frontend Image Cropper Dependency

**Files:**
- Modify: `frontend/package.json` (indirectly via pnpm)

- [ ] **Step 1: Install `react-image-crop`**

```bash
cd frontend && pnpm add react-image-crop
```

Expected: `react-image-crop` added to `dependencies` in `frontend/package.json`.

- [ ] **Step 2: Commit**

```bash
git add frontend/package.json frontend/pnpm-lock.yaml
git commit -m "deps: add react-image-crop for artwork cropping"
```

---

## Task 8: Create `SongMetadataForm` Component

**Files:**
- Create: `frontend/src/components/admin/SongMetadataForm.tsx`

- [ ] **Step 1: Write the component**

```tsx
import type { SongDraft } from "../../types";

interface SongMetadataFormProps {
  draft: SongDraft;
  onChange: (draft: SongDraft) => void;
}

const inputClass =
  "w-full rounded-lg border border-surface-700 bg-surface-900 px-3 py-2 text-sm text-white placeholder-surface-500 focus:border-aurora-400 focus:outline-none";

const labelClass = "mb-1 block text-xs font-medium text-surface-300";

export default function SongMetadataForm({ draft, onChange }: SongMetadataFormProps) {
  const update = <K extends keyof SongDraft>(field: K, value: SongDraft[K]) => {
    onChange({ ...draft, [field]: value });
  };

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      <div className="sm:col-span-2">
        <label className={labelClass}>Title *</label>
        <input
          className={inputClass}
          value={draft.title}
          onChange={(e) => update("title", e.target.value)}
          required
        />
      </div>

      <div className="sm:col-span-2">
        <label className={labelClass}>Artist *</label>
        <input
          className={inputClass}
          value={draft.artist}
          onChange={(e) => update("artist", e.target.value)}
          required
        />
      </div>

      <div>
        <label className={labelClass}>Album</label>
        <input
          className={inputClass}
          value={draft.album ?? ""}
          onChange={(e) => update("album", e.target.value || null)}
          placeholder="Optional"
        />
      </div>

      <div>
        <label className={labelClass}>Album Artist</label>
        <input
          className={inputClass}
          value={draft.album_artist ?? ""}
          onChange={(e) => update("album_artist", e.target.value || null)}
          placeholder="Optional"
        />
      </div>

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

      <div>
        <label className={labelClass}>Year</label>
        <input
          className={inputClass}
          type="number"
          value={draft.year ?? ""}
          onChange={(e) => {
            const val = e.target.value ? parseInt(e.target.value, 10) : null;
            update("year", val);
          }}
          placeholder="Optional"
        />
      </div>

      <div>
        <label className={labelClass}>Genre</label>
        <input
          className={inputClass}
          value={draft.genre ?? ""}
          onChange={(e) => update("genre", e.target.value || null)}
          placeholder="Optional"
        />
      </div>

      <div>
        <label className={labelClass}>Studio / Label</label>
        <input
          className={inputClass}
          value={draft.studio ?? ""}
          onChange={(e) => update("studio", e.target.value || null)}
          placeholder="Optional"
        />
      </div>

      <div className="sm:col-span-2">
        <div className="flex flex-wrap gap-4 text-xs text-surface-400">
          <span>Duration: {formatDuration(draft.duration_seconds)}</span>
          <span>Format: {draft.file_format.toUpperCase()}</span>
          {draft.bitrate_kbps && <span>Bitrate: {draft.bitrate_kbps} kbps</span>}
          {draft.sample_rate_hz && <span>Sample Rate: {draft.sample_rate_hz} Hz</span>}
        </div>
      </div>
    </div>
  );
}

function formatDuration(seconds: number) {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}
```

- [ ] **Step 2: Verify no TypeScript errors**

```bash
cd frontend && pnpm tsc -b --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/admin/SongMetadataForm.tsx
git commit -m "feat: add SongMetadataForm component for upload dialog"
```

---

## Task 9: Create `ArtworkCropper` Component

**Files:**
- Create: `frontend/src/components/admin/ArtworkCropper.tsx`

- [ ] **Step 1: Write the component**

```tsx
import { useState, useRef, useCallback } from "react";
import ReactCrop, { type Crop, type PixelCrop, centerCrop, makeAspectCrop } from "react-image-crop";
import "react-image-crop/dist/ReactCrop.css";

interface ArtworkCropperProps {
  imageSrc: string | null;
  onCropComplete: (croppedBlob: Blob) => void;
  onReplace: (file: File) => void;
  onRemove: () => void;
}

export default function ArtworkCropper({
  imageSrc,
  onCropComplete,
  onReplace,
  onRemove,
}: ArtworkCropperProps) {
  const [crop, setCrop] = useState<Crop>();
  const [completedCrop, setCompletedCrop] = useState<PixelCrop>();
  const imgRef = useRef<HTMLImageElement | null>(null);

  const onImageLoad = useCallback((e: React.SyntheticEvent<HTMLImageElement>) => {
    const { width, height } = e.currentTarget;
    const crop = centerCrop(
      makeAspectCrop({ unit: "%", width: 90 }, 1, width, height),
      width,
      height
    );
    setCrop(crop);
    setCompletedCrop({
      x: Math.round((crop.x / 100) * width),
      y: Math.round((crop.y / 100) * height),
      width: Math.round((crop.width / 100) * width),
      height: Math.round((crop.height / 100) * height),
      unit: "px",
    });
    imgRef.current = e.currentTarget;
  }, []);

  const generateCroppedImage = useCallback(async () => {
    if (!imgRef.current || !completedCrop) return;
    const canvas = document.createElement("canvas");
    const scaleX = imgRef.current.naturalWidth / imgRef.current.width;
    const scaleY = imgRef.current.naturalHeight / imgRef.current.height;
    const size = Math.min(
      completedCrop.width * scaleX,
      completedCrop.height * scaleY,
      1200
    );
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.drawImage(
      imgRef.current,
      completedCrop.x * scaleX,
      completedCrop.y * scaleY,
      completedCrop.width * scaleX,
      completedCrop.height * scaleY,
      0,
      0,
      size,
      size
    );

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", 0.92)
    );
    if (blob) {
      onCropComplete(blob);
    }
  }, [completedCrop, onCropComplete]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) onReplace(file);
  };

  if (!imageSrc) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-lg border-2 border-dashed border-surface-700 bg-surface-900/50 p-6">
        <p className="text-sm text-surface-400">No artwork. Upload an image:</p>
        <label className="cursor-pointer rounded-md bg-aurora-600 px-4 py-2 text-sm font-medium text-white hover:bg-aurora-500">
          Choose Image
          <input type="file" accept="image/*" className="hidden" onChange={handleFileChange} />
        </label>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="mx-auto max-w-xs">
        <ReactCrop
          crop={crop}
          onChange={(_, percentCrop) => setCrop(percentCrop)}
          onComplete={(c) => setCompletedCrop(c)}
          aspect={1}
          circularCrop={false}
        >
          <img
            src={imageSrc}
            alt="Artwork"
            onLoad={onImageLoad}
            className="max-h-64 w-auto rounded-md"
          />
        </ReactCrop>
      </div>
      <p className="text-center text-xs text-surface-400">
        Drag to adjust the crop. Aspect ratio is locked to 1:1.
      </p>
      <div className="flex justify-center gap-2">
        <button
          type="button"
          onClick={generateCroppedImage}
          className="rounded-md bg-aurora-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-aurora-500"
        >
          Apply Crop
        </button>
        <label className="cursor-pointer rounded-md bg-surface-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-surface-600">
          Replace
          <input type="file" accept="image/*" className="hidden" onChange={handleFileChange} />
        </label>
        <button
          type="button"
          onClick={onRemove}
          className="rounded-md bg-red-900/50 px-3 py-1.5 text-sm font-medium text-red-200 hover:bg-red-900"
        >
          Remove
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify no TypeScript errors**

```bash
cd frontend && pnpm tsc -b --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/admin/ArtworkCropper.tsx
git commit -m "feat: add ArtworkCropper component with 1:1 aspect lock"
```

---

## Task 10: Create `UploadSongDialog` Component

**Files:**
- Create: `frontend/src/components/admin/UploadSongDialog.tsx`

- [ ] **Step 1: Write the component**

```tsx
import { useState, useCallback, useRef } from "react";
import { stageSong, commitSong } from "../../api/client";
import type { SongDraft, Song } from "../../types";
import SongMetadataForm from "./SongMetadataForm";
import ArtworkCropper from "./ArtworkCropper";

type UploadState = "idle" | "uploading" | "editing" | "committing" | "done";

interface UploadSongDialogProps {
  onClose: () => void;
  onSuccess: (song: Song) => void;
}

export default function UploadSongDialog({ onClose, onSuccess }: UploadSongDialogProps) {
  const [state, setState] = useState<UploadState>("idle");
  const [draft, setDraft] = useState<SongDraft | null>(null);
  const [imageSrc, setImageSrc] = useState<string | null>(null);
  const [croppedBlob, setCroppedBlob] = useState<Blob | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      setError(null);
      setState("uploading");
      try {
        const result = await stageSong(file);
        setDraft(result);
        if (result.has_artwork) {
          // The backend doesn't return a direct URL for staged artwork.
          // We'll need a new endpoint, OR we can skip showing the extracted
          // artwork until commit and instead just show a placeholder.
          // For now, set a placeholder — we will add a staging-artwork endpoint
          // in a follow-up step (see Task 11).
          setImageSrc(null);
        } else {
          setImageSrc(null);
        }
        setState("editing");
      } catch (err) {
        setError(err instanceof Error ? err.message : "Upload failed");
        setState("idle");
      }
    },
    []
  );

  const handleReplaceArtwork = useCallback((file: File) => {
    const reader = new FileReader();
    reader.onload = () => {
      setImageSrc(reader.result as string);
      setCroppedBlob(null);
    };
    reader.readAsDataURL(file);
  }, []);

  const handleCropComplete = useCallback((blob: Blob) => {
    setCroppedBlob(blob);
    setImageSrc(URL.createObjectURL(blob));
  }, []);

  const handleRemoveArtwork = useCallback(() => {
    setImageSrc(null);
    setCroppedBlob(null);
  }, []);

  const handleCommit = useCallback(async () => {
    if (!draft) return;
    if (!draft.title.trim() || !draft.artist.trim()) {
      setError("Title and artist are required");
      return;
    }
    setError(null);
    setState("committing");
    try {
      const song = await commitSong(draft, croppedBlob ?? undefined);
      setState("done");
      onSuccess(song);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Commit failed");
      setState("editing");
    }
  }, [draft, croppedBlob, onSuccess, onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-xl border border-surface-700 bg-surface-950 p-6 shadow-2xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-white">Upload Song</h2>
          <button
            onClick={onClose}
            className="text-surface-400 hover:text-white"
            disabled={state === "uploading" || state === "committing"}
          >
            ✕
          </button>
        </div>

        {error && (
          <div className="mb-4 rounded-md bg-red-900/30 px-3 py-2 text-sm text-red-300">
            {error}
          </div>
        )}

        {state === "idle" && (
          <div className="flex flex-col items-center gap-4 py-8">
            <div className="rounded-full bg-surface-900 p-4">
              <svg
                className="h-8 w-8 text-aurora-400"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3"
                />
              </svg>
            </div>
            <p className="text-sm text-surface-300">Select an audio file to upload</p>
            <button
              onClick={() => fileInputRef.current?.click()}
              className="rounded-md bg-aurora-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-aurora-500"
            >
              Choose File
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="audio/*"
              className="hidden"
              onChange={handleFileSelect}
            />
          </div>
        )}

        {state === "uploading" && (
          <div className="py-12 text-center text-sm text-surface-400">
            Extracting metadata…
          </div>
        )}

        {state === "editing" && draft && (
          <div className="flex flex-col gap-6">
            <SongMetadataForm draft={draft} onChange={setDraft} />

            <div>
              <h3 className="mb-2 text-sm font-medium text-white">Artwork</h3>
              <ArtworkCropper
                imageSrc={imageSrc}
                onCropComplete={handleCropComplete}
                onReplace={handleReplaceArtwork}
                onRemove={handleRemoveArtwork}
              />
            </div>

            <div className="flex justify-end gap-2">
              <button
                onClick={onClose}
                className="rounded-md bg-surface-800 px-4 py-2 text-sm font-medium text-white hover:bg-surface-700"
              >
                Cancel
              </button>
              <button
                onClick={handleCommit}
                className="rounded-md bg-aurora-600 px-4 py-2 text-sm font-medium text-white hover:bg-aurora-500"
              >
                Save to Library
              </button>
            </div>
          </div>
        )}

        {state === "committing" && (
          <div className="py-12 text-center text-sm text-surface-400">Saving to library…</div>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify no TypeScript errors**

```bash
cd frontend && pnpm tsc -b --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/admin/UploadSongDialog.tsx
git commit -m "feat: add UploadSongDialog component"
```

---

## Task 11: Add Staged Artwork Endpoint (So Extracted Artwork Can Be Previewed)

**Files:**
- Modify: `backend/src/admin/upload.rs`
- Modify: `backend/src/main.rs`
- Modify: `frontend/src/api/client.ts`
- Modify: `frontend/src/components/admin/UploadSongDialog.tsx`

- [ ] **Step 1: Add `get_staged_artwork` handler to `upload.rs`**

Append this handler to the end of `backend/src/admin/upload.rs`:

```rust
pub async fn get_staged_artwork(
    State(state): State<Arc<AppState>>,
    claims: axum::Extension<crate::auth::Claims>,
    axum::extract::Path(staging_id): axum::extract::Path<String>,
) -> Result<impl axum::response::IntoResponse, AppError> {
    require_admin_access(&state.pool, &claims.sub, &claims.role).await?;

    let staging_dir = state.storage.base_dir.join(".staging").join(&staging_id);
    if !staging_dir.exists() {
        return Err(AppError::NotFound);
    }

    let mut entries = tokio::fs::read_dir(&staging_dir)
        .await
        .map_err(|e| AppError::Storage(e.to_string()))?;

    while let Some(entry) = entries
        .next_entry()
        .await
        .map_err(|e| AppError::Storage(e.to_string()))?
    {
        let name = entry.file_name().to_string_lossy().to_string();
        if name.starts_with("artwork.") {
            let path = entry.path();
            let mime = mime_guess::from_path(&path)
                .first_or_octet_stream()
                .to_string();
            let bytes = tokio::fs::read(&path)
                .await
                .map_err(|e| AppError::Storage(e.to_string()))?;
            return Ok((
                [(axum::http::header::CONTENT_TYPE, mime)],
                bytes,
            ));
        }
    }

    Err(AppError::NotFound)
}
```

- [ ] **Step 2: Wire the route in `main.rs`**

Add the route inside `protected_routes`, after the other admin song routes:

```rust
        .route("/api/v1/admin/songs/stage/{id}/artwork", get(admin::upload::get_staged_artwork))
```

- [ ] **Step 3: Add frontend helper in `client.ts`**

Append this function to the end of `frontend/src/api/client.ts`:

```typescript
export function stagedArtworkUrl(stagingId: string) {
  return `${API_BASE}/admin/songs/stage/${stagingId}/artwork`;
}
```

- [ ] **Step 4: Update `UploadSongDialog` to show extracted artwork**

In `frontend/src/components/admin/UploadSongDialog.tsx`, find the `handleFileSelect` callback. Replace the block that sets `imageSrc` after `stageSong`:

```typescript
        setDraft(result);
        if (result.has_artwork) {
          setImageSrc(stagedArtworkUrl(result.staging_id));
        } else {
          setImageSrc(null);
        }
```

Also add the import:

```typescript
import { stageSong, commitSong, stagedArtworkUrl } from "../../api/client";
```

- [ ] **Step 5: Check compilation and TypeScript**

```bash
cd backend && cargo check
cd ../frontend && pnpm tsc -b --noEmit
```

Expected: both clean.

- [ ] **Step 6: Commit**

```bash
git add backend/src/admin/upload.rs backend/src/main.rs frontend/src/api/client.ts frontend/src/components/admin/UploadSongDialog.tsx
git commit -m "feat: add staged artwork preview endpoint and wire it to dialog"
```

---

## Task 12: Integrate Upload Button into AdminDashboard Library Tab

**Files:**
- Modify: `frontend/src/pages/admin/AdminDashboard.tsx`

- [ ] **Step 1: Add imports and state**

At the top of `AdminDashboard.tsx`, add `UploadSongDialog` to the imports from `../../api/client`:

Actually, `UploadSongDialog` is a component, not an API function. Add a new import line after the existing component imports:

```typescript
import UploadSongDialog from "../../components/admin/UploadSongDialog";
```

Add state inside the `AdminDashboard` component (find where `activeTab` and other state hooks are declared):

```typescript
  const [showUploadDialog, setShowUploadDialog] = useState(false);
```

- [ ] **Step 2: Add the "Upload Song" button to the Library tab header**

Find the Library tab rendering in `AdminDashboard.tsx`. Look for the search input / header controls (around line 900+). The exact location varies, but it's inside the `activeTab === "library"` block. Add a button before or next to the search input.

If the Library tab header looks like this:

```tsx
          {activeTab === "library" && (
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <input ... />
                ...
              </div>
```

Insert the upload button inside that flex container:

```tsx
                <button
                  onClick={() => setShowUploadDialog(true)}
                  className="rounded-md bg-aurora-600 px-3 py-2 text-sm font-medium text-white hover:bg-aurora-500"
                >
                  + Upload Song
                </button>
```

- [ ] **Step 3: Render the dialog conditionally**

At the end of the main return (before the final closing `</div>` of the page), add:

```tsx
      {showUploadDialog && (
        <UploadSongDialog
          onClose={() => setShowUploadDialog(false)}
          onSuccess={() => {
            // Refetch songs for the library tab
            if (activeTab === "library") {
              handleLibrarySearch();
            }
          }}
        />
      )}
```

Note: `handleLibrarySearch` is the existing function that fetches songs for the library tab. If your file uses a different name (e.g., `fetchLibrary`), adjust accordingly. The goal is to refresh the song list after a successful upload.

- [ ] **Step 4: Verify no TypeScript errors**

```bash
cd frontend && pnpm tsc -b --noEmit
```

Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/pages/admin/AdminDashboard.tsx
git commit -m "feat: integrate Upload Song button and dialog into admin library tab"
```

---

## Task 13: Full End-to-End Manual Test

**Files:** none (verification only)

- [ ] **Step 1: Start the backend**

```bash
cd backend && cargo run
```

Wait for "Server listening on" message.

- [ ] **Step 2: Start the frontend dev server**

```bash
cd frontend && pnpm dev
```

Open `http://localhost:5173` (or whatever port Vite reports).

- [ ] **Step 3: Log in as admin and navigate to Admin Dashboard → Library tab**

- [ ] **Step 4: Click "Upload Song" and select an audio file**

Test with:
- An MP3 **with** embedded cover art.
- An MP3 **without** embedded cover art.
- An unsupported file (e.g., `.txt`) — expect a clear error.

- [ ] **Step 5: Verify the edit dialog**

- Fields are pre-filled from `lofty` metadata.
- Read-only info (duration, format, bitrate, sample rate) is displayed.
- Artwork shows up (if embedded) or shows upload prompt (if not).

- [ ] **Step 6: Test artwork cropper**

- With an extracted image: crop to a smaller 1:1 square, click **Apply Crop**, verify the preview updates.
- Click **Replace**, choose a new image, verify it loads.
- Click **Remove**, verify it clears.

- [ ] **Step 7: Edit metadata**

- Change title, artist, album, genre, studio.
- Try leaving title or artist blank and clicking **Save to Library** — expect validation error.

- [ ] **Step 8: Commit**

Click **Save to Library**. Verify:
- Dialog closes.
- Library table refreshes and shows the new song.
- Artwork appears in the table.

- [ ] **Step 9: Verify backend files**

Check that:
- Audio file exists in `<music_dir>/uploads/<uuid>_audio.mp3`.
- Artwork exists in `<music_dir>/artwork/<uuid>.jpg`.
- Staging directory `<music_dir>/.staging/<uuid>/` has been cleaned up.

- [ ] **Step 10: Commit test results (optional)**

If any issues were found, fix them in follow-up commits. If everything works:

```bash
git log --oneline -5
```

Verify a clean chain of commits.

---

## Spec Self-Review

### 1. Spec coverage check

- `studio` column in DB — Tasks 1, 2, 5.
- Two-step stage + commit flow — Tasks 3, 4, 6, 10, 11.
- Metadata auto-extraction via `lofty` — Task 3.
- Artwork extraction + cropper — Tasks 3, 9, 11.
- Edit dialog with all fields — Tasks 8, 10.
- Admin Dashboard integration — Task 12.
- Manual testing steps — Task 13.

All spec requirements are covered.

### 2. Placeholder scan

- No "TBD", "TODO", or "implement later" strings.
- No vague steps like "add appropriate error handling" — error handling is explicit in the Rust code.
- No "similar to Task N" shortcuts.

### 3. Type consistency check

- `studio` field is `Option<String>` in Rust, `string | null` in TypeScript, `TEXT` in SQL — consistent.
- `SongDraft` fields match between Rust and TypeScript.
- `CommitSongRequest` includes all fields needed for DB insert.
- API endpoint paths are consistent: `/admin/songs/stage` and `/admin/songs/commit` in both backend router and frontend client.

### 4. Known gaps / follow-ups

- **Meilisearch indexing** is mentioned in the spec but skipped in the plan because `search/handlers.rs` currently returns a "not yet implemented" placeholder. When search is actually implemented, the commit handler should add the song to the Meilisearch index.
- **Unit tests** are not included; the project currently has no test suite for handlers. Manual testing (Task 13) is the verification strategy.

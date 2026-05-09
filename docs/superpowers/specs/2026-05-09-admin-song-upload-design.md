# Admin Song Upload with Artwork Cropping — Design Spec

**Date:** 2026-05-09
**Status:** Approved

---

## Goal

Add a song upload flow to the admin dashboard that:
1. Accepts audio file uploads.
2. Auto-extracts metadata and embedded artwork via `lofty`.
3. Opens an edit dialog for the admin to customize fields.
4. Provides a 1:1 artwork cropper (with upload fallback if no embedded art).
5. Commits the final song to the library with edited metadata and artwork.

---

## Architecture

**Approach A — Two-Step Staging Flow**

### Step 1: Stage (Upload + Extract)

- **Trigger:** Admin clicks **"Upload Song"** in the Library tab, selects an audio file via native file picker.
- **Frontend:** `POST /api/v1/admin/songs/stage` as `multipart/form-data` with the audio file.
- **Backend:**
  1. Saves the file to a temp staging directory: `<music_dir>/.staging/<uuid>/audio.<ext>`.
  2. Runs `lofty` to extract metadata: `title`, `artist`, `album`, `album_artist`, `track_number`, `year`, `genre`, `duration_seconds`, `bitrate_kbps`, `sample_rate_hz`, `file_format`.
  3. Attempts to extract embedded cover art via `lofty::picture::Picture`.
  4. If cover art found, saves it to `<music_dir>/.staging/<uuid>/artwork.<ext>`.
  5. Returns a `SongDraft` JSON containing all extracted fields, plus `staging_id` and `has_artwork: bool`.

### Step 2: Edit Dialog (Customize)

- **Frontend:** Opens a modal pre-filled with the `SongDraft`.
- **Editable fields:**
  - Title (string, required)
  - Artist (string, required)
  - Album (string, optional)
  - Album Artist (string, optional)
  - Track Number (number, optional)
  - Year (number, optional)
  - Genre (string, optional)
  - Studio (string, optional) — **new DB field**
- **Read-only display:** Duration, File Format, Bitrate, Sample Rate.
- **Artwork section:**
  - If `has_artwork` is true: displays the extracted image. Admin can crop to 1:1 via a cropper, or upload a replacement.
  - If `has_artwork` is false: admin can upload an image file, then crop it.
  - Admin can also choose "No artwork" to leave it blank.

### Step 3: Commit (Save to Library)

- **Frontend:** `POST /api/v1/admin/songs/commit` with:
  - JSON body containing `staging_id` + all edited metadata fields.
  - Optional multipart file: the cropped/replacement artwork image.
- **Backend:**
  1. Looks up the staged audio file by `staging_id`.
  2. Moves the audio file from `.staging/` to the final music directory, computing `file_key` relative to `base_dir`.
  3. If artwork was provided in the request: saves it to `<music_dir>/artwork/<song_id>.jpg` (or `.png`), setting `artwork_key`.
  4. If no artwork provided but `has_artwork` was true and admin did not remove it: moves the staged artwork to the final location.
  5. Inserts the song into the `songs` table with the edited metadata and `publisher_id` = current admin user ID.
  6. Adds the song to Meilisearch index.
  7. Cleans up the staging directory.
  8. Returns the created `Song` object.
- **Frontend:** Refreshes the Library table to show the new song.

---

## Data Model Changes

### New Field on `songs` Table

Add `studio TEXT` to both SQLite and PostgreSQL migration files (new migration).

### New Types

**Backend (`backend/src/admin/handlers.rs` or new module):**

```rust
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
}
```

**Frontend (`frontend/src/types/index.ts`):**

```typescript
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
```

---

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/api/v1/admin/songs/stage` | Upload audio file, extract metadata, return draft. |
| `POST` | `/api/v1/admin/songs/commit` | Commit staged song with edited metadata + artwork. |

---

## Frontend Components

### New Components

1. **`frontend/src/components/admin/UploadSongDialog.tsx`**
   - Wraps the entire upload flow.
   - State machine: `idle` → `uploading` → `editing` → `committing` → `done`.
   - In `editing` state, renders the metadata form + artwork cropper.

2. **`frontend/src/components/admin/ArtworkCropper.tsx`**
   - Uses `react-image-crop` or `react-easy-crop` for 1:1 cropping.
   - Props: `imageSrc: string | null`, `onCropComplete: (croppedImage: Blob) => void`, `onReplace: (file: File) => void`.
   - Shows upload area if no image.
   - Displays crop area with 1:1 aspect ratio lock.

3. **`frontend/src/components/admin/SongMetadataForm.tsx`**
   - Form with all editable fields.
   - Pre-filled with `SongDraft` values.
   - Validation: Title and Artist are required.

### Integration into AdminDashboard

- Add an **"Upload Song"** button to the Library tab header (next to search/pagination).
- Clicking it opens `<UploadSongDialog onClose={...} onSuccess={refetchSongs} />`.

---

## Backend Modules

### New File: `backend/src/admin/upload.rs`

- `stage_song` handler: receives multipart audio, saves to temp, extracts metadata + artwork via `lofty`, returns `SongDraft`.
- `commit_song` handler: receives JSON + optional multipart artwork, moves files, inserts DB record, indexes in Meilisearch, cleans up staging.
- Helper: `extract_metadata(path)` — wraps `lofty` logic (reusable from scanner.rs patterns).
- Helper: `extract_artwork(tagged_file)` — extracts first `Picture` from the tag.
- Helper: `cleanup_staging(staging_id)` — removes the staging directory.

### Router Updates

- Wire new handlers into `backend/src/main.rs` under the admin route group.
- Both endpoints require `admin.access` permission (already enforced by auth middleware on protected routes).

---

## Artwork Handling

### Supported Formats
- **Audio input:** `mp3`, `flac`, `ogg`, `opus`, `m4a`, `aac`, `wma`.
- **Artwork input:** `jpg`, `jpeg`, `png`, `webp`.
- **Artwork output:** Saved as-is (no transcoding) or as JPEG if cropping was performed (canvas `toBlob` from frontend cropper).

### Storage Keys
- Final audio: relative to `music_dir`, e.g., `uploads/<uuid>.mp3`.
- Final artwork: `artwork/<song_id>.<ext>`.

---

## Error Handling

| Scenario | Behavior |
|----------|----------|
| Unsupported audio format | Backend returns `400` with clear message. Frontend shows error toast. |
| `lofty` fails to read metadata | Still returns draft with defaults: title = filename, artist = "Unknown Artist", other fields blank. |
| No embedded artwork | `has_artwork: false`. Frontend shows upload prompt. |
| Staging file missing at commit | Backend returns `404`. Frontend shows error. |
| Artwork upload invalid format | Backend returns `400`. Frontend shows error. |
| Required fields empty at commit | Frontend validates before submitting. |

---

## Security Considerations

- Staging directory is inside the configured `music_dir`. Cleaned up after commit or on error.
- Staging files are not served publicly (only final files are accessible via the storage layer).
- File size limits on upload (e.g., 50MB for audio, 10MB for artwork).
- File type validation by extension and, where possible, magic bytes.

---

## Dependencies

### Frontend
- `react-image-crop` (or `react-easy-crop`) — image cropping UI.

### Backend
- No new crates. Uses existing `lofty`, `tokio`, `axum`, `sqlx`, `uuid`.

---

## Out of Scope

- Bulk upload (multiple files at once).
- Automatic album-level artwork sharing (each song stores its own artwork copy).
- Audio file transcoding.
- Lyrics upload.
- Advanced audio analysis (waveform, BPM, key).

---

## Testing Notes

- Backend: test staging with MP3 and FLAC (both with and without embedded artwork).
- Backend: test commit with and without artwork replacement.
- Frontend: test cropper with tall and wide images.
- Frontend: test form validation (empty title/artist).

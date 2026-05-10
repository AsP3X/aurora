# HLS Segmented Streaming with AES-128 Encryption

**Date:** 2026-05-10  
**Status:** Approved

## 1. Architecture Overview

### Transcoding Pipeline (one-time, at upload)
After a song passes the staging/commit flow, the backend runs FFmpeg to produce an HLS bundle that replaces the original file:

- HLS playlist (`stream.m3u8`)
- AES-128 encrypted `.ts` segments of uniform duration (4 seconds each)
- A per-song AES-128 key file (`key.bin`)

```
upload.mp3 ──► FFmpeg ──► stream.m3u8
                             │
                             ├── key.bin  (AES key, stored securely)
                             ├── seg001.ts (encrypted)
                             ├── seg002.ts (encrypted)
                             └── ...
```

### Storage Layout
Each song gets a dedicated prefix:

```
songs/{song_id}/stream.m3u8
songs/{song_id}/key.bin
songs/{song_id}/segments/0000.ts
songs/{song_id}/segments/0001.ts
...
```

This works identically for both `LocalStorage` and `NebulaStorage` backends.

### Key Management
A new table `song_encryption_keys` stores per-song AES-128 keys. Keys are encrypted at rest with a master secret (`MASTER_SECRET`) via AES-256-GCM and rotated periodically. Old keys remain valid for a grace period so in-flight streams don't break.

### Serving Architecture
Three new authenticated endpoints:
1. `GET /api/v1/songs/{id}/playlist` — returns `.m3u8` with `#EXT-X-KEY:URI="/api/v1/songs/{id}/key"` for local segments, or presigned segment URLs inline for NebulaStorage.
2. `GET /api/v1/songs/{id}/key` — validates JWT, returns the AES key as raw bytes.
3. `GET /api/v1/songs/{id}/segments/{segment}` — validates JWT, serves the segment.

For `NebulaStorage`, segment URLs in the `.m3u8` are rewritten to short-lived presigned URLs (reusing existing HMAC signing logic with a 60-second expiry). For `LocalStorage`, segments are streamed directly through Axum.

### Frontend Integration
The current `<audio src={streamUrl}>` is replaced with `hls.js` (or native Safari HLS). The frontend calls `/songs/{id}/playlist` to get the `.m3u8`, then hands it to `hls.js` which handles segment fetching, AES decryption, and playback automatically.

---

## 2. Components

### 2.1 Backend — New Modules

#### `backend/src/hls/encoder.rs` — `HlsEncoder`
A standalone FFmpeg wrapper that:
- Takes the path to a staged MP3/FLAC and produces an HLS bundle.
- Generates a random 16-byte AES-128 key, writes it to `key.bin`, and instructs FFmpeg to encrypt segments.
- Returns the output directory path and segment manifest info.
- Uses `tokio::process::Command` to run FFmpeg asynchronously so uploads aren't blocked.

```rust
pub struct HlsOutput {
    pub playlist_path: PathBuf,
    pub key_id: Uuid,
    pub segments: Vec<String>,
    pub total_duration: f64,
}
```

#### `backend/src/hls/key_store.rs` — `KeyStore`
Manages the `song_encryption_keys` table:
- `get_key(song_id) -> Option<Vec<u8>>` — decrypts and returns the raw AES key.
- `rotate_key(song_id) -> Result<(), AppError>` — generates a new key and re-encrypts segments. Called by a background task.
- `create_key_for_song(song_id) -> (Uuid, Vec<u8>)` — generates and persists a new key.

Keys at rest are encrypted with `MASTER_SECRET` via AES-256-GCM.

#### `backend/src/hls/handlers.rs` — `HlsHandlers`
Three Axum handlers:

1. **`get_playlist`** — `GET /api/v1/songs/{id}/playlist`
   - Authenticate via `auth_middleware`.
   - Fetch segment list from storage.
   - Generate the `.m3u8` dynamically.
   - For NebulaStorage, rewrite segment URIs to short-lived presigned URLs.
   - Return as `application/vnd.apple.mpegurl`.

2. **`get_key`** — `GET /api/v1/songs/{id}/key`
   - Authenticate via `auth_middleware`.
   - Fetch decrypted AES key from `KeyStore`.
   - Return as 16 raw bytes with `Content-Type: application/octet-stream`.

3. **`get_segment`** — `GET /api/v1/songs/{id}/segments/{segment_name}`
   - Authenticate via `auth_middleware`.
   - For NebulaStorage: generate a short-lived presigned URL and redirect (`302 Found`).
   - For LocalStorage: stream the segment file directly from disk.

#### `backend/src/hls/playlist.rs` — `PlaylistGenerator`
A utility that assembles `.m3u8` content dynamically:
- `#EXTM3U`, `#EXT-X-VERSION:3`, `#EXT-X-TARGETDURATION`
- `#EXT-X-KEY` tag pointing to the key endpoint (or inline key URI for future per-request keys)
- `#EXTINF` entries with segment durations
- `#EXT-X-ENDLIST` for VOD content

This avoids storing a static `.m3u8`, letting us inject per-session presigned URLs on the fly.

#### `backend/src/hls/mod.rs`
Public interface. Re-exports `HlsEncoder`, `KeyStore`, and mounts the three handlers into the router.

### 2.2 Backend — Modified Modules

#### `backend/src/storage/mod.rs` — Storage Trait
Add:

```rust
fn presigned_segment_url(&self, key: &str, expires_secs: u64) -> anyhow::Result<String>;
```

`NebulaStorage::presigned_segment_url` reuses existing HMAC signing but defaults to a 60-second expiry. `LocalStorage` returns a full backend URL since it doesn't support presigned URLs.

#### `backend/src/admin/upload.rs` — Upload Flow
After `commit_song` succeeds, spawn `HlsEncoder` in the background:
1. Move committed file to a temp directory.
2. Run FFmpeg → output to `{music_dir}/songs/{song_id}/`.
3. On success: update `songs` row to set `hls_ready = true`.
4. On failure: retry once, then log error and keep `hls_ready = false` (fallback to old stream endpoint).

#### `backend/src/songs/model.rs` — Song Model
Add fields:
- `hls_ready: bool`
- `hls_key_id: Option<Uuid>`
- `segment_count: Option<i32>`

#### `backend/src/songs/handlers.rs` — `get_stream_url`
Return the HLS playlist URL when `hls_ready = true`, otherwise fall back to the existing presigned file URL.

### 2.3 Database Schema

```sql
-- New table for per-song encryption keys
CREATE TABLE song_encryption_keys (
    song_id         UUID PRIMARY KEY REFERENCES songs(id) ON DELETE CASCADE,
    key_id          UUID NOT NULL,
    encrypted_key   BYTEA NOT NULL,      -- AES-256-GCM encrypted with master secret
    created_at      TIMESTAMPTZ DEFAULT now() NOT NULL,
    rotated_at      TIMESTAMPTZ
);

-- Add columns to existing songs table
ALTER TABLE songs ADD COLUMN hls_ready      BOOLEAN DEFAULT FALSE;
ALTER TABLE songs ADD COLUMN hls_key_id     UUID REFERENCES song_encryption_keys(key_id);
ALTER TABLE songs ADD COLUMN segment_count  INTEGER;
```

### 2.4 Frontend — New/Modified Components

#### `frontend/src/components/HlsPlayer.tsx` — `HlsPlayer`
Replaces direct `<audio src>` usage in `PlayerBar.tsx`.

```tsx
import Hls from 'hls.js';

export default function HlsPlayer({ playlistUrl, ...props }) {
  const audioRef = useRef<HTMLAudioElement>(null);

  useEffect(() => {
    const el = audioRef.current;
    if (!el || !playlistUrl) return;

    if (Hls.isSupported()) {
      const hls = new Hls({ enableWorker: true });
      hls.loadSource(playlistUrl);
      hls.attachMedia(el);
      return () => hls.destroy();
    } else if (el.canPlayType('application/vnd.apple.mpegurl')) {
      el.src = playlistUrl; // native HLS on Safari
    }
  }, [playlistUrl]);

  return <audio ref={audioRef} {...props} />;
}
```

#### `frontend/src/api/client.ts`
Add:

```ts
export async function fetchPlaylistUrl(id: string) {
  const res = await apiFetch(`/songs/${id}/playlist`);
  return res.url;
}
```

#### `frontend/src/context/PlayerContext.tsx` — `playSong`
Call `fetchPlaylistUrl` instead of `fetchStreamUrl`. The rest of the context (play/pause/seek/volume) works the same.

### 2.5 Dependencies

- Backend: `tokio` (already present) for `tokio::process::Command` with FFmpeg.
- Frontend: `hls.js` (npm install).
- DevOps: `ffmpeg` binary installed on the host/container.

---

## 3. Data Flow

### 3.1 Upload → Transcode → Ready

```
Admin uploads song
    │
    ▼
POST /admin/songs/stage (existing)
    │
    ▼
POST /admin/songs/commit (existing)
    │
    ▼
Spawn HlsEncoder (background task)
    │
    ├──► FFmpeg transcodes to HLS segments
    ├──► Generates AES-128 key
    ├──► Writes segments + key to storage
    │
    ▼
Insert row into song_encryption_keys
    │
    ▼
UPDATE songs SET hls_ready = true, hls_key_id = ?, segment_count = ?
```

### 3.2 User Playback (LocalStorage)

```
User clicks Play
    │
    ▼
GET /songs/{id}/playlist (JWT required)
    │
    ▼
Backend generates .m3u8:
    #EXT-X-KEY:METHOD=AES-128,URI="/api/v1/songs/{id}/key"
    #EXTINF:4.0, segments/0000.ts
    #EXTINF:4.0, segments/0001.ts
    ...
    │
    ▼
hls.js loads .m3u8
    │
    ├──► GET /songs/{id}/key → returns 16-byte AES key
    │
    ├──► GET /songs/{id}/segments/0000.ts → JWT auth, stream segment
    ├──► GET /songs/{id}/segments/0001.ts → JWT auth, stream segment
    ...
    │
    ▼
hls.js decrypts segments in browser and plays audio
```

### 3.3 User Playback (NebulaStorage)

```
User clicks Play
    │
    ▼
GET /songs/{id}/playlist (JWT required)
    │
    ▼
Backend generates .m3u8 with presigned segment URLs inline:
    #EXT-X-KEY:METHOD=AES-128,URI="https://nebula.example.com/.../key.bin?sig=...&expires=60"
    #EXTINF:4.0, https://nebula.example.com/.../0000.ts?sig=...&expires=60
    ...
    │
    ▼
hls.js loads .m3u8
    │
    ├──► Fetches key via presigned URL (60s expiry)
    ├──► Fetches segments via presigned URLs (60s expiry)
    │
    ▼
hls.js decrypts and plays audio
```

---

## 4. Error Handling

### Transcoding Errors
- FFmpeg non-zero exit → retry once after 2 seconds. If still failing, log error and leave `hls_ready = false`. The old stream endpoints still work.
- Disk full → abort transcoding, clean up temp files, return 507 to admin upload endpoint.
- Invalid audio file → catch early, return 400 with `invalid_audio_format`.

### Key Retrieval Errors
- `song_id` not found in `song_encryption_keys` → return 404.
- Master secret missing or corrupted → return 500, log critical alert.
- Key decryption failure → return 500, trigger rotation.

### Playlist Errors
- `hls_ready = false` for a song → fall back to old `stream_url` response (or return 503 with `transcoding_in_progress`).
- Storage backend unavailable → return 503 with `storage_unavailable`.

### Segment Errors
- Segment file missing → return 404. `hls.js` will retry the next segment.
- Presigned URL expired (for Nebula) → return 403. Frontend refreshes the playlist.
- JWT invalid or expired → return 401. Frontend redirects to login.

### Frontend Errors
- `hls.js` initialization failure → fall back to `<audio src>` using the old `stream-url` endpoint.
- Network interruption during playback → `hls.js` auto-retries with exponential backoff up to 3 times.

---

## 5. Testing

### Unit Tests
- `KeyStore`: test key generation, encryption/decryption with `MASTER_SECRET`, rotation logic.
- `PlaylistGenerator`: test that generated `.m3u8` contains correct `#EXTINF`, `#EXT-X-KEY`, and `#EXT-X-ENDLIST` tags.
- `HlsEncoder`: mock FFmpeg by using a small fixture MP3; assert output files exist and segment durations match target.

### Integration Tests
- Upload a fixture song → assert `hls_ready = true` within 30 seconds.
- Authenticated `GET /songs/{id}/playlist` → assert `.m3u8` body contains key URI and segment entries.
- `GET /songs/{id}/key` with valid JWT → assert 16 raw bytes.
- `GET /songs/{id}/key` without JWT → assert 401.
- `GET /songs/{id}/segments/0000.ts` with valid JWT → assert encrypted bytes.
- Playback test: use `hls.js` in a headless browser (Playwright) to play a fixture `.m3u8` and assert `audio.played.length > 0`.

### Security Tests
- Attempt to download all segments without JWT → assert every request returns 401.
- Attempt to reassemble downloaded segments without the key → assert output is unplayable noise.
- Attempt to reuse an expired presigned segment URL → assert 403.
- Verify the AES key returned by `/key` is never cached by checking `Cache-Control` headers.

### Performance Tests
- Transcode a 10-minute song and assert it completes in under 30 seconds on the CI runner.
- Serve 100 concurrent playlist requests and assert p95 latency < 50 ms.
- Serve 100 concurrent segment requests and assert p95 latency < 200 ms.

---

## 6. Rollout Plan

1. **Phase 1** — Backend-only: Add `HlsEncoder`, `KeyStore`, and DB schema. Keep old endpoints unchanged. Transcode songs in the background.
2. **Phase 2** — Add `/playlist`, `/key`, `/segments` endpoints. Add `hls.js` to frontend. Switch `PlayerContext` to use new endpoints when `hls_ready = true`.
3. **Phase 3** — Backfill: write a migration script that iterates existing songs and queues them for transcoding.
4. **Phase 4** — Deprecate old `stream_song` and `get_stream_url` endpoints once all songs are HLS-ready.

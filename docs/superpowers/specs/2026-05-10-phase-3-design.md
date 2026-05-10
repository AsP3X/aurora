# Phase 3 Design: Presigned URLs, Health Checks, and Observability

**Date:** 2026-05-10
**Scope:** Aurora backend + Nebula OS integration enhancements

## Goal
Enable frontend direct access to object storage via cryptographically signed URLs, add health checks for Docker orchestration, implement backend fallback handling, and expose basic storage metrics.

---

## 1. Presigned URL Architecture

### 1.1 Flow

```
Frontend (authenticated)          Backend                    Nebula OS
     |                              |                          |
     | GET /songs/{id}/stream-url   |                          |
     |----------------------------->|                          |
     |                              | lookup file_key          |
     |                              | generate presigned URL   |
     |                              |                          |
     |<-----------------------------| { url: "..." }           |
     |                              |                          |
     | GET http://nos/...?sig=&exp  |                          |
     |--------------------------------------------------------->|
     |                              |                          | validate sig
     |<---------------------------------------------------------| 200 + stream
```

### 1.2 Signature Algorithm

- **Secret:** `NOS_SIGNING_SECRET` (shared between backend and Nebula OS)
- **Format:** `signature = hex(hmac-sha256("GET\n{bucket}\n{key}\n{expires}"))`
- **Query string:** `?signature={sig}&expires={unix_ts}`
- **Default expiry:** 3600 seconds (1 hour)
- **Validation:** Nebula OS recomputes HMAC and compares. If `expires <= now()`, return 403.

### 1.3 Security Properties

- URLs are time-bound (expiry)
- URLs are cryptographically signed (tamper-proof)
- No JWT required on Nebula OS for valid presigned GET/HEAD
- PUT/DELETE remain JWT-protected regardless

---

## 2. Nebula OS Changes

### 2.1 New Config

```rust
pub signing_secret: Option<String>, // NOS_SIGNING_SECRET
```

### 2.2 New Middleware: `presigned_auth`

On GET/HEAD requests to `/:bucket/*key`:

1. If `Authorization` header present → validate JWT (existing behavior)
2. Else if `?signature` and `?expires` present → validate presigned signature
3. Else if `allow_public_read` is true → allow (future config)
4. Else → 401 Unauthorized

### 2.3 New Route: Health Check

```
GET /health → { "status": "ok", "version": "0.1.0" }
```

### 2.4 New Route: Metrics (Admin)

```
GET /metrics → {
  "total_objects": 1234,
  "total_bytes": 5678901234,
  "requests_total": 50000
}
```

Protected by JWT admin role.

### 2.5 Request Counter Middleware

Increment counters per HTTP method for `/metrics`.

---

## 3. Backend Changes

### 3.1 New Config Fields

```rust
pub signing_secret: String,       // NOS_SIGNING_SECRET
pub url_expiry_seconds: u64,      // default 3600
```

### 3.2 Storage Trait Extension

```rust
#[async_trait::async_trait]
pub trait Storage: Send + Sync + 'static {
    // existing methods...
    
    fn presigned_url(&self, key: &str, expiry_seconds: u64) -> anyhow::Result<String>;
}
```

- `LocalStorage`: returns `file://` path (or error if not applicable)
- `NebulaStorage`: generates HMAC signature and returns full URL with query params

### 3.3 New Route Handlers

**`backend/src/songs/handlers.rs`:**

```rust
pub async fn get_stream_url(
    State(state): State<Arc<AppState>>,
    claims: axum::Extension<crate::auth::Claims>,
    Path(id): Path<Uuid>,
) -> Result<Json<serde_json::Value>, AppError> {
    require_permission(&state.pool, &claims.sub, "library.view").await?;
    let row = sqlx::query_as::<_, (String,)>("SELECT file_key FROM songs WHERE id = $1")
        .bind(id.to_string())
        .fetch_optional(&state.pool)
        .await?;
    let (file_key,) = row.ok_or(AppError::NotFound)?;
    let url = state.storage.presigned_url(&file_key, state.url_expiry_seconds)
        .map_err(|e| AppError::Storage(e.to_string()))?;
    Ok(Json(json!({"url": url})))
}
```

Same pattern for `get_artwork_url`.

**Router registration in `main.rs`:**
```rust
.route("/api/v1/songs/{id}/stream-url", get(songs::handlers::get_stream_url))
.route("/api/v1/songs/{id}/artwork-url", get(songs::handlers::get_artwork_url))
```

### 3.4 Health Check on Startup

Backend pings Nebula OS `/health` on startup when `storage_mode=proxy`. Logs warning if unreachable but does not fail startup (allows graceful recovery).

### 3.5 Fallback Handling

If Nebula OS returns connection errors during operation:
- Log error with tracing
- Return `AppError::StorageUnavailable` to client
- (Future: auto-fallback to local storage)

---

## 4. Frontend Changes

### 4.1 API Client

```typescript
export async function fetchStreamUrl(id: string) {
  return apiFetch(`/songs/${id}/stream-url`) as Promise<{ url: string }>;
}

export async function fetchArtworkUrl(id: string) {
  return apiFetch(`/songs/${id}/artwork-url`) as Promise<{ url: string }>;
}
```

### 4.2 PlayerContext.tsx

```typescript
const playSong = useCallback(async (song: Song) => {
  setCurrentSong(song);
  setIsPlaying(true);
  setProgress(0);
  setDuration(song.duration_seconds || 0);
  setBuffered(0);

  try {
    const { url } = await fetchStreamUrl(song.id);
    requestAnimationFrame(() => {
      const audio = audioRef.current;
      if (!audio) return;
      audio.src = url;
      audio.currentTime = 0;
      audio.load();
      audio.play().catch(() => {});
    });
  } catch (e) {
    // fallback to backend proxy URL
    const fallbackUrl = streamUrl(song.id);
    // ... same as above with fallbackUrl
  }
}, []);
```

### 4.3 ArtworkImage.tsx

Use `fetchArtworkUrl` instead of direct backend URL.

---

## 5. Docker Compose Updates

```yaml
object-storage:
  # ... existing config ...
  healthcheck:
    test: ["CMD", "wget", "-q", "--spider", "http://localhost:9000/health"]
    interval: 10s
    timeout: 5s
    retries: 3
    start_period: 5s
```

---

## 6. Error Handling

| Scenario | Response |
|----------|----------|
| Presigned URL expired | 403 Forbidden |
| Presigned signature invalid | 403 Forbidden |
| Nebula OS unreachable | 503 Service Unavailable (backend) |
| Object not found | 404 Not Found |
| Missing both JWT and presigned params | 401 Unauthorized |

---

## 7. Testing Plan

1. **Unit:** Signature generation and validation roundtrip
2. **Integration:** Backend returns valid presigned URL, Nebula OS accepts it
3. **Integration:** Expired URL returns 403
4. **Integration:** Tampered signature returns 403
5. **Integration:** Health check returns 200
6. **Integration:** Metrics endpoint returns counts
7. **E2E:** Frontend streams audio via presigned URL

---

## 8. Files Changed

### Nebula OS
- `src/config.rs` — add `signing_secret`
- `src/auth.rs` — add `presigned_auth_middleware`
- `src/routes/mod.rs` — add `/health`, `/metrics`
- `src/storage/engine.rs` — add `count_objects()`, `total_bytes()`
- `src/server.rs` — wire new routes and middleware

### Backend
- `src/config.rs` — add `signing_secret`, `url_expiry_seconds`
- `src/storage/mod.rs` — add `presigned_url()` to trait
- `src/storage/nebula.rs` — implement `presigned_url()`
- `src/storage/local.rs` — stub `presigned_url()` (return error)
- `src/songs/handlers.rs` — add `get_stream_url`, `get_artwork_url`
- `src/main.rs` — register new routes, health check on startup

### Frontend
- `src/api/client.ts` — add `fetchStreamUrl`, `fetchArtworkUrl`
- `src/context/PlayerContext.tsx` — use presigned URLs
- `src/components/ArtworkImage.tsx` — use presigned URLs

### Docker
- `docker-compose.yml` — add healthcheck, `NOS_SIGNING_SECRET`

---

## 9. Spec Self-Review

- **Placeholder scan:** No TBD/TODO items.
- **Internal consistency:** Signature algorithm described in 1.2, implemented in 2.2 and 3.2.
- **Scope:** Focused on presigned URLs + observability. No unrelated features.
- **Ambiguity:** Signature format explicitly `METHOD\nbucket\nkey\nexpires`. Expiry default is 3600s.

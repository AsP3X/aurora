# Nebula OS — Aurora Object Storage Design

## Overview

Nebula OS (`nebula-os`) is a standalone, self-hosted object storage service for the Aurora stack. It provides a simple S3-like HTTP API for storing and retrieving binary blobs (music tracks, artwork, etc.) without any AWS dependencies. It is implemented in Rust using Axum, stores blobs as flat files on disk, and tracks metadata in SQLite.

## Goals

- Provide `PUT`, `GET`, `DELETE`, `HEAD` for objects with streaming and range-request support.
- Stay 100% independent of AWS / S3 SDKs.
- Integrate with the existing Aurora backend via three selectable modes: `direct`, `proxy`, `direct_access`.
- Reuse the same JWT secret and claims shape as the Aurora backend for seamless auth.
- Be simple to configure, deploy via docker-compose, and inspect/debug.

## Non-Goals (MVP)

- Multipart upload (resumable/chunked uploads).
- Versioning / soft delete.
- Replication or erasure coding.
- Bucket-level ACLs beyond basic JWT auth.
- Web UI for browsing objects.

## Architecture

```
nebula-os/
├── src/
│   ├── main.rs              # Server bootstrap
│   ├── config.rs            # Config from env (envy style, NOS_ prefix)
│   ├── server.rs            # Router assembly
│   ├── auth.rs              # JWT middleware (same Claims shape as backend)
│   ├── storage/
│   │   ├── mod.rs           # Storage trait + engine impl
│   │   ├── engine.rs        # Flat file I/O + SQLite metadata
│   │   └── types.rs         # ObjectMetadata, ListResult, etc.
│   └── routes/
│       ├── mod.rs
│       ├── object.rs        # PUT, GET, DELETE, HEAD /:bucket/*key
│       └── bucket.rs        # GET /:bucket (list objects)
```

## HTTP API (MVP)

| Method | Route | Auth | Description |
|--------|-------|------|-------------|
| `PUT` | `/:bucket/*key` | Bearer JWT | Stream upload. Supports `Content-Type` and `x-nd-custom-meta-*` headers. |
| `GET` | `/:bucket/*key` | Bearer JWT | Stream download. Supports `Range` header for audio seeking. |
| `HEAD` | `/:bucket/*key` | Bearer JWT | Same headers as GET, no body. |
| `DELETE` | `/:bucket/*key` | Bearer JWT | Hard delete object + metadata row. |
| `GET` | `/:bucket?prefix=foo&delimiter=/&limit=100&start_after=bar` | Bearer JWT | List objects in bucket. |

## Data Flow

### Upload (PUT `/:bucket/:key`)

1. Validate JWT.
2. Sanitize key (prevent directory traversal: no `..`, no absolute paths).
3. Stream body to a temp file: `<NOS_DATA_DIR>/.tmp/<uuid>`.
4. On completion, compute size and MD5-based ETag.
5. Atomically rename temp to final path: `<NOS_DATA_DIR>/<bucket>/<hash_prefix>/<sanitized-key>`.
   - `hash_prefix` = first 2 hex chars of `xxh3(key)` to avoid huge directories.
6. Upsert metadata row in SQLite.
7. Return `201 Created` with `ETag` header.

### Download (GET `/:bucket/:key`)

1. Validate JWT.
2. Query SQLite for metadata (size, mime_type, etag).
3. If not found, return `404`.
4. Open blob file; stream via `tokio_util::io::ReaderStream`.
5. If `Range` header present, serve `206 Partial Content` with correct byte boundaries.
6. Return `Content-Type`, `Content-Length`, `ETag`, `Last-Modified`.

### Delete (DELETE `/:bucket/:key`)

1. Validate JWT.
2. Delete metadata row from SQLite.
3. Delete blob file from disk.
4. Return `204 No Content`.

## SQLite Metadata Schema

```sql
CREATE TABLE objects (
    bucket      TEXT NOT NULL,
    key         TEXT NOT NULL,
    size        INTEGER NOT NULL,
    mime_type   TEXT,
    etag        TEXT,
    created_at  INTEGER NOT NULL,  -- unix timestamp
    updated_at  INTEGER NOT NULL,
    custom_meta TEXT,              -- JSON blob
    PRIMARY KEY (bucket, key)
);

CREATE INDEX idx_prefix ON objects(bucket, key);
```

## Integration Modes

The Aurora backend can integrate with Nebula OS in three modes, selected by `STORAGE_MODE`.

| Mode | What Backend Does | What Nebula OS Does | Use Case |
|------|-------------------|---------------------|----------|
| `direct` (default) | Backend's `Storage` trait writes/reads directly from `MUSIC_DIR` on local disk. Nebula OS is **not started**. | Not running. | Single-node deployments where simplicity matters. |
| `proxy` | Backend's `Storage` trait is replaced with an HTTP client that calls Nebula OS internally. Frontend still streams through backend (`/api/v1/songs/{id}/stream`). | Runs on internal port. Backend acts as a client. | Separate storage service without exposing it publicly. |
| `direct_access` | Backend stores object URLs in its DB. On stream/artwork requests, backend returns a redirect or signed URL to Nebula OS. Frontend streams directly from Nebula OS. | Runs on a public or internal port. Serves direct requests. | Maximum throughput; backend is not in the data path. |

### Configuration

**Backend env vars:**

```
STORAGE_MODE=direct|proxy|direct_access        # default: direct
OBJECT_STORAGE_URL=http://localhost:9000       # used when mode != direct
OBJECT_STORAGE_PUBLIC_URL=https://os.aurora.local # used in direct_access mode for frontend URLs
```

**Nebula OS env vars (all prefixed with `NOS_`):**

```
NOS_BIND_ADDR=0.0.0.0:9000
NOS_DATA_DIR=/data/blobs
NOS_META_PATH=/data/meta/metadata.db
NOS_JWT_SECRET=<same secret as backend>
NOS_MAX_BODY_SIZE=104857600      # 100 MB
NOS_ALLOW_PUBLIC_READ=false       # if true, GET/HEAD don't need auth
```

## Error Handling

All errors return a JSON body: `{"error": "description"}`.

| Status | When |
|--------|------|
| `200` | Success (GET, HEAD) |
| `201` | Created (PUT) |
| `204` | Deleted (DELETE) |
| `206` | Partial Content (GET with Range) |
| `400` | Bad Request (invalid bucket/key format) |
| `401` | Unauthorized (missing or bad JWT) |
| `403` | Forbidden (reserved for future bucket ACLs) |
| `404` | Not Found |
| `416` | Range Not Satisfiable |
| `500` | Internal server error (I/O, SQLite failures) |

## Security

- **Key sanitization:** Keys are sanitized to prevent directory traversal (`../`, absolute paths).
- **SQLite hardening:** `PRAGMA foreign_keys = ON`, `PRAGMA journal_mode = WAL`.
- **Atomic writes:** Temp files are created in the same filesystem as the final blob path to ensure atomic `rename`.
- **JWT reuse:** Nebula OS uses the exact same `Claims` shape and `jsonwebtoken` config as the Aurora backend, so tokens are interchangeable.

## Observability

- `tracing` with `env-filter`, same subscriber setup as backend.
- One span per request logging: `method`, `bucket`, `key`, `status`, `duration_ms`.
- Structured logs at `info` level for every object operation.

## Testing Strategy

- **Unit tests:** Test `StorageEngine` with in-memory SQLite and a temp dir for blobs.
- **Integration tests:** Use `reqwest` + `tokio::test` hitting the full Axum router.
- **Auth tests:** Valid token, expired token, missing token, wrong secret.
- **Range request tests:** Full file, first 1KB, last 1KB, invalid range.

## docker-compose Addition

```yaml
  object-storage:
    build:
      context: ./nebula-os
      dockerfile: Dockerfile
    container_name: aurora-nebula-os
    environment:
      NOS_BIND_ADDR: 0.0.0.0:9000
      NOS_DATA_DIR: /data/blobs
      NOS_META_PATH: /data/meta/metadata.db
      NOS_JWT_SECRET: ${JWT_SECRET:?JWT_SECRET must be set}
      NOS_MAX_BODY_SIZE: 104857600
    ports:
      - "9000:9000"
    volumes:
      - nebula_data:/data
    depends_on:
      - backend
```

Add `nebula_data:` to the top-level `volumes` section.

## Future Work (Post-MVP)

- Multipart / resumable upload.
- Pre-signed URLs for time-limited direct access.
- Bucket-level access control lists.
- Soft delete / versioning.
- Replication across multiple storage nodes.
- Admin API and web UI for browsing objects.

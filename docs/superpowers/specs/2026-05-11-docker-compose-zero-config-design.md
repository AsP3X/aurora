# Zero-Config Docker Compose with FFmpeg

**Date:** 2026-05-11
**Status:** Approved

## Goal

Provide a single `docker compose up` experience that launches the entire Aurora stack — frontend, backend, object storage, search, and database — with no manual configuration required. FFmpeg must be available inside the backend container for HLS segment transcoding. All important settings must be customizable via environment variables.

## Architecture

```
┌─────────────┐     ┌──────────────┐
│   Browser   │────▶│  Nginx (80)  │──┐
└─────────────┘     └──────────────┘  │
                                      │ serves static files
                                      │ proxies /api/v1/*
                                      ▼
                            ┌─────────────────┐
                            │   Frontend SPA  │
                            │  (React + Vite) │
                            └─────────────────┘
                                      │
                                      ▼
                            ┌─────────────────┐
                            │ aurora-backend  │
                            │   (Axum + FF)   │
                            │    port 3000    │
                            └─────────────────┘
                                      │
         ┌────────────────────────────┼────────────────────────────┐
         │                            │                            │
         ▼                            ▼                            ▼
┌──────────────┐          ┌──────────────┐          ┌──────────────┐
│   postgres   │          │  meilisearch │          │  nebula-os   │
│   port 5432  │          │   port 7700  │          │   port 9000  │
└──────────────┘          └──────────────┘          └──────────────┘
```

### Services

| Service | Image / Build | Port | Purpose |
|---------|-------------|------|---------|
| `frontend` | Build `frontend/Dockerfile` | `80` | Nginx serving built React SPA + API proxy |
| `backend` | Build `backend/Dockerfile` | `3000` | Rust Axum API with FFmpeg |
| `postgres` | `postgres:16-alpine` | `5432` | Primary database |
| `meilisearch` | `getmeili/meilisearch:v1.12` | `7700` | Full-text search index |
| `object-storage` | Build `nebula-os/Dockerfile` | `9000` | Blob / object storage |

## Configuration Strategy

### Layered Defaults

1. **`.env.example`** — checked into git. Contains all non-secret defaults and `GENERATE_ME` placeholders for secrets.
2. **`init-env.sh`** — idempotent script that copies `.env.example` → `.env` (if missing) and replaces `GENERATE_ME` with `openssl rand -hex 32` values.
3. **`.env`** — gitignored live config. Docker Compose auto-loads this.
4. **`docker-compose.yml`** — uses `${VAR:-fallback}` so services start even without `.env`.

### First-Run Flow

```bash
# Option 1: explicit init (one-shot container generates .env, then exits)
docker compose run --rm init-env
docker compose up -d

# Option 2: compose profile (init runs once automatically alongside services)
docker compose --profile init up -d
```

The `init-env` service is a one-shot Alpine container that runs `init-env.sh` and exits. It mounts the project directory so it can write `.env` to the host filesystem.

### Customizable Variables

| Variable | `.env.example` Default | Description |
|----------|----------------------|-------------|
| `DATABASE_URL` | `postgres://aurora:aurora@postgres:5432/aurora` | DB connection string |
| `POSTGRES_USER` | `aurora` | Postgres user |
| `POSTGRES_PASSWORD` | `aurora` | Postgres password |
| `POSTGRES_DB` | `aurora` | Postgres database name |
| `MEILI_MASTER_KEY` | `aurora-master-key` | Meilisearch master key |
| `JWT_SECRET` | `GENERATE_ME` | JWT signing secret |
| `SIGNING_SECRET` | `GENERATE_ME` | URL signing secret |
| `MASTER_SECRET` | `GENERATE_ME` | Admin / setup master secret |
| `NOS_JWT_SECRET` | `GENERATE_ME` | Nebula-OS JWT secret |
| `NOS_SIGNING_SECRET` | `GENERATE_ME` | Nebula-OS signing secret |
| `URL_EXPIRY_SECONDS` | `3600` | Signed URL lifetime |
| `STORAGE_MODE` | `proxy` | `proxy` or `direct` |
| `OBJECT_STORAGE_BUCKET` | `music` | Storage bucket name |
| `RUST_LOG` | `info` | Backend log level |
| `BIND_ADDR` | `0.0.0.0:3000` | API listen address |
| `MUSIC_DIR` | `/music` | Music library mount point |

## Dockerfile Changes

### Backend

The current runtime stage is `debian:bookworm-slim` without FFmpeg. HLS transcoding will fail.

**Change:** Install `ffmpeg` in the runtime stage.

```dockerfile
FROM debian:bookworm-slim
RUN apt-get update && apt-get install -y libssl3 ca-certificates ffmpeg \
    && rm -rf /var/lib/apt/lists/*
```

### Frontend (new)

Multi-stage build:

1. **Builder** — `node:22-alpine` installs pnpm, dependencies, builds with `VITE_API_URL=/api/v1`
2. **Runtime** — `nginx:alpine` serves `dist/` and proxies API calls

**Nginx config must handle:**
- `/api/v1/*` → `proxy_pass http://backend:3000/api/v1` (covers all API routes including HLS playlist/stream)
- SPA fallback: all non-asset paths → `index.html`

## Data Flow

### Upload → HLS Transcoding

1. User uploads song via frontend
2. Frontend → Nginx → backend `/api/v1/admin/upload`
3. Backend stores blob via Nebula-OS
4. Backend spawns `ffmpeg` to create HLS segments
5. Segments stored via Nebula-OS
6. Database updated with `hls_ready = true`

### Playback

1. Frontend requests song
2. If `hls_ready`, frontend fetches `/api/v1/songs/{id}/playlist`
3. Backend returns signed M3U8 playlist URL
4. `hls.js` loads segments via signed URLs from Nebula-OS
5. If not `hls_ready`, falls back to old `/api/v1/songs/{id}/stream` endpoint

## Error Handling

- **FFmpeg missing:** Container build fails at `apt-get install ffmpeg` — caught early, impossible at runtime.
- **Database not ready:** `depends_on` with `condition: service_healthy` on postgres.
- **Secrets not generated:** `.env.example` has `GENERATE_ME` placeholders. `init-env.sh` replaces them. If user deletes `.env`, compose falls back to hardcoded dev values in `docker-compose.yml` so the stack still starts (but warns in logs).
- **Frontend API URL wrong:** Built with `VITE_API_URL=/api/v1` — relative, so Nginx proxying always works regardless of hostname.

## Testing

1. `docker compose up` → all containers healthy
2. Open `http://localhost` → setup wizard appears
3. Upload a song → backend transcodes HLS, segments appear in Nebula-OS
4. Play song → `hls.js` loads playlist, segments stream correctly
5. Stop, edit `.env` (e.g., change `RUST_LOG=debug`), `docker compose up` → new log level applied

## Out of Scope

- Reverse proxy / TLS termination (Caddy/Nginx for production)
- Multi-stage secret rotation
- Docker Swarm / K8s deployment manifests
- Volume backup automation

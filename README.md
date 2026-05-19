# Aurora

Self-hosted music streaming server with a web player UI.

## Quick Start

### Prerequisites

- [Rust](https://rustup.rs/) (latest stable)
- [Node.js](https://nodejs.org/) (20+) with [pnpm](https://pnpm.io/) (repo enforces pnpm via `packageManager`)
- (Optional) [Docker](https://docker.com/) for PostgreSQL + Meilisearch

### Install dependencies

From the repository root:

```bash
pnpm install
```

This installs root tooling and the frontend workspace. The API is Rust (`backend/`); run `cargo build` there if you want to verify the backend separately.

For local API runs, generate secrets once (creates `backend/.env` and root `.env`):

```bash
./init-env.sh
```

The backend refuses to start with known weak or placeholder secrets (`GENERATE_ME`, `change-me-in-production`, `dev-*-change-me`).

### Start everything

```bash
pnpm run dev
```

This starts both services concurrently:

- **API** → `http://localhost:3000`
- **Web** → `http://localhost:5173`

### Start services individually

```bash
# API only (Rust + Axum)
pnpm run dev:backend

# Web only (Vite + React)
pnpm run dev:frontend
```

### Start with Docker (Postgres + Meilisearch)

Generate secrets once (creates `.env` from `.env.example` with random values, including `MEILI_MASTER_KEY` at 32+ characters):

```bash
docker compose --profile init run --rm init-env
```

If you already have a `.env` with the old `MEILI_MASTER_KEY=aurora-master-key` (17 characters), re-run `init-env` above or set a key of at least 32 characters—otherwise the backend exits on startup.

Then start the stack (Compose requires `JWT_SECRET`, `SIGNING_SECRET`, `MASTER_SECRET`, and `NOS_*` secrets in `.env`):

```bash
docker compose up --build
```

Then in another terminal:

```bash
pnpm run dev:frontend
```

The backend will auto-detect Postgres via `DATABASE_URL` when running inside Docker. For local dev it defaults to SQLite (`sqlite:aurora.db`).

### Docker Hub and image pulls

If `docker compose build` fails with `registry-1.docker.io` and `dial tcp ... connect: no route to host` (often over IPv6), the machine cannot reach Docker Hub. Try another network, restart Docker Desktop, or adjust Docker’s networking / DNS settings. A quick check is `docker pull hello-world`.

For CI or air-gapped builds, configure a [registry mirror](https://docs.docker.com/docker-hub/mirror/) or bake images on a machine that can reach the registry, then transfer them.

### Verify deployed API build

Unauthenticated `GET /api/v1/version` returns the crate version, optional `git_sha`, and `environment` (from `AURORA_ENVIRONMENT` / `GIT_SHA` at runtime).

## Project Structure

```
.
├── backend/          # Rust Axum API
│   ├── src/
│   ├── migrations/
│   └── Cargo.toml
├── frontend/         # React + Vite + Tailwind
│   ├── src/
│   └── package.json
├── docker-compose.yml
└── docs/
```

## Key Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `DATABASE_URL` | `sqlite:aurora.db` | Postgres or SQLite connection string |
| `JWT_SECRET` | `change-me-in-production` | JWT signing secret |
| `MUSIC_DIR` | `/music` | Path to music library |
| `BIND_ADDR` | `0.0.0.0:3000` | API listen address |
| `MEILI_URL` | (empty) | Meilisearch URL — leave empty to disable search indexing |
| `MEILI_MASTER_KEY` | (empty) | Required (32+ chars) when `MEILI_URL` is set |
| `CORS_ALLOWED_ORIGINS` | (empty) | Comma-separated origins; empty = permissive (dev) |
| `AURORA_ENVIRONMENT` | `development` | Set to `production` to hide detailed query parse errors on 400 responses |
| `GIT_SHA` | (unset) | Shown on `/api/v1/version`; set at build (`docker build --build-arg GIT_SHA=...`) or runtime |
| `ADMIN_LISTENING_RPM` | `120` | Per-admin rolling cap (60s window) for aggregate listening API POST/GET |
| `AUTH_LOGIN_RPM` | `15` | Per-IP rolling cap (60s window) for `POST /auth/login` |
| `AUTH_REGISTER_RPM` | `5` | Per-IP rolling cap (60s window) for `POST /auth/register` |
| `UPLOAD_RPM` | `20` | Per-admin-user rolling cap (60s window) for song stage/commit uploads |
| `HLS_SEGMENT_RPM` | `480` | Per-user-per-song rolling cap (60s window) for `GET .../segments/{name}` |

See `backend/src/config.rs` for full configuration options.

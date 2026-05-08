# Aurora

Self-hosted music streaming server with a web player UI.

## Quick Start

### Prerequisites

- [Rust](https://rustup.rs/) (latest stable)
- [Node.js](https://nodejs.org/) (20+) with `npm`
- (Optional) [Docker](https://docker.com/) for PostgreSQL + Meilisearch

### Install dependencies

```bash
npm install
```

### Start everything

```bash
npm run dev
```

This starts both services concurrently:

- **API** → `http://localhost:3000`
- **Web** → `http://localhost:5173`

### Start services individually

```bash
# API only (Rust + Axum)
npm run dev:backend

# Web only (Vite + React)
npm run dev:frontend
```

### Start with Docker (Postgres + Meilisearch)

```bash
docker-compose up
```

Then in another terminal:

```bash
npm run dev:frontend
```

The backend will auto-detect Postgres via `DATABASE_URL` when running inside Docker. For local dev it defaults to SQLite (`sqlite:aurora.db`).

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
| `MEILI_URL` | `http://localhost:7700` | Meilisearch URL |
| `MEILI_MASTER_KEY` | `aurora-master-key` | Meilisearch master key |

See `backend/src/config.rs` for full configuration options.

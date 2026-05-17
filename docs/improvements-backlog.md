# Aurora improvements backlog

Track and execute improvements one at a time. When you want work started, say which item number (or ID) to tackle—for example: *"Do item 6"* or *"Start IMP-006"*.

**Status legend:** `[ ]` not started · `[~]` in progress · `[x]` done · `[-]` deferred / won't do

**Last reviewed:** 2026-05-17 (from codebase and `docs/` audit)

### Completion tracker (security batch)

| ID | Status | Completed |
|----|--------|-----------|
| **IMP-001** | ✅ **Complete** | 2026-05-17 — Security audit re-run; all 3 vulns fixed; see `docs/security-audit.md` |
| **IMP-002** | ✅ **Complete** | 2026-05-17 — Random 12-byte nonce prefix; legacy zero-nonce decrypt + lazy re-encrypt on read |
| **IMP-003** | ✅ **Complete** | 2026-05-17 — Docker/Nebula `${VAR:?}`, `secrets.rs`, startup validation |
| **IMP-004** | ✅ **Complete** | 2026-05-17 — `redact.rs` helpers, TraceLayer URI scrubbing, auth/upload/Nebula log audit |
| **IMP-005** | ✅ **Complete** | 2026-05-17 — Auth/upload/HLS `PerKeyRateLimiter`; 429 via `AppError::RateLimited`; env-tunable RPM caps |

### Completion tracker (reliability batch)

| ID | Status | Completed |
|----|--------|-----------|
| **IMP-011** | ✅ **Complete** | 2026-05-17 — Transactional playlist reorder with two-phase positions; `playlist_reorder_transaction.rs` |
| **IMP-012** | ✅ **Complete** | 2026-05-17 — `search_index_queue`, retry worker, admin sync-status/retry-sync; hooks on song CUD |
| **IMP-013** | ✅ **Complete** | 2026-05-17 — `hls_encode_status`/`hls_encode_error`, `encode_job.rs`, admin retry + library badges |
| **IMP-014** | ✅ **Complete** | 2026-05-17 — `migration_parity.rs`, `.github/workflows/migrations.yml`, `pnpm test:migrations` |

> **Note:** The security review’s three findings (registration bypass, weak JWT defaults, role escalation) are **not** IMP-001/002/003 one-to-one. They were closed under **IMP-001** (audit + handlers) and **IMP-003** (compose/Nebula secrets). **IMP-002** is still the HLS encryption nonce task.

---

## How to use this document

1. Pick the next item (top-down by priority, or by your choice).
2. Tell the agent: **"Work on IMP-###"** (or the section number).
3. When finished, mark `[x]` and add a one-line **Done notes** entry under that item.
4. Optional: add **Blocked by** if an item depends on another.

---

## 1. Security & production hardening

### IMP-001 — Refresh security audit doc and close gaps

**Status:** ✅ Complete (2026-05-17)

- [x] Done
- **Priority:** High
- **Summary:** Re-run scenarios from `docs/security-audit.md` against current code; update the doc to list fixed vs open items; implement anything still open.
- **References:** `docs/security-audit.md`, `backend/src/auth/handlers.rs`, `backend/src/lib.rs`, `backend/src/admin/handlers.rs`
- **Done notes:** 2026-05-17 — All three vulns fixed; `secrets.rs`, compose `${VAR:?}`, Nebula validation, 7 regression tests; see `docs/security-audit.md`.

### IMP-002 — HLS key encryption: random AES-GCM nonce

**Status:** ✅ Complete (2026-05-17)

- [x] Done
- **Priority:** High
- **Summary:** Replace fixed zero nonce in `key_store.rs` with a random nonce per encryption; store nonce with ciphertext; migrate or re-encrypt existing rows if needed.
- **References:** `backend/src/hls/key_store.rs` (TODO at encrypt/decrypt)
- **Done notes:** Storage format `nonce(12) || ciphertext+tag`; legacy 32-byte blobs decrypt with zero nonce and re-encrypt on `get_key`; unit tests in `key_store::tests`.

### IMP-003 — Harden Docker / Nebula secrets for production

**Status:** ✅ Complete (2026-05-17)

- [x] Done
- **Priority:** High
- **Summary:** Avoid predictable `NOS_*` defaults in production; fail fast or require `${VAR:?}` on production compose profile; align with backend weak-secret checks.
- **References:** `docker-compose.yml`, `nebula-os/`, `backend/src/lib.rs`
- **Done notes:** 2026-05-17 — Completed with IMP-001/ Vuln 2: compose required secrets, `nebula-os/src/secrets.rs`, shared weak list in `backend/src/secrets.rs`.

### IMP-004 — Expand log redaction beyond email

**Status:** ✅ Complete (2026-05-17)

- [x] Done
- **Priority:** Medium
- **Summary:** Extend `redact.rs` (or helpers) for IPs, stream tickets, sensitive paths; audit tracing in auth, HLS, and upload paths.
- **References:** `backend/src/redact.rs`, hot-path `tracing` calls
- **Done notes:** 2026-05-17 — `redact.rs` helpers (IP, ticket, path, URL, filename, JWT); custom `TraceLayer` URI scrubbing; upload filename redaction; Nebula URL logs; auth middleware + `validate_ticket` debug audit lines.

### IMP-005 — Broader API rate limiting

**Status:** ✅ Complete (2026-05-17)

- [x] Done
- **Priority:** Medium
- **Summary:** Add consistent 429 behavior for auth (`login`/`register`), uploads, and HLS segment abuse; reuse `rate_limit` module patterns.
- **References:** `backend/src/rate_limit.rs`, `backend/src/error.rs` (`RateLimited`), route registration in `backend/src/lib.rs`
- **Done notes:** 2026-05-17 — `PerKeyRateLimiter` on login/register (per IP), upload stage/commit (per admin), HLS segments (per user+song); `AUTH_*_RPM` / `UPLOAD_RPM` / `HLS_SEGMENT_RPM` config; tests in `rate_limit_routes.rs`.

---

## 2. Features & product gaps

### IMP-006 — Implement Meilisearch-backed search

- [ ] **Status**
- **Priority:** High
- **Summary:** Replace `/api/v1/search` stub with real Meili indexing and queries; index on song create/update/delete; return ranked hits to the frontend.
- **References:** `backend/src/search/`, `docker-compose.yml` (meilisearch service), `frontend` search UX
- **Done notes:**

### IMP-007 — Library import strategy (post-scanner removal)

- [ ] **Status**
- **Priority:** High
- **Summary:** `backend/src/songs/scanner.rs` was removed—either restore a bounded filesystem scanner (with progress API) or document that library growth is admin-upload / Nebula staging only.
- **References:** git history / `MUSIC_DIR` in `backend/src/config.rs`, admin upload flow
- **Done notes:**

### IMP-008 — Account activation end-to-end

- [x] **Status**
- **Priority:** Medium
- **Summary:** Verify `require_account_activation` is enforced on login and surfaced in admin UI (approve/disable users).
- **References:** `backend/src/auth/handlers.rs`, admin users pages
- **Done notes:** Register omits JWT when activation required (`pending_activation`); login/middleware return 403 for disabled users; `GET /settings/activation`; Login page pending-approval UX; Admin Users banner + Approve action; regression tests in `security_audit_regressions.rs`.

### IMP-009 — Expose OpenAPI / Swagger UI

- [ ] **Status**
- **Priority:** Medium
- **Summary:** Wire existing `utoipa` / `utoipa-swagger-ui` deps to document `/api/v1` routes (e.g. `/api/docs`).
- **References:** `backend/Cargo.toml`, route modules under `backend/src/`
- **Done notes:**

### IMP-010 — Nebula `allow_public_read` decision

- [ ] **Status**
- **Priority:** Low
- **Summary:** Implement public read mode or remove the flag and TODO from `nebula-os`.
- **References:** `nebula-os/src/server.rs`
- **Done notes:**

---

## 3. Reliability & data integrity

### IMP-011 — Transactional playlist reorder

**Status:** ✅ Complete (2026-05-17)

- [x] Done
- **Priority:** Medium
- **Summary:** Wrap `reorder_songs` position updates in a single DB transaction so partial updates cannot corrupt order.
- **References:** `backend/src/playlists/handlers.rs` (`reorder_songs`)
- **Done notes:** 2026-05-17 — Single `BEGIN`/`COMMIT` with two-phase temp positions (10_000+) to satisfy `UNIQUE (playlist_id, position)`; fixed `Playlist.is_public` Any/SQLite decode; test `playlist_reorder_transaction.rs`.

### IMP-012 — Search index sync failure policy

**Status:** ✅ Complete (2026-05-17)

- [x] Done
- **Priority:** Medium
- **Summary:** After IMP-006, define behavior when Meili indexing fails after DB success (retry queue, admin warning, etc.).
- **Blocked by:** IMP-006 (recommended) — indexing + `/search` wired; full product search UX remains IMP-006
- **Done notes:** 2026-05-17 — `search_index_queue` migration; `SearchIndexer` + `SearchSyncService` (immediate try, DB-backed retry, 30s worker); admin `GET/POST /admin/search/sync-*`; banner on admin library; hooks on song commit/update/delete/toggle.

### IMP-013 — HLS encode failure visibility

**Status:** ✅ Complete (2026-05-17)

- [x] Done
- **Priority:** Medium
- **Summary:** Surface encode failures to admins (status badge, retry) instead of silent `hls_ready = false`.
- **References:** `backend/src/hls/`, admin library UI
- **Done notes:** 2026-05-17 — Migration `014` (`hls_encode_status`, `hls_encode_error`); shared `hls/encode_job.rs`; `POST /admin/songs/{id}/hls/retry`; admin library Streaming column + context-menu retry.

### IMP-014 — SQLite vs Postgres migration parity in CI

**Status:** ✅ Complete (2026-05-17)

- [x] Done
- **Priority:** Medium
- **Summary:** CI matrix or script that applies both `migrations/sqlite` and `migrations/postgres` cleanly.
- **References:** `backend/migrations/`
- **Done notes:** 2026-05-17 — `backend/tests/migration_parity.rs`; `.github/workflows/migrations.yml` (SQLite + Postgres 16 service); root `pnpm test:migrations`.

---

## 4. Testing, CI, and developer experience

### IMP-015 — GitHub Actions CI pipeline

- [ ] **Status**
- **Priority:** High
- **Summary:** Add workflow: `cargo test`, `cargo clippy`, `pnpm lint`, `pnpm build`; optional Docker build on `master` / PRs.
- **References:** new `.github/workflows/`
- **Done notes:**

### IMP-016 — Expand backend integration tests

- [ ] **Status**
- **Priority:** High
- **Summary:** Add tests for auth, permissions, playlists, stream tickets beyond existing admin listening tests.
- **References:** `backend/tests/`
- **Done notes:**

### IMP-017 — Frontend test harness

- [ ] **Status**
- **Priority:** Medium
- **Summary:** Add Vitest for units (`api/client`, contexts) and optional Playwright smoke (login → play).
- **References:** `frontend/package.json`
- **Done notes:**

### IMP-018 — Root package scripts for verification

- [ ] **Status**
- **Priority:** Low
- **Summary:** Add `pnpm test:backend`, `pnpm clippy`, etc. at repo root; document in README.
- **References:** root `package.json`, `README.md`
- **Done notes:**

### IMP-019 — Split and land the current large diff

- [ ] **Status**
- **Priority:** High (process)
- **Summary:** Organize unstaged work into logical PRs (security/redact, HLS, admin UI, …) per `git-commits.mdc`; merge via PR to `master`.
- **References:** current git status, `.cursor/rules/git-commits.mdc`
- **Done notes:**

---

## 5. Frontend & UX

### IMP-021 — Accessibility pass

**Status:** ✅ Complete (2026-05-17)

- [x] Done
- **Priority:** Medium
- **Summary:** Dialog focus traps, skip links, labeled admin controls, keyboard paths for player and queue.
- **References:** `frontend/src/components/`, admin pages
- **Done notes:** 2026-05-17 — `useFocusTrap` + `SkipLink`; `#main-content` landmarks; dialog a11y on Glass/Confirm/Entity/User/Upload modals; queue drawer focus trap; global player shortcuts (Space, arrows±seek, Shift+arrows track, Q queue, M mute, Escape); labeled admin/library search and form controls.

### IMP-022 — Consistent API error / loading UX

- [ ] **Status**
- **Priority:** Medium
- **Summary:** Surface `ApiError` messages via toasts or inline banners; reduce silent `console.error` only flows.
- **References:** `frontend/src/api/client.ts`, page components
- **Done notes:**

### IMP-023 — Offline / PWA (optional, later)

- [ ] **Status**
- **Priority:** Low
- **Summary:** Service worker for cached artwork and playback metadata only—not full offline DRM streams.
- **Done notes:**

---

## 6. Observability & ops

### IMP-024 — Unified health and readiness

- [ ] **Status**
- **Priority:** Medium
- **Summary:** Single readiness endpoint: DB, Meili, Nebula, FFmpeg availability for orchestrators.
- **References:** `backend/src/lib.rs`, Phase 3 plan in `docs/superpowers/plans/2026-05-10-phase-3.md`
- **Done notes:**

### IMP-025 — Operational roadmap doc

- [ ] **Status**
- **Priority:** Low
- **Summary:** Add `docs/ROADMAP.md` linking done / in-progress / deferred items from `docs/superpowers/` and this backlog.
- **References:** `docs/superpowers/`, this file
- **Done notes:**

### IMP-026 — Production Docker Compose profile

- [ ] **Status**
- **Priority:** Medium
- **Summary:** Document first-run (`init-env` profile) vs upgrades; production override with required secrets.
- **References:** `docker-compose.yml`, `init-env.sh`, `.env.example`
- **Done notes:**

---

## 7. Code quality & consistency

### IMP-027 — Remove duplicate `fuse.js` dependency

- [ ] **Status**
- **Priority:** Low
- **Summary:** Keep `fuse.js` only in the package that imports it (root vs `frontend/package.json`).
- **References:** root `package.json`, `frontend/package.json`
- **Done notes:**

### IMP-028 — Audit handlers for canonical `AppError` JSON

- [ ] **Status**
- **Priority:** Medium
- **Summary:** Ensure no `/api/v1` handlers return alternate error shapes; align `frontend/src/api/client.ts` if needed.
- **References:** `.cursor/rules/api-error-shape.mdc`, `backend/src/error.rs`
- **Done notes:**

### IMP-029 — Clippy in CI with warnings denied

- [ ] **Status**
- **Priority:** Medium
- **Summary:** Run `cargo clippy -D warnings` in CI; chip away at `unwrap`/`expect` in hot paths.
- **Blocked by:** IMP-015 (recommended)
- **References:** `backend/src/songs/handlers.rs`, `backend/src/hls/encoder.rs`
- **Done notes:**

### IMP-030 — Inline documentation pass on landed diff

- [x] **Status**
- **Priority:** Medium
- **Summary:** Ensure changed `*.rs`, `*.ts`, `*.tsx` follow Human/Agent comment rules for non-trivial logic.
- **References:** `.cursor/rules/inline-documentation.mdc`
- **Done notes:** Audited IMP-021 landed diff (HLS encode job, search sync queue, admin handlers/upload, frontend library/admin API). Added Human/Agent pairs on non-trivial blocks that only had module-level docs (progress scaling, Meili spawn/backoff, delete/retry flows, Song HLS types, DataTable breakpoints).

---

## Quick wins (same IDs as above)

These are the highest leverage items if you want fast progress without reading the full list:

| ID | Title | Status |
|----|--------|--------|
| IMP-006 | Meilisearch search | ⬜ |
| IMP-015 | GitHub Actions CI | ⬜ |
| IMP-002 | HLS GCM nonce fix | ✅ |
| IMP-009 | OpenAPI / Swagger | ⬜ |
| IMP-001 | Security audit refresh | ✅ |
| IMP-003 | Docker/Nebula secrets | ✅ |

---

## Suggested default order

1. IMP-019 — land/split current work safely  
2. ~~IMP-001, IMP-002, IMP-003~~ — security audit, HLS nonce, compose secrets (**done**)  
3. IMP-015, IMP-016 — CI and tests  
4. IMP-006 — search  
5. IMP-007 — library import story  
6. Everything else by your priority  

---

## Changelog

| Date | Change |
|------|--------|
| 2026-05-17 | Initial backlog from codebase audit |
| 2026-05-17 | IMP-001 completed (security audit re-verification) |
| 2026-05-17 | IMP-003 completed (Docker/Nebula secret hardening with Vuln 2) |
| 2026-05-17 | IMP-002 completed (HLS random AES-GCM nonce + legacy migration) |
| 2026-05-17 | IMP-011 completed (transactional playlist reorder) |
| 2026-05-17 | IMP-012 completed (Meilisearch sync retry queue + admin warnings) |
| 2026-05-17 | IMP-013 completed (HLS encode failure visibility + admin retry) |
| 2026-05-17 | IMP-014 completed (SQLite/Postgres migration parity CI) |

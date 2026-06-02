# Security Audit — Aurora Music Server

**Date:** 2026-06-03  
**Scope:** Static code review of authentication, authorization, setup/bootstrap, JWT lifecycle, rate limiting, cryptographic primitives (tickets, HLS keys, presigned URLs), file upload pipeline, storage abstraction (local + Nebula), HLS encoding/serving, CORS and reverse-proxy behavior, DB query scoping, permissions/groups, secret validation, and Docker Compose deployment wiring. Reviewed against existing `backend/tests/security_audit_regressions.rs` and prior `docs/security-audit.md`. No live penetration testing or third-party dependency CVE scan performed.
**Method:** Route table + middleware analysis (`lib.rs`), handler authz checks, middleware DB reloads, secret validation paths, key derivation + HMAC/AES usage, multipart + temp file handling in uploads, `Storage` trait implementations, nginx proxy vs client URL construction, `.env*` + compose interpolation, and permission evaluation queries.

Use the checkboxes below to track remediation as you work through each item.

---

## Executive summary


| Severity | Count | Open |
| -------- | ----- | ---- |
| High     | 2     | 2    |
| Medium   | 5     | 5    |
| Low      | 1     | 1    |


**Recommended fix order:** SEC-001 → SEC-002 → SEC-003 → SEC-004 → SEC-005 → SEC-006 → SEC-007 → SEC-008

---

## Findings

### SEC-001 — Unauthenticated first-boot setup allows admin takeover (race + exposure window)

- **Not started** / [ ] **In progress** / [ ] **Fixed** / [ ] **Accepted risk**


| Field              | Detail                                                                                                                                                                                        |
| ------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Severity**       | High                                                                                                                                                                                          |
| **Category**       | Unauthorized action / account takeover                                                                                                                                                        |
| **Impacted files** | `backend/src/setup/handlers.rs` (`setup`, `setup_status`), `backend/src/lib.rs` (public route wiring), `docker-compose.yml` (ports + profiles), `init-env.sh`                                   |
| **Routes**         | `POST /api/v1/setup` (also status/info pre-checks)                                                                                                                                            |
| **Audit script**   | Extend `backend/tests/security_audit_regressions.rs` (analogous to prior Vuln 1/2 tests); manual reproduction on fresh DB                                                                 |

**Description**

The sole gate for the initial `POST /api/v1/setup` (which creates the first `role=admin` user and seeds settings) is a `COUNT(*) FROM users == 0` check performed inside the handler. There is no bootstrap token (`SETUP_TOKEN`), one-time URL, or binding restriction (localhost-only). The route is wired in the public router (no `auth_middleware`). Concurrent requests on a fresh instance can race; the first writer wins admin.

**Evidence**

```rust
// setup/handlers.rs:182
let count: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM users")
    .fetch_one(&setup_pool).await?;
if count > 0 { return Err(AppError::Conflict(...)); }

// then INSERT role=admin, group admin membership, settings...
```

```rust
// lib.rs:247
.route("/api/v1/setup", post(setup::handlers::setup))
```

No other guard in `create_router` for this mutation.

**Exploit scenario**

1. Operator brings up `docker compose up --build` (or `pnpm run dev:backend`) on a publicly reachable or LAN-exposed host before running the setup wizard themselves.
2. Attacker (or automated scanner) discovers the open `/api/v1/setup/status` returning `{"setup_complete":false}`.
3. Attacker POSTs a minimal setup body with their email/password and becomes the sole initial admin.
4. Legitimate operator later sees setup already complete or receives 409.

**Impact**

Full instance compromise on first boot: attacker controls all users, can upload arbitrary audio (with HLS), manage permissions/groups, view all listening stats, delete content, change settings, etc. Data stored under the attacker's control.

**Remediation**

1. Add an optional bootstrap secret (`SETUP_TOKEN` or `AURORA_SETUP_TOKEN`) that must be supplied (header or body) on `POST /setup` (and perhaps the test endpoints). Fail with 401/403 if missing or wrong when the env var is configured.
2. Alternatively / in addition: bind the setup mutation to localhost or a configurable "setup CIDR" list until complete (enforce in middleware or handler using `X-Forwarded-For` after trusting proxies).
3. Document in README + docker section: "Expose the service only after running `init-env` and completing setup, or use a one-time `SETUP_TOKEN`".
4. Consider a `setup_state` table with CAS or advisory lock for the first admin creation to eliminate the pure count() race even with a token.
5. After first admin exists, the setup routes should remain 409 (or be removed from the router) even with a token.

**Verification**

- Fresh DB: `POST /api/v1/setup` without a valid `SETUP_TOKEN` (when configured) returns 401/403.
- With correct token on clean DB, setup succeeds exactly once.
- Post-setup: further setup attempts return 409 regardless of token.
- Add regression test: `setup_without_bootstrap_token_rejected`, `setup_with_token_creates_admin`.
- `cargo test --test security_audit_regressions` continues to pass (extend the file).
- On a docker stack with `SETUP_TOKEN` set, unauthenticated setup probe fails.

---

### SEC-002 — Stale JWT role allows continued admin access after demotion

- **Not started** / [ ] **In progress** / [ ] **Fixed** / [ ] **Accepted risk**


| Field              | Detail                                                                                                                                                                                        |
| ------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Severity**       | High                                                                                                                                                                                          |
| **Category**       | Unauthorized action / privilege escalation                                                                                                                                                    |
| **Impacted files** | `backend/src/auth/mod.rs` (`auth_middleware`), `backend/src/admin/handlers.rs` (`update_user_role`, `require_admin_access` callers), `backend/src/permissions/mod.rs` (`require_admin_access`), `auth/handlers.rs` (Claims + create_token) |
| **Routes**         | All `/api/v1/admin/*` (role change, user delete, settings, library admin, listening stats, etc.)                                                                                              |
| **Audit script**   | Extend `backend/tests/security_audit_regressions.rs` (build on `update_user_role_*` tests)                                                                                                    |

**Description**

`auth_middleware` decodes the JWT into `Claims` (containing `role`), verifies signature/expiry, then only re-checks `users.enabled` (via short cache) from the DB. It never reloads `role` (or group memberships) from the database. `require_admin_access` and several admin handlers short-circuit on `claims.role == "admin"`. `update_user_role` writes the new role + adjusts the admin `group_memberships` row, but never invalidates existing tokens for the target user.

**Evidence**

```rust
// auth/mod.rs:58
let enabled: Option<(i64,)> = sqlx::query_as(
    "SELECT CAST(enabled AS INTEGER) AS enabled FROM users WHERE id = $1"
)...
// only enabled; role stays in the already-decoded claims
request.extensions_mut().insert(claims);
```

```rust
// permissions/mod.rs:117
pub async fn require_admin_access(...) {
    if role == "admin" { return Ok(()); }  // from stale claims
    if check_permission(...) ... "admin.access" or "users.manage"
```

```rust
// admin/handlers.rs:343 (inside update_user_role)
if claims.role != "admin" { 403 }
... UPDATE users SET role = ...
... INSERT/DELETE group_memberships for admin group
```

JWT TTL is fixed at 24 hours (`create_token`).

**Exploit scenario**

1. Alice (admin) and Bob (listener) both have valid JWTs.
2. Alice calls `PUT /api/v1/admin/users/{bob-id}/role` with `{ "role": "listener" }` (demotes Bob and removes him from the admin group).
3. Bob re-uses his pre-demotion JWT (still carrying `role: "admin"`).
4. Bob successfully calls admin-only routes (`list_admin_songs`, `delete_song`, `get_admin_stats`, `update_user_enabled`, permission grants, etc.) until his token naturally expires or he logs in again.

Even a non-role admin (someone with only `users.manage` via a group) can be affected in the other direction for certain checks.

**Impact**

Privilege persistence after explicit demotion. A compromised or former admin account retains full control for up to 24 hours. Also affects any permission granted/revoked via groups while a token is live (because many paths trust the embedded role or snapshot permissions returned at login).

**Remediation**

1. In `auth_middleware`, after the enabled check, also load the current `role` from `users` (and optionally effective permissions) and overwrite `claims.role` (and perhaps attach a fresh permissions list) before inserting into extensions. All downstream `require_*` and handler logic must use the DB-sourced value.
2. On any role change (especially admin ↔ non-admin) or removal from the implicit admin group, bump a `token_version` / `session_epoch` column on the user row and embed the version in the JWT at issue time. Reject tokens whose embedded version < current DB version.
3. Provide an explicit "revoke all sessions" admin action (and call it automatically from `update_user_role` and password-reset paths).
4. Consider shorter lifetimes for tokens issued to admin-role users, or switch to shorter access tokens + refresh (with revocation list).
5. Update `create_token` / `AuthResponse` flows and the regression tests.

**Verification**

- After demotion via `update_user_role`, the subject's prior JWT immediately receives 403 on any `/admin/*` route (even before natural expiry).
- New login for the demoted user yields a listener token that cannot call admin APIs.
- `cargo test --test security_audit_regressions` (add `stale_jwt_after_demotion_rejected` test exercising the full flow with two admin accounts or bootstrap).
- Manual: login as subject, demote from another admin, reuse old token → 403.
- Role changes via direct `user_permissions` / group membership also take effect immediately for new requests.

---

### SEC-003 — Login/register rate limits fully trust spoofable `X-Forwarded-For` / `X-Real-IP`

- **Not started** / [ ] **In progress** / [ ] **Fixed** / [ ] **Accepted risk**


| Field              | Detail                                                                                                                                                                                        |
| ------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Severity**       | Medium                                                                                                                                                                                        |
| **Category**       | Brute force / account enumeration / DoS                                                                                                                                                       |
| **Impacted files** | `backend/src/rate_limit.rs` (`client_ip_from_headers`), `backend/src/auth/handlers.rs` (`login`, `register`), `lib.rs` (rate limiter wiring)                                                  |
| **Routes**         | `POST /api/v1/auth/login`, `POST /api/v1/auth/register`                                                                                                                                       |
| **Audit script**   | Extend `backend/tests/rate_limit_routes.rs` or add to security regressions                                                                                                                    |

**Description**

`client_ip_from_headers` unconditionally prefers `X-Forwarded-For` (first hop) then `X-Real-IP`. The value is used directly as the key into the in-memory `PerKeyRateLimiter` for the low RPM auth limits (default 15 login / 5 register per 60s). No configuration of trusted proxy CIDRs exists; any client (or any proxy that forwards client-supplied headers) can supply arbitrary values.

**Evidence**

```rust
// rate_limit.rs:52
pub fn client_ip_from_headers(headers: &HeaderMap) -> String {
    if let Some(value) = headers.get("x-forwarded-for") {
        if let Some(first) = text.split(',').map(str::trim).find(...) { return first; }
    }
    if let Some(value) = headers.get("x-real-ip") { ... }
    "unknown".to_string()
}
```

Used in:

```rust
let ip = crate::rate_limit::client_ip_from_headers(&headers);
crate::rate_limit::enforce(&state.auth_login_rl, &ip)?;
```

Nginx in the compose does set `X-Forwarded-For $proxy_add_x_forwarded_for`, but the backend port is also directly exposed (`3000:3000`), and the frontend client constructs `hostname:3000` URLs (see SEC-004), so direct attacker connections to the API are realistic.

**Exploit scenario**

Attacker sends bursts of `POST /auth/login` (or register) with a rotating `X-Forwarded-For: 203.0.113.{N}` (or random IPv6) on each request. Each spoofed IP gets its own small bucket; the real source IP (or the nginx proxy IP) never hits the limit. Successful password guesses or account creation spam succeed under the per-"IP" caps.

**Impact**

Weakened protection against credential stuffing, password spraying, and mass registration abuse. Combined with the lack of per-email backoff or account lockout, makes online guessing more practical.

**Remediation**

1. Add a config option `TRUSTED_PROXY_CIDRS` (or `RATE_LIMIT_TRUSTED_PROXIES`). Only trust `X-Forwarded-For` / `X-Real-IP` when the immediate peer (or the last hop in a chain) is within a trusted range.
2. When not behind a trusted proxy, always use the TCP peer address (Axum `ConnectInfo` or equivalent).
3. Add secondary defenses: per-email rate limit or exponential backoff after N failures for the same email (independent of IP), plus optional CAPTCHA or proof-of-work on repeated failures.
4. Update nginx.conf example + README to document the real_ip / set_real_ip_from directives if operators want to rely on XFF.
5. Consider logging the raw + derived IP at warn level on rate limit hits.

**Verification**

- Direct connection (no trusted proxy) supplying `X-Forwarded-For` does not create separate rate limit buckets; the source is still limited.
- With a correctly configured trusted proxy in front, the first client IP from XFF is used and spoofing by the client is ignored.
- Bursts under a fixed spoofed IP hit 429; rotation does not evade when the proxy is untrusted.
- Add a test in `rate_limit_routes.rs` or security regressions that exercises the header path vs peer IP.
- `cargo test rate_limit` and the new cases pass.

---

### SEC-004 — Frontend constructs absolute backend URLs (`:3000`), bypassing nginx reverse proxy in Docker deploys

- **Not started** / [ ] **In progress** / [ ] **Fixed** / [ ] **Accepted risk**


| Field              | Detail                                                                                                                                                                                        |
| ------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Severity**       | Medium                                                                                                                                                                                        |
| **Category**       | Configuration / information disclosure / rate-limit bypass                                                                                                                                    |
| **Impacted files** | `frontend/src/api/client.ts` (`getApiBase`), `frontend/nginx.conf`, `docker-compose.yml` (ports + backend service), `backend/src/lib.rs` (CORS + rate limit XFF handling)                       |
| **Routes**         | All API calls from the SPA in a composed deployment                                                                                                                                           |

**Description**

`getApiBase()` falls back to `` `${protocol}//${hostname}:3000/api/v1` `` unless `VITE_API_URL` is set at build time. In the Docker Compose production image the SPA is served from the `frontend` nginx on port 80 (which proxies `/api/v1/` to the `backend` container), but the browser JS still talks directly to port 3000 on the host-exposed address.

**Evidence**

```ts
// frontend/src/api/client.ts:6
function getApiBase(): string {
  if (import.meta.env.VITE_API_URL) return ...
  return `${window.location.protocol}//${window.location.hostname}:3000/api/v1`;
}
```

Compose:

```yaml
backend:
  ports: ["3000:3000"]
frontend:
  ports: ["80:80"]
  # nginx location /api/v1/ { proxy_pass http://backend:3000/... }
```

Result: browser fetches go direct to the backend port (bypassing nginx `X-Forwarded-For` / `X-Real-IP` headers that would be set by the proxy), CORS must be permissive or explicitly list the origin, and any future tightening of the backend (auth, rate limits based on real client IP) is undermined.

**Exploit scenario**

- Attacker reaches the host on port 3000 directly (exposed by compose) and benefits from the current `CorsLayer::permissive()` when `CORS_ALLOWED_ORIGINS` is empty.
- Rate limit keys become the attacker's direct IP or easily spoofed values (see SEC-003) instead of the values the nginx would have produced.
- Any nginx-level WAF, body-size, or logging rules for `/api` are evaded by SPA traffic.

**Impact**

Incorrect trust boundaries in the canonical deployment model. Reduced effectiveness of rate limiting and proxy hardening. Makes it harder to run the backend on a non-public port or internal network only.

**Remediation**

1. Change the client fallback to use a same-origin relative base (`/api/v1`) when the page was loaded from the production frontend origin. Only force a different origin when `VITE_API_URL` (or an equivalent runtime config) explicitly points at a separate API host.
2. Document that in Docker / production the SPA must be served from the same origin (or a properly CORS-configured frontend) and set `VITE_API_URL` at build if a separate API domain is used.
3. Remove or make optional the `3000:3000` port publish in compose for the "full stack" profile, or document that direct 3000 access is for local dev only and should be firewalled.
4. Consider serving a small runtime config JSON (`/config.json`) from nginx that the client can fetch at bootstrap time to learn the API base.

**Verification**

- In a `docker compose up` stack, open the UI at http://localhost/ and inspect the Network tab: all `/api/v1` requests go to the same host (no `:3000` port in the URL) or to the explicitly configured `VITE_API_URL`.
- Direct browser fetch to `http://localhost:3000/api/v1/...` is still possible for debugging but is not what the SPA uses.
- With `CORS_ALLOWED_ORIGINS` set to the frontend origin only, the proxied (or relative) calls succeed; direct cross-port calls from the old client would be blocked (as intended).
- Update any Vite `define` or env docs.

---

### SEC-005 — Independent generation of `SIGNING_SECRET` vs `NOS_SIGNING_SECRET` breaks presigned URLs (and therefore playback) in `STORAGE_MODE=proxy` Docker deploys

- **Not started** / [ ] **In progress** / [ ] **Fixed** / [ ] **Accepted risk**


| Field              | Detail                                                                                                                                                                                        |
| ------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Severity**       | Medium                                                                                                                                                                                        |
| **Category**       | Configuration / denial of service (playback)                                                                                                                                                  |
| **Impacted files** | `init-env.sh`, `.env.example` (root + backend + nebula-os), `docker-compose.yml` (environment blocks), `backend/src/storage/nebula.rs` (NebulaStorage + generate_signature), `nebula-os/src/auth.rs` (verify_signature + presigned_or_jwt_middleware), `backend/src/config.rs` + `lib.rs` (storage selection) |
| **Routes**         | `GET /api/v1/songs/{id}/playlist`, segment URLs returned inside it, `get_stream_url` / artwork presigned paths when nebula is active                                                          |

**Description**

`init-env.sh` runs `init_env_file` independently on the three `.env` files, replacing each `GENERATE_ME` with a fresh random value. Root `.env` therefore ends up with a `SIGNING_SECRET` different from `nebula-os/.env`'s `NOS_SIGNING_SECRET`. Docker Compose passes:

- `SIGNING_SECRET: ${SIGNING_SECRET:-}` (the backend one) into the `backend` container
- `NOS_SIGNING_SECRET: ${NOS_SIGNING_SECRET:-}` into the `object-storage` container

`NebulaStorage::new(..., &config.signing_secret)` (the backend `SIGNING_SECRET`) is then used to compute HMAC signatures for presigned `?signature=...&expires=...` URLs returned to the browser for direct segment/artwork fetches and for the HLS playlist body when `is_nebula`. Nebula only accepts signatures computed with its own `NOS_SIGNING_SECRET`.

**Evidence**

(See root `.env.example` lines 12 and 17; nebula `.env.example` line 4; compose lines for `SIGNING_SECRET` vs `NOS_SIGNING_SECRET`; `backend/src/storage/nebula.rs:35` and `generate_signature`; `nebula-os/src/main.rs:18` + `auth.rs:149` `verify_signature`.)

No code in init-env, compose, or the two services ever forces or copies the two signing values to be identical.

**Exploit scenario**

(Not really an "exploit" of auth, but a reliable breakage.)

Operator follows the documented Docker path (`docker compose --profile init run --rm init-env && docker compose up --build`). With `STORAGE_MODE=proxy` (the default), any song playback that relies on presigned URLs (progressive fallback, HLS segments for nebula, artwork variants) receives 401/403 from Nebula because the signatures were minted with the wrong secret. Users see broken player, 403s in console, etc.

**Impact**

Nebula proxy storage mode (the recommended path for multi-node / durability) is non-functional out of the box after the documented init + up flow. Operators must manually edit `.env` files post-generation to make `SIGNING_SECRET == NOS_SIGNING_SECRET` (while keeping the two JWT secrets distinct). This is a foot-gun and documentation gap.

**Remediation**

1. In `init-env.sh`, after generating, ensure that the root `SIGNING_SECRET` (or a new `SHARED_SIGNING_SECRET`) is written into the places that the backend will read as its nebula signing secret, and that `NOS_SIGNING_SECRET` receives the same value. Or document a single `SIGNING_SECRET` that both root and nebula-os consume.
2. Update `docker-compose.yml` so the `object-storage` service receives `NOS_SIGNING_SECRET: ${SIGNING_SECRET:-}` (or introduce an explicit shared var) and remove the independent `NOS_SIGNING_SECRET=GENERATE_ME` from the nebula example if it is no longer independently generated.
3. Update README, docker section, and the nebula design doc. Add a health/integration check at nebula startup or in `create_app_state` that exercises a presigned URL round-trip when in proxy mode.
4. Consider renaming for clarity: backend's `SIGNING_SECRET` is the shared one for both stream tickets and nebula presigns.

**Verification**

- After `init-env` + `docker compose up`, a song uploaded in proxy mode plays end-to-end (library grid → detail → play, including HLS if transcoded, and artwork).
- `grep -E 'SIGNING_SECRET|NOS_SIGNING_SECRET' .env*` shows the two relevant values are identical (the ones used by backend client and nebula verifier).
- Unit test or integration test in `nebula-os/tests/` or backend that constructs a NebulaStorage with the signing secret and verifies a round-trip signature that nebula accepts.
- `cargo test` + manual compose smoke test.

---

### SEC-006 — Pre-setup database connection test allows unauthenticated probing of arbitrary (internal) Postgres instances

- **Not started** / [ ] **In progress** / [ ] **Fixed** / [ ] **Accepted risk**


| Field              | Detail                                                                                                                                                                                        |
| ------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Severity**       | Medium                                                                                                                                                                                        |
| **Category**       | Data extraction / infrastructure reconnaissance                                                                                                                                               |
| **Impacted files** | `backend/src/setup/handlers.rs` (`test_setup_database`, `setup_database_info`), `backend/src/db.rs` (`test_connection`, `init_pool`, `driver_from_url`)                                         |
| **Routes**         | `POST /api/v1/setup/database/test`, `GET /api/v1/setup/database`                                                                                                                              |

**Description**

Before any user exists, these endpoints are public. `test_setup_database` accepts an arbitrary `database_url` in the JSON body, parses the scheme, then calls `db::test_connection` which does a real `init_pool` + `SELECT 1`. No bootstrap token, no scheme/host allowlist, no timeout or size guard beyond what sqlx provides. `setup_database_info` returns the live `DATABASE_URL` (frequently containing username + password) while `count(users) == 0`.

**Evidence**

(See `setup/handlers.rs:124` (the count guard), `131` (trim + driver check), `140` (`db::test_connection(url)`), `112` (returning full `database_url` in the info response), and `db.rs` implementation of `test_connection` / `init_pool` which can create the DB and run migrations.)

**Exploit scenario**

During the bootstrap window on an internet- or LAN-reachable instance, an attacker repeatedly POSTs internal `database_url` values (`postgres://...@127.0.0.1:5432/`, `postgres://...@10.0.0.0/8`, cloud metadata-adjacent hosts, etc.). Success/failure + timing reveals reachable Postgres instances, valid credentials (via later errors), and network topology. Even on failure the error messages can be informative.

**Impact**

SSRF-style reconnaissance from the backend host's network perspective. Can aid follow-on attacks against internal databases or help an attacker map the environment before the legitimate operator completes setup.

**Remediation**

1. Gate the test/info database endpoints behind a bootstrap secret (same token as recommended for SEC-001) or require the request to come from a trusted source IP.
2. In `test_connection` / before `init_pool`, add a strict validator that rejects `localhost`, `127.0.0.0/8`, link-local, and private RFC1918 ranges (with an explicit opt-in env for dev/CI).
3. Prefer a lightweight TCP/TLS connect + protocol banner check for the "test connection" UX in the wizard instead of a full pool + migration attempt.
4. Rate-limit the setup test endpoints per source IP.
5. Redact or never return the credential-bearing portion of `database_url` in the info response (return only driver + host + db name).

**Verification**

- Unauthenticated `POST /setup/database/test` with a `database_url` pointing at `127.0.0.1` or a private range is rejected (401/403 when token required, or 400 "internal targets not allowed").
- Legitimate external Postgres still works for the wizard.
- `setup/database` info response contains no password material after the fix (or is 409 after first user).
- Extend the existing `backend/tests/setup_database.rs` with negative cases for internal targets.

---

### SEC-007 — Only minimum-length password policy (≥8) with no complexity or strength requirements

- **Not started** / [ ] **In progress** / [ ] **Fixed** / [ ] **Accepted risk**


| Field              | Detail                                                                                                                                                                                        |
| ------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Severity**       | Medium                                                                                                                                                                                        |
| **Category**       | Weak authentication / credential stuffing facilitation                                                                                                                                        |
| **Impacted files** | `backend/src/auth/handlers.rs` (`validate_registration_password`, `register`, `login`), `backend/src/setup/handlers.rs` (`setup`), frontend registration/setup forms                            |
| **Routes**         | `POST /api/v1/auth/register`, `POST /api/v1/setup`                                                                                                                                            |

**Description**

Password validation is only `body.password.len() < 8`. No uppercase, digit, symbol, or dictionary checks. No zxcvbn / haveibeenpwned integration. The same weak password can be used for the initial admin and all subsequent listener accounts.

**Evidence**

```rust
// setup/handlers.rs:190
if body.password.len() < 8 { BadRequest("password must be at least 8 characters") }

// auth/handlers.rs:119
validate_registration_password(&body.password)?;
```

(The `validate...` helper only does the length check.)

**Exploit scenario**

Attacker obtains a list of common passwords or a breach corpus and sprays them against the register or login endpoints (aided by the rate-limit weaknesses in SEC-003). A user or the initial admin who chose `Password123` or `aurora2026` is trivially compromised.

**Impact**

Low bar for account takeover, especially for the all-powerful first admin account created during setup. Once an admin account is taken, the attacker can enable public registration, create more accounts, exfiltrate stats, upload malicious content, etc.

**Remediation**

1. Strengthen `validate_registration_password` (and the setup equivalent) with at least one of: character class requirements (upper+lower+digit+symbol), minimum entropy, or a small set of forbidden common passwords.
2. Consider integrating a lightweight strength estimator (or call out to a haveibeenpwned range API for the hash prefix) — at minimum for the initial admin password in setup.
3. Enforce the policy on password change paths if/when added.
4. Update the UI forms and error messages to give immediate feedback.
5. Document the policy in the security section of the README.

**Verification**

- `register` and `setup` with `password: "1234567"` or `"password"` return 400 with a useful message.
- A password meeting the new policy is accepted.
- Add unit tests for the validator covering the new rules.
- Existing security regression tests still pass.

---

### SEC-008 — CORS is permissive by default and the backend port is publicly exposed in the canonical Docker Compose configuration

- **Not started** / [ ] **In progress** / [ ] **Fixed** / [ ] **Accepted risk**


| Field              | Detail                                                                                                                                                                                        |
| ------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Severity**       | Low                                                                                                                                                                                           |
| **Category**       | Information disclosure / relaxed cross-origin policy                                                                                                                                          |
| **Impacted files** | `backend/src/lib.rs` (`build_cors_layer`, `create_router`), `backend/src/config.rs`, `docker-compose.yml` (ports for backend), `frontend/nginx.conf` (the proxy that is bypassed per SEC-004) |
| **Routes**         | All routes when `CORS_ALLOWED_ORIGINS` is empty                                                                                                                                            |

**Description**

When `cors_allowed_origins` is empty (the default, and not set in the compose environment block), `CorsLayer::permissive()` is used. Combined with the `3000:3000` port publish, any origin can make browser requests directly to the API (credentials mode, custom headers including `Authorization`).

**Evidence**

```rust
// lib.rs:207
if trimmed.is_empty() {
    return CorsLayer::permissive();
}
```

Compose environment for backend has no `CORS_ALLOWED_ORIGINS` line.

**Impact**

In a default docker deployment the API is callable cross-origin from any malicious site the victim visits while holding a valid Aurora JWT in localStorage. This enables CSWSH-style or data exfil attacks if the attacker can get the user to visit their page (theft of listening history, playlist contents, etc. via the authenticated API surface). Not as severe as cookie-based auth because the attacker still needs the bearer token value, but still widens the attack surface.

**Remediation**

1. Default `CORS_ALLOWED_ORIGINS` to empty string should perhaps mean "same-origin only" (no CORS header or a strict one) rather than fully permissive. Or change the compose example to set it to the expected frontend origin(s).
2. Remove the unconditional `3000:3000` publish from the "full" compose profile, or document that it is only for local development and must be firewalled / not published in production.
3. Add a production-oriented compose override or profile that does not publish the backend port and sets a restrictive CORS value.
4. Make the permissive path emit a startup warning when `AURORA_ENVIRONMENT=production`.

**Verification**

- With no `CORS_ALLOWED_ORIGINS` (or empty) and `AURORA_ENVIRONMENT=production`, a cross-origin request from an unexpected Origin receives no `Access-Control-Allow-Origin: *` (or is rejected).
- Compose production example does not publish backend port 3000 on the host.
- Docs updated.

---

## Areas reviewed — no critical issues found


| Area                                                                                   | Result                                                                                                                    |
| -------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| Secret validation at startup                                                           | Strong (`secrets.rs` + `validate_startup_secrets` called from both `run` and `create_app_state`; covers JWT, SIGNING, MASTER, OBJECT_STORAGE_JWT, MEILI when used; rejects documented weak values + short values). Past Vuln 2 remediated. |
| Registration public policy enforcement                                                 | `allow_public_registration` setting is read and 403s when false (and the opposite when true). Past Vuln 1 remediated + tests. |
| Role change via `users.manage` permission                                              | `update_user_role` contains an explicit `if claims.role != "admin"` guard in addition to `require_admin_access`. Past Vuln 3 remediated. |
| Error responses / information disclosure in normal operation                           | `AppError` + `IntoResponse` never emit raw SQL, stack traces, or internal paths in the JSON body (only logs them). Query rejections are generic outside dev. |
| Stream / artwork ticket security                                                       | HMAC-SHA256 with constant-time verify, 4-part structure, expiry, song binding, redaction in logs. Tickets invalidated for disabled songs (regression test). |
| HLS media key storage                                                                  | AES-256-GCM with random nonce per key (legacy zero-nonce migration), master_secret validated ≥32 chars. Key served only over authenticated HLS routes. |
| Storage key construction & LocalStorage path handling                                  | All keys built from UUIDs + controlled extensions inside the backend (`uploads/`, `songs/`, `staging/`). `base_dir.join(key)` receives only those values. |
| Playlist / song / history scoping                                                      | User-owned playlists enforce owner or `playlists.view_all`. Songs list/history respect `enabled` + ownership where appropriate. Admin paths require the admin checks. |
| Upload pipeline (multipart, temp files, rate limit per admin user)                     | 100 MiB body limit on the upload router layer + per-user `upload_rl`. Extension/MIME allowlist + lofty for metadata. Staging under UUID paths. No shell in ffmpeg invocation (arg array). |
| Redaction of sensitive values in logs / traces                                         | Comprehensive (`redact.rs`): emails, IPs, tickets, signatures, tokens, filenames, paths, query params. Used by TraceLayer and auth paths. |
| Meilisearch integration (when enabled)                                                 | Master key kept server-side only; sync queue + retry worker; admin-only sync status/retry. |
| Nebula OS sidecar                                                                      | Separate JWT for service-to-Nebula + optional signing secret; its own secret validation at start; presigned or JWT middleware. |
| Existing regression tests                                                              | `backend/tests/security_audit_regressions.rs` (11 tests) + `secrets::` + `rate_limit_routes` + `stream_ticket_disabled_song` + `setup_database` all pass. |

---

## Assumptions and limits

- **Static review + test inspection only** — no dynamic scanning (Burp/ZAP), no fuzzing of upload/HLS paths, no live Docker stack exploitation, and no external dependency audit (`cargo audit`, `pnpm audit`, `cargo outdated`).
- **Deployment context matters** — many findings (bootstrap window, XFF spoofing, CORS, proxy bypass) are far more severe when the stack is reachable from the internet without a reverse proxy or firewall. The "secure by default" story for a fresh `docker compose up` on a VPS is still weak.
- **Nebula OS** was reviewed at the integration points (auth, secret wiring, presigned generation) but not exhaustively as a standalone object store.
- **Frontend** is a standard React SPA with JWT in localStorage; classic web auth issues (token theft via XSS, etc.) apply but were not the focus.
- **No persistent session store** — JWTs are the only credential after login; revocation is currently only via `enabled=false` or natural expiry.
- Past findings from `docs/security-audit.md` (registration bypass, weak default secrets, `users.manage` role escalation) are treated as fixed and were only spot-checked.

---

## Suggested verification commands (after fixes)

```bash
# Backend
cd backend
cargo test --test security_audit_regressions
cargo test --test security_audit_regressions -- --nocapture   # for new tests
cargo test secrets::
cargo test rate_limit
cargo clippy --all-targets -- -D warnings   # (will require fixes for current lints)
cargo test --test stream_ticket_disabled_song
cargo test --test setup_database

# Full suite
cargo test
```

```bash
# Frontend
cd frontend
pnpm run build
pnpm run lint
pnpm run test
```

Add or extend integration tests in `backend/tests/` for the new findings:

- Bootstrap token enforcement and race behavior (SEC-001)
- Demotion immediately invalidates prior admin JWT for all admin routes (SEC-002)
- XFF rotation does not bypass login/register limits when behind untrusted proxy (SEC-003)
- SPA uses same-origin or configured API base (no hard-coded :3000) (SEC-004)
- Presigned round-trips succeed when SIGNING_SECRET == NOS_SIGNING_SECRET (SEC-005)
- Internal DB targets rejected on setup test (SEC-006)
- Password policy tests (SEC-007)

---

## Changelog


| Date       | Author                  | Notes                                              |
| ---------- | ----------------------- | -------------------------------------------------- |
| 2026-05-10 | Prior security review   | 3 confirmed findings (later fixed; see docs/)      |
| 2026-05-17 | Re-verification         | All prior fixed; secrets + compose hardening       |
| 2026-06-03 | Current static audit    | Fresh review against ownly style; 3 High + 5 Med   |

---

## Notes for operators

- Always run `./init-env.sh` (or the docker init profile) on a fresh clone before first `docker compose up`.
- For any internet-exposed deployment, set `CORS_ALLOWED_ORIGINS`, publish only the frontend port (or put a proper reverse proxy in front), and consider a `SETUP_TOKEN`.
- After the first admin exists, treat the setup endpoints as sensitive (they may still return metadata).
- Monitor the `aurora_admin_listening` and `aurora_audit` tracing targets for unusual aggregate queries.
- Run `cargo audit` and `pnpm audit` (in frontend/) regularly and before releases.


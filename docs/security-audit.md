 ---
  Security Review: Aurora Music Server

  Reviewed: 2026-05-10 | 7 candidates assessed, 4 false positives removed, 3 confirmed

  ---
  Vuln 1 — Auth Bypass: allow_public_registration Never Enforced

  File: backend/src/auth/handlers.rs:90–155, backend/src/main.rs:77
  Severity: High | Confidence: 9/10 | Category: auth_bypass

  Description: The admin can set allow_public_registration = false via the setup flow, which is written to app_settings in the database. However, the register handler never reads this setting, and there is no
  middleware or guard that checks it before the route executes. The route sits in public_routes with no auth layer whatsoever. Registration succeeds regardless of admin intent.

  Exploit Scenario: Admin deploys an invite-only instance and disables public registration. An attacker sends one unauthenticated request:
  POST /api/v1/auth/register
  {"email":"attacker@evil.com","password":"hunter2"}
  The server returns a valid listener JWT with no preconditions. The attacker now has authenticated access to the library, streaming, playlists, and play history.

  Recommendation: At the top of the register handler, read allow_public_registration from app_settings and return 403 Forbidden if it is false. This is a one-query check that should mirror how the setup
  handler already writes the flag.

  ---
  Vuln 2 — Forged JWTs via Publicly Known Default Secret

  File: backend/src/config.rs:41, backend/docker-compose.yml:40
  Severity: High | Confidence: 9/10 | Category: broken_auth

  Description: The application falls back to "change-me-in-production" (code default) or "change-me-in-production-jwt-secret" (Docker Compose default) when JWT_SECRET is not set. Neither value is secret — both
   are committed to the public repository. No startup validation warns or aborts when the default is detected. A deployment that takes no configuration action runs with a publicly known signing key.

  Exploit Scenario: Operator runs docker-compose up without setting JWT_SECRET. An attacker signs any JWT payload with the known secret using standard tooling (e.g. jwt.io or python-jose) and includes "role":
  "admin". The server's decode_token accepts it as valid. The attacker has unconditional admin access: song upload/deletion, user management, and all system settings.

  Recommendation: On startup, compare the loaded secret against both known defaults and abort with a clear error message if a match is found. Alternatively, generate a random secret on first run and persist
  it, refusing to start if none is configured. The docker-compose file should use ${JWT_SECRET:?JWT_SECRET must be set} syntax to fail fast at compose startup.

  ---
  Vuln 3 — Privilege Escalation: users.manage Grants Role Promotion

  File: backend/src/permissions/mod.rs:137–152, backend/src/admin/handlers.rs:245–285
  Severity: Medium | Confidence: 9/10 | Category: privilege_escalation

  Description: require_admin_access admits any user whose permissions include users.manage — without requiring role == "admin". The update_user_role endpoint (PUT /api/v1/admin/users/{id}/role) uses only
  require_admin_access, with no further check that the caller already holds role = "admin". It also has no self-targeting guard (unlike delete_user, which explicitly blocks this). A user granted users.manage
  can promote themselves or any other user to role = "admin".

  Exploit Scenario: An admin grants a "moderator" account the users.manage permission to handle routine user support. That user sends:
  PUT /api/v1/admin/users/{own-user-id}/role
  {"role": "admin"}
  This updates their database row. On next login, their JWT carries role: "admin", granting unconditional require_admin_access passage forever — including ability to upload/delete songs, mutate app settings,
  and demote other admins. Even if the admin later revokes users.manage, the promoted role persists until manually reset in the database.

  Recommendation: Add a role == "admin" check inside update_user_role before executing the update — only full admins should be able to change roles. Also add a self-targeting guard (mirror the pattern from
  delete_user) and validate body.role against an explicit allowlist (["admin", "listener"]) rather than accepting arbitrary strings.
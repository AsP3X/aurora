# Security review: Aurora music server

| Field | Value |
|-------|--------|
| **Original review** | 2026-05-10 |
| **Re-verification** | 2026-05-17 |
| **Remediation completed** | 2026-05-17 |
| **Scope** | 7 candidates assessed originally; 4 false positives removed; **3 confirmed** (all remediated) |
| **Regression tests** | `backend/tests/security_audit_regressions.rs`, `backend/src/secrets.rs` (unit tests) |

---

## Summary

| ID | Finding | Severity | Status |
|----|---------|----------|--------|
| [Vuln 1](#vuln-1--auth-bypass-allow_public_registration) | `allow_public_registration` not enforced on register | High | **Fixed** |
| [Vuln 2](#vuln-2--forged-jwts-via-weak-default-secrets) | Known weak JWT / signing defaults | High | **Fixed** |
| [Vuln 3](#vuln-3--privilege-escalation-via-usersmanage) | `users.manage` could change roles | Medium | **Fixed** |

---

## Re-verification method (2026-05-17)

1. **Code review** — handlers, `backend/src/secrets.rs`, `docker-compose.yml`, Nebula startup.
2. **Automated tests** — `cargo test --test security_audit_regressions` and `cargo test secrets::`.
3. **Compose** — secret vars use `${VAR:?}` (no `dev-*` fallbacks).

---

## Vuln 1 — Auth bypass: `allow_public_registration`

| | |
|--|--|
| **Severity** | High |
| **Status** | **Fixed** |

### Fix

`register` returns **403** when `app_settings.allow_public_registration` is `"false"` (`backend/src/auth/handlers.rs`).

### Verification

| Test | Result |
|------|--------|
| `register_returns_forbidden_when_public_registration_disabled` | Pass |
| `register_succeeds_when_public_registration_enabled` | Pass |

---

## Vuln 2 — Forged JWTs via weak default secrets

| | |
|--|--|
| **Severity** | High |
| **Status** | **Fixed** |

### Fix

1. **`backend/src/secrets.rs`** — `validate_startup_secrets()` rejects known weak values (including `dev-jwt-secret-change-me`, compose placeholders `GENERATE_ME`) and secrets shorter than 32 characters.
2. **Startup** — Called from `run()` and `create_app_state()` so every boot path is gated.
3. **`docker-compose.yml`** — `JWT_SECRET`, `SIGNING_SECRET`, `MASTER_SECRET`, `NOS_JWT_SECRET`, `NOS_SIGNING_SECRET` use `${VAR:?…}` (fail if `.env` missing).
4. **`nebula-os`** — `secrets.rs` validates `NOS_JWT_SECRET` / `NOS_SIGNING_SECRET` at startup.
5. **Docs** — README Docker section documents `docker compose --profile init run --rm init-env` before `up`.

### Verification

| Check | Result |
|-------|--------|
| `startup_rejects_compose_weak_jwt_default` | Pass |
| `startup_rejects_legacy_change_me_jwt_default` | Pass |
| `create_app_state_rejects_weak_signing_secret` | Pass |
| `weak_secret_helper_covers_documented_defaults` | Pass |
| Compose has no `:-dev-*` secret fallbacks | Pass (review) |

---

## Vuln 3 — Privilege escalation: `users.manage` grants role promotion

| | |
|--|--|
| **Severity** | Medium |
| **Status** | **Fixed** |

### Fix

`update_user_role` requires JWT `role == "admin"`, blocks self-targeting, allowlists `admin` / `listener` (`backend/src/admin/handlers.rs`).

### Verification

| Test | Result |
|------|--------|
| `update_user_role_forbidden_for_listener_with_users_manage` | Pass |
| `update_user_role_rejects_self_targeting` | Pass |

---

## False positives (original review)

Four of seven candidates were false positives in the 2026-05-10 review; not tracked here.

---

## Running regression tests

From `backend/`:

```bash
cargo test --test security_audit_regressions
cargo test secrets::
```

---

## Changelog

| Date | Change |
|------|--------|
| 2026-05-10 | Initial review — 3 confirmed findings |
| 2026-05-17 | Re-verification; Vuln 2 partial |
| 2026-05-17 | All three fixed; secrets module, compose hardening, expanded tests |

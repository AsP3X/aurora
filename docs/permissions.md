# Aurora Permission System

## Overview

Aurora uses a role-based access control (RBAC) system built around **permission keys**, **groups**, and **direct user grants**. The system is inspired by CloudWrkz and is designed to be simple, extensible, and fully manageable through the admin UI and REST API.

## Concepts

- **Permission Key** — A dot-notation string that identifies a capability (e.g., `library.view`, `playlists.create`, `admin.access`).
- **Group** — A named collection of permission keys. Users are assigned to groups and inherit all of the group's permissions.
- **Direct User Grant** — A permission assigned directly to a specific user, bypassing groups.
- **Effective Permissions** — The union of all permissions a user holds via both direct grants and group memberships.

## Database Schema

The permission system adds five tables to the existing Aurora schema:

### `permissions`
Master list of all permission keys.

| Column      | Type   | Notes                        |
|-------------|--------|------------------------------|
| `id`        | UUID   | Primary key                  |
| `key`       | TEXT   | Unique, dot-notation         |
| `name`      | TEXT   | Human-readable label         |
| `description` | TEXT | Optional explanation         |
| `category`  | TEXT   | Grouping for UI (e.g., `admin`, `library`) |
| `created_at`| TIMESTAMPTZ | Auto-generated          |

### `groups`
Permission groups (e.g., "Default", "Admin").

| Column      | Type   | Notes                        |
|-------------|--------|------------------------------|
| `id`        | UUID   | Primary key                  |
| `name`      | TEXT   | Unique                       |
| `description` | TEXT | Optional                     |
| `created_at`| TIMESTAMPTZ | Auto-generated          |
| `updated_at`| TIMESTAMPTZ | Auto-generated          |

### `group_permissions`
Many-to-many link between groups and permissions.

| Column         | Type   | Notes                        |
|----------------|--------|------------------------------|
| `id`           | UUID   | Primary key                  |
| `group_id`     | UUID   | FK → `groups(id)`            |
| `permission_id`| UUID   | FK → `permissions(id)`       |

### `user_permissions`
Many-to-many link between users and permissions (direct grants).

| Column         | Type   | Notes                        |
|----------------|--------|------------------------------|
| `id`           | UUID   | Primary key                  |
| `user_id`      | UUID   | FK → `users(id)`             |
| `permission_id`| UUID   | FK → `permissions(id)`       |

### `group_memberships`
Many-to-many link between users and groups.

| Column         | Type   | Notes                        |
|----------------|--------|------------------------------|
| `id`           | UUID   | Primary key                  |
| `user_id`      | UUID   | FK → `users(id)`             |
| `group_id`     | UUID   | FK → `groups(id)`            |

## Permission Resolution

A user's effective permissions are computed as the **union** of:

1. All permissions from every group the user belongs to (`group_memberships` → `group_permissions` → `permissions`).
2. All permissions directly assigned to the user (`user_permissions` → `permissions`).

There is no concept of "deny" permissions — the system is additive (grant-only).

## Initial Permission Keys

The migration seeds the following permission keys:

| Key | Description | Default Groups |
|-----|-------------|----------------|
| `library.view` | View the song library | Default |
| `library.manage` | Scan, upload, and manage songs | Admin |
| `playlists.create` | Create new playlists | Default |
| `playlists.update` | Update own playlists | Default |
| `playlists.delete` | Delete own playlists | Default |
| `playlists.view_all` | View any playlist (including private) | Admin |
| `history.view` | View own playback history | Default |
| `history.view_all` | View all users' playback history | Admin |
| `users.manage` | Create, update, and delete users | Admin |
| `settings.manage` | Manage system settings | Admin |
| `admin.access` | Access admin dashboard and APIs | Admin |

## Default Groups

Two groups are created automatically during migration:

- **Default** — Assigned to all existing and new users. Contains basic permissions (`library.view`, `playlists.create`, `playlists.update`, `playlists.delete`, `history.view`).
- **Admin** — Contains all permissions. Users with `role = 'admin'` in the `users` table are automatically assigned to this group.

## Backend: Checking Permissions

### In a Handler

Use the helper functions from `src/permissions/mod.rs`:

```rust
use crate::permissions::{check_permission, require_permission};

pub async fn my_handler(
    State(state): State<Arc<AppState>>,
    claims: axum::Extension<crate::auth::Claims>,
) -> Result<Json<SomeData>, AppError> {
    // Hard check — returns 403 if missing
    require_permission(&state.pool, &claims.sub, "library.view").await?;

    // Soft check — returns bool
    let is_admin = check_permission(&state.pool, &claims.sub, "admin.access").await;

    // ... handler logic
}
```

### Combined with Resource Ownership

For resources that have an owner (e.g., playlists), check ownership **or** a permission:

```rust
let playlist = sqlx::query_as::<_, Playlist>("SELECT * FROM playlists WHERE id = $1")
    .bind(&id)
    .fetch_optional(&state.pool)
    .await?;
let playlist = playlist.ok_or(AppError::NotFound)?;

let is_owner = playlist.user_id == claims.sub;
let can_update = check_permission(&state.pool, &claims.sub, "playlists.update").await;
if !is_owner && !can_update {
    return Err(AppError::Forbidden("you do not have permission to modify this playlist".into()));
}
```

### Admin Access Check

The `require_admin_access` helper checks for `role == "admin"`, `admin.access`, or `users.manage`:

```rust
use crate::permissions::require_admin_access;

require_admin_access(&state.pool, &claims.sub, &claims.role).await?;
```

## Backend: Adding a New Permission

1. **Add the key to the migration** (`003_permissions.sql`) in both `postgres` and `sqlite` directories.
2. **Assign it to the appropriate group(s)** in the same migration.
3. **Add a check in the relevant handler(s)** using `require_permission` or `check_permission`.
4. **Update the frontend** if the permission should gate UI elements.

Example migration snippet:

```sql
INSERT INTO permissions (id, key, name, description, category) VALUES
    ('10000000-0000-0000-0000-000000000012', 'reports.view', 'View Reports', 'View system reports', 'admin');

-- Assign to Admin group
INSERT INTO group_permissions (id, group_id, permission_id)
SELECT gen_random_uuid(), '00000000-0000-0000-0000-000000000002', id
FROM permissions WHERE key = 'reports.view'
ON CONFLICT (group_id, permission_id) DO NOTHING;
```

## Frontend: Gating UI Elements

The `AuthContext` provides a `can(permission: string)` helper:

```tsx
import { useAuth } from "../context/AuthContext";

function MyComponent() {
  const { can } = useAuth();

  return (
    <div>
      {can("library.manage") && <button>Scan Library</button>}
      {can("admin.access") && <a href="/admin">Admin</a>}
    </div>
  );
}
```

## Admin API Reference

All admin routes are under `/api/v1/admin/*` and require authentication plus admin access (see `require_admin_access`).

### Permissions

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/admin/permissions` | List all permission keys |

### Groups

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/admin/groups` | List all groups |
| POST | `/admin/groups` | Create a new group |
| GET | `/admin/groups/:id` | Get group details |
| GET | `/admin/groups/:id/permissions` | List permissions assigned to group |
| POST | `/admin/groups/:id/permissions` | Grant a permission to group |
| PUT | `/admin/groups/:id/permissions` | Bulk replace group permissions |
| DELETE | `/admin/groups/:id/permissions/:key` | Revoke a permission from group |
| GET | `/admin/groups/:id/members` | List group members |
| POST | `/admin/groups/:id/members` | Add a user to group |
| DELETE | `/admin/groups/:id/members/:user_id` | Remove a user from group |

### Users

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/admin/users` | List all users |
| GET | `/admin/users/:id/permissions` | List direct permissions for user |
| POST | `/admin/users/:id/permissions` | Grant a direct permission to user |
| PUT | `/admin/users/:id/permissions` | Bulk replace user direct permissions |
| DELETE | `/admin/users/:id/permissions/:key` | Revoke a direct permission from user |
| GET | `/admin/users/:id/effective-permissions` | Get full effective permission set for user |

## Frontend Admin UI

The admin dashboard is available at `/admin` for any user with `admin.access` permission.

- **Groups Tab** — Create groups, toggle permissions via checkboxes, add/remove members.
- **Users Tab** — View users, toggle direct permissions, view effective permissions.

Changes are saved explicitly with a **Save** button.

## Extending the System

### New Permission Category

1. Choose a dot-notation prefix (e.g., `reports.`).
2. Add all keys to the `permissions` table with that `category`.
3. Seed them into the relevant group(s) in migrations.
4. Use `require_permission` in handlers and `can()` in the frontend.

### Custom User Types / Roles

The legacy `role` column on `users` is preserved for backward compatibility, but the preferred approach is:

1. Create a new group (e.g., "Uploader").
2. Assign the desired permissions to that group.
3. Add users to the group via the admin UI or API.

This avoids hard-coding role checks throughout the codebase.

## Dual Database Support

The permission system works with both **PostgreSQL** and **SQLite** via SQLx `AnyPool`:

- Separate migrations are provided in `migrations/postgres/` and `migrations/sqlite/`.
- Handlers use standard SQL with `$1` placeholders compatible with both engines.
- UUIDs are stored as strings to work consistently across both backends.

## Security Notes

- **Song streaming** (`/songs/:id/stream`) and **artwork** (`/songs/:id/artwork`) remain public by design and are not gated by the permission system.
- Playlist ownership checks always take precedence: a user can always modify their own playlists even without explicit `playlists.update`/`playlists.delete` permissions. These permissions act as overrides for **other users'** playlists.
- The `auth_middleware` validates JWT tokens; permission checks happen inside handlers or via `require_permission`. There is no separate authorization middleware — this keeps the system simple and explicit.

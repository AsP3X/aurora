// Human: Admin-only HTTP for RBAC primitives—permissions catalog, groups, memberships, and direct user grants with transactional bulk replace endpoints.
// Agent: ALL routes call require_admin_access first; WRITES group_permissions, user_permissions, group_memberships; READS permissions + groups tables.
use axum::{
    extract::{Path, State},
    Json,
};
use serde::Deserialize;
use std::sync::Arc;
use uuid::Uuid;

use crate::{
    error::AppError,
    permissions::{get_user_permission_keys, require_admin_access, Group, Permission},
    AppState,
};

#[derive(Debug, Deserialize)]
pub struct CreateGroup {
    pub name: String,
    pub description: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct GrantPermission {
    pub permission_key: String,
}

#[derive(Debug, Deserialize)]
pub struct BulkPermissions {
    pub permission_keys: Vec<String>,
}

#[derive(Debug, Deserialize)]
pub struct AddMember {
    pub user_id: String,
}

// --- Permission catalog ---

// Human: Enumerate every defined permission row for admin UIs building checkboxes.
// Agent: READS permissions ORDER BY category,key; REQUIRES admin; RETURNS Vec<Permission>.
pub async fn list_permissions(
    State(state): State<Arc<AppState>>,
    claims: axum::Extension<crate::auth::Claims>,
) -> Result<Json<Vec<Permission>>, AppError> {
    require_admin_access(&state.pool, &claims.sub, &claims.role).await?;
    let permissions = sqlx::query_as::<_, Permission>(
        "SELECT id, key, name, description, category, created_at FROM permissions ORDER BY category, key",
    )
    .fetch_all(&state.pool)
    .await?;
    Ok(Json(permissions))
}

// --- Groups ---

// Human: List distinct permission groups used to bucket grants in the admin console.
// Agent: READS groups table sorted by name; NO joins; REQUIRES admin.
pub async fn list_groups(
    State(state): State<Arc<AppState>>,
    claims: axum::Extension<crate::auth::Claims>,
) -> Result<Json<Vec<Group>>, AppError> {
    require_admin_access(&state.pool, &claims.sub, &claims.role).await?;
    let groups = sqlx::query_as::<_, Group>("SELECT * FROM groups ORDER BY name")
        .fetch_all(&state.pool)
        .await?;
    Ok(Json(groups))
}

// Human: Insert a named group container that later receives permission rows via join table inserts.
// Agent: INSERT groups; CONFLICT unique name → 409; RETURNS Group row; REQUIRES admin.
pub async fn create_group(
    State(state): State<Arc<AppState>>,
    claims: axum::Extension<crate::auth::Claims>,
    Json(body): Json<CreateGroup>,
) -> Result<Json<Group>, AppError> {
    require_admin_access(&state.pool, &claims.sub, &claims.role).await?;
    let id = Uuid::new_v4().to_string();
    let group = sqlx::query_as::<_, Group>(
        "INSERT INTO groups (id, name, description) VALUES ($1, $2, $3) RETURNING *",
    )
    .bind(&id)
    .bind(&body.name)
    .bind(&body.description)
    .fetch_one(&state.pool)
    .await
    .map_err(|e| match e {
        sqlx::Error::Database(db_err) if db_err.is_unique_violation() => {
            AppError::Conflict("group name already exists".into())
        }
        _ => AppError::Database(e),
    })?;
    Ok(Json(group))
}

pub async fn get_group(
    State(state): State<Arc<AppState>>,
    claims: axum::Extension<crate::auth::Claims>,
    Path(id): Path<String>,
) -> Result<Json<Group>, AppError> {
    require_admin_access(&state.pool, &claims.sub, &claims.role).await?;
    let group = sqlx::query_as::<_, Group>("SELECT * FROM groups WHERE id = $1")
        .bind(&id)
        .fetch_optional(&state.pool)
        .await?;
    group.map(Json).ok_or(AppError::NotFound)
}

pub async fn list_group_permissions(
    State(state): State<Arc<AppState>>,
    claims: axum::Extension<crate::auth::Claims>,
    Path(group_id): Path<String>,
) -> Result<Json<Vec<Permission>>, AppError> {
    require_admin_access(&state.pool, &claims.sub, &claims.role).await?;
    let permissions = sqlx::query_as::<_, Permission>(
        "SELECT p.id, p.key, p.name, p.description, p.category, p.created_at FROM permissions p
         JOIN group_permissions gp ON gp.permission_id = p.id
         WHERE gp.group_id = $1
         ORDER BY p.category, p.key",
    )
    .bind(&group_id)
    .fetch_all(&state.pool)
    .await?;
    Ok(Json(permissions))
}

pub async fn grant_group_permission(
    State(state): State<Arc<AppState>>,
    claims: axum::Extension<crate::auth::Claims>,
    Path(group_id): Path<String>,
    Json(body): Json<GrantPermission>,
) -> Result<Json<serde_json::Value>, AppError> {
    require_admin_access(&state.pool, &claims.sub, &claims.role).await?;
    let perm_id: Option<(String,)> = sqlx::query_as("SELECT id FROM permissions WHERE key = $1")
        .bind(&body.permission_key)
        .fetch_optional(&state.pool)
        .await?;
    let (perm_id,) = perm_id.ok_or_else(|| AppError::BadRequest("invalid permission key".into()))?;

    let id = Uuid::new_v4().to_string();
    sqlx::query(
        "INSERT INTO group_permissions (id, group_id, permission_id) VALUES ($1, $2, $3)",
    )
    .bind(&id)
    .bind(&group_id)
    .bind(&perm_id)
    .execute(&state.pool)
    .await
    .map_err(|e| match e {
        sqlx::Error::Database(db_err) if db_err.is_unique_violation() => {
            AppError::Conflict("permission already granted to group".into())
        }
        _ => AppError::Database(e),
    })?;
    Ok(Json(serde_json::json!({"ok": true})))
}

pub async fn revoke_group_permission(
    State(state): State<Arc<AppState>>,
    claims: axum::Extension<crate::auth::Claims>,
    Path((group_id, key)): Path<(String, String)>,
) -> Result<Json<serde_json::Value>, AppError> {
    require_admin_access(&state.pool, &claims.sub, &claims.role).await?;
    sqlx::query(
        "DELETE FROM group_permissions WHERE group_id = $1 AND permission_id = (SELECT id FROM permissions WHERE key = $2)",
    )
    .bind(&group_id)
    .bind(&key)
    .execute(&state.pool)
    .await?;
    Ok(Json(serde_json::json!({"ok": true})))
}

// Human: Wipe and rebuild the group's permission set atomically so UI "save" reflects exact checkbox state.
// Agent: TX DELETE group_permissions; INSERT validated keys; ERRORS on first bad key before commit.
pub async fn replace_group_permissions(
    State(state): State<Arc<AppState>>,
    claims: axum::Extension<crate::auth::Claims>,
    Path(group_id): Path<String>,
    Json(body): Json<BulkPermissions>,
) -> Result<Json<serde_json::Value>, AppError> {
    require_admin_access(&state.pool, &claims.sub, &claims.role).await?;
    let mut tx = state.pool.begin().await?;

    sqlx::query("DELETE FROM group_permissions WHERE group_id = $1")
        .bind(&group_id)
        .execute(&mut *tx)
        .await?;

    for key in &body.permission_keys {
        let perm_id: Option<(String,)> =
            sqlx::query_as("SELECT id FROM permissions WHERE key = $1")
                .bind(key)
                .fetch_optional(&mut *tx)
                .await?;
        let (perm_id,) = perm_id.ok_or_else(|| {
            AppError::BadRequest(format!("invalid permission key: {}", key))
        })?;
        let id = Uuid::new_v4().to_string();
        sqlx::query(
            "INSERT INTO group_permissions (id, group_id, permission_id) VALUES ($1, $2, $3)",
        )
        .bind(&id)
        .bind(&group_id)
        .bind(&perm_id)
        .execute(&mut *tx)
        .await?;
    }

    tx.commit().await?;
    Ok(Json(serde_json::json!({"ok": true})))
}

// --- Group membership ---

// Human: Show which accounts belong to a group so admins can audit inherited grants.
// Agent: READS users JOIN group_memberships; RETURNS JSON rows id/email/role; REQUIRES admin.
pub async fn list_group_members(
    State(state): State<Arc<AppState>>,
    claims: axum::Extension<crate::auth::Claims>,
    Path(group_id): Path<String>,
) -> Result<Json<Vec<serde_json::Value>>, AppError> {
    require_admin_access(&state.pool, &claims.sub, &claims.role).await?;
    let members = sqlx::query_as::<_, (String, String, String)>(
        "SELECT u.id, u.email, u.role FROM users u
         JOIN group_memberships gm ON gm.user_id = u.id
         WHERE gm.group_id = $1",
    )
    .bind(&group_id)
    .fetch_all(&state.pool)
    .await?;

    let users: Vec<serde_json::Value> = members
        .into_iter()
        .map(|(id, email, role)| serde_json::json!({"id": id, "email": email, "role": role}))
        .collect();
    Ok(Json(users))
}

pub async fn add_group_member(
    State(state): State<Arc<AppState>>,
    claims: axum::Extension<crate::auth::Claims>,
    Path(group_id): Path<String>,
    Json(body): Json<AddMember>,
) -> Result<Json<serde_json::Value>, AppError> {
    require_admin_access(&state.pool, &claims.sub, &claims.role).await?;
    let id = Uuid::new_v4().to_string();
    sqlx::query(
        "INSERT INTO group_memberships (id, user_id, group_id) VALUES ($1, $2, $3)",
    )
    .bind(&id)
    .bind(&body.user_id)
    .bind(&group_id)
    .execute(&state.pool)
    .await
    .map_err(|e| match e {
        sqlx::Error::Database(db_err) if db_err.is_unique_violation() => {
            AppError::Conflict("user already in group".into())
        }
        _ => AppError::Database(e),
    })?;
    Ok(Json(serde_json::json!({"ok": true})))
}

pub async fn remove_group_member(
    State(state): State<Arc<AppState>>,
    claims: axum::Extension<crate::auth::Claims>,
    Path((group_id, user_id)): Path<(String, String)>,
) -> Result<Json<serde_json::Value>, AppError> {
    require_admin_access(&state.pool, &claims.sub, &claims.role).await?;
    sqlx::query("DELETE FROM group_memberships WHERE group_id = $1 AND user_id = $2")
        .bind(&group_id)
        .bind(&user_id)
        .execute(&state.pool)
        .await?;
    Ok(Json(serde_json::json!({"ok": true})))
}

// --- Direct user grants ---

// Human: List only permissions granted directly on a user row, excluding group-derived rights.
// Agent: READS user_permissions join permissions; REQUIRES admin; DISTINCT ordering by category/key.
pub async fn list_user_permissions(
    State(state): State<Arc<AppState>>,
    claims: axum::Extension<crate::auth::Claims>,
    Path(user_id): Path<String>,
) -> Result<Json<Vec<Permission>>, AppError> {
    require_admin_access(&state.pool, &claims.sub, &claims.role).await?;
    let permissions = sqlx::query_as::<_, Permission>(
        "SELECT p.id, p.key, p.name, p.description, p.category, p.created_at FROM permissions p
         JOIN user_permissions up ON up.permission_id = p.id
         WHERE up.user_id = $1
         ORDER BY p.category, p.key",
    )
    .bind(&user_id)
    .fetch_all(&state.pool)
    .await?;
    Ok(Json(permissions))
}

pub async fn grant_user_permission(
    State(state): State<Arc<AppState>>,
    claims: axum::Extension<crate::auth::Claims>,
    Path(user_id): Path<String>,
    Json(body): Json<GrantPermission>,
) -> Result<Json<serde_json::Value>, AppError> {
    require_admin_access(&state.pool, &claims.sub, &claims.role).await?;
    let perm_id: Option<(String,)> = sqlx::query_as("SELECT id FROM permissions WHERE key = $1")
        .bind(&body.permission_key)
        .fetch_optional(&state.pool)
        .await?;
    let (perm_id,) = perm_id.ok_or_else(|| AppError::BadRequest("invalid permission key".into()))?;

    let id = Uuid::new_v4().to_string();
    sqlx::query(
        "INSERT INTO user_permissions (id, user_id, permission_id) VALUES ($1, $2, $3)",
    )
    .bind(&id)
    .bind(&user_id)
    .bind(&perm_id)
    .execute(&state.pool)
    .await
    .map_err(|e| match e {
        sqlx::Error::Database(db_err) if db_err.is_unique_violation() => {
            AppError::Conflict("permission already granted to user".into())
        }
        _ => AppError::Database(e),
    })?;
    Ok(Json(serde_json::json!({"ok": true})))
}

pub async fn revoke_user_permission(
    State(state): State<Arc<AppState>>,
    claims: axum::Extension<crate::auth::Claims>,
    Path((user_id, key)): Path<(String, String)>,
) -> Result<Json<serde_json::Value>, AppError> {
    require_admin_access(&state.pool, &claims.sub, &claims.role).await?;
    sqlx::query(
        "DELETE FROM user_permissions WHERE user_id = $1 AND permission_id = (SELECT id FROM permissions WHERE key = $2)",
    )
    .bind(&user_id)
    .bind(&key)
    .execute(&state.pool)
    .await?;
    Ok(Json(serde_json::json!({"ok": true})))
}

// Human: Transactionally replace the per-user shadow permission list with validated keys—mirrors group bulk replace semantics.
// Agent: TX delete user_permissions; INSERT loop; RETURNS 400 on unknown key before commit.
pub async fn replace_user_permissions(
    State(state): State<Arc<AppState>>,
    claims: axum::Extension<crate::auth::Claims>,
    Path(user_id): Path<String>,
    Json(body): Json<BulkPermissions>,
) -> Result<Json<serde_json::Value>, AppError> {
    require_admin_access(&state.pool, &claims.sub, &claims.role).await?;
    let mut tx = state.pool.begin().await?;

    sqlx::query("DELETE FROM user_permissions WHERE user_id = $1")
        .bind(&user_id)
        .execute(&mut *tx)
        .await?;

    for key in &body.permission_keys {
        let perm_id: Option<(String,)> =
            sqlx::query_as("SELECT id FROM permissions WHERE key = $1")
                .bind(key)
                .fetch_optional(&mut *tx)
                .await?;
        let (perm_id,) = perm_id.ok_or_else(|| {
            AppError::BadRequest(format!("invalid permission key: {}", key))
        })?;
        let id = Uuid::new_v4().to_string();
        sqlx::query(
            "INSERT INTO user_permissions (id, user_id, permission_id) VALUES ($1, $2, $3)",
        )
        .bind(&id)
        .bind(&user_id)
        .bind(&perm_id)
        .execute(&mut *tx)
        .await?;
    }

    tx.commit().await?;
    Ok(Json(serde_json::json!({"ok": true})))
}

// Human: Return the merged key list (groups + direct grants) using the same helper as `/auth/me` permission hydration.
// Agent: CALLS get_user_permission_keys; RETURNS string keys only; REQUIRES admin viewing chosen user_id.
pub async fn get_user_effective_permissions(
    State(state): State<Arc<AppState>>,
    claims: axum::Extension<crate::auth::Claims>,
    Path(user_id): Path<String>,
) -> Result<Json<Vec<String>>, AppError> {
    require_admin_access(&state.pool, &claims.sub, &claims.role).await?;
    let keys = get_user_permission_keys(&state.pool, &user_id).await;
    Ok(Json(keys))
}

// Human: Lightweight directory of accounts for admin pickers without exposing password material.
// Agent: READS users id/email/role/enabled newest first; MAPS to JSON objects inline; REQUIRES admin.
pub async fn list_users(
    State(state): State<Arc<AppState>>,
    claims: axum::Extension<crate::auth::Claims>,
) -> Result<Json<Vec<serde_json::Value>>, AppError> {
    require_admin_access(&state.pool, &claims.sub, &claims.role).await?;
    // Human: Cast `enabled` so SQLite INTEGER columns decode the same way as login and auth middleware.
    // Agent: SELECT CAST(enabled AS INTEGER); MAPS !=0 → JSON boolean enabled.
    let users = sqlx::query_as::<_, (String, String, String, i64)>(
        "SELECT id, email, role, CAST(enabled AS INTEGER) AS enabled FROM users ORDER BY created_at DESC",
    )
    .fetch_all(&state.pool)
    .await?;
    let result: Vec<serde_json::Value> = users
        .into_iter()
        .map(|(id, email, role, enabled_raw)| {
            serde_json::json!({
                "id": id,
                "email": email,
                "role": role,
                "enabled": enabled_raw != 0,
            })
        })
        .collect();
    Ok(Json(result))
}

#[derive(Debug, Deserialize)]
pub struct UpdateEnabled {
    pub enabled: bool,
}

// Human: Toggle login eligibility for another user but block self-lockout mistakes from the same JWT.
// Agent: UPDATE users.enabled; HTTP 400 if claims.sub target; REQUIRES admin.
pub async fn update_user_enabled(
    State(state): State<Arc<AppState>>,
    claims: axum::Extension<crate::auth::Claims>,
    Path(user_id): Path<String>,
    Json(body): Json<UpdateEnabled>,
) -> Result<Json<serde_json::Value>, AppError> {
    require_admin_access(&state.pool, &claims.sub, &claims.role).await?;

    if claims.sub == user_id {
        return Err(AppError::BadRequest("cannot change your own enabled status".into()));
    }

    // Human: Use bool binding so Postgres BOOLEAN and SQLite INTEGER columns both accept the value.
    // Agent: UPDATE users.enabled; BINDS body.enabled as bool via sqlx Any.
    sqlx::query("UPDATE users SET enabled = $1 WHERE id = $2")
        .bind(body.enabled)
        .bind(&user_id)
        .execute(&state.pool)
        .await?;

    // Human: Drop cached activation state so the next request sees the admin toggle immediately.
    // Agent: INVALIDATES user_enabled_cache for user_id.
    state.user_enabled_cache.invalidate(&user_id);

    Ok(Json(serde_json::json!({"ok": true})))
}

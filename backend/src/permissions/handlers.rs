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

pub async fn get_user_effective_permissions(
    State(state): State<Arc<AppState>>,
    claims: axum::Extension<crate::auth::Claims>,
    Path(user_id): Path<String>,
) -> Result<Json<Vec<String>>, AppError> {
    require_admin_access(&state.pool, &claims.sub, &claims.role).await?;
    let keys = get_user_permission_keys(&state.pool, &user_id).await;
    Ok(Json(keys))
}

pub async fn list_users(
    State(state): State<Arc<AppState>>,
    claims: axum::Extension<crate::auth::Claims>,
) -> Result<Json<Vec<serde_json::Value>>, AppError> {
    require_admin_access(&state.pool, &claims.sub, &claims.role).await?;
    let users = sqlx::query_as::<_, (String, String, String)>(
        "SELECT id, email, role FROM users ORDER BY created_at DESC",
    )
    .fetch_all(&state.pool)
    .await?;
    let result: Vec<serde_json::Value> = users
        .into_iter()
        .map(|(id, email, role)| serde_json::json!({"id": id, "email": email, "role": role}))
        .collect();
    Ok(Json(result))
}

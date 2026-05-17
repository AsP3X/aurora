// Human: Permission keys via direct user grants and group membership (SQL checks, not ORM models for joins).
// Agent: READS user_permissions, group_permissions, group_memberships; EXPOSES check_permission and require_* helpers.
use std::collections::HashSet;

use serde::Serialize;
use sqlx::{AnyPool, FromRow};

use crate::error::AppError;

pub mod handlers;

#[derive(Debug, FromRow, Serialize)]
pub struct Permission {
    pub id: String,
    pub key: String,
    pub name: String,
    pub description: Option<String>,
    pub category: String,
    pub created_at: String,
}

#[derive(Debug, FromRow, Serialize)]
pub struct Group {
    pub id: String,
    pub name: String,
    pub description: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

pub async fn check_permission(pool: &AnyPool, user_id: &str, permission_key: &str) -> bool {
    let direct: i64 = sqlx::query_scalar(
        r#"SELECT COUNT(*) FROM user_permissions up
           JOIN permissions p ON up.permission_id = p.id
           WHERE up.user_id = $1 AND p.key = $2"#,
    )
    .bind(user_id)
    .bind(permission_key)
    .fetch_one(pool)
    .await
    .unwrap_or(0);

    if direct > 0 {
        return true;
    }

    let group: i64 = sqlx::query_scalar(
        r#"SELECT COUNT(*) FROM group_permissions gp
           JOIN permissions p ON gp.permission_id = p.id
           JOIN group_memberships gm ON gm.group_id = gp.group_id
           WHERE gm.user_id = $1 AND p.key = $2"#,
    )
    .bind(user_id)
    .bind(permission_key)
    .fetch_one(pool)
    .await
    .unwrap_or(0);

    group > 0
}

pub async fn require_permission(
    pool: &AnyPool,
    user_id: &str,
    permission_key: &str,
) -> Result<(), AppError> {
    if check_permission(pool, user_id, permission_key).await {
        Ok(())
    } else {
        Err(AppError::Forbidden(format!(
            "missing permission: {}",
            permission_key
        )))
    }
}

pub async fn get_user_permission_keys(pool: &AnyPool, user_id: &str) -> Vec<String> {
    let mut keys = HashSet::new();

    let direct: Vec<String> = sqlx::query_scalar(
        r#"SELECT p.key FROM user_permissions up
           JOIN permissions p ON up.permission_id = p.id
           WHERE up.user_id = $1"#,
    )
    .bind(user_id)
    .fetch_all(pool)
    .await
    .unwrap_or_default();

    for k in direct {
        keys.insert(k);
    }

    let from_groups: Vec<String> = sqlx::query_scalar(
        r#"SELECT DISTINCT p.key FROM group_permissions gp
           JOIN permissions p ON gp.permission_id = p.id
           JOIN group_memberships gm ON gm.group_id = gp.group_id
           WHERE gm.user_id = $1"#,
    )
    .bind(user_id)
    .fetch_all(pool)
    .await
    .unwrap_or_default();

    for k in from_groups {
        keys.insert(k);
    }

    keys.into_iter().collect()
}

pub async fn require_admin_access(
    pool: &AnyPool,
    user_id: &str,
    role: &str,
) -> Result<(), AppError> {
    if role == "admin" {
        return Ok(());
    }
    if check_permission(pool, user_id, "admin.access").await {
        return Ok(());
    }
    if check_permission(pool, user_id, "users.manage").await {
        return Ok(());
    }
    Err(AppError::Forbidden("admin access required".into()))
}

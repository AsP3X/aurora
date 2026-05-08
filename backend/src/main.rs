use axum::{
    middleware,
    routing::{get, post},
    Router,
};
use std::sync::Arc;
use tower_http::{cors::CorsLayer, trace::TraceLayer};
use tracing::info;

mod admin;
mod auth;
mod config;
mod db;
mod error;
mod permissions;
mod playlists;
mod search;
mod setup;
mod songs;
mod storage;

use config::Config;
use storage::LocalStorage;
use sqlx::AnyPool;

#[derive(Clone)]
pub struct AppState {
    pub pool: AnyPool,
    pub storage: LocalStorage,
    pub jwt_secret: String,
}

fn install_sqlx_drivers() {
    sqlx::any::install_default_drivers();
}

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    tracing_subscriber::fmt()
        .with_env_filter(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| tracing_subscriber::EnvFilter::new("info")),
        )
        .init();

    install_sqlx_drivers();

    let config = Config::from_env()?;

    let pool = db::init_pool(&config.database_url).await?;
    info!("Database connected and migrations applied");

    let storage = LocalStorage {
        base_dir: std::path::PathBuf::from(&config.music_dir),
    };

    let state = Arc::new(AppState {
        pool,
        storage,
        jwt_secret: config.jwt_secret.clone(),
    });

    let app = create_router(state);

    let listener = tokio::net::TcpListener::bind(&config.bind_addr).await?;
    info!("Server listening on {}", config.bind_addr);

    axum::serve(listener, app).await?;
    Ok(())
}

pub fn create_router(state: Arc<AppState>) -> Router {
    let public_routes = Router::new()
        .route("/api/v1/setup/status", get(setup::handlers::setup_status))
        .route("/api/v1/setup", post(setup::handlers::setup))
        .route("/api/v1/auth/register", post(auth::handlers::register))
        .route("/api/v1/auth/login", post(auth::handlers::login))
        .route("/api/v1/auth/oauth/{provider}", get(auth::handlers::oauth_placeholder))
        .route("/api/v1/songs/{id}/stream", get(songs::handlers::stream_song))
        .route("/api/v1/songs/{id}/artwork", get(songs::handlers::get_artwork));

    let protected_routes = Router::new()
        .route("/api/v1/me", get(auth::handlers::me))
        .route("/api/v1/songs", get(songs::handlers::list_songs))
        .route("/api/v1/songs/{id}", get(songs::handlers::get_song))
        .route("/api/v1/search", get(search::handlers::search))
        .route("/api/v1/playlists", get(playlists::handlers::list_playlists).post(playlists::handlers::create_playlist))
        .route("/api/v1/playlists/{id}", get(playlists::handlers::get_playlist))
        .route("/api/v1/playlists/{id}/songs", post(playlists::handlers::add_song))
        .route("/api/v1/playlists/{id}/songs/{song_id}", axum::routing::delete(playlists::handlers::remove_song))
        .route("/api/v1/history", get(songs::handlers::list_history).post(songs::handlers::log_history))
        .route("/api/v1/stats", get(songs::handlers::get_stats))
        .route("/api/v1/admin/permissions", get(permissions::handlers::list_permissions))
        .route("/api/v1/admin/groups", get(permissions::handlers::list_groups).post(permissions::handlers::create_group))
        .route("/api/v1/admin/groups/{id}", get(permissions::handlers::get_group))
        .route("/api/v1/admin/groups/{id}/permissions",
            get(permissions::handlers::list_group_permissions)
            .post(permissions::handlers::grant_group_permission)
            .put(permissions::handlers::replace_group_permissions))
        .route("/api/v1/admin/groups/{id}/permissions/{key}", axum::routing::delete(permissions::handlers::revoke_group_permission))
        .route("/api/v1/admin/groups/{id}/members",
            get(permissions::handlers::list_group_members)
            .post(permissions::handlers::add_group_member))
        .route("/api/v1/admin/groups/{id}/members/{user_id}", axum::routing::delete(permissions::handlers::remove_group_member))
        .route("/api/v1/admin/users", get(permissions::handlers::list_users))
        .route("/api/v1/admin/users/{id}/permissions",
            get(permissions::handlers::list_user_permissions)
            .post(permissions::handlers::grant_user_permission)
            .put(permissions::handlers::replace_user_permissions))
        .route("/api/v1/admin/users/{id}/permissions/{key}", axum::routing::delete(permissions::handlers::revoke_user_permission))
        .route("/api/v1/admin/users/{id}/effective-permissions", get(permissions::handlers::get_user_effective_permissions))
        .route("/api/v1/admin/users/{id}/role", axum::routing::put(admin::handlers::update_user_role))
        .route("/api/v1/admin/users/{id}", axum::routing::delete(admin::handlers::delete_user))
        .route("/api/v1/admin/songs", get(admin::handlers::list_admin_songs))
        .route("/api/v1/admin/songs/{id}", axum::routing::delete(admin::handlers::delete_song))
        .route("/api/v1/admin/playlists", get(admin::handlers::list_all_playlists))
        .route("/api/v1/admin/playlists/{id}", axum::routing::delete(admin::handlers::delete_playlist))
        .route("/api/v1/admin/stats", get(admin::handlers::get_admin_stats))
        .route("/api/v1/admin/settings", get(admin::handlers::list_settings).put(admin::handlers::update_setting))
        .layer(middleware::from_fn_with_state(state.clone(), auth::auth_middleware));

    Router::new()
        .merge(public_routes)
        .merge(protected_routes)
        .with_state(state)
        .layer(CorsLayer::permissive())
        .layer(TraceLayer::new_for_http())
}

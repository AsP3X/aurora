use axum::{
    extract::DefaultBodyLimit,
    middleware,
    routing::{get, post, put},
    Router,
};
use std::path::PathBuf;
use std::sync::Arc;
use tower_http::{cors::CorsLayer, trace::TraceLayer};
use tracing::info;

mod admin;
mod auth;
mod config;
mod db;
mod error;
mod hls;
mod permissions;
mod playlists;
mod search;
mod setup;
mod songs;
mod storage;
mod stream_ticket;

use config::Config;
use storage::{LocalStorage, Storage, nebula::NebulaStorage};
use sqlx::AnyPool;

#[derive(Clone)]
pub struct AppState {
    pub pool: AnyPool,
    pub storage: Arc<dyn Storage>,
    pub staging_dir: PathBuf,
    pub jwt_secret: String,
    pub signing_secret: String,
    pub url_expiry_seconds: u64,
    pub hls_key_store: crate::hls::key_store::KeyStore,
}

fn install_sqlx_drivers() {
    sqlx::any::install_default_drivers();
}

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    tracing_subscriber::fmt()
        .with_env_filter(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| tracing_subscriber::EnvFilter::new("info,tower_http=debug")),
        )
        .init();

    install_sqlx_drivers();

    let config = Config::from_env()?;

    let known_weak_secrets = [
        "change-me-in-production",
        "change-me-in-production-jwt-secret",
    ];
    if known_weak_secrets.contains(&config.jwt_secret.as_str()) {
        anyhow::bail!(
            "JWT_SECRET is set to a known weak default ({}). Please set a strong, random JWT_SECRET environment variable.",
            config.jwt_secret
        );
    }
    if config.signing_secret == "change-me-in-production" {
        anyhow::bail!(
            "SIGNING_SECRET is set to a known weak default. Please set a strong, random SIGNING_SECRET environment variable."
        );
    }
    if config.master_secret == "change-me-in-production" {
        anyhow::bail!(
            "MASTER_SECRET is set to a known weak default. Please set a strong, random MASTER_SECRET environment variable."
        );
    }

    let pool = db::init_pool(&config.database_url).await?;
    info!("Database connected and migrations applied");

    let storage: Arc<dyn Storage> = match config.storage_mode.as_str() {
        "proxy" => {
            info!("Using Nebula OS object storage at {}", config.object_storage_url);
            let nebula = NebulaStorage::new(
                config.object_storage_url.clone(),
                config.object_storage_public_url.clone(),
                config.object_storage_bucket.clone(),
                &config.object_storage_jwt_secret,
                &config.signing_secret,
            )?;

            let health_url = format!("{}/health", config.object_storage_url.trim_end_matches('/'));
            match reqwest::get(&health_url).await {
                Ok(resp) if resp.status().is_success() => {
                    info!("Nebula OS health check passed");
                }
                Ok(resp) => {
                    anyhow::bail!(
                        "Nebula OS health check failed with status {} at {}",
                        resp.status(),
                        health_url
                    );
                }
                Err(e) => {
                    anyhow::bail!(
                        "Nebula OS health check failed: {} at {}",
                        e,
                        health_url
                    );
                }
            }

            Arc::new(nebula)
        }
        _ => {
            info!("Using local filesystem storage at {}", config.music_dir);
            let local = LocalStorage {
                base_dir: std::path::PathBuf::from(&config.music_dir),
            };
            Arc::new(local)
        }
    };

    let staging_dir = PathBuf::from(&config.music_dir);
    let pool_clone = pool.clone();

    let state = Arc::new(AppState {
        pool,
        storage,
        staging_dir,
        jwt_secret: config.jwt_secret.clone(),
        signing_secret: config.signing_secret.clone(),
        url_expiry_seconds: config.url_expiry_seconds,
        hls_key_store: crate::hls::key_store::KeyStore::new(pool_clone, config.master_secret.clone()),
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
        .route("/api/v1/settings/registration", get(admin::handlers::get_public_registration_setting))
        // Fallback direct stream for songs not yet transcoded to HLS
        .route("/api/v1/songs/{id}/stream", get(songs::handlers::stream_song))
        .route("/api/v1/songs/{id}/artwork", get(songs::handlers::get_artwork));

    let protected_routes = Router::new()
        .route("/api/v1/me", get(auth::handlers::me))
        .route("/api/v1/songs", get(songs::handlers::list_songs))
        .route("/api/v1/songs/values", get(songs::handlers::list_values))
        .route("/api/v1/songs/album-song-count", get(songs::handlers::album_song_count))
        .route("/api/v1/songs/{id}", get(songs::handlers::get_song))
        .route("/api/v1/songs/{id}/play-count", get(songs::handlers::get_play_count))
        .route("/api/v1/songs/{id}/stream-url", get(songs::handlers::get_stream_url))
        .route("/api/v1/songs/{id}/artwork-url", get(songs::handlers::get_artwork_url))
        .route("/api/v1/songs/{id}/playlist", get(hls::handlers::get_playlist))
        .route("/api/v1/songs/{id}/key", get(hls::handlers::get_key))
        .route("/api/v1/songs/{id}/segments/{segment}", get(hls::handlers::get_segment))
        .route("/api/v1/search", get(search::handlers::search))
        .route("/api/v1/playlists", get(playlists::handlers::list_playlists).post(playlists::handlers::create_playlist))
        .route("/api/v1/playlists/{id}", get(playlists::handlers::get_playlist).put(playlists::handlers::update_playlist).delete(playlists::handlers::delete_playlist))
        .route("/api/v1/playlists/{id}/songs", post(playlists::handlers::add_song))
        .route("/api/v1/playlists/{id}/songs/reorder", put(playlists::handlers::reorder_songs))
        .route("/api/v1/playlists/{id}/songs/{song_id}", axum::routing::delete(playlists::handlers::remove_song))
        .route("/api/v1/history", get(songs::handlers::list_history).post(songs::handlers::log_history))
        .route("/api/v1/me/top-plays", get(songs::handlers::get_top_plays))
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
        .route("/api/v1/admin/users/{id}/enabled", axum::routing::put(permissions::handlers::update_user_enabled))
        .route("/api/v1/admin/users/{id}", axum::routing::delete(admin::handlers::delete_user))
        .route("/api/v1/admin/songs", get(admin::handlers::list_admin_songs))
        .route("/api/v1/admin/songs/{id}", axum::routing::delete(admin::handlers::delete_song).put(admin::handlers::update_song))
        .route("/api/v1/admin/songs/{id}/enabled", axum::routing::put(admin::handlers::toggle_song_enabled))
        .route("/api/v1/admin/songs/stage/{id}/artwork", get(admin::upload::get_staged_artwork))
        .route("/api/v1/admin/playlists", get(admin::handlers::list_all_playlists))
        .route("/api/v1/admin/playlists/{id}", axum::routing::delete(admin::handlers::delete_playlist))
        .route("/api/v1/admin/stats", get(admin::handlers::get_admin_stats))
        .route("/api/v1/admin/settings", get(admin::handlers::list_settings))
        .route("/api/v1/admin/settings/{key}", axum::routing::put(admin::handlers::update_setting))
        .layer(middleware::from_fn_with_state(state.clone(), auth::auth_middleware));

    let upload_routes = Router::new()
        .route("/api/v1/admin/songs/stage", post(admin::upload::stage_song))
        .route("/api/v1/admin/songs/commit", post(admin::upload::commit_song))
        .layer(DefaultBodyLimit::max(100 * 1024 * 1024))
        .layer(middleware::from_fn_with_state(state.clone(), auth::auth_middleware));

    Router::new()
        .merge(public_routes)
        .merge(protected_routes)
        .merge(upload_routes)
        .with_state(state)
        .layer(CorsLayer::permissive())
        .layer(TraceLayer::new_for_http())
}

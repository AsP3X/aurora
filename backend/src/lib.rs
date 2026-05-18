use axum::{
    extract::DefaultBodyLimit,
    middleware,
    routing::{get, post, put},
    Router,
};
use std::path::PathBuf;
use std::sync::Arc;
use std::time::Duration;
use tower_http::{cors::CorsLayer, trace::TraceLayer};
use tracing::{info, Level};

pub mod admin;
pub mod auth;
pub mod config;
pub mod db;
pub mod error;
pub mod hls;
pub mod lyrics;
pub mod permissions;
pub mod playlists;
pub mod rate_limit;
pub mod redact;
pub mod secrets;
pub mod search;
pub mod setup;
pub mod songs;
pub mod storage;
pub mod stream_ticket;

use config::Config;
use sqlx::AnyPool;
use storage::{LocalStorage, Storage, nebula::NebulaStorage};

#[derive(Clone)]
pub struct AppState {
    pub pool: AnyPool,
    pub storage: Arc<dyn Storage>,
    pub staging_dir: PathBuf,
    pub jwt_secret: String,
    pub signing_secret: String,
    pub url_expiry_seconds: u64,
    pub hls_key_store: crate::hls::key_store::KeyStore,
    /// e.g. `development`, `production` — controls query error detail exposure.
    pub environment: String,
    pub expose_query_errors: bool,
    pub git_sha: String,
    pub admin_listening_rl: Arc<rate_limit::PerKeyRateLimiter>,
    pub auth_login_rl: Arc<rate_limit::PerKeyRateLimiter>,
    pub auth_register_rl: Arc<rate_limit::PerKeyRateLimiter>,
    pub upload_rl: Arc<rate_limit::PerKeyRateLimiter>,
    pub hls_segment_rl: Arc<rate_limit::PerKeyRateLimiter>,
    /// Meilisearch base URL (search route is still a stub until SDK is wired).
    pub meili_url: String,
    /// Meilisearch master key — kept server-side only.
    pub meili_master_key: String,
    /// Optional Meilisearch indexer; absent when URL/key are unset.
    pub search_indexer: Option<Arc<search::indexer::SearchIndexer>>,
    /// Coordinates immediate index sync and DB-backed retries after failures.
    pub search_sync: Arc<search::sync_queue::SearchSyncService>,
    /// Active `DATABASE_URL` the process connected with at startup (used to compare setup wizard input).
    pub database_url: String,
}

fn install_sqlx_drivers() {
    sqlx::any::install_default_drivers();
}

pub async fn create_app_state(config: &Config) -> anyhow::Result<Arc<AppState>> {
    secrets::validate_startup_secrets(config)?;
    install_sqlx_drivers();
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
                    anyhow::bail!("Nebula OS health check failed: {} at {}", e, health_url);
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

    let environment = config.aurora_environment.clone();
    let expose_query_errors = !environment.eq_ignore_ascii_case("production");
    let git_sha = config
        .git_sha
        .clone()
        .or_else(|| std::env::var("GIT_SHA").ok())
        .filter(|s| !s.is_empty())
        .unwrap_or_else(|| "unknown".to_string());

    let window = Duration::from_secs(60);
    let admin_listening_rl = Arc::new(rate_limit::PerKeyRateLimiter::new(
        config.admin_listening_rpm.max(1) as usize,
        window,
    ));
    let auth_login_rl = Arc::new(rate_limit::PerKeyRateLimiter::new(
        config.auth_login_rpm.max(1) as usize,
        window,
    ));
    let auth_register_rl = Arc::new(rate_limit::PerKeyRateLimiter::new(
        config.auth_register_rpm.max(1) as usize,
        window,
    ));
    let upload_rl = Arc::new(rate_limit::PerKeyRateLimiter::new(
        config.upload_rpm.max(1) as usize,
        window,
    ));
    let hls_segment_rl = Arc::new(rate_limit::PerKeyRateLimiter::new(
        config.hls_segment_rpm.max(1) as usize,
        window,
    ));

    // Human: Log Meilisearch env and start the index retry worker when configured.
    // Agent: READS config.meili_*; SPAWNS search_sync worker; EMITS info at startup.
    let search_indexer = search::indexer::SearchIndexer::try_new(
        &config.meili_url,
        &config.meili_master_key,
        pool.clone(),
    );
    let search_sync = search::sync_queue::SearchSyncService::new(pool.clone(), search_indexer.clone());
    if search_indexer.is_some() {
        info!(
            meili_url = %config.meili_url,
            "Meilisearch indexer ready; search sync retry worker started"
        );
        search_sync.clone().spawn_worker();
    } else {
        info!("Meilisearch URL/key not set; /api/v1/search uses SQL fallback messaging only");
    }

    Ok(Arc::new(AppState {
        pool,
        storage,
        staging_dir,
        jwt_secret: config.jwt_secret.clone(),
        signing_secret: config.signing_secret.clone(),
        url_expiry_seconds: config.url_expiry_seconds,
        hls_key_store: crate::hls::key_store::KeyStore::new(pool_clone, config.master_secret.clone()),
        environment,
        expose_query_errors,
        git_sha,
        admin_listening_rl,
        auth_login_rl,
        auth_register_rl,
        upload_rl,
        hls_segment_rl,
        meili_url: config.meili_url.clone(),
        meili_master_key: config.meili_master_key.clone(),
        search_indexer,
        search_sync,
        database_url: config.database_url.clone(),
    }))
}

pub fn create_router(state: Arc<AppState>) -> Router {
    let public_routes = Router::new()
        .route("/api/v1/version", get(setup::handlers::release_info))
        .route("/api/v1/setup/status", get(setup::handlers::setup_status))
        .route("/api/v1/setup/database", get(setup::handlers::setup_database_info))
        .route(
            "/api/v1/setup/database/test",
            post(setup::handlers::test_setup_database),
        )
        .route("/api/v1/setup", post(setup::handlers::setup))
        .route("/api/v1/auth/register", post(auth::handlers::register))
        .route("/api/v1/auth/login", post(auth::handlers::login))
        .route("/api/v1/auth/oauth/{provider}", get(auth::handlers::oauth_placeholder))
        .route("/api/v1/settings/registration", get(admin::handlers::get_public_registration_setting))
        .route("/api/v1/settings/activation", get(admin::handlers::get_public_activation_setting))
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
        .route("/api/v1/songs/{id}/lyrics", get(lyrics::handlers::get_song_lyrics))
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
        .route("/api/v1/history/{id}", put(songs::handlers::update_history))
        .route("/api/v1/me/top-plays", get(songs::handlers::get_top_plays))
        .route("/api/v1/me/listening-time", get(songs::handlers::get_listening_time))
        .route("/api/v1/me/listening-habits", get(songs::handlers::get_listening_habits))
        .route("/api/v1/me/top-artists", get(songs::handlers::get_top_artists))
        .route("/api/v1/me/top-albums", get(songs::handlers::get_top_albums))
        .route("/api/v1/me/listening-by-song", get(songs::handlers::get_me_listening_by_song))
        .route("/api/v1/me/listening-sessions", get(songs::handlers::get_me_listening_sessions))
        .route("/api/v1/stats", get(songs::handlers::get_stats))
        .route("/api/v1/admin/listening-stats", get(songs::handlers::get_admin_listening_stats))
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
        .route(
            "/api/v1/admin/listening-by-song",
            get(songs::handlers::get_admin_listening_by_song_multi).post(songs::handlers::post_admin_listening_by_song_multi),
        )
        .route(
            "/api/v1/admin/listening-sessions",
            get(songs::handlers::get_admin_listening_sessions_multi).post(songs::handlers::post_admin_listening_sessions_multi),
        )
        .route("/api/v1/admin/users/{id}/listening-by-song", get(songs::handlers::get_admin_user_listening_by_song))
        .route("/api/v1/admin/users/{id}/listening-sessions", get(songs::handlers::get_admin_user_listening_sessions))
        .route("/api/v1/admin/users/{id}/role", axum::routing::put(admin::handlers::update_user_role))
        .route("/api/v1/admin/users/{id}/enabled", axum::routing::put(permissions::handlers::update_user_enabled))
        .route("/api/v1/admin/users/{id}", axum::routing::delete(admin::handlers::delete_user))
        .route("/api/v1/admin/songs", get(admin::handlers::list_admin_songs))
        .route("/api/v1/admin/songs/{id}", axum::routing::delete(admin::handlers::delete_song).put(admin::handlers::update_song))
        .route(
            "/api/v1/admin/songs/{id}/lyrics",
            get(lyrics::handlers::admin_get_song_lyrics)
                .put(lyrics::handlers::admin_put_song_lyrics)
                .delete(lyrics::handlers::admin_delete_song_lyrics),
        )
        .route("/api/v1/admin/songs/{id}/enabled", axum::routing::put(admin::handlers::toggle_song_enabled))
        // Human: Admin-only HLS retry and Meilisearch backlog controls (library reliability).
        // Agent: POST hls/retry; GET search/sync-status; POST search/retry-sync; REQUIRE auth middleware layer.
        .route(
            "/api/v1/admin/songs/{id}/hls/retry",
            post(admin::hls_handlers::retry_hls_encode),
        )
        .route(
            "/api/v1/admin/search/sync-status",
            get(search::handlers::admin_search_sync_status),
        )
        .route(
            "/api/v1/admin/search/retry-sync",
            post(search::handlers::admin_search_retry_sync),
        )
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
        // Human: Scrub ticket/signature query params from request spans so tower_http=debug stays safe.
        // Agent: TraceLayer make_span_with CALLS redact::uri_for_log on each request URI.
        .layer(
            TraceLayer::new_for_http().make_span_with(|request: &axum::http::Request<_>| {
                tracing::span!(
                    Level::DEBUG,
                    "request",
                    method = %request.method(),
                    uri = %crate::redact::uri_for_log(request.uri()),
                    version = ?request.version(),
                )
            }),
        )
}

pub async fn run() -> anyhow::Result<()> {
    tracing_subscriber::fmt()
        .with_env_filter(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| tracing_subscriber::EnvFilter::new("info,tower_http=debug")),
        )
        .init();

    let config = Config::from_env()?;
    secrets::validate_startup_secrets(&config)?;

    let state = create_app_state(&config).await?;

    let app = create_router(state);

    let listener = tokio::net::TcpListener::bind(&config.bind_addr).await?;
    info!("Server listening on {}", config.bind_addr);

    axum::serve(listener, app).await?;
    Ok(())
}

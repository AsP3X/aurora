use axum::{
    middleware,
    routing::{get, post},
    Router,
};
use std::sync::Arc;
use tower_http::cors::CorsLayer;
use tracing::info;

mod auth;
mod config;
mod db;
mod error;
mod playlists;
mod search;
mod songs;
mod storage;

use config::Config;
use storage::LocalStorage;

#[derive(Clone)]
pub struct AppState {
    pub pool: sqlx::PgPool,
    pub storage: LocalStorage,
    pub jwt_secret: String,
}

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    tracing_subscriber::fmt()
        .with_env_filter(tracing_subscriber::EnvFilter::from_default_env())
        .init();

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
        .route("/api/v1/auth/register", post(auth::handlers::register))
        .route("/api/v1/auth/login", post(auth::handlers::login))
        .route("/api/v1/auth/oauth/:provider", get(auth::handlers::oauth_placeholder))
        .route("/api/v1/songs/:id/stream", get(songs::handlers::stream_song))
        .route("/api/v1/songs/:id/artwork", get(songs::handlers::get_artwork));

    let protected_routes = Router::new()
        .route("/api/v1/me", get(auth::handlers::me))
        .route("/api/v1/songs", get(songs::handlers::list_songs))
        .route("/api/v1/songs/:id", get(songs::handlers::get_song))
        .route("/api/v1/search", get(search::handlers::search))
        .route("/api/v1/playlists", get(playlists::handlers::list_playlists).post(playlists::handlers::create_playlist))
        .route("/api/v1/playlists/:id", get(playlists::handlers::get_playlist))
        .route("/api/v1/playlists/:id/songs", post(playlists::handlers::add_song))
        .route("/api/v1/playlists/:id/songs/:song_id", axum::routing::delete(playlists::handlers::remove_song))
        .route("/api/v1/history", post(songs::handlers::log_history))
        .layer(middleware::from_fn(auth::auth_middleware));

    Router::new()
        .merge(public_routes)
        .merge(protected_routes)
        .with_state(state)
        .layer(CorsLayer::permissive())
}

// Human: Song library domain — HTTP handlers, SQL models, and Postgres/SQLite date helpers.
// Agent: MODULE songs; ROUTES under /api/v1/songs; DB table songs + song_genres.
pub mod date_dialect;
pub mod handlers;
pub mod limits;
pub mod model;

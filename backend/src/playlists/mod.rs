// Human: Playlist ORM types live in `model`, while `handlers` owns authenticated CRUD for per-user libraries and moderator overrides.
// Agent: EXPORTS handlers + model; TABLES playlists + playlist_songs; ROUTER composes in lib.rs.
pub mod handlers;
pub mod model;

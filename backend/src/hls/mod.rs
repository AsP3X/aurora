// Human: Server-side HLS helpers—AES key persistence, ffmpeg packaging, dynamic playlist text, and authenticated segment/key routes.
// Agent: MODULES encoder/handlers/key_store/playlist; USED during upload commit background task and `/songs/:id/playlist` proxy paths.
pub mod encoder;
pub mod handlers;
pub mod key_store;
pub mod playlist;

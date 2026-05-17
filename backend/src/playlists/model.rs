use serde::{Deserialize, Serialize};
use sqlx::FromRow;

#[derive(Debug, FromRow, Serialize, Deserialize)]
pub struct Playlist {
    pub id: String,
    pub user_id: String,
    pub name: String,
    pub description: Option<String>,
    pub is_public: bool,
    pub created_at: String,
}

// Human: One row in playlist_songs linking a track to a playlist with sort position.
// Agent: READS/WRITES playlist_songs; USED by add_song RETURNING and reorder validation.
#[derive(Debug, FromRow, Serialize, Deserialize)]
pub struct PlaylistSong {
    pub id: String,
    pub playlist_id: String,
    pub song_id: String,
    pub position: i32,
    pub added_at: String,
}

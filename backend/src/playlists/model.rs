use serde::{Deserialize, Deserializer, Serialize, Serializer};
use sqlx::FromRow;

// Human: sqlx Any + SQLite returns is_public as integer widths that do not map to Rust bool directly.
// Agent: SERIALIZE as JSON bool; DESERIALIZE from JSON bool into 0/1 for UPDATE handlers.
pub mod serde_is_public {
    use super::*;

    pub fn serialize<S>(value: &i64, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: Serializer,
    {
        serializer.serialize_bool(*value != 0)
    }

    pub fn deserialize<'de, D>(deserializer: D) -> Result<i64, D::Error>
    where
        D: Deserializer<'de>,
    {
        let b = bool::deserialize(deserializer)?;
        Ok(if b { 1 } else { 0 })
    }
}

#[derive(Debug, FromRow, Serialize, Deserialize)]
pub struct Playlist {
    pub id: String,
    pub user_id: String,
    pub name: String,
    pub description: Option<String>,
    #[serde(with = "serde_is_public")]
    pub is_public: i64,
    pub created_at: String,
}

impl Playlist {
    // Human: Convenience for permission checks that read like ordinary boolean logic.
    // Agent: READS is_public i64; RETURNS true when non-zero.
    pub fn is_public_bool(&self) -> bool {
        self.is_public != 0
    }
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

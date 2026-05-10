use serde::{Deserialize, Serialize};
use sqlx::FromRow;
use std::collections::HashMap;

#[derive(Debug, FromRow)]
#[allow(dead_code)]
pub struct SongDb {
    pub id: String,
    pub title: String,
    pub artist: String,
    pub album: Option<String>,
    pub album_artist: Option<String>,
    pub track_number: Option<i32>,
    pub year: Option<i32>,
    pub studio: Option<String>,
    pub duration_seconds: i32,
    pub file_key: String,
    pub file_size_bytes: i64,
    pub file_format: String,
    pub bitrate_kbps: Option<i32>,
    pub sample_rate_hz: Option<i32>,
    pub artwork_key: Option<String>,
    pub publisher_id: Option<String>,
    pub enabled: i64,
    pub hls_ready: Option<bool>,
    pub hls_key_id: Option<String>,
    pub segment_count: Option<i32>,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct Song {
    pub id: String,
    pub title: String,
    pub artist: String,
    pub album: Option<String>,
    pub album_artist: Option<String>,
    pub track_number: Option<i32>,
    pub year: Option<i32>,
    pub genres: Vec<String>,
    pub studio: Option<String>,
    pub duration_seconds: i32,
    pub file_key: String,
    pub file_size_bytes: i64,
    pub file_format: String,
    pub bitrate_kbps: Option<i32>,
    pub sample_rate_hz: Option<i32>,
    pub artwork_key: Option<String>,
    pub publisher_id: Option<String>,
    pub enabled: i64,
    pub hls_ready: bool,
    pub created_at: String,
    pub updated_at: String,
}

impl From<SongDb> for Song {
    fn from(db: SongDb) -> Self {
        Self {
            id: db.id,
            title: db.title,
            artist: db.artist,
            album: db.album,
            album_artist: db.album_artist,
            track_number: db.track_number,
            year: db.year,
            genres: Vec::new(),
            studio: db.studio,
            duration_seconds: db.duration_seconds,
            file_key: db.file_key,
            file_size_bytes: db.file_size_bytes,
            file_format: db.file_format,
            bitrate_kbps: db.bitrate_kbps,
            sample_rate_hz: db.sample_rate_hz,
            artwork_key: db.artwork_key,
            publisher_id: db.publisher_id,
            enabled: db.enabled,
            hls_ready: db.hls_ready.unwrap_or(false),
            created_at: db.created_at,
            updated_at: db.updated_at,
        }
    }
}

pub async fn populate_genres(
    pool: &sqlx::AnyPool,
    songs: &mut [Song],
) -> Result<(), sqlx::Error> {
    if songs.is_empty() {
        return Ok(());
    }

    // SQLite parameter limit is 999; use a safe batch size
    const BATCH_SIZE: usize = 900;
    let ids: Vec<&str> = songs.iter().map(|s| s.id.as_str()).collect();

    let mut genre_map: HashMap<String, Vec<String>> = HashMap::new();

    for chunk in ids.chunks(BATCH_SIZE) {
        let placeholders: Vec<String> = (1..=chunk.len()).map(|i| format!("${}", i)).collect();
        let sql = format!(
            "SELECT song_id, g.name FROM song_genres sg JOIN genres g ON sg.genre_id = g.id WHERE song_id IN ({})",
            placeholders.join(", ")
        );
        let mut query = sqlx::query_as::<_, (String, String)>(&sql);
        for id in chunk {
            query = query.bind(id);
        }
        let rows = query.fetch_all(pool).await?;
        for (song_id, genre) in rows {
            genre_map.entry(song_id).or_default().push(genre);
        }
    }

    for song in songs.iter_mut() {
        song.genres = genre_map.remove(&song.id).unwrap_or_default();
    }

    Ok(())
}

pub async fn populate_genres_for_one(
    pool: &sqlx::AnyPool,
    song: &mut Song,
) -> Result<(), sqlx::Error> {
    let rows: Vec<(String,)> = sqlx::query_as(
        "SELECT g.name FROM song_genres sg JOIN genres g ON sg.genre_id = g.id WHERE sg.song_id = $1"
    )
    .bind(&song.id)
    .fetch_all(pool)
    .await?;

    song.genres = rows.into_iter().map(|r| r.0).collect();
    Ok(())
}

#[derive(Debug, FromRow, Serialize, Deserialize)]
pub struct HistoryEntry {
    pub id: String,
    pub user_id: String,
    pub song_id: String,
    pub started_at: String,
    pub duration_listened_seconds: Option<i32>,
    pub completed: i64,
    pub title: String,
    pub artist: String,
    pub album: Option<String>,
    pub artwork_key: Option<String>,
    pub duration_seconds: i32,
}

#[derive(Debug, FromRow, Serialize, Deserialize)]
pub struct LibraryStats {
    pub total_songs: i64,
    pub total_artists: i64,
    pub total_albums: i64,
    pub total_duration_seconds: i64,
}

use serde::{Deserialize, Serialize};
use sqlx::FromRow;
use std::collections::HashMap;

// Human: Full songs row from SQL; converted to API-facing `Song` (genres loaded separately).
// Agent: READS songs table via FromRow; MAPS to Song via From; WRITES via admin/upload and handlers.
#[derive(Debug, FromRow)]
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
    pub enabled: bool,
    pub hls_ready: Option<bool>,
    pub hls_key_id: Option<String>,
    pub segment_count: Option<i32>,
    pub hls_encode_status: Option<String>,
    pub hls_encode_error: Option<String>,
    pub conversion_progress: Option<i32>,
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
    pub enabled: bool,
    pub hls_ready: bool,
    pub hls_encode_status: Option<String>,
    pub hls_encode_error: Option<String>,
    pub conversion_progress: i32,
    // Human: Admin library overview — whether a song_lyrics row has non-empty text (optional on public list).
    // Agent: SERIALIZED bool; DEFAULT false; POPULATED by populate_lyrics_status for admin list only.
    #[serde(default)]
    pub has_lyrics: bool,
    // Human: Admin library overview — whether all non-empty lines have timestamps (karaoke-ready).
    // Agent: SERIALIZED bool; DEFAULT false; REQUIRES has_lyrics; SET via is_synced after JSON parse.
    #[serde(default)]
    pub lyrics_synced: bool,
    pub created_at: String,
    pub updated_at: String,
}

impl From<SongDb> for Song {
    // Human: Normalize nullable HLS columns to API defaults (not ready → false, no progress → 0).
    // Agent: MAPS hls_ready Option→bool unwrap_or false; conversion_progress Option→i32 unwrap_or 0.
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
            hls_encode_status: db.hls_encode_status,
            hls_encode_error: db.hls_encode_error,
            conversion_progress: db.conversion_progress.unwrap_or(0),
            has_lyrics: false,
            lyrics_synced: false,
            created_at: db.created_at,
            updated_at: db.updated_at,
        }
    }
}

// Human: Batch-load song_lyrics JSON for admin table badges (added vs synced).
// Agent: READS song_lyrics IN chunk; PARSES lines_json; MUTATES Song.has_lyrics + lyrics_synced.
pub async fn populate_lyrics_status(
    pool: &sqlx::AnyPool,
    songs: &mut [Song],
) -> Result<(), sqlx::Error> {
    use crate::lyrics::model::{has_lyrics_content, is_synced, LyricLine};

    if songs.is_empty() {
        return Ok(());
    }

    const BATCH_SIZE: usize = 900;
    let ids: Vec<&str> = songs.iter().map(|s| s.id.as_str()).collect();
    let mut status_map: HashMap<String, (bool, bool)> = HashMap::new();

    for chunk in ids.chunks(BATCH_SIZE) {
        let placeholders: Vec<String> = (1..=chunk.len()).map(|i| format!("${}", i)).collect();
        let sql = format!(
            "SELECT song_id, lines_json FROM song_lyrics WHERE song_id IN ({})",
            placeholders.join(", ")
        );
        let mut query = sqlx::query_as::<_, (String, String)>(&sql);
        for id in chunk {
            query = query.bind(id);
        }
        let rows = query.fetch_all(pool).await?;
        for (song_id, json) in rows {
            let lines: Vec<LyricLine> = match serde_json::from_str(&json) {
                Ok(lines) => lines,
                Err(e) => {
                    tracing::warn!(song_id = %song_id, error = %e, "corrupt lyrics JSON; treating as no lyrics");
                    continue;
                }
            };
            let has = has_lyrics_content(&lines);
            status_map.insert(song_id, (has, has && is_synced(&lines)));
        }
    }

    for song in songs.iter_mut() {
        if let Some((has, synced)) = status_map.remove(&song.id) {
            song.has_lyrics = has;
            song.lyrics_synced = synced;
        }
    }

    Ok(())
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
    pub ended_at: Option<String>,
    pub duration_listened_seconds: Option<i32>,
    pub completed: bool,
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

#[derive(Debug, Serialize, Deserialize)]
pub struct PlayCount {
    pub song_id: String,
    pub play_count: i64,
}

#[derive(Debug, FromRow, Serialize, Deserialize)]
pub struct TopPlay {
    pub song_id: String,
    pub title: String,
    pub artist: String,
    pub album: Option<String>,
    pub artwork_key: Option<String>,
    pub duration_seconds: i32,
    pub play_count: i64,
    pub last_played_at: Option<String>,
}

#[derive(Debug, FromRow, Serialize)]
pub struct TopArtist {
    pub artist: String,
    pub total_seconds: i64,
    pub play_count: i64,
}

#[derive(Debug, FromRow, Serialize)]
pub struct TopAlbum {
    pub album: String,
    pub album_artist: Option<String>,
    pub total_seconds: i64,
    pub play_count: i64,
}

#[derive(Debug, FromRow, Serialize)]
pub struct ListeningTimeResult {
    pub total_seconds: i64,
}

#[derive(Debug, FromRow, Serialize)]
pub struct HourBucket {
    pub hour: i32,
    pub total_seconds: i64,
}

#[derive(Debug, FromRow, Serialize)]
pub struct DayBucket {
    pub day: i32,
    pub total_seconds: i64,
}

#[derive(Debug, FromRow, Serialize)]
pub struct AdminListeningStats {
    pub total_plays: i64,
    pub active_users: i64,
    pub total_listening_seconds: i64,
    pub avg_duration_seconds: f32,
}

/// Per-song aggregates for a single user (playback sessions joined to library metadata).
#[derive(Debug, FromRow, Serialize)]
pub struct UserSongListening {
    pub song_id: String,
    pub title: String,
    pub artist: String,
    pub album: Option<String>,
    pub artwork_key: Option<String>,
    pub duration_seconds: i32,
    pub play_count: i64,
    pub total_listened_seconds: i64,
}

/// One playback row for analytics (per session listened seconds and timestamps).
#[derive(Debug, FromRow, Serialize)]
pub struct ListeningSessionEntry {
    pub id: String,
    pub user_id: String,
    pub song_id: String,
    pub started_at: String,
    pub ended_at: Option<String>,
    pub duration_listened_seconds: Option<i32>,
    pub completed: bool,
    pub title: String,
    pub artist: String,
    pub album: Option<String>,
    pub song_duration_seconds: i32,
}

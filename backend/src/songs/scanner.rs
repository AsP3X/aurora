use sqlx::PgPool;
use std::path::Path;
use tracing::{info, warn};
use uuid::Uuid;
use walkdir::WalkDir;

pub async fn scan_directory(pool: &PgPool, base_dir: &str) -> anyhow::Result<()> {
    info!("Starting library scan at {}", base_dir);

    for entry in WalkDir::new(base_dir).into_iter().filter_map(|e| e.ok()) {
        let path = entry.path();
        if !path.is_file() {
            continue;
        }

        let ext = path.extension().and_then(|e| e.to_str()).unwrap_or("").to_lowercase();
        if !matches!(ext.as_str(), "mp3" | "flac" | "ogg" | "opus" | "m4a" | "aac" | "wma") {
            continue;
        }

        match process_file(pool, path, base_dir).await {
            Ok(_) => {}
            Err(e) => warn!("Failed to process {}: {}", path.display(), e),
        }
    }

    info!("Library scan complete");
    Ok(())
}

async fn process_file(pool: &PgPool, path: &Path, base_dir: &str) -> anyhow::Result<()> {
    use lofty::prelude::*;
    use lofty::tag::ItemKey;

    let tagged_file = lofty::read_from_path(path)?;

    let tag = match tagged_file.primary_tag() {
        Some(tag) => tag,
        None => return Ok(()),
    };

    let properties = tagged_file.properties();

    let title = tag.title().as_deref().unwrap_or_else(|| {
        path.file_stem().and_then(|s| s.to_str()).unwrap_or("Unknown")
    }).to_string();
    let artist = tag.artist().as_deref().unwrap_or("Unknown Artist").to_string();
    let album = tag.album().map(|v| v.to_string());
    let album_artist = tag.get_string(&ItemKey::AlbumArtist).map(|v| v.to_string());
    let track_number = tag.track().map(|v| v as i32);
    let year = tag.year().map(|v| v as i32);
    let genre = tag.genre().map(|v| v.to_string());

    let duration = properties.duration().as_secs() as i32;
    let file_size = std::fs::metadata(path)?.len() as i64;
    let file_format = path.extension().and_then(|e| e.to_str()).unwrap_or("unknown").to_string();
    let bitrate = properties.audio_bitrate().map(|b| b as i32);
    let sample_rate = properties.sample_rate().map(|s| s as i32);

    let file_key = path.strip_prefix(base_dir)?.to_string_lossy().to_string();

    let id = Uuid::new_v4();

    sqlx::query(
        "INSERT INTO songs (
            id, title, artist, album, album_artist, track_number, year, genre,
            duration_seconds, file_key, file_size_bytes, file_format, bitrate_kbps, sample_rate_hz
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
        ON CONFLICT (file_key) DO UPDATE SET
            title = EXCLUDED.title,
            artist = EXCLUDED.artist,
            album = EXCLUDED.album,
            album_artist = EXCLUDED.album_artist,
            track_number = EXCLUDED.track_number,
            year = EXCLUDED.year,
            genre = EXCLUDED.genre,
            duration_seconds = EXCLUDED.duration_seconds,
            file_size_bytes = EXCLUDED.file_size_bytes,
            bitrate_kbps = EXCLUDED.bitrate_kbps,
            sample_rate_hz = EXCLUDED.sample_rate_hz,
            updated_at = now()"
    )
    .bind(id)
    .bind(&title)
    .bind(&artist)
    .bind(&album)
    .bind(&album_artist)
    .bind(track_number)
    .bind(year)
    .bind(&genre)
    .bind(duration)
    .bind(&file_key)
    .bind(file_size)
    .bind(&file_format)
    .bind(bitrate)
    .bind(sample_rate)
    .execute(pool)
    .await?;

    info!("Indexed: {} - {}", artist, title);
    Ok(())
}

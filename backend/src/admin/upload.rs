use axum::extract::{Multipart, State};
use serde::{Deserialize, Serialize};
use std::path::Path;
use std::sync::Arc;
use uuid::Uuid;

use crate::{
    error::AppError,
    permissions::require_admin_access,
    AppState,
};

const STAGING_DIR_NAME: &str = ".staging";

async fn ensure_parent_dir(path: &Path) -> Result<(), AppError> {
    if let Some(parent) = path.parent() {
        tokio::fs::create_dir_all(parent)
            .await
            .map_err(|e| AppError::Storage(e.to_string()))?;
    }
    Ok(())
}

#[derive(Debug, Serialize)]
pub struct SongDraft {
    pub staging_id: String,
    pub title: String,
    pub artist: String,
    pub album: Option<String>,
    pub album_artist: Option<String>,
    pub track_number: Option<i32>,
    pub year: Option<i32>,
    pub genre: Option<String>,
    pub studio: Option<String>,
    pub duration_seconds: i32,
    pub file_format: String,
    pub bitrate_kbps: Option<i32>,
    pub sample_rate_hz: Option<i32>,
    pub has_artwork: bool,
}

#[derive(Debug, Deserialize)]
pub struct CommitSongRequest {
    pub staging_id: String,
    pub title: String,
    pub artist: String,
    pub album: Option<String>,
    pub album_artist: Option<String>,
    pub track_number: Option<i32>,
    pub year: Option<i32>,
    pub genre: Option<String>,
    pub studio: Option<String>,
    pub duration_seconds: i32,
    pub file_format: String,
    pub bitrate_kbps: Option<i32>,
    pub sample_rate_hz: Option<i32>,
}

struct ExtractedMetadata {
    title: String,
    artist: String,
    album: Option<String>,
    album_artist: Option<String>,
    track_number: Option<i32>,
    year: Option<i32>,
    genre: Option<String>,
    duration_seconds: i32,
    file_format: String,
    bitrate_kbps: Option<i32>,
    sample_rate_hz: Option<i32>,
}

fn extract_metadata(path: &Path) -> anyhow::Result<ExtractedMetadata> {
    use lofty::prelude::*;
    use lofty::tag::ItemKey;

    let tagged_file = lofty::read_from_path(path)?;
    let properties = tagged_file.properties();

    let (title, artist, album, album_artist, track_number, year, genre) =
        match tagged_file.primary_tag() {
            Some(tag) => (
                tag.title()
                    .as_deref()
                    .unwrap_or_else(|| {
                        path.file_stem()
                            .and_then(|s| s.to_str())
                            .unwrap_or("Unknown")
                    })
                    .to_string(),
                tag.artist().as_deref().unwrap_or("Unknown Artist").to_string(),
                tag.album().map(|v| v.to_string()),
                tag.get_string(&ItemKey::AlbumArtist).map(|v| v.to_string()),
                tag.track().map(|v| v as i32),
                tag.year().map(|v| v as i32),
                tag.genre().map(|v| v.to_string()),
            ),
            None => (
                path.file_stem()
                    .and_then(|s| s.to_str())
                    .unwrap_or("Unknown")
                    .to_string(),
                "Unknown Artist".to_string(),
                None,
                None,
                None,
                None,
                None,
            ),
        };

    let duration = properties.duration().as_secs().try_into().unwrap_or(i32::MAX);
    let file_format = path
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("unknown")
        .to_string();
    let bitrate = properties.audio_bitrate().map(|b| b as i32);
    let sample_rate = properties.sample_rate().map(|s| s as i32);

    Ok(ExtractedMetadata {
        title,
        artist,
        album,
        album_artist,
        track_number,
        year,
        genre,
        duration_seconds: duration,
        file_format,
        bitrate_kbps: bitrate,
        sample_rate_hz: sample_rate,
    })
}

fn extract_artwork(path: &Path) -> anyhow::Result<Option<(String, Vec<u8>)>> {
    use lofty::prelude::*;

    let tagged_file = lofty::read_from_path(path)?;
    let tag = match tagged_file.primary_tag() {
        Some(t) => t,
        None => return Ok(None),
    };

    let pictures = tag.pictures();
    if pictures.is_empty() {
        return Ok(None);
    }

    if let Some(pic) = pictures.first() {
        let ext = match pic.mime_type().map(|m| m.as_str()).unwrap_or("image/jpeg") {
            "image/png" => "png",
            "image/webp" => "webp",
            _ => "jpg",
        };
        return Ok(Some((ext.to_string(), pic.data().to_vec())));
    }

    Ok(None)
}

pub async fn stage_song(
    State(state): State<Arc<AppState>>,
    claims: axum::Extension<crate::auth::Claims>,
    mut multipart: Multipart,
) -> Result<axum::Json<SongDraft>, AppError> {
    require_admin_access(&state.pool, &claims.sub, &claims.role).await?;

    let mut audio_bytes: Option<Vec<u8>> = None;
    let mut filename = String::new();

    while let Some(field) = multipart
        .next_field()
        .await
        .map_err(|e| AppError::BadRequest(e.to_string()))?
    {
        let name = field.name().unwrap_or("").to_string();
        if name == "audio" {
            filename = field.file_name().unwrap_or("unknown").to_string();
            let bytes = field
                .bytes()
                .await
                .map_err(|e| AppError::BadRequest(e.to_string()))?
                .to_vec();
            audio_bytes = Some(bytes);
            break;
        }
    }

    let audio_bytes = audio_bytes.ok_or_else(|| AppError::BadRequest("No audio file provided".into()))?;

    let ext = Path::new(&filename)
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("")
        .to_lowercase();
    let allowed = ["mp3", "flac", "ogg", "opus", "m4a", "aac", "wma"];
    if !allowed.contains(&ext.as_str()) {
        return Err(AppError::BadRequest(format!(
            "Unsupported audio format: {}. Allowed: {:?}",
            ext, allowed
        )));
    }

    let staging_id = Uuid::new_v4().to_string();
    let staging_dir = state.storage.base_dir.join(STAGING_DIR_NAME).join(&staging_id);
    tokio::fs::create_dir_all(&staging_dir)
        .await
        .map_err(|e| AppError::Storage(e.to_string()))?;

    let audio_path = staging_dir.join(format!("audio.{}", ext));
    tokio::fs::write(&audio_path, &audio_bytes)
        .await
        .map_err(|e| AppError::Storage(e.to_string()))?;

    let audio_path_clone = audio_path.clone();
    let meta_result = tokio::task::spawn_blocking(move || extract_metadata(&audio_path_clone))
        .await
        .map_err(|e| AppError::Storage(format!("Metadata task failed: {}", e)))?;

    let meta = match meta_result {
        Ok(m) => m,
        Err(e) => {
            if let Err(cleanup_err) = tokio::fs::remove_dir_all(&staging_dir).await {
                tracing::warn!("Failed to clean up staging dir after metadata error: {}", cleanup_err);
            }
            return Err(AppError::BadRequest(format!("Failed to read metadata: {}", e)));
        }
    };

    let audio_path_clone = audio_path.clone();
    let artwork_result = tokio::task::spawn_blocking(move || extract_artwork(&audio_path_clone))
        .await
        .map_err(|e| AppError::Storage(format!("Artwork task failed: {}", e)))?;

    let has_artwork = match artwork_result {
        Ok(Some((ext, data))) => {
            let art_path = staging_dir.join(format!("artwork.{}", ext));
            match tokio::fs::write(&art_path, &data).await {
                Ok(()) => true,
                Err(e) => {
                    tracing::warn!("Failed to write extracted artwork: {}", e);
                    if let Err(cleanup_err) = tokio::fs::remove_dir_all(&staging_dir).await {
                        tracing::warn!("Failed to clean up staging dir after artwork write error: {}", cleanup_err);
                    }
                    return Err(AppError::Storage(format!("Failed to write artwork: {}", e)));
                }
            }
        }
        Ok(None) => false,
        Err(e) => {
            tracing::warn!("Failed to extract artwork: {}", e);
            if let Err(cleanup_err) = tokio::fs::remove_dir_all(&staging_dir).await {
                tracing::warn!("Failed to clean up staging dir after artwork error: {}", cleanup_err);
            }
            return Err(AppError::BadRequest(format!("Failed to extract artwork: {}", e)));
        }
    };

    let draft = SongDraft {
        staging_id,
        title: meta.title,
        artist: meta.artist,
        album: meta.album,
        album_artist: meta.album_artist,
        track_number: meta.track_number,
        year: meta.year,
        genre: meta.genre,
        studio: None,
        duration_seconds: meta.duration_seconds,
        file_format: meta.file_format,
        bitrate_kbps: meta.bitrate_kbps,
        sample_rate_hz: meta.sample_rate_hz,
        has_artwork,
    };

    Ok(axum::Json(draft))
}

pub async fn commit_song(
    State(state): State<Arc<AppState>>,
    claims: axum::Extension<crate::auth::Claims>,
    mut multipart: Multipart,
) -> Result<axum::Json<crate::songs::model::Song>, AppError> {
    require_admin_access(&state.pool, &claims.sub, &claims.role).await?;

    let mut metadata_json = String::new();
    let mut artwork_bytes: Option<Vec<u8>> = None;
    let mut artwork_ext = "jpg".to_string();

    while let Some(field) = multipart
        .next_field()
        .await
        .map_err(|e| AppError::BadRequest(e.to_string()))?
    {
        let name = field.name().unwrap_or("").to_string();
        match name.as_str() {
            "metadata" => {
                metadata_json = String::from_utf8(
                    field
                        .bytes()
                        .await
                        .map_err(|e| AppError::BadRequest(e.to_string()))?
                        .to_vec(),
                )
                .map_err(|_| AppError::BadRequest("Invalid metadata encoding".into()))?;
            }
            "artwork" => {
                artwork_ext = field
                    .file_name()
                    .and_then(|f| Path::new(f).extension().and_then(|e| e.to_str()))
                    .unwrap_or("jpg")
                    .to_lowercase();
                artwork_bytes = Some(
                    field
                        .bytes()
                        .await
                        .map_err(|e| AppError::BadRequest(e.to_string()))?
                        .to_vec(),
                );
            }
            _ => {}
        }
    }

    let req: CommitSongRequest = serde_json::from_str(&metadata_json)
        .map_err(|e| AppError::BadRequest(format!("Invalid metadata JSON: {}", e)))?;

    if req.title.trim().is_empty() || req.artist.trim().is_empty() {
        return Err(AppError::BadRequest("Title and artist are required".into()));
    }

    Uuid::parse_str(&req.staging_id).map_err(|_| AppError::BadRequest("Invalid staging_id".into()))?;

    if let Some(ref bytes) = artwork_bytes {
        if bytes.is_empty() {
            return Err(AppError::BadRequest("Empty artwork payload".into()));
        }
    }

    let staging_dir = state.storage.base_dir.join(STAGING_DIR_NAME).join(&req.staging_id);
    if !staging_dir.is_dir() {
        return Err(AppError::NotFound);
    }

    let mut entries = tokio::fs::read_dir(&staging_dir)
        .await
        .map_err(|e| AppError::Storage(e.to_string()))?;
    let mut audio_path = None;
    while let Some(entry) = entries
        .next_entry()
        .await
        .map_err(|e| AppError::Storage(e.to_string()))?
    {
        let name = entry.file_name().to_string_lossy().to_string();
        if name.starts_with("audio.") {
            audio_path = Some(entry.path());
            break;
        }
    }
    let audio_path = audio_path.ok_or(AppError::NotFound)?;

    let song_id = Uuid::new_v4().to_string();
    let file_key = format!(
        "uploads/{}_{}",
        &song_id,
        audio_path.file_name().ok_or_else(|| AppError::Storage("Invalid audio path".into()))?.to_string_lossy()
    );
    let dest_path = state.storage.base_dir.join(&file_key);
    ensure_parent_dir(&dest_path).await?;
    tokio::fs::rename(&audio_path, &dest_path)
        .await
        .map_err(|e| AppError::Storage(e.to_string()))?;

    let file_size = tokio::fs::metadata(&dest_path)
        .await
        .map_err(|e| AppError::Storage(e.to_string()))?
        .len() as i64;

    let mut artwork_key: Option<String> = None;

    if let Some(bytes) = artwork_bytes {
        let art_ext = if matches!(artwork_ext.as_str(), "png" | "jpg" | "jpeg" | "webp") {
            artwork_ext
        } else {
            "jpg".to_string()
        };
        let art_key = format!("artwork/{}.{}", song_id, art_ext);
        let art_path = state.storage.base_dir.join(&art_key);
        ensure_parent_dir(&art_path).await?;
        tokio::fs::write(&art_path, bytes)
            .await
            .map_err(|e| AppError::Storage(e.to_string()))?;
        artwork_key = Some(art_key);
    } else {
        let mut art_entries = tokio::fs::read_dir(&staging_dir)
            .await
            .map_err(|e| AppError::Storage(e.to_string()))?;
        while let Some(entry) = art_entries
            .next_entry()
            .await
            .map_err(|e| AppError::Storage(e.to_string()))?
        {
            let name = entry.file_name().to_string_lossy().to_string();
            if name.starts_with("artwork.") {
                let ext = Path::new(&name)
                    .extension()
                    .and_then(|e| e.to_str())
                    .unwrap_or("jpg");
                let art_key = format!("artwork/{}.{}", song_id, ext);
                let art_path = state.storage.base_dir.join(&art_key);
                ensure_parent_dir(&art_path).await?;
                tokio::fs::rename(entry.path(), &art_path)
                    .await
                    .map_err(|e| AppError::Storage(e.to_string()))?;
                artwork_key = Some(art_key);
                break;
            }
        }
    }

    let song_result = sqlx::query_as::<_, crate::songs::model::Song>(
        "INSERT INTO songs (
            id, title, artist, album, album_artist, track_number, year, genre, studio,
            duration_seconds, file_key, file_size_bytes, file_format, bitrate_kbps, sample_rate_hz, artwork_key, publisher_id
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)
        RETURNING *"
    )
    .bind(&song_id)
    .bind(&req.title)
    .bind(&req.artist)
    .bind(&req.album)
    .bind(&req.album_artist)
    .bind(req.track_number)
    .bind(req.year)
    .bind(&req.genre)
    .bind(&req.studio)
    .bind(req.duration_seconds)
    .bind(&file_key)
    .bind(file_size)
    .bind(&req.file_format)
    .bind(req.bitrate_kbps)
    .bind(req.sample_rate_hz)
    .bind(&artwork_key)
    .bind(&claims.sub)
    .fetch_one(&state.pool)
    .await;

    match song_result {
        Ok(song) => {
            if let Err(e) = tokio::fs::remove_dir_all(&staging_dir).await {
                tracing::warn!("Failed to remove staging directory: {}", e);
            }
            Ok(axum::Json(song))
        }
        Err(e) => {
            if let Err(e) = tokio::fs::remove_file(&dest_path).await {
                tracing::warn!("Failed to clean up audio file after DB error: {}", e);
            }
            if let Some(ref key) = artwork_key {
                let art_path = state.storage.base_dir.join(key);
                if let Err(e) = tokio::fs::remove_file(&art_path).await {
                    tracing::warn!("Failed to clean up artwork file after DB error: {}", e);
                }
            }
            if let Err(e) = tokio::fs::remove_dir_all(&staging_dir).await {
                tracing::warn!("Failed to remove staging directory after DB error: {}", e);
            }
            Err(e.into())
        }
    }
}

pub async fn get_staged_artwork(
    State(state): State<Arc<AppState>>,
    claims: axum::Extension<crate::auth::Claims>,
    axum::extract::Path(staging_id): axum::extract::Path<String>,
) -> Result<impl axum::response::IntoResponse, AppError> {
    require_admin_access(&state.pool, &claims.sub, &claims.role).await?;

    let staging_dir = state.storage.base_dir.join(STAGING_DIR_NAME).join(&staging_id);
    if !staging_dir.is_dir() {
        return Err(AppError::NotFound);
    }

    let mut entries = tokio::fs::read_dir(&staging_dir)
        .await
        .map_err(|e| AppError::Storage(e.to_string()))?;

    while let Some(entry) = entries
        .next_entry()
        .await
        .map_err(|e| AppError::Storage(e.to_string()))?
    {
        let name = entry.file_name().to_string_lossy().to_string();
        if name.starts_with("artwork.") {
            let path = entry.path();
            let mime = mime_guess::from_path(&path)
                .first_or_octet_stream()
                .to_string();
            let bytes = tokio::fs::read(&path)
                .await
                .map_err(|e| AppError::Storage(e.to_string()))?;
            return Ok((
                [(axum::http::header::CONTENT_TYPE, mime)],
                bytes,
            ));
        }
    }

    Err(AppError::NotFound)
}

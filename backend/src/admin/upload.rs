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

#[derive(Debug, Serialize)]
pub struct SongDraft {
    pub staging_id: String,
    pub title: String,
    pub artist: String,
    pub album: Option<String>,
    pub album_artist: Option<String>,
    pub track_number: Option<i32>,
    pub year: Option<i32>,
    pub genres: Vec<String>,
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
    pub genres: Vec<String>,
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
    genres: Vec<String>,
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

    let (title, artist, album, album_artist, track_number, year, genres) =
        match tagged_file.primary_tag() {
            Some(tag) => {
                let genre_str = tag.genre().map(|v| v.to_string());
                let genres = genre_str
                    .map(|s| {
                        s.split(|c: char| c == '/' || c == ';' || c == ',')
                            .map(|g| g.trim().to_lowercase())
                            .filter(|g| !g.is_empty())
                            .collect::<Vec<String>>()
                    })
                    .unwrap_or_default();
                (
                    path.file_stem()
                        .and_then(|s| s.to_str())
                        .unwrap_or("Unknown")
                        .to_string(),
                    tag.artist().as_deref().unwrap_or("Unknown Artist").to_string(),
                    tag.album().map(|v| v.to_string()),
                    tag.get_string(&ItemKey::AlbumArtist).map(|v| v.to_string()),
                    tag.track().map(|v| v as i32),
                    tag.year().map(|v| v as i32),
                    genres,
                )
            }
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
                Vec::new(),
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
        genres,
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
    let start = std::time::Instant::now();
    tracing::info!(user_id = %claims.sub, email = %claims.email, "stage_song started");

    require_admin_access(&state.pool, &claims.sub, &claims.role).await?;

    let mut audio_bytes: Option<Vec<u8>> = None;
    let mut ext = String::new();

    while let Some(field) = multipart
        .next_field()
        .await
        .map_err(|e| AppError::BadRequest(e.to_string()))?
    {
        let name = field.name().unwrap_or("").to_string();
        let filename = field.file_name().unwrap_or("unknown").to_string();
        let content_type = field.content_type().map(|ct| ct.to_string());
        tracing::info!(field_name = %name, field_filename = %filename, field_content_type = ?content_type, "multipart field received");
        if name == "audio" && audio_bytes.is_none() {
            // Validate extension BEFORE buffering bytes
            ext = Path::new(&filename)
                .extension()
                .and_then(|e| e.to_str())
                .unwrap_or("")
                .to_lowercase();

            // Fallback to MIME type mapping if filename has no extension
            if ext.is_empty() {
                if let Some(ref ct) = content_type {
                    ext = match ct.as_str() {
                        "audio/mpeg" => "mp3".to_string(),
                        "audio/flac" | "audio/x-flac" => "flac".to_string(),
                        "audio/ogg" => "ogg".to_string(),
                        "audio/opus" => "opus".to_string(),
                        "audio/mp4" | "audio/x-m4a" => "m4a".to_string(),
                        "audio/aac" => "aac".to_string(),
                        "audio/x-ms-wma" => "wma".to_string(),
                        "audio/wav" | "audio/x-wav" | "audio/wave" => "wav".to_string(),
                        _ => {
                            tracing::warn!(content_type = %ct, "unrecognized audio MIME type");
                            String::new()
                        }
                    };
                }
            }

            tracing::info!(extracted_ext = %ext, "extension extracted");
            let allowed = ["mp3", "flac", "ogg", "opus", "m4a", "aac", "wma", "wav"];
            if !allowed.contains(&ext.as_str()) {
                tracing::warn!(ext = %ext, filename = %filename, content_type = ?content_type, "unsupported audio format");
                return Err(AppError::BadRequest(format!(
                    "Unsupported audio format: {} (filename: {}). Allowed: {:?}",
                    ext, filename, allowed
                )));
            }
            tracing::info!("about to read field bytes");
            let bytes = field
                .bytes()
                .await
                .map_err(|e| {
                    tracing::warn!(error = %e, "field.bytes() failed");
                    AppError::BadRequest(e.to_string())
                })?
                .to_vec();
            tracing::info!(byte_count = bytes.len(), "audio bytes buffered");
            audio_bytes = Some(bytes);
            // Continue consuming remaining fields instead of break
            continue;
        }
    }

    let staging_id = Uuid::new_v4().to_string();
    let staging_dir = state.staging_dir.join(STAGING_DIR_NAME).join(&staging_id);
    tokio::fs::create_dir_all(&staging_dir)
        .await
        .map_err(|e| AppError::Storage(e.to_string()))?;

    let audio_bytes = match audio_bytes {
        Some(b) => b,
        None => {
            tracing::warn!("no audio field found in multipart request");
            return Err(AppError::BadRequest("No audio file provided".into()));
        }
    };

    let audio_path = staging_dir.join(format!("audio.{}", ext));
    tokio::fs::write(&audio_path, &audio_bytes)
        .await
        .map_err(|e| AppError::Storage(e.to_string()))?;

    let audio_path_clone = audio_path.clone();
    let audio_path_fallback = audio_path.clone();
    let meta = tokio::task::spawn_blocking(move || extract_metadata(&audio_path_clone))
        .await
        .map_err(|e| AppError::Storage(format!("Metadata task failed: {}", e)))?
        .unwrap_or_else(|_| {
            // lofty failed to read metadata (e.g. unsupported format like wav).
            // Use filename-derived defaults.
            let file_stem = audio_path_fallback.file_stem().and_then(|s| s.to_str()).unwrap_or("Unknown");
            ExtractedMetadata {
                title: file_stem.to_string(),
                artist: "Unknown Artist".to_string(),
                album: None,
                album_artist: None,
                track_number: None,
                year: None,
                genres: Vec::new(),
                duration_seconds: 0,
                file_format: audio_path_fallback.extension().and_then(|e| e.to_str()).unwrap_or("unknown").to_string(),
                bitrate_kbps: None,
                sample_rate_hz: None,
            }
        });

    let audio_path_clone = audio_path.clone();
    let artwork_data = tokio::task::spawn_blocking(move || extract_artwork(&audio_path_clone))
        .await
        .map_err(|e| AppError::Storage(format!("Artwork task failed: {}", e)))?
        .unwrap_or_else(|e| {
            tracing::warn!("Failed to extract artwork: {}", e);
            None
        });

    let has_artwork = if let Some((ext, data)) = artwork_data {
        let art_path = staging_dir.join(format!("artwork.{}", ext));
        match tokio::fs::write(&art_path, &data).await {
            Ok(()) => true,
            Err(e) => {
                tracing::warn!("Failed to write extracted artwork: {}", e);
                false
            }
        }
    } else {
        false
    };

    let draft = SongDraft {
        staging_id: staging_id.clone(),
        title: meta.title.clone(),
        artist: meta.artist.clone(),
        album: meta.album.clone(),
        album_artist: meta.album_artist.clone(),
        track_number: meta.track_number,
        year: meta.year,
        genres: meta.genres.clone(),
        studio: None,
        duration_seconds: meta.duration_seconds,
        file_format: meta.file_format.clone(),
        bitrate_kbps: meta.bitrate_kbps,
        sample_rate_hz: meta.sample_rate_hz,
        has_artwork,
    };

    tracing::info!(
        staging_id = %staging_id,
        title = %meta.title,
        artist = %meta.artist,
        duration = meta.duration_seconds,
        has_artwork,
        elapsed_ms = start.elapsed().as_millis(),
        "stage_song completed"
    );

    Ok(axum::Json(draft))
}

pub async fn commit_song(
    State(state): State<Arc<AppState>>,
    claims: axum::Extension<crate::auth::Claims>,
    mut multipart: Multipart,
) -> Result<axum::Json<crate::songs::model::Song>, AppError> {
    let start = std::time::Instant::now();
    tracing::info!(user_id = %claims.sub, email = %claims.email, "commit_song started");

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

    let staging_dir = state.staging_dir.join(STAGING_DIR_NAME).join(&req.staging_id);
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

    let audio_meta = tokio::fs::metadata(&audio_path)
        .await
        .map_err(|e| AppError::Storage(e.to_string()))?;
    let file_size = audio_meta.len() as i64;
    let audio_data = tokio::fs::read(&audio_path)
        .await
        .map_err(|e| AppError::Storage(e.to_string()))?;
    let audio_mime = mime_guess::from_path(&audio_path)
        .first_or_octet_stream()
        .to_string();
    state.storage.put(&file_key, &audio_mime, audio_data).await
        .map_err(|e| AppError::Storage(e.to_string()))?;

    let mut artwork_key: Option<String> = None;

    if let Some(bytes) = artwork_bytes {
        let art_ext = if matches!(artwork_ext.as_str(), "png" | "jpg" | "jpeg" | "webp") {
            artwork_ext
        } else {
            "jpg".to_string()
        };
        let art_key = format!("artwork/{}.{}", song_id, art_ext);
        let art_mime = format!("image/{}", art_ext);
        state.storage.put(&art_key, &art_mime, bytes).await
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
                let art_path = entry.path();
                let art_data = tokio::fs::read(&art_path)
                    .await
                    .map_err(|e| AppError::Storage(e.to_string()))?;
                let art_mime = mime_guess::from_path(&art_path)
                    .first_or_octet_stream()
                    .to_string();
                state.storage.put(&art_key, &art_mime, art_data).await
                    .map_err(|e| AppError::Storage(e.to_string()))?;
                artwork_key = Some(art_key);
                break;
            }
        }
    }

    let result: Result<crate::songs::model::SongDb, AppError> = async {
        let mut tx = state.pool.begin().await?;

        let song_db = sqlx::query_as::<_, crate::songs::model::SongDb>(
            "INSERT INTO songs (
                id, title, artist, album, album_artist, track_number, year, studio,
                duration_seconds, file_key, file_size_bytes, file_format, bitrate_kbps, sample_rate_hz, artwork_key, publisher_id
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
            RETURNING *"
        )
        .bind(&song_id)
        .bind(&req.title)
        .bind(&req.artist)
        .bind(&req.album)
        .bind(&req.album_artist)
        .bind(req.track_number)
        .bind(req.year)
        .bind(&req.studio)
        .bind(req.duration_seconds)
        .bind(&file_key)
        .bind(file_size)
        .bind(&req.file_format)
        .bind(req.bitrate_kbps)
        .bind(req.sample_rate_hz)
        .bind(&artwork_key)
        .bind(&claims.sub)
        .fetch_one(&mut *tx)
        .await?;

        let mut seen = std::collections::HashSet::new();
        for genre in &req.genres {
            let genre_lower = genre.trim().to_lowercase();
            if genre_lower.is_empty() || !seen.insert(genre_lower.clone()) { continue; }

            let existing: Option<(i64,)> = sqlx::query_as("SELECT id FROM genres WHERE name = $1")
                .bind(&genre_lower)
                .fetch_optional(&mut *tx)
                .await?;

            if existing.is_none() {
                sqlx::query("INSERT INTO genres (name) VALUES ($1)")
                    .bind(&genre_lower)
                    .execute(&mut *tx)
                    .await?;
            }

            sqlx::query(
                "INSERT INTO song_genres (song_id, genre_id)
                 SELECT $1, id FROM genres WHERE name = $2"
            )
            .bind(&song_id)
            .bind(&genre_lower)
            .execute(&mut *tx)
            .await?;
        }

        tx.commit().await?;
        Ok(song_db)
    }.await;

    match result {
        Ok(song_db) => {
            // Spawn HLS encoding in the background
            let song_id_clone = song_id.clone();
            let audio_path_clone = audio_path.clone();
            let staging_dir_clone = staging_dir.clone();
            let hls_key_store = state.hls_key_store.clone();
            let pool_clone = state.pool.clone();
            let storage_clone = state.storage.clone();

            tokio::spawn(async move {
                use crate::hls::encoder::HlsEncoder;

                let song_uuid = match Uuid::parse_str(&song_id_clone) {
                    Ok(u) => u,
                    Err(e) => {
                        tracing::error!(song_id = %song_id_clone, error = %e, "Invalid song_id UUID for HLS encoding");
                        return;
                    }
                };

                let output_dir = staging_dir_clone.parent().unwrap_or(&staging_dir_clone)
                    .join("hls_output")
                    .join(&song_id_clone);

                match hls_key_store.create_key_for_song(song_uuid).await {
                    Ok((key_id, key)) => {
                        match HlsEncoder::transcode(&audio_path_clone, &output_dir, &key).await {
                            Ok(output) => {
                                // Upload HLS output to storage
                                let prefix = format!("songs/{}/", song_id_clone);

                                // Upload playlist
                                let playlist_data = match tokio::fs::read(&output.playlist_path).await {
                                    Ok(data) => data,
                                    Err(e) => {
                                        tracing::error!(song_id = %song_id_clone, error = %e, "Failed to read HLS playlist");
                                        return;
                                    }
                                };
                                if let Err(e) = storage_clone.put(
                                    &format!("{}stream.m3u8", prefix),
                                    "application/vnd.apple.mpegurl",
                                    playlist_data
                                ).await {
                                    tracing::error!(song_id = %song_id_clone, error = %e, "Failed to upload HLS playlist");
                                    return;
                                }

                                // Upload key file
                                let key_data = match tokio::fs::read(&output.key_path).await {
                                    Ok(data) => data,
                                    Err(e) => {
                                        tracing::error!(song_id = %song_id_clone, error = %e, "Failed to read HLS key file");
                                        return;
                                    }
                                };
                                if let Err(e) = storage_clone.put(
                                    &format!("{}key.bin", prefix),
                                    "application/octet-stream",
                                    key_data
                                ).await {
                                    tracing::error!(song_id = %song_id_clone, error = %e, "Failed to upload HLS key");
                                    return;
                                }

                                // Upload segments
                                let mut segment_entries = match tokio::fs::read_dir(&output.segments_dir).await {
                                    Ok(entries) => entries,
                                    Err(e) => {
                                        tracing::error!(song_id = %song_id_clone, error = %e, "Failed to read segments directory");
                                        return;
                                    }
                                };
                                while let Ok(Some(entry)) = segment_entries.next_entry().await {
                                    let path = entry.path();
                                    if path.extension().and_then(|e| e.to_str()) != Some("ts") {
                                        continue;
                                    }
                                    let name = path.file_name().unwrap_or_default().to_string_lossy().to_string();
                                    let data = match tokio::fs::read(&path).await {
                                        Ok(d) => d,
                                        Err(e) => {
                                            tracing::error!(song_id = %song_id_clone, segment = %name, error = %e, "Failed to read segment");
                                            continue;
                                        }
                                    };
                                    if let Err(e) = storage_clone.put(
                                        &format!("{}segments/{}", prefix, name),
                                        "video/mp2t",
                                        data
                                    ).await {
                                        tracing::error!(song_id = %song_id_clone, segment = %name, error = %e, "Failed to upload segment");
                                    }
                                }

                                // Update database
                                if let Err(e) = sqlx::query(
                                    "UPDATE songs SET hls_ready = true, hls_key_id = $1, segment_count = $2 WHERE id = $3"
                                )
                                .bind(key_id.to_string())
                                .bind(output.segment_count as i32)
                                .bind(&song_id_clone)
                                .execute(&pool_clone)
                                .await {
                                    tracing::error!(song_id = %song_id_clone, error = %e, "Failed to update song HLS status");
                                    return;
                                }

                                tracing::info!(song_id = %song_id_clone, segment_count = output.segment_count, "HLS encoding completed successfully");
                            }
                            Err(e) => {
                                tracing::error!(song_id = %song_id_clone, error = %e, "HLS encoding failed");
                            }
                        }
                    }
                    Err(e) => {
                        tracing::error!(song_id = %song_id_clone, error = %e, "Failed to create encryption key for HLS");
                    }
                }

                // Clean up staging directory AFTER HLS encoding is done
                if let Err(e) = tokio::fs::remove_dir_all(&staging_dir_clone).await {
                    tracing::warn!(staging_dir = %staging_dir_clone.display(), error = %e, "Failed to remove staging directory after HLS encoding");
                }

                // Clean up HLS output directory
                if let Err(e) = tokio::fs::remove_dir_all(&output_dir).await {
                    tracing::warn!(output_dir = %output_dir.display(), error = %e, "Failed to remove HLS output directory");
                }
            });

            // Continue with the rest (don't clean up staging_dir here - background task handles it)
            let mut song: crate::songs::model::Song = song_db.into();
            if let Err(e) = crate::songs::model::populate_genres_for_one(&state.pool, &mut song).await {
                tracing::warn!("Failed to populate genres after commit: {}", e);
            }

            tracing::info!(
                song_id = %song.id,
                title = %req.title,
                artist = %req.artist,
                elapsed_ms = start.elapsed().as_millis(),
                "commit_song completed"
            );
            Ok(axum::Json(song))
        }
        Err(e) => {
            tracing::warn!(error = %e, "commit_song failed");
            if let Err(e) = state.storage.delete(&file_key).await {
                tracing::warn!("Failed to clean up audio object after DB error: {}", e);
            }
            if let Some(ref key) = artwork_key {
                if let Err(e) = state.storage.delete(key).await {
                    tracing::warn!("Failed to clean up artwork object after DB error: {}", e);
                }
            }
            if let Err(e) = tokio::fs::remove_dir_all(&staging_dir).await {
                tracing::warn!("Failed to remove staging directory after DB error: {}", e);
            }
            Err(e)
        }
    }
}

pub async fn get_staged_artwork(
    State(state): State<Arc<AppState>>,
    claims: axum::Extension<crate::auth::Claims>,
    axum::extract::Path(staging_id): axum::extract::Path<String>,
) -> Result<impl axum::response::IntoResponse, AppError> {
    tracing::info!(user_id = %claims.sub, staging_id = %staging_id, "get_staged_artwork");
    require_admin_access(&state.pool, &claims.sub, &claims.role).await?;

    let staging_dir = state.staging_dir.join(STAGING_DIR_NAME).join(&staging_id);
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

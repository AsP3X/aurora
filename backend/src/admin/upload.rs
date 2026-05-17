// Human: Multipart ingest path that stages audio in object storage, probes tags via Lofty on a temp file, then commits rows and kicks off async HLS packaging.
// Agent: WRITES staging/* + uploads/* keys; READS metadata with lofty; SPawns background HLSEncoder job; REQUIRES require_admin_access on HTTP entrypoints.
use axum::extract::{Multipart, State};
use futures_util::TryStreamExt;
use serde::{Deserialize, Serialize};
use std::path::Path;
use std::sync::Arc;
use uuid::Uuid;

use crate::{
    error::AppError,
    permissions::require_admin_access,
    storage::StorageStream,
    AppState,
};

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

// Human: Read duration, bitrate, and textual tags from an on-disk audio path so staging can propose a draft before commit.
// Agent: READS path via lofty read_from_path; RETURNS ExtractedMetadata; FALLBACK to filename stem when tags missing; BLOCKING from stage_song via spawn_blocking.
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

// Human: Pull the first embedded picture (if any) and normalize to a small extension bucket for storage keys.
// Agent: READS lofty tag pictures; RETURNS Option<(ext, bytes)>; NONE when tag or images missing.
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

// Human: Drain the storage byte stream into a contiguous buffer for small payloads like artwork or whole songs during commit.
// Agent: READS StorageStream TryStreamExt; RETURNS Vec<u8>; MAPS stream errors to AppError::Storage string.
pub(crate) async fn collect_stream(stream: StorageStream) -> Result<Vec<u8>, AppError> {
    let chunks: Vec<_> = stream
        .try_collect()
        .await
        .map_err(|e| AppError::Storage(e.to_string()))?;
    Ok(chunks.into_iter().flat_map(|b| b.to_vec()).collect())
}

// Human: Probe staging bucket for known artwork file names so commit can copy forward without client re-upload.
// Agent: READS Storage::exists staging/.../artwork.{jpg,png,...}; RETURNS key + mime tuple; USED by commit + get_staged_artwork.
async fn find_staged_artwork_key(
    storage: &dyn crate::storage::Storage,
    staging_id: &str,
) -> Option<(String, String)> {
    for ext in ["jpg", "jpeg", "png", "webp"] {
        let key = format!("staging/{}/artwork.{}", staging_id, ext);
        if storage.exists(&key).await.unwrap_or(false) {
            let mime = format!("image/{}", if ext == "jpeg" { "jpeg" } else { ext });
            return Some((key, mime));
        }
    }
    None
}

// Human: After successful ingest, remove staging audio/artwork objects so temp prefixes do not accumulate forever.
// Agent: CALLS Storage::delete staging paths; LOGS warn on failure; NO AppError — best effort hygiene.
async fn delete_staging_keys(
    storage: &dyn crate::storage::Storage,
    staging_id: &str,
    file_format: &str,
) {
    let audio_key = format!("staging/{}/audio.{}", staging_id, file_format);
    if let Err(e) = storage.delete(&audio_key).await {
        tracing::warn!(key = %audio_key, error = %e, "Failed to delete staged audio");
    }
    if let Some((key, _)) = find_staged_artwork_key(storage, staging_id).await {
        if let Err(e) = storage.delete(&key).await {
            tracing::warn!(key = %key, error = %e, "Failed to delete staged artwork");
        }
    }
}

// Human: Accept the `audio` multipart part, enforce extension/MIME allowlist, write temp for Lofty, then upload bytes to `staging/{uuid}/audio.*`.
// Agent: WRITES temp dir + staging object; RETURNS SongDraft JSON; DELETES temp tree after metadata pass; LOGS multipart field metadata.
pub async fn stage_song(
    State(state): State<Arc<AppState>>,
    claims: axum::Extension<crate::auth::Claims>,
    mut multipart: Multipart,
) -> Result<axum::Json<SongDraft>, AppError> {
    let start = std::time::Instant::now();
    tracing::info!(user_id = %claims.sub, email_redacted = %crate::redact::email_for_log(&claims.email), "stage_song started");

    require_admin_access(&state.pool, &claims.sub, &claims.role).await?;
    crate::rate_limit::enforce(&state.upload_rl, &claims.sub)?;

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
        tracing::info!(
            field_name = %name,
            field_filename_redacted = %crate::redact::filename_for_log(&filename),
            field_content_type = ?content_type,
            "multipart field received"
        );
        if name == "audio" && audio_bytes.is_none() {
            ext = Path::new(&filename)
                .extension()
                .and_then(|e| e.to_str())
                .unwrap_or("")
                .to_lowercase();

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
                tracing::warn!(
                    ext = %ext,
                    filename_redacted = %crate::redact::filename_for_log(&filename),
                    content_type = ?content_type,
                    "unsupported audio format"
                );
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
            continue;
        }
    }

    let audio_bytes = match audio_bytes {
        Some(b) => b,
        None => {
            tracing::warn!("no audio field found in multipart request");
            return Err(AppError::BadRequest("No audio file provided".into()));
        }
    };

    let staging_id = Uuid::new_v4().to_string();

    // Write to system temp for lofty (needs a real file path)
    let tmp_dir = std::env::temp_dir().join(format!("aurora_stage_{}", staging_id));
    tokio::fs::create_dir_all(&tmp_dir)
        .await
        .map_err(|e| AppError::Storage(e.to_string()))?;
    let tmp_audio = tmp_dir.join(format!("audio.{}", ext));
    tokio::fs::write(&tmp_audio, &audio_bytes)
        .await
        .map_err(|e| AppError::Storage(e.to_string()))?;

    let tmp_audio_clone = tmp_audio.clone();
    let tmp_audio_fallback = tmp_audio.clone();
    let meta = tokio::task::spawn_blocking(move || extract_metadata(&tmp_audio_clone))
        .await
        .map_err(|e| AppError::Storage(format!("Metadata task failed: {}", e)))?
        .unwrap_or_else(|_| {
            let file_stem = tmp_audio_fallback
                .file_stem()
                .and_then(|s| s.to_str())
                .unwrap_or("Unknown");
            ExtractedMetadata {
                title: file_stem.to_string(),
                artist: "Unknown Artist".to_string(),
                album: None,
                album_artist: None,
                track_number: None,
                year: None,
                genres: Vec::new(),
                duration_seconds: 0,
                file_format: tmp_audio_fallback
                    .extension()
                    .and_then(|e| e.to_str())
                    .unwrap_or("unknown")
                    .to_string(),
                bitrate_kbps: None,
                sample_rate_hz: None,
            }
        });

    let tmp_audio_clone = tmp_audio.clone();
    let artwork_data = tokio::task::spawn_blocking(move || extract_artwork(&tmp_audio_clone))
        .await
        .map_err(|e| AppError::Storage(format!("Artwork task failed: {}", e)))?
        .unwrap_or_else(|e| {
            tracing::warn!("Failed to extract artwork: {}", e);
            None
        });

    // Temp dir no longer needed — clean up before uploading
    let _ = tokio::fs::remove_dir_all(&tmp_dir).await;

    // Upload audio to object storage
    let audio_stage_key = format!("staging/{}/audio.{}", staging_id, ext);
    let audio_mime = mime_guess::from_ext(&ext).first_or_octet_stream().to_string();
    state
        .storage
        .put(&audio_stage_key, &audio_mime, audio_bytes)
        .await
        .map_err(|e| AppError::Storage(e.to_string()))?;

    // Upload artwork to object storage if present
    let has_artwork = if let Some((art_ext, art_data)) = artwork_data {
        let art_key = format!("staging/{}/artwork.{}", staging_id, art_ext);
        let art_mime = format!("image/{}", art_ext);
        match state.storage.put(&art_key, &art_mime, art_data).await {
            Ok(()) => true,
            Err(e) => {
                tracing::warn!("Failed to store staged artwork: {}", e);
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

// Human: Finalize a staged object: copy audio into `uploads/`, insert `songs` + genre rows, spawn background ffmpeg HLS, and clean staging keys on success path.
// Agent: WRITES songs row; SPawns tokio task HlsEncoder + storage uploads; ON DB failure DELETES uploaded objects; UPDATES conversion_progress during job.
pub async fn commit_song(
    State(state): State<Arc<AppState>>,
    claims: axum::Extension<crate::auth::Claims>,
    mut multipart: Multipart,
) -> Result<axum::Json<crate::songs::model::Song>, AppError> {
    let start = std::time::Instant::now();
    tracing::info!(user_id = %claims.sub, email_redacted = %crate::redact::email_for_log(&claims.email), "commit_song started");

    require_admin_access(&state.pool, &claims.sub, &claims.role).await?;
    crate::rate_limit::enforce(&state.upload_rl, &claims.sub)?;

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

    Uuid::parse_str(&req.staging_id)
        .map_err(|_| AppError::BadRequest("Invalid staging_id".into()))?;

    if let Some(ref bytes) = artwork_bytes {
        if bytes.is_empty() {
            return Err(AppError::BadRequest("Empty artwork payload".into()));
        }
    }

    // Download audio from staging storage
    let audio_stage_key = format!("staging/{}/audio.{}", req.staging_id, req.file_format);
    let (audio_stream, _, _) = state
        .storage
        .get_stream(&audio_stage_key)
        .await
        .map_err(|_| AppError::NotFound)?;
    let audio_data = collect_stream(audio_stream).await?;
    let file_size = audio_data.len() as i64;

    let song_id = Uuid::new_v4().to_string();
    let file_key = format!("uploads/{}_audio.{}", song_id, req.file_format);
    let audio_mime = mime_guess::from_ext(&req.file_format)
        .first_or_octet_stream()
        .to_string();

    // Write audio to temp dir for HLS encoding (ffmpeg needs a real file path)
    let hls_tmp_dir = std::env::temp_dir().join(format!("aurora_hls_{}", song_id));
    tokio::fs::create_dir_all(&hls_tmp_dir)
        .await
        .map_err(|e| AppError::Storage(e.to_string()))?;
    let tmp_audio = hls_tmp_dir.join(format!("audio.{}", req.file_format));
    tokio::fs::write(&tmp_audio, &audio_data)
        .await
        .map_err(|e| AppError::Storage(e.to_string()))?;

    // Upload to permanent storage
    state
        .storage
        .put(&file_key, &audio_mime, audio_data)
        .await
        .map_err(|e| AppError::Storage(e.to_string()))?;

    // Resolve artwork
    let mut artwork_key: Option<String> = None;

    if let Some(bytes) = artwork_bytes {
        let art_ext = if matches!(artwork_ext.as_str(), "png" | "jpg" | "jpeg" | "webp") {
            artwork_ext
        } else {
            "jpg".to_string()
        };
        let art_key = format!("artwork/{}.{}", song_id, art_ext);
        let art_mime = format!("image/{}", art_ext);
        state
            .storage
            .put(&art_key, &art_mime, bytes)
            .await
            .map_err(|e| AppError::Storage(e.to_string()))?;
        artwork_key = Some(art_key);
    } else if let Some((staged_key, staged_mime)) =
        find_staged_artwork_key(state.storage.as_ref(), &req.staging_id).await
    {
        let staged_ext = Path::new(&staged_key)
            .extension()
            .and_then(|e| e.to_str())
            .unwrap_or("jpg");
        let art_key = format!("artwork/{}.{}", song_id, staged_ext);
        let (stream, _, _) = state
            .storage
            .get_stream(&staged_key)
            .await
            .map_err(|e| AppError::Storage(e.to_string()))?;
        let art_data = collect_stream(stream).await?;
        state
            .storage
            .put(&art_key, &staged_mime, art_data)
            .await
            .map_err(|e| AppError::Storage(e.to_string()))?;
        artwork_key = Some(art_key);
    }

    let result: Result<crate::songs::model::SongDb, AppError> = async {
        let mut tx = state.pool.begin().await?;

        let song_db = sqlx::query_as::<_, crate::songs::model::SongDb>(
            "INSERT INTO songs (
                id, title, artist, album, album_artist, track_number, year, studio,
                duration_seconds, file_key, file_size_bytes, file_format, bitrate_kbps, sample_rate_hz, artwork_key, publisher_id
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
            RETURNING *",
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
            if genre_lower.is_empty() || !seen.insert(genre_lower.clone()) {
                continue;
            }

            let existing: Option<(i64,)> =
                sqlx::query_as("SELECT id FROM genres WHERE name = $1")
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
                 SELECT $1, id FROM genres WHERE name = $2",
            )
            .bind(&song_id)
            .bind(&genre_lower)
            .execute(&mut *tx)
            .await?;
        }

        tx.commit().await?;
        Ok(song_db)
    }
    .await;

    match result {
        Ok(song_db) => {
            let _ = sqlx::query(
                "UPDATE songs SET hls_encode_status = 'pending' WHERE id = $1",
            )
            .bind(&song_id)
            .execute(&state.pool)
            .await;

            crate::hls::encode_job::spawn_hls_encode_job(
                state.pool.clone(),
                state.storage.clone(),
                state.hls_key_store.clone(),
                crate::hls::encode_job::HlsEncodeJob {
                    song_id: song_id.clone(),
                    tmp_audio: tmp_audio.clone(),
                    duration_seconds: req.duration_seconds,
                    staging_id: Some(req.staging_id.clone()),
                    file_format: Some(req.file_format.clone()),
                },
            );

            let mut song: crate::songs::model::Song = song_db.into();
            if let Err(e) =
                crate::songs::model::populate_genres_for_one(&state.pool, &mut song).await
            {
                tracing::warn!("Failed to populate genres after commit: {}", e);
            }

            let song_id_for_search = song.id.clone();
            let sync = state.search_sync.clone();
            tokio::spawn(async move {
                sync.notify_song_upsert(&song_id_for_search).await;
            });

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
            delete_staging_keys(
                state.storage.as_ref(),
                &req.staging_id,
                &req.file_format,
            )
            .await;
            let _ = tokio::fs::remove_dir_all(&hls_tmp_dir).await;
            Err(e)
        }
    }
}

// Human: Let the admin UI preview embedded art before commit by streaming whichever staged artwork object exists.
// Agent: REQUIRES admin; READS staging artwork key via find_staged_artwork_key; RETURNS bytes + CONTENT_TYPE; HTTP 404 if absent.
pub async fn get_staged_artwork(
    State(state): State<Arc<AppState>>,
    claims: axum::Extension<crate::auth::Claims>,
    axum::extract::Path(staging_id): axum::extract::Path<String>,
) -> Result<impl axum::response::IntoResponse, AppError> {
    tracing::info!(user_id = %claims.sub, staging_id = %staging_id, "get_staged_artwork");
    require_admin_access(&state.pool, &claims.sub, &claims.role).await?;

    if let Some((key, mime)) = find_staged_artwork_key(state.storage.as_ref(), &staging_id).await {
        let (stream, _, _) = state
            .storage
            .get_stream(&key)
            .await
            .map_err(|e| AppError::Storage(e.to_string()))?;
        let bytes = collect_stream(stream).await?;
        return Ok(([(axum::http::header::CONTENT_TYPE, mime)], bytes));
    }

    Err(AppError::NotFound)
}

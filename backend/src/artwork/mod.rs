// Human: Decode uploaded cover art once, emit three WebP sizes for seeker, library grid, and detail views.
// Agent: MODULE optimize+store+resolve+delete; VARIANTS seeker|library|detail; STORAGE keys artwork/{id}/{variant}.webp.

use crate::{error::AppError, storage::Storage};
use image::imageops::FilterType;
use image::{DynamicImage, GenericImageView, ImageFormat};

/// Human: Which optimized derivative the client wants when loading cover art.
/// Agent: ENUM Seeker|Library|Detail; PARSE from query `size`; MAPS to max edge + WebP quality.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ArtworkVariant {
    Seeker,
    Library,
    Detail,
}

impl ArtworkVariant {
    /// Human: Default to library-sized art when the client omits `size`.
    /// Agent: READS optional str; RETURNS Detail|Library|Seeker or Library default; IGNORES unknown values.
    pub fn from_query(size: Option<&str>) -> Self {
        let Some(raw) = size.map(str::trim) else {
            return Self::Library;
        };
        match raw.to_ascii_lowercase().as_str() {
            "seeker" | "thumb" | "mini" => Self::Seeker,
            "detail" | "large" | "hero" => Self::Detail,
            "library" | "card" | "medium" => Self::Library,
            _ => Self::Library,
        }
    }

    /// Human: Query-string value echoed in artwork ticket URLs.
    /// Agent: RETURNS seeker|library|detail for ?size=.
    pub fn as_query_str(self) -> &'static str {
        match self {
            Self::Seeker => "seeker",
            Self::Library => "library",
            Self::Detail => "detail",
        }
    }

    /// Human: Longest edge cap before WebP encode — seeker is tiny for the transport bar, detail for hero layouts.
    /// Agent: RETURNS u32 max_edge_px per variant (96 / 320 / 1024).
    fn max_edge_px(self) -> u32 {
        match self {
            Self::Seeker => 96,
            Self::Library => 320,
            Self::Detail => 1024,
        }
    }

    /// Human: WebP quality trades bytes for clarity; seeker tolerates more compression.
    /// Agent: RETURNS f32 WebP quality 60–88 per variant.
    fn webp_quality(self) -> f32 {
        match self {
            Self::Seeker => 62.0,
            Self::Library => 78.0,
            Self::Detail => 86.0,
        }
    }
}

/// Human: Object-storage path for one optimized variant of a song cover.
/// Agent: RETURNS artwork/{song_id}/{stem}.webp; READ by get_artwork resolve.
pub fn storage_key(song_id: &str, variant: ArtworkVariant) -> String {
    format!("artwork/{}/{}.webp", song_id, variant.as_query_str())
}

/// Human: DB `artwork_key` points at the detail WebP so “has artwork” checks stay a single column.
/// Agent: RETURNS storage_key(song_id, Detail); WRITTEN on upload/update.
pub fn canonical_db_key(song_id: &str) -> String {
    storage_key(song_id, ArtworkVariant::Detail)
}

/// Human: All three WebP blobs produced from one source upload.
/// Agent: STRUCT seeker+library+detail Vec<u8>; FILLED by optimize().
pub struct OptimizedArtwork {
    pub seeker: Vec<u8>,
    pub library: Vec<u8>,
    pub detail: Vec<u8>,
}

/// Human: Decode arbitrary image bytes, resize per variant, and encode lossy WebP for each target.
/// Agent: READS bytes; DECODES ImageFormat guess; RESIZES max_edge; ENCODE WebP; ERR String on bad input.
pub fn optimize(source: &[u8]) -> Result<OptimizedArtwork, String> {
    let img = image::load_from_memory(source).map_err(|e| format!("decode artwork: {e}"))?;
    Ok(OptimizedArtwork {
        seeker: encode_variant(&img, ArtworkVariant::Seeker)?,
        library: encode_variant(&img, ArtworkVariant::Library)?,
        detail: encode_variant(&img, ArtworkVariant::Detail)?,
    })
}

fn encode_variant(img: &DynamicImage, variant: ArtworkVariant) -> Result<Vec<u8>, String> {
    let resized = resize_to_max_edge(img, variant.max_edge_px());
    let rgba = resized.to_rgba8();
    let (width, height) = rgba.dimensions();
    // Human: image crate only exposes lossless WebP; libwebp via `webp` gives lossy control per variant.
    // Agent: CALLS webp::Encoder::from_rgba; encode(quality 0–100); RETURNS Vec<u8> WebP bytes.
    let encoder = webp::Encoder::from_rgba(rgba.as_raw(), width, height);
    let webp_mem = encoder.encode(variant.webp_quality());
    Ok(webp_mem.to_vec())
}

fn resize_to_max_edge(img: &DynamicImage, max_edge: u32) -> DynamicImage {
    let (w, h) = img.dimensions();
    let longest = w.max(h);
    if longest <= max_edge {
        return img.clone();
    }
    let scale = max_edge as f32 / longest as f32;
    let nw = ((w as f32) * scale).round().max(1.0) as u32;
    let nh = ((h as f32) * scale).round().max(1.0) as u32;
    img.resize(nw, nh, FilterType::Triangle)
}

/// Human: Guess image format for logging or validation — used when accepting admin uploads.
/// Agent: READS magic bytes; RETURNS ImageFormat or None.
pub fn detect_format(bytes: &[u8]) -> Option<ImageFormat> {
    image::guess_format(bytes).ok()
}

const WEBP_MIME: &str = "image/webp";

/// Human: Persist all optimized variants under `artwork/{song_id}/` and return the detail key for the DB.
/// Agent: WRITES 3 Storage puts image/webp; RETURNS canonical_db_key; ERR AppError::Storage on failure.
pub async fn store_optimized(
    storage: &dyn Storage,
    song_id: &str,
    optimized: &OptimizedArtwork,
) -> Result<String, String> {
    let pairs = [
        (ArtworkVariant::Seeker, &optimized.seeker),
        (ArtworkVariant::Library, &optimized.library),
        (ArtworkVariant::Detail, &optimized.detail),
    ];
    for (variant, bytes) in pairs {
        let key = storage_key(song_id, variant);
        storage
            .put(&key, WEBP_MIME, bytes.clone())
            .await
            .map_err(|e| format!("put {key}: {e}"))?;
    }
    Ok(canonical_db_key(song_id))
}

/// Human: Pick the storage object for a requested variant, falling back to legacy single-file keys.
/// Agent: READS song_id+db_key+variant; CHECKS optimized key exists else legacy db_key when present.
pub async fn resolve_storage_key(
    storage: &dyn Storage,
    song_id: &str,
    db_artwork_key: &str,
    variant: ArtworkVariant,
) -> Option<String> {
    let optimized = storage_key(song_id, variant);
    if storage.exists(&optimized).await.unwrap_or(false) {
        return Some(optimized);
    }
    if storage.exists(db_artwork_key).await.unwrap_or(false) {
        return Some(db_artwork_key.to_string());
    }
    None
}

/// Human: Remove every derivative plus any legacy flat key when artwork is replaced or the song is deleted.
/// Agent: DELETE artwork/{id}/*.webp + optional legacy_key; BEST-EFFORT per key.
pub async fn delete_all_for_song(
    storage: &dyn Storage,
    song_id: &str,
    legacy_key: Option<&str>,
) {
    for variant in [
        ArtworkVariant::Seeker,
        ArtworkVariant::Library,
        ArtworkVariant::Detail,
    ] {
        let key = storage_key(song_id, variant);
        if let Err(e) = storage.delete(&key).await {
            tracing::debug!(key = %key, error = %e, "artwork variant delete skipped");
        }
    }
    if let Some(key) = legacy_key {
        let new_keys = [
            storage_key(song_id, ArtworkVariant::Seeker),
            storage_key(song_id, ArtworkVariant::Library),
            storage_key(song_id, ArtworkVariant::Detail),
        ];
        if !new_keys.iter().any(|k| k == key) {
            if let Err(e) = storage.delete(key).await {
                tracing::debug!(key = %key, error = %e, "legacy artwork delete skipped");
            }
        }
    }
}

/// Human: Blocking wrapper so CPU-heavy resize/WebP work does not stall the async runtime.
/// Agent: spawn_blocking optimize; MAPS join error + optimize error to String.
pub async fn optimize_async(source: Vec<u8>) -> Result<OptimizedArtwork, String> {
    tokio::task::spawn_blocking(move || optimize(&source))
        .await
        .map_err(|e| format!("artwork optimize task: {e}"))?
}

/// Human: End-to-end path used on commit/update — optimize in a worker thread, then upload all WebP variants.
/// Agent: CALLS optimize_async + store_optimized; RETURNS canonical_db_key; HTTP 500 via AppError::Storage on failure.
pub async fn ingest_artwork(
    storage: &dyn Storage,
    song_id: &str,
    source: Vec<u8>,
) -> Result<String, AppError> {
    let optimized = optimize_async(source)
        .await
        .map_err(|e| AppError::Storage(e))?;
    store_optimized(storage, song_id, &optimized)
        .await
        .map_err(|e| AppError::Storage(e))
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Cursor;

    fn tiny_png() -> Vec<u8> {
        let img = image::RgbaImage::from_pixel(4, 4, image::Rgba([10, 20, 30, 255]));
        let mut buf = Vec::new();
        img.write_to(&mut Cursor::new(&mut buf), ImageFormat::Png)
            .unwrap();
        buf
    }

    #[test]
    fn optimize_emits_three_webp_blobs() {
        let out = optimize(&tiny_png()).expect("optimize");
        assert!(!out.seeker.is_empty());
        assert!(!out.library.is_empty());
        assert!(!out.detail.is_empty());
        assert!(out.detail.len() >= out.library.len());
    }

    #[test]
    fn variant_from_query_maps_aliases() {
        assert_eq!(
            ArtworkVariant::from_query(Some("seeker")),
            ArtworkVariant::Seeker
        );
        assert_eq!(
            ArtworkVariant::from_query(Some("detail")),
            ArtworkVariant::Detail
        );
        assert_eq!(ArtworkVariant::from_query(None), ArtworkVariant::Library);
    }
}

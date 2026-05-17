// Human: Stitch `#EXTM3U` manifests either from synthetic segment lists (Nebula mode) or by re-reading ffmpeg output on disk.
// Agent: PURE string builder generate(); scan_local_output READS stream.m3u8; NO network.
use std::path::Path;

pub struct PlaylistGenerator;

impl PlaylistGenerator {
    /// Generates a dynamic `.m3u8` playlist string.
    ///
    /// - `base_url`: The root URL for this song's HLS resources (e.g., `/api/v1/songs/{id}`)
    /// - `segment_files`: List of segment filenames (e.g., `["segments/0000.ts", ...]`)
    /// - `segment_durations`: Duration of each segment in seconds
    /// - `key_uri`: The URI where the AES key can be fetched
    // Human: Build a VOD-style HLS playlist that points at relative segment URLs under the API-owned `base_url` with AES-128 metadata.
    // Agent: READS parallel slices segments+durations; DEFAULTS missing duration to 4.0; EMITS string ending with ENDLIST newline.
    pub fn generate(
        base_url: &str,
        segment_files: &[String],
        segment_durations: &[f64],
        key_uri: &str,
    ) -> String {
        let target_duration = segment_durations.iter().copied()
            .fold(0.0f64, |a, b| a.max(b)).ceil() as i32;

        let mut lines = vec![
            "#EXTM3U".to_string(),
            "#EXT-X-VERSION:3".to_string(),
            format!("#EXT-X-TARGETDURATION:{}", target_duration),
            "#EXT-X-MEDIA-SEQUENCE:0".to_string(),
            format!("#EXT-X-KEY:METHOD=AES-128,URI=\"{}\"", key_uri),
        ];

        for (i, file) in segment_files.iter().enumerate() {
            let duration = segment_durations.get(i).copied().unwrap_or(4.0);
            lines.push(format!("#EXTINF:{:.3},", duration));
            lines.push(format!("{}/{}", base_url, file));
        }

        lines.push("#EXT-X-ENDLIST".to_string());
        lines.join("\n") + "\n"
    }

    /// Scans a local HLS output directory and returns segment filenames + durations.
    // Human: Parse ffmpeg-written `stream.m3u8` so local-storage mode can rebuild manifests without trusting synthetic segment counts alone.
    // Agent: READS playlist_path file; PAIRS #EXTINF durations with following non-# lines; RETURNS (files, durs) vectors.
    pub fn scan_local_output(playlist_path: &Path) -> anyhow::Result<(Vec<String>, Vec<f64>)> {
        let content = std::fs::read_to_string(playlist_path)?;
        let mut files = Vec::new();
        let mut durations = Vec::new();

        for line in content.lines() {
            if line.starts_with("#EXTINF:") {
                let dur = line.trim_start_matches("#EXTINF:").trim_end_matches(',').parse::<f64>()?;
                durations.push(dur);
            } else if !line.starts_with('#') && !line.trim().is_empty() {
                files.push(line.trim().to_string());
            }
        }

        Ok((files, durations))
    }
}

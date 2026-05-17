// Human: Wrap ffmpeg invocation and stderr parsing so uploads can background-transcode masters into AES-128 HLS with progress telemetry.
// Agent: SPAWNS ffmpeg subprocess; WRITES key_info + bin; EMITS HlsOutput paths; parse_ffmpeg_progress maps stderr time= to percent.
use anyhow::{Context, bail};
use std::path::{Path, PathBuf};
use tokio::io::{AsyncBufReadExt, BufReader};
use tokio::process::Command;

// Human: Paths ffmpeg populated plus how many transport segments landed for later upload accounting.
// Agent: CONSUMED by upload task to read playlist/key/segments and set songs.segment_count; CONTAINS PathBuf triple + usize count.
pub struct HlsOutput {
    pub playlist_path: PathBuf,
    pub key_path: PathBuf,
    pub segments_dir: PathBuf,
    pub segment_count: usize,
}

pub struct HlsEncoder;

impl HlsEncoder {
    // Human: Shell out to ffmpeg to AES-128 encrypt AAC HLS segments and capture coarse progress by parsing stderr timecodes.
    // Agent: SPAWNS ffmpeg with hls_key_info_file; OPTIONAL watch::Sender progress; COUNTS .ts files after success; WRITES temp key+playlist+segments dirs.
    pub async fn transcode(
        input_path: &Path,
        output_dir: &Path,
        key: &[u8; 16],
        duration_seconds: i32,
        progress_tx: Option<tokio::sync::watch::Sender<i32>>,
    ) -> anyhow::Result<HlsOutput> {
        tokio::fs::create_dir_all(output_dir).await
            .context("creating HLS output directory")?;

        let segments_dir = output_dir.join("segments");
        tokio::fs::create_dir_all(&segments_dir).await
            .context("creating segments directory")?;

        let playlist_path = output_dir.join("stream.m3u8");
        let key_path = output_dir.join("key.bin");

        tokio::fs::write(&key_path, key)
            .await
            .context("writing AES key file")?;

        let segment_pattern = segments_dir.join("%04d.ts");
        let segment_pattern_str = segment_pattern.to_string_lossy();

        // Write key info file for FFmpeg
        let key_info_path = output_dir.join("key_info.txt");
        let key_info_content = format!(
            "{}\n{}\n",
            key_path.to_string_lossy(),
            key_path.to_string_lossy(),
        );
        tokio::fs::write(&key_info_path, key_info_content)
            .await
            .context("writing key info file")?;

        let mut child = Command::new("ffmpeg")
            .args(&[
                "-i", input_path.to_str().unwrap(),
                "-c:a", "aac",
                "-b:a", "192k",
                "-f", "hls",
                "-hls_time", "4",
                "-hls_list_size", "0",
                "-hls_segment_filename", &segment_pattern_str,
                "-hls_key_info_file", key_info_path.to_str().unwrap(),
                "-y",
                playlist_path.to_str().unwrap(),
            ])
            .stdout(std::process::Stdio::null())
            .stderr(std::process::Stdio::piped())
            .spawn()
            .context("spawning ffmpeg")?;

        // Spawn stderr parser to report encoding progress
        let duration = duration_seconds as f64;
        let progress_tx_clone = progress_tx.clone();
        let stderr_handle = if let Some(stderr) = child.stderr.take() {
            Some(tokio::spawn(async move {
                let reader = BufReader::new(stderr);
                let mut lines = reader.lines();
                while let Ok(Some(line)) = lines.next_line().await {
                    if let Some(progress) = parse_ffmpeg_progress(&line, duration) {
                        if let Some(ref tx) = progress_tx_clone {
                            let _ = tx.send(progress);
                        }
                    }
                }
            }))
        } else {
            None
        };

        let status = child.wait().await.context("waiting for ffmpeg")?;

        if let Some(handle) = stderr_handle {
            let _ = handle.await;
        }

        if !status.success() {
            bail!("ffmpeg exited with code: {:?}", status.code());
        }

        let mut segment_count = 0usize;
        let mut entries = tokio::fs::read_dir(&segments_dir).await
            .context("reading segments directory")?;
        while let Some(entry) = entries.next_entry().await? {
            if entry.path().extension().and_then(|e| e.to_str()) == Some("ts") {
                segment_count += 1;
            }
        }

        Ok(HlsOutput {
            playlist_path,
            key_path,
            segments_dir,
            segment_count,
        })
    }
}

// Human: Translate ffmpeg status lines into integer percent complete by comparing parsed `time=` against known track duration.
// Agent: READS stderr line + duration_seconds; PARSES HH:MM:SS.xx; RETURNS 0-100; NONE when pattern missing or duration zero.
fn parse_ffmpeg_progress(line: &str, duration: f64) -> Option<i32> {
    // ffmpeg stderr output includes lines like:
    // size=    256kB time=00:00:15.23 bitrate= ...
    // We look for "time=" followed by HH:MM:SS.xx or MM:SS.xx
    let time_prefix = "time=";
    let start = line.find(time_prefix)?;
    let time_str = &line[start + time_prefix.len()..];
    let end = time_str.find(' ').unwrap_or(time_str.len());
    let time_val = &time_str[..end];

    let parts: Vec<&str> = time_val.split(':').collect();
    if parts.len() != 3 {
        return None;
    }

    let hours: f64 = parts[0].parse().ok()?;
    let minutes: f64 = parts[1].parse().ok()?;
    let seconds: f64 = parts[2].parse().ok()?;
    let current = hours * 3600.0 + minutes * 60.0 + seconds;

    if duration <= 0.0 {
        return None;
    }
    let pct = ((current / duration) * 100.0).clamp(0.0, 100.0) as i32;
    Some(pct)
}

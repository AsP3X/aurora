use anyhow::{Context, bail};
use std::path::{Path, PathBuf};
use tokio::process::Command;

pub struct HlsOutput {
    pub playlist_path: PathBuf,
    pub key_path: PathBuf,
    pub segments_dir: PathBuf,
    pub segment_count: usize,
}

pub struct HlsEncoder;

impl HlsEncoder {
    pub async fn transcode(
        input_path: &Path,
        output_dir: &Path,
        key: &[u8; 16],
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

        let status = Command::new("ffmpeg")
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
            .stderr(std::process::Stdio::null())
            .spawn()
            .context("spawning ffmpeg")?
            .wait()
            .await
            .context("waiting for ffmpeg")?;

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

use serde::{Deserialize, Serialize};

// Human: One lyric line — optional millisecond timestamp when synced to playback.
// Agent: SERIALIZES text + start_ms Option; VALIDATED in handlers before DB write.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LyricLine {
    pub text: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub start_ms: Option<i64>,
}

// Human: API payload for a song's lyrics document returned to clients.
// Agent: INCLUDES song_id, lines[], synced flag, updated_at; READ from song_lyrics.lines_json.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SongLyrics {
    pub song_id: String,
    pub lines: Vec<LyricLine>,
    pub synced: bool,
    pub updated_at: String,
}

// Human: True when every non-empty line has a non-negative start_ms (fully synced for karaoke display).
// Agent: PURE fn; IGNORES blank lines; REQUIRES start_ms Some for remaining lines.
pub fn is_synced(lines: &[LyricLine]) -> bool {
    let content: Vec<_> = lines
        .iter()
        .filter(|l| !l.text.trim().is_empty())
        .collect();
    if content.is_empty() {
        return false;
    }
    content.iter().all(|l| l.start_ms.is_some_and(|ms| ms >= 0))
}

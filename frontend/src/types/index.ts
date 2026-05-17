// Human: Shared TypeScript shapes for API JSON — users, songs, playlists, and auth responses.
// Agent: DOMAIN TYPES only; CONSUMED by pages/components and `api/client` responses; no runtime logic.

export interface User {
  id: string;
  email: string;
  role: string;
  permissions: string[];
}

export interface Song {
  id: string;
  title: string;
  artist: string;
  album: string | null;
  album_artist: string | null;
  track_number: number | null;
  year: number | null;
  genres: string[];
  studio: string | null;
  duration_seconds: number;
  file_key: string;
  file_size_bytes: number;
  file_format: string;
  bitrate_kbps: number | null;
  sample_rate_hz: number | null;
  artwork_key: string | null;
  publisher_id: string | null;
  // Human: HLS pipeline state from the API — ready flag, status string, admin error text, and 0–100 progress.
  // Agent: MIRRORS songs.hls_* + conversion_progress; DRIVES AdminLibraryPage badges and retry menu.
  hls_ready: boolean;
  hls_encode_status: string | null;
  hls_encode_error: string | null;
  conversion_progress: number;
  enabled: number;
  created_at: string;
  updated_at: string;
}

export interface SongDraft {
  staging_id: string;
  title: string;
  artist: string;
  album: string | null;
  album_artist: string | null;
  track_number: number | null;
  year: number | null;
  genres: string[];
  studio: string | null;
  duration_seconds: number;
  file_format: string;
  bitrate_kbps: number | null;
  sample_rate_hz: number | null;
  has_artwork: boolean;
}

export interface Playlist {
  id: string;
  user_id: string;
  name: string;
  description: string | null;
  is_public: boolean;
  created_at: string;
}

export interface AuthResponse {
  token: string;
  user: User;
}

// Human: One line of synced lyrics — text plus optional start time in milliseconds.
// Agent: MIRRORS backend LyricLine; USED by LyricsPanel and AdminLyricsEditorPage.
export interface LyricLine {
  text: string;
  start_ms?: number | null;
}

// Human: Full lyrics document for a song as returned by GET /songs/:id/lyrics.
// Agent: INCLUDES synced flag; CONSUMED by player and admin editor.
export interface SongLyrics {
  song_id: string;
  lines: LyricLine[];
  synced: boolean;
  updated_at: string;
}

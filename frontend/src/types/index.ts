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
  hls_ready: boolean;
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

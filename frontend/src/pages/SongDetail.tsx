import { useEffect, useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { usePlayer } from "../context/PlayerContext";
import { fetchSong } from "../api/client";
import ArtworkImage from "../components/ArtworkImage";
import type { Song } from "../types";

function formatDuration(seconds: number) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) {
    return `${h}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  }
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function formatFileSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

export default function SongDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { playSong } = usePlayer();
  const [song, setSong] = useState<Song | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    fetchSong(id)
      .then((data) => {
        if (!cancelled) {
          setSong(data);
          setLoading(false);
        }
      })
      .catch((e) => {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "Failed to load song");
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [id]);

  function handlePlay() {
    if (!song) return;
    playSong(song);
    navigate(`/player/${song.id}`);
  }

  if (!id) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[calc(100vh-4rem)] px-4 gap-4">
        <p className="text-surface-400 text-center">No song ID provided.</p>
        <Link
          to="/"
          className="text-sm text-aurora-400 hover:text-aurora-300 transition-colors"
        >
          Go back to Library
        </Link>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[calc(100vh-4rem)] px-4">
        <div className="w-full max-w-md space-y-8">
          <div className="relative">
            <div className="aspect-square rounded-3xl bg-surface-800 animate-pulse" />
          </div>
          <div className="space-y-3 text-center">
            <div className="h-8 w-3/4 mx-auto bg-surface-800 animate-pulse rounded" />
            <div className="h-5 w-1/2 mx-auto bg-surface-800 animate-pulse rounded" />
          </div>
        </div>
      </div>
    );
  }

  if (error || !song) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[calc(100vh-4rem)] px-4 gap-4">
        <p className="text-surface-400 text-center">
          {error || "Song not found."}
        </p>
        <Link
          to="/"
          className="text-sm text-aurora-400 hover:text-aurora-300 transition-colors"
        >
          Go back to Library
        </Link>
      </div>
    );
  }

  return (
    <div className="flex flex-col min-h-[calc(100vh-4rem)] px-4 sm:px-6">
      {/* Top bar */}
      <div className="py-4">
        <button
          onClick={() => navigate(-1)}
          className="flex items-center gap-2 text-sm text-surface-400 hover:text-white transition-colors group"
        >
          <svg
            className="w-4 h-4 transition-transform group-hover:-translate-x-0.5"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M15 19l-7-7 7-7"
            />
          </svg>
          Back
        </button>
      </div>

      {/* Main content */}
      <div className="flex-1 flex flex-col items-center justify-center pb-8">
        <div className="w-full max-w-md space-y-8">
          {/* Artwork */}
          <div className="relative mx-auto w-full max-w-sm sm:max-w-md">
            <div
              className="absolute -inset-4 rounded-[2rem] opacity-60 pointer-events-none"
              style={{
                background:
                  "radial-gradient(ellipse at 50% 50%, rgba(139,92,246,0.15) 0%, transparent 70%)",
              }}
            />
            <div className="relative aspect-square rounded-3xl overflow-hidden bg-surface-900 shadow-2xl shadow-black/50">
              <ArtworkImage
                songId={song.id}
                title={song.title}
                artist={song.artist}
                className="w-full h-full object-cover"
              />
            </div>
          </div>

          {/* Track Info */}
          <div className="text-center space-y-1">
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-white truncate">
              {song.title}
            </h1>
            <p className="text-lg sm:text-xl font-medium text-aurora-400 truncate">
              {song.artist}
            </p>
            <p className="text-sm text-surface-400 truncate">
              {song.album && song.year
                ? `${song.album} — ${song.year}`
                : song.album || (song.year ? String(song.year) : "")}
            </p>
            <div className="flex flex-wrap items-center justify-center gap-2 mt-3">
              {song.genres.map((genre) => (
                <span
                  key={genre}
                  className="text-xs font-medium bg-white/5 text-surface-400 px-2.5 py-1 rounded-full"
                >
                  {genre}
                </span>
              ))}
              <span className="text-xs font-medium bg-white/5 text-surface-400 px-2.5 py-1 rounded-full uppercase">
                {song.file_format}
              </span>
              {song.bitrate_kbps && (
                <span className="text-xs font-medium bg-white/5 text-surface-400 px-2.5 py-1 rounded-full">
                  {song.bitrate_kbps} kbps
                </span>
              )}
              {song.sample_rate_hz && (
                <span className="text-xs font-medium bg-white/5 text-surface-400 px-2.5 py-1 rounded-full">
                  {song.sample_rate_hz} Hz
                </span>
              )}
              {song.studio && (
                <span className="text-xs font-medium bg-white/5 text-surface-400 px-2.5 py-1 rounded-full">
                  {song.studio}
                </span>
              )}
            </div>
          </div>

          {/* Play Button */}
          <div className="flex justify-center">
            <button
              onClick={handlePlay}
              className="flex items-center gap-3 px-8 py-3 rounded-full bg-gradient-to-br from-aurora-500 to-aurora-700 hover:from-aurora-400 hover:to-aurora-600 text-white font-medium shadow-lg shadow-aurora-500/25 hover:shadow-aurora-500/40 transition-all hover:scale-105 active:scale-95"
            >
              <svg
                className="w-5 h-5 ml-0.5"
                fill="currentColor"
                viewBox="0 0 24 24"
              >
                <path d="M8 5v14l11-7z" />
              </svg>
              Play
            </button>
          </div>

          {/* Details grid */}
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div className="bg-surface-900 border border-white/5 rounded-xl p-3">
              <p className="text-surface-500 text-xs uppercase tracking-wider mb-1">Duration</p>
              <p className="text-white font-medium">{formatDuration(song.duration_seconds)}</p>
            </div>
            <div className="bg-surface-900 border border-white/5 rounded-xl p-3">
              <p className="text-surface-500 text-xs uppercase tracking-wider mb-1">File Size</p>
              <p className="text-white font-medium">{formatFileSize(song.file_size_bytes)}</p>
            </div>
            {song.track_number != null && (
              <div className="bg-surface-900 border border-white/5 rounded-xl p-3">
                <p className="text-surface-500 text-xs uppercase tracking-wider mb-1">Track Number</p>
                <p className="text-white font-medium">{song.track_number}</p>
              </div>
            )}
            {song.album_artist && (
              <div className="bg-surface-900 border border-white/5 rounded-xl p-3">
                <p className="text-surface-500 text-xs uppercase tracking-wider mb-1">Album Artist</p>
                <p className="text-white font-medium truncate">{song.album_artist}</p>
              </div>
            )}
            <div className="bg-surface-900 border border-white/5 rounded-xl p-3">
              <p className="text-surface-500 text-xs uppercase tracking-wider mb-1">Added</p>
              <p className="text-white font-medium">{formatDate(song.created_at)}</p>
            </div>
            <div className="bg-surface-900 border border-white/5 rounded-xl p-3">
              <p className="text-surface-500 text-xs uppercase tracking-wider mb-1">Status</p>
              <p className="text-white font-medium">
                {song.hls_ready ? (
                  <span className="inline-flex items-center gap-1 text-emerald-400">
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                    Ready
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 text-amber-400">
                    <svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.058M20 20v-5h-.058M4 14a8 8 0 0113.647-5.647M20 10a8 8 0 01-13.647 5.647" />
                    </svg>
                    Processing
                  </span>
                )}
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

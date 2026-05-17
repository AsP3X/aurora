// Human: Full-screen now-playing view — loads song by route id if needed and mirrors PlayerContext transport.
// Agent: fetchSong+playSong when id differs; SYNCs audio element time to context on visit; BOTTOM BAR controls queue/shuffle when queue length > 0.
import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { usePlayer } from "../context/PlayerContext";
import { fetchSong } from "../api/client";
import ArtworkImage from "../components/ArtworkImage";

export default function Player() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const {
    currentSong,
    isPlaying,
    progress,
    duration,
    volume,
    buffered,
    queue,
    shuffle,
    queueOpen,
    togglePlay,
    playNext,
    playPrevious,
    seek,
    setVolume,
    toggleMute,
    toggleShuffle,
    playSong,
    setDuration,
    setBuffered,
    setProgress,
    setQueueOpen,
    audioRef,
  } = usePlayer();
  const [loading, setLoading] = useState(!currentSong || currentSong.id !== id);
  const [hoverPercent, setHoverPercent] = useState<number | null>(null);

  // Human: Tooltip math for seek preview — identical approach to PlayerBar’s hover percent.
  // Agent: onMouseMove/Leave handlers; SETS hoverPercent from clientX/width.
  function handleProgressMouseMove(e: React.MouseEvent<HTMLDivElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const pct = Math.max(0, Math.min(100, (x / rect.width) * 100));
    setHoverPercent(pct);
  }

  function handleProgressMouseLeave() {
    setHoverPercent(null);
  }

  // Human: When opening `/player/:id` for a different track than what is loaded, fetch full metadata and start it via context.
  // Agent: EFFECT [id, currentSong, playSong]; CANCELS on id change; SETS loading around fetchSong.
  useEffect(() => {
    if (!id) return;
    if (currentSong?.id === id) {
      setLoading(false);
      return;
    }
    setLoading(true);
    let cancelled = false;
    fetchSong(id)
      .then((song) => {
        if (!cancelled) {
          playSong(song);
        }
      })
      .catch(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [id, currentSong, playSong]);

  // Human: If the global `<audio>` advanced while user was elsewhere, re-read element state when landing on this page.
  // Agent: EFFECT [currentSong]; READS audioRef currentTime/duration/buffered; WRITES context setters.
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !currentSong) return;
    setProgress(audio.currentTime);
    setDuration(audio.duration || currentSong.duration_seconds || 0);
    if (audio.buffered.length > 0) {
      setBuffered(audio.buffered.end(audio.buffered.length - 1));
    }
  }, [currentSong, audioRef, setProgress, setDuration, setBuffered]);

  function handleSeek(e: React.ChangeEvent<HTMLInputElement>) {
    seek(Number(e.target.value));
  }

  function handleVolume(e: React.ChangeEvent<HTMLInputElement>) {
    setVolume(Number(e.target.value));
  }

  function formatTime(t: number) {
    if (!isFinite(t)) return "0:00";
    const m = Math.floor(t / 60);
    const s = Math.floor(t % 60);
    return `${m}:${s.toString().padStart(2, "0")}`;
  }

  function formatDelta(seconds: number) {
    const sign = seconds >= 0 ? "+" : "-";
    const absSeconds = Math.abs(Math.round(seconds));
    const m = Math.floor(absSeconds / 60);
    const s = Math.floor(absSeconds % 60);
    return `${sign}${m}:${s.toString().padStart(2, "0")}`;
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

  if (!currentSong) return <p className="text-surface-400 text-center py-20">Song not found.</p>;

  const progressPercent = duration ? (progress / duration) * 100 : 0;
  const bufferedPercent = duration ? (buffered / duration) * 100 : 0;

  return (
    <div className="flex flex-col min-h-[calc(100vh-4rem)] px-4 sm:px-6">
      {/* Top bar */}
      <div className="py-4">
        <button
          onClick={() => navigate(-1)}
          className="flex items-center gap-2 text-sm text-surface-400 hover:text-white transition-colors group"
        >
          <svg className="w-4 h-4 transition-transform group-hover:-translate-x-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          Back
        </button>
      </div>

      {/* Main content - centered */}
      <div className="flex-1 flex flex-col items-center justify-center pb-8">
        <div className="w-full max-w-md space-y-8">
          {/* Artwork */}
          <div className="relative mx-auto w-full max-w-sm sm:max-w-md">
            <div
              className="absolute -inset-4 rounded-[2rem] opacity-60 pointer-events-none"
              style={{
                background: "radial-gradient(ellipse at 50% 50%, rgba(139,92,246,0.15) 0%, transparent 70%)",
              }}
            />
            <div className="relative aspect-square rounded-3xl overflow-hidden bg-surface-900 shadow-2xl shadow-black/50">
              <ArtworkImage
                songId={currentSong.id}
                title={currentSong.title}
                artist={currentSong.artist}
                className="w-full h-full object-cover"
              />
            </div>
          </div>

          {/* Track Info - below artwork */}
          <div className="text-center space-y-1">
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-white truncate">
              {currentSong.title}
            </h1>
            <p className="text-lg sm:text-xl font-medium text-aurora-400 truncate">
              {currentSong.artist}
            </p>
            <p className="text-sm text-surface-400 truncate">
              {currentSong.album && currentSong.year
                ? `${currentSong.album} — ${currentSong.year}`
                : currentSong.album || (currentSong.year ? String(currentSong.year) : "")}
            </p>
            <div className="flex flex-wrap items-center justify-center gap-2 mt-3">
              {currentSong.genres.map((genre) => (
                <span key={genre} className="text-xs font-medium bg-white/5 text-surface-400 px-2.5 py-1 rounded-full">
                  {genre}
                </span>
              ))}
              <span className="text-xs font-medium bg-white/5 text-surface-400 px-2.5 py-1 rounded-full uppercase">
                {currentSong.file_format}
              </span>
              {currentSong.bitrate_kbps && (
                <span className="text-xs font-medium bg-white/5 text-surface-400 px-2.5 py-1 rounded-full">
                  {currentSong.bitrate_kbps} kbps
                </span>
              )}
              {currentSong.studio && (
                <span className="text-xs font-medium bg-white/5 text-surface-400 px-2.5 py-1 rounded-full">
                  {currentSong.studio}
                </span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Bottom Player Bar - Full-screen version */}
      <div className="sticky bottom-0 left-0 right-0 bg-surface-950/90 backdrop-blur-xl border-t border-white/10 py-4 px-4 sm:px-6 -mx-4 sm:-mx-6">
        <div className="max-w-3xl mx-auto space-y-3">
          {/* Progress Bar */}
          <div>
            <div className="relative h-1.5 group cursor-pointer"
            onMouseMove={handleProgressMouseMove}
            onMouseLeave={handleProgressMouseLeave}
          >
              {/* Track */}
              <div className="absolute inset-0 bg-surface-800 rounded-full overflow-hidden">
              <div
                className="absolute inset-y-0 left-0 bg-surface-600 rounded-full"
                style={{ width: `${bufferedPercent}%` }}
              />
              <div
                className="absolute inset-y-0 left-0 bg-gradient-to-r from-aurora-500 to-aurora-400 rounded-full"
                style={{ width: `${progressPercent}%` }}
              />
              </div>

              <input
                type="range"
                min={0}
                max={duration || currentSong.duration_seconds}
                value={progress}
                onChange={handleSeek}
                aria-label="Seek"
                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
              />

              {/* Drag tooltip */}
              <div
                className="absolute bottom-full mb-2 pointer-events-none z-50 flex flex-col items-center"
                style={{ left: `${hoverPercent ?? progressPercent}%`, transform: "translateX(-50%)" }}
              >
                <div className="flex flex-col items-center drop-shadow-xl origin-bottom transition-all duration-300 ease-[cubic-bezier(0.34,1.56,0.64,1)] opacity-0 scale-75 translate-y-2 group-hover:opacity-100 group-hover:scale-100 group-hover:translate-y-0">
                  <div className="bg-white rounded-xl px-4 py-3 flex flex-col items-center gap-1 relative z-10 shadow-2xl shadow-black/30 ring-2 ring-aurora-500/20">
                    <span className="text-base font-bold text-surface-900 leading-none tracking-tight">
                      {formatTime(duration ? (duration * (hoverPercent ?? progressPercent)) / 100 : 0)}
                    </span>
                    <span className="text-xs font-semibold text-surface-600 leading-none">
                      {formatDelta(duration ? (duration * (hoverPercent ?? progressPercent)) / 100 - progress : 0)}
                    </span>
                  </div>
                  <div className="w-3 h-3 bg-white rotate-45 -mt-2 relative z-0 shadow-lg shadow-black/20 ring-2 ring-aurora-500/20" />
                </div>
              </div>
            </div>
            <div className="flex items-center justify-between text-xs text-surface-500 font-mono mt-1.5">
              <span>{formatTime(progress)}</span>
              <span>{formatTime(duration || currentSong.duration_seconds)}</span>
            </div>
          </div>

          {/* Transport + Volume Row */}
          <div className="flex items-center justify-between gap-4">
            {/* Volume */}
            <div className="flex items-center gap-2 w-28 sm:w-36">
              <button
                onClick={toggleMute}
                aria-label={volume === 0 ? "Unmute" : "Mute"}
                className="text-surface-400 hover:text-white transition-colors shrink-0"
              >
                {volume === 0 ? (
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2" /></svg>
                ) : volume < 0.5 ? (
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" /></svg>
                ) : (
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" /></svg>
                )}
              </button>
              <div className="relative flex-1 h-1 bg-surface-800 rounded-full overflow-hidden group cursor-pointer">
                <div
                  className="absolute inset-y-0 left-0 bg-surface-400 rounded-full"
                  style={{ width: `${volume * 100}%` }}
                />
                <div
                  className="absolute top-1/2 -translate-y-1/2 w-2.5 h-2.5 bg-white rounded-full shadow opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none"
                  style={{ left: `calc(${volume * 100}% - 5px)` }}
                />
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.01}
                  value={volume}
                  onChange={handleVolume}
                  aria-label="Volume"
                  className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                />
              </div>
            </div>

            {/* Transport Controls */}
            <div className="flex items-center justify-center gap-2 sm:gap-4">
              <button
                onClick={toggleShuffle}
                disabled={queue.length === 0}
                className={`w-9 h-9 sm:w-10 sm:h-10 flex items-center justify-center transition-colors rounded-full hover:bg-white/5 ${
                  queue.length === 0
                    ? "text-surface-600 cursor-default"
                    : shuffle
                      ? "text-aurora-400"
                      : "text-surface-400 hover:text-white"
                }`}
                title="Shuffle"
                aria-label="Shuffle"
              >
                <svg className="w-4 h-4 sm:w-5 sm:h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M16 3h5v5M4 20L21 3M21 16v5h-5M15 15l6 6M4 4l5 5" />
                </svg>
              </button>

              <button
                onClick={playPrevious}
                disabled={queue.length === 0}
                className={`w-10 h-10 sm:w-12 sm:h-12 flex items-center justify-center transition-colors ${
                  queue.length === 0 ? "text-surface-600 cursor-default" : "text-surface-400 hover:text-white"
                }`}
                aria-label="Previous"
              >
                <svg className="w-5 h-5 sm:w-6 sm:h-6" fill="currentColor" viewBox="0 0 24 24"><path d="M6 6h2v12H6zm3.5 6l8.5 6V6z" /></svg>
              </button>

              <button
                onClick={togglePlay}
                aria-label={isPlaying ? "Pause" : "Play"}
                className="w-14 h-14 sm:w-16 sm:h-16 rounded-full bg-gradient-to-br from-aurora-500 to-aurora-700 hover:from-aurora-400 hover:to-aurora-600 flex items-center justify-center shadow-lg shadow-aurora-500/25 hover:shadow-aurora-500/40 transition-all hover:scale-105 active:scale-95"
              >
                {isPlaying ? (
                  <svg className="w-6 h-6 sm:w-7 sm:h-7 text-white" fill="currentColor" viewBox="0 0 24 24"><path d="M6 4h4v16H6V4zm8 0h4v16h-4V4z" /></svg>
                ) : (
                  <svg className="w-6 h-6 sm:w-7 sm:h-7 text-white ml-0.5 sm:ml-1" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z" /></svg>
                )}
              </button>

              <button
                onClick={playNext}
                disabled={queue.length === 0}
                className={`w-10 h-10 sm:w-12 sm:h-12 flex items-center justify-center transition-colors ${
                  queue.length === 0 ? "text-surface-600 cursor-default" : "text-surface-400 hover:text-white"
                }`}
                aria-label="Next"
              >
                <svg className="w-5 h-5 sm:w-6 sm:h-6" fill="currentColor" viewBox="0 0 24 24"><path d="M6 18l8.5-6L6 6v12zM16 6v12h2V6h-2z" /></svg>
              </button>

              <button
                onClick={() => setQueueOpen(true)}
                className={`w-9 h-9 sm:w-10 sm:h-10 flex items-center justify-center transition-colors rounded-full hover:bg-white/5 ${
                  queueOpen ? "text-aurora-400" : "text-surface-400 hover:text-white"
                }`}
                title="Queue"
                aria-label="Queue"
              >
                <svg className="w-4 h-4 sm:w-5 sm:h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
                </svg>
              </button>
            </div>

            {/* Spacer to balance volume on left */}
            <div className="w-28 sm:w-36 hidden sm:block" />
          </div>
        </div>
      </div>
    </div>
  );
}

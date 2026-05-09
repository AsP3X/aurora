import { useEffect, useCallback } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { usePlayer } from "../context/PlayerContext";
import { streamUrl, logHistory } from "../api/client";
import ArtworkImage from "./ArtworkImage";

function formatTime(t: number) {
  if (!isFinite(t)) return "0:00";
  const m = Math.floor(t / 60);
  const s = Math.floor(t % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export default function PlayerBar() {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const isLibrary = pathname === "/";
  const isPlayerPage = pathname.startsWith("/player/");
  const {
    currentSong,
    isPlaying,
    progress,
    duration,
    volume,
    buffered,
    togglePlay,
    seek,
    setVolume,
    toggleMute,
    setProgress,
    setDuration,
    setBuffered,
    audioRef,
  } = usePlayer();

  const handleTimeUpdate = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;
    setProgress(audio.currentTime);
    if (audio.buffered.length > 0) {
      setBuffered(audio.buffered.end(audio.buffered.length - 1));
    }
  }, [audioRef, setProgress, setBuffered]);

  const handleLoadedMetadata = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;
    setDuration(audio.duration || 0);
  }, [audioRef, setDuration]);

  const handleEnded = useCallback(() => {
    if (currentSong) {
      logHistory(currentSong.id, undefined, true).catch(() => {});
    }
  }, [currentSong]);

  const handleSeekInput = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      seek(Number(e.target.value));
    },
    [seek]
  );

  const handleVolumeInput = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      setVolume(Number(e.target.value));
    },
    [setVolume]
  );

  // Auto-play when song changes
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !currentSong) return;
    audio.play().catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentSong?.id]);

  if (!currentSong || isPlayerPage) return null;

  const progressPercent = duration ? (progress / duration) * 100 : 0;
  const bufferedPercent = duration ? (buffered / duration) * 100 : 0;

  return (
    <>
      {/* Progress bar overlay at top of player bar */}
      <div className={`fixed bottom-[80px] z-50 h-1 bg-surface-800 ${isLibrary ? "md:left-64 left-0" : "left-0"} right-0`}>
        <div className="relative w-full h-full group cursor-pointer">
          <div
            className="absolute inset-y-0 left-0 bg-surface-600"
            style={{ width: `${bufferedPercent}%` }}
          />
          <div
            className="absolute inset-y-0 left-0 bg-aurora-500"
            style={{ width: `${progressPercent}%` }}
          />
          <input
            type="range"
            min={0}
            max={duration || currentSong.duration_seconds}
            value={progress}
            onChange={handleSeekInput}
            aria-label="Seek"
            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
          />
        </div>
      </div>

      {/* Player bar */}
      <div className={`fixed bottom-0 z-50 h-20 bg-surface-950/95 backdrop-blur-xl border-t border-white/10 px-4 sm:px-6 ${isLibrary ? "md:left-64 left-0" : "left-0"} right-0`}>
        <div className="max-w-7xl mx-auto h-full flex items-center justify-between gap-4">
          {/* Left: Artwork + Info */}
          <button
            onClick={() => navigate(`/player/${currentSong.id}`)}
            className="flex items-center gap-3 min-w-0 flex-1 group text-left"
          >
            <div className="w-14 h-14 rounded-lg overflow-hidden bg-surface-900 shrink-0">
              <ArtworkImage
                songId={currentSong.id}
                title={currentSong.title}
                artist={currentSong.artist}
                className="w-full h-full object-cover"
              />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-medium text-white truncate group-hover:text-aurora-300 transition-colors">
                {currentSong.title}
              </p>
              <p className="text-xs text-surface-400 truncate">
                {currentSong.artist}
              </p>
            </div>
          </button>

          {/* Center: Controls */}
          <div className="flex items-center justify-center gap-2 sm:gap-4">
            <button
              className="w-8 h-8 flex items-center justify-center text-surface-600 cursor-default"
              title="Shuffle"
              tabIndex={-1}
              aria-disabled="true"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M16 3h5v5M4 20L21 3M21 16v5h-5M15 15l6 6M4 4l5 5" />
              </svg>
            </button>

            <button
              className="w-9 h-9 flex items-center justify-center text-surface-400 hover:text-white transition-colors"
              aria-label="Previous"
            >
              <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24"><path d="M6 6h2v12H6zm3.5 6l8.5 6V6z" /></svg>
            </button>

            <button
              onClick={togglePlay}
              aria-label={isPlaying ? "Pause" : "Play"}
              className="w-11 h-11 rounded-full bg-white flex items-center justify-center hover:scale-105 active:scale-95 transition-all"
            >
              {isPlaying ? (
                <svg className="w-5 h-5 text-surface-950" fill="currentColor" viewBox="0 0 24 24"><path d="M6 4h4v16H6V4zm8 0h4v16h-4V4z" /></svg>
              ) : (
                <svg className="w-5 h-5 text-surface-950 ml-0.5" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z" /></svg>
              )}
            </button>

            <button
              className="w-9 h-9 flex items-center justify-center text-surface-400 hover:text-white transition-colors"
              aria-label="Next"
            >
              <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24"><path d="M6 18l8.5-6L6 6v12zM16 6v12h2V6h-2z" /></svg>
            </button>

            <button
              className="w-8 h-8 flex items-center justify-center text-surface-600 cursor-default"
              title="Repeat"
              tabIndex={-1}
              aria-disabled="true"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.058M20 20v-5h-.058M4 14a8 8 0 0113.647-5.647M20 10a8 8 0 01-13.647 5.647" />
              </svg>
            </button>
          </div>

          {/* Right: Volume + Time */}
          <div className="flex items-center justify-end gap-3 w-32 sm:w-40">
            <span className="text-xs text-surface-500 font-mono hidden sm:block">
              {formatTime(progress)} / {formatTime(duration || currentSong.duration_seconds)}
            </span>

            <button
              onClick={toggleMute}
              aria-label={volume === 0 ? "Unmute" : "Mute"}
              className="text-surface-400 hover:text-white transition-colors shrink-0"
            >
              {volume === 0 ? (
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2" /></svg>
              ) : volume < 0.5 ? (
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" /></svg>
              ) : (
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" /></svg>
              )}
            </button>

            <div className="relative flex-1 h-1 bg-surface-800 rounded-full overflow-hidden group cursor-pointer">
              <div
                className="absolute inset-y-0 left-0 bg-surface-400 rounded-full"
                style={{ width: `${volume * 100}%` }}
              />
              <input
                type="range"
                min={0}
                max={1}
                step={0.01}
                value={volume}
                onChange={handleVolumeInput}
                aria-label="Volume"
                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
              />
            </div>
          </div>
        </div>
      </div>

      <audio
        ref={audioRef}
        src={streamUrl(currentSong.id)}
        onTimeUpdate={handleTimeUpdate}
        onLoadedMetadata={handleLoadedMetadata}
        onEnded={handleEnded}
        preload="metadata"
      />
    </>
  );
}

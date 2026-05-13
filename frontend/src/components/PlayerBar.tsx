import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import Hls from "hls.js";
import { usePlayer } from "../context/PlayerContext";
import { logHistory } from "../api/client";
import ArtworkImage from "./ArtworkImage";
import QueueDrawer from "./QueueDrawer";

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

export default function PlayerBar() {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const isDashboard = pathname === "/" || pathname === "/playlists" || pathname.startsWith("/playlist/");
  const isPlayerPage = pathname.startsWith("/player/");
  const {
    currentSong,
    isPlaying,
    progress,
    duration,
    volume,
    buffered,
    currentStreamUrl,
    queue,
    shuffle,
    togglePlay,
    playNext,
    playPrevious,
    seek,
    setVolume,
    toggleMute,
    setProgress,
    setDuration,
    setBuffered,
    toggleShuffle,
    queueOpen,
    setQueueOpen,
    audioRef,
  } = usePlayer();

  const prevStreamUrl = useRef<string | null>(null);
  const lastLoggedStart = useRef<string | null>(null);

  useEffect(() => {
    if (currentSong && currentStreamUrl && currentSong.id !== lastLoggedStart.current) {
      logHistory(currentSong.id, undefined, false).catch(() => {});
      lastLoggedStart.current = currentSong.id;
    }
  }, [currentSong, currentStreamUrl]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !currentStreamUrl) return;

    let hls: Hls | null = null;

    if (currentStreamUrl.endsWith("/playlist")) {
      if (Hls.isSupported()) {
        hls = new Hls({
          enableWorker: true,
          xhrSetup: (xhr) => {
            const token = localStorage.getItem("aurora_token");
            if (token) {
              xhr.setRequestHeader("Authorization", `Bearer ${token}`);
            }
          },
        });
        hls.loadSource(currentStreamUrl);
        hls.attachMedia(audio);
      } else if (audio.canPlayType("application/vnd.apple.mpegurl")) {
        audio.src = currentStreamUrl;
      }
    } else {
      audio.src = currentStreamUrl;
    }

    return () => {
      if (hls) {
        hls.destroy();
      }
    };
  }, [currentStreamUrl]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    if (currentStreamUrl && currentStreamUrl !== prevStreamUrl.current) {
      audio.currentTime = 0;
      prevStreamUrl.current = currentStreamUrl;
    }

    if (!currentStreamUrl) return;

    if (isPlaying) {
      const promise = audio.play();
      if (promise !== undefined) {
        promise.catch((err: Error) => {
          console.error("Audio play failed:", err);
        });
      }
    } else {
      audio.pause();
    }
  }, [currentStreamUrl, isPlaying, audioRef]);

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
    if (queue.length > 0) {
      playNext();
    }
  }, [currentSong, queue, playNext]);

  const handleAudioError = useCallback(() => {
    const audio = audioRef.current;
    console.error("Audio element error:", audio?.error);
  }, [audioRef]);

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

  const [hoverPercent, setHoverPercent] = useState<number | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [dragOrigin, setDragOrigin] = useState(0);

  const handleProgressMouseMove = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      const rect = e.currentTarget.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const pct = Math.max(0, Math.min(100, (x / rect.width) * 100));
      setHoverPercent(pct);
    },
    []
  );

  const handleProgressMouseLeave = useCallback(() => {
    setHoverPercent(null);
  }, []);

  const handleSeekPointerDown = useCallback(
    (e: React.PointerEvent<HTMLInputElement>) => {
      e.currentTarget.setPointerCapture(e.pointerId);
      setIsDragging(true);
      setDragOrigin(Number(e.currentTarget.value));
    },
    []
  );

  const handleSeekPointerUp = useCallback(() => {
    setIsDragging(false);
  }, []);

  const handleSeekLostPointerCapture = useCallback(() => {
    setIsDragging(false);
  }, []);

  if (!currentSong) return null;

  const progressPercent = duration ? (progress / duration) * 100 : 0;
  const bufferedPercent = duration ? (buffered / duration) * 100 : 0;

  return (
    <>
      {!isPlayerPage && (
        <div
          className={`fixed bottom-4 z-40 ${
            isDashboard ? "md:left-72 left-4" : "md:left-8 left-4"
          } right-4 md:right-8`}
        >
        {/* Liquid Glass Container */}
        <div className="relative rounded-[32px]">
          {/* Clipped background shell */}
          <div className="absolute inset-0 rounded-[32px] overflow-hidden">
            <div className="absolute inset-0 backdrop-blur-2xl bg-surface-950/35" />
            <div className="absolute inset-0 bg-gradient-to-b from-white/[0.12] to-white/[0.02]" />
            <div className="absolute inset-0 shadow-[inset_0_1px_2px_rgba(255,255,255,0.15)]" />
            <div className="absolute inset-0 rounded-[32px] border border-white/20" />
          </div>

          {/* Outer floating shadow */}
          <div className="absolute -inset-1 rounded-[36px] bg-black/20 blur-xl -z-10" />

          {/* Content */}
          <div className="relative px-4 sm:px-5 py-3 space-y-2">
            {/* Progress bar */}
            <div
              className="relative w-full h-2.5 group cursor-pointer"
              onMouseMove={handleProgressMouseMove}
              onMouseLeave={handleProgressMouseLeave}
            >
              {/* Bar track (clipped) */}
              <div className="relative w-full h-full bg-surface-800/60 rounded-full overflow-hidden">
                <div
                  className="absolute inset-y-0 left-0 bg-surface-500/40 rounded-full"
                  style={{ width: `${bufferedPercent}%` }}
                />
                <div
                  className="absolute inset-y-0 left-0 bg-gradient-to-r from-aurora-400 to-aurora-500 rounded-full shadow-[0_0_10px_rgba(139,92,246,0.4)] transition-[width] duration-300 ease-linear"
                  style={{ width: `${progressPercent}%` }}
                />
              </div>

              {/* Ghost dot at cursor position */}
              {hoverPercent !== null && (
                <div
                  className="absolute top-1/2 -translate-y-1/2 w-2.5 h-2.5 bg-white/40 rounded-full pointer-events-none z-10 transition-[left] duration-300 ease-linear"
                  style={{ left: `calc(${hoverPercent}% - 5px)` }}
                />
              )}

              {/* Always-visible dot at the tip of progress */}
              <div
                className="absolute top-1/2 -translate-y-1/2 w-2.5 h-2.5 bg-white rounded-full shadow pointer-events-none z-10 transition-[left] duration-300 ease-linear"
                style={{ left: `calc(${progressPercent}% - 5px)` }}
              />

              {/* Hover thumb above the bar */}
              <div
                className="absolute top-1/2 -translate-y-1/2 w-5 h-5 bg-white rounded-full shadow-lg opacity-0 group-hover:opacity-100 transition-[left,opacity] duration-300 ease-linear pointer-events-none flex items-center justify-center z-10"
                style={{ left: `calc(${progressPercent}% - 10px)` }}
              >
                <div className="w-2 h-2 bg-aurora-500 rounded-full" />
              </div>

              {/* Invisible hit target */}
              <input
                type="range"
                min={0}
                max={duration || currentSong.duration_seconds}
                value={progress}
                onChange={handleSeekInput}
                onPointerDown={handleSeekPointerDown}
                onPointerUp={handleSeekPointerUp}
                onLostPointerCapture={handleSeekLostPointerCapture}
                aria-label="Seek"
                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
              />

              <div
                className="absolute bottom-full mb-2 pointer-events-none z-50 flex flex-col items-center"
                style={{ left: `${progressPercent}%`, transform: "translateX(-50%)" }}
              >
                <div
                  className={`flex flex-col items-center drop-shadow-xl origin-bottom transition-all duration-300 ease-[cubic-bezier(0.34,1.56,0.64,1)] ${isDragging ? "opacity-100 scale-100 translate-y-0" : "opacity-0 scale-75 translate-y-2"}`}
                >
                  <div className="bg-white rounded-xl px-3 py-2 flex flex-col items-center gap-1 relative z-10">
                    <span className="text-sm font-bold text-surface-900 leading-none tracking-tight">
                      {formatTime(progress)}
                    </span>
                    <span className="text-[11px] font-semibold text-surface-500 leading-none">
                      {formatDelta(progress - dragOrigin)}
                    </span>
                  </div>
                  <div className="w-2.5 h-2.5 bg-white rotate-45 -mt-1.5 relative z-0" />
                </div>
              </div>
            </div>

            {/* Main row */}
            <div className="flex items-center justify-between gap-3 sm:gap-4">
              {/* Left: Artwork + Info */}
              <button
                onClick={() => navigate(`/player/${currentSong.id}`)}
                className="flex items-center gap-3 min-w-0 group text-left shrink-0"
              >
                <div className="w-11 h-11 sm:w-12 sm:h-12 rounded-xl overflow-hidden bg-surface-900/80 ring-1 ring-white/10 shrink-0">
                  <ArtworkImage
                    songId={currentSong.id}
                    title={currentSong.title}
                    artist={currentSong.artist}
                    className="w-full h-full object-cover"
                  />
                </div>
                <div className="min-w-0 hidden sm:block">
                  <p className="text-sm font-semibold text-white truncate group-hover:text-aurora-300 transition-colors">
                    {currentSong.title}
                  </p>
                  <p className="text-xs text-surface-400 truncate">
                    {currentSong.artist}
                  </p>
                </div>
              </button>

              {/* Center: Controls */}
              <div className="flex items-center justify-center gap-1 sm:gap-2">
                <button
                  onClick={toggleShuffle}
                  className={`w-8 h-8 sm:w-9 sm:h-9 flex items-center justify-center transition-colors rounded-full hover:bg-white/5 ${shuffle ? "text-aurora-400" : "text-surface-400 hover:text-white"}`}
                  aria-label="Shuffle"
                  title="Shuffle"
                >
                  <svg className="w-4 h-4 sm:w-5 sm:h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                  </svg>
                </button>

                <button
                  onClick={playPrevious}
                  className="w-8 h-8 sm:w-9 sm:h-9 flex items-center justify-center text-surface-400 hover:text-white transition-colors rounded-full hover:bg-white/5"
                  aria-label="Previous"
                >
                  <svg className="w-4 h-4 sm:w-5 sm:h-5" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M6 6h2v12H6zm3.5 6l8.5 6V6z" />
                  </svg>
                </button>

                <button
                  onClick={togglePlay}
                  aria-label={isPlaying ? "Pause" : "Play"}
                  className="w-9 h-9 sm:w-10 sm:h-10 rounded-full bg-white/90 backdrop-blur-sm flex items-center justify-center hover:bg-white hover:scale-105 active:scale-95 transition-all shadow-lg shadow-white/10"
                >
                  {isPlaying ? (
                    <svg className="w-4 h-4 sm:w-5 sm:h-5 text-surface-950" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M6 4h4v16H6V4zm8 0h4v16h-4V4z" />
                    </svg>
                  ) : (
                    <svg className="w-4 h-4 sm:w-5 sm:h-5 text-surface-950 ml-0.5" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M8 5v14l11-7z" />
                    </svg>
                  )}
                </button>

                <button
                  onClick={playNext}
                  className="w-8 h-8 sm:w-9 sm:h-9 flex items-center justify-center text-surface-400 hover:text-white transition-colors rounded-full hover:bg-white/5"
                  aria-label="Next"
                >
                  <svg className="w-4 h-4 sm:w-5 sm:h-5" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M6 18l8.5-6L6 6v12zM16 6v12h2V6h-2z" />
                  </svg>
                </button>
              </div>

              {/* Right: Volume + Time */}
              <div className="flex items-center justify-end gap-2 sm:gap-3 shrink-0">
                <span className="text-[11px] text-surface-500 font-mono hidden lg:block">
                  {formatTime(progress)} / {formatTime(duration || currentSong.duration_seconds)}
                </span>

                <button
                  onClick={() => setQueueOpen(!queueOpen)}
                  className={`text-surface-400 hover:text-white transition-colors ${queueOpen ? "text-aurora-400" : ""}`}
                  aria-label="Queue"
                  title="Queue"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
                  </svg>
                </button>

                <button
                  onClick={toggleMute}
                  aria-label={volume === 0 ? "Unmute" : "Mute"}
                  className="text-surface-400 hover:text-white transition-colors"
                >
                  {volume === 0 ? (
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2" />
                    </svg>
                  ) : volume < 0.5 ? (
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
                    </svg>
                  ) : (
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
                    </svg>
                  )}
                </button>

                <div className="relative w-16 sm:w-20 h-1 bg-surface-800/60 rounded-full overflow-hidden group cursor-pointer">
                  <div
                    className="absolute inset-y-0 left-0 bg-surface-400 rounded-full"
                    style={{ width: `${volume * 100}%` }}
                  />
                  <div
                    className="absolute top-1/2 -translate-y-1/2 w-2 h-2 bg-white rounded-full shadow opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none"
                    style={{ left: `calc(${volume * 100}% - 4px)` }}
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
        </div>
      </div>
      )}

      <QueueDrawer />

      <audio
        ref={audioRef}
        onTimeUpdate={handleTimeUpdate}
        onLoadedMetadata={handleLoadedMetadata}
        onEnded={handleEnded}
        onError={handleAudioError}
        preload="metadata"
      />
    </>
  );
}

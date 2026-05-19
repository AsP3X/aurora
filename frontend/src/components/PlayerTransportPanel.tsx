// Human: Shared liquid-glass transport UI — one source of truth for dashboard PlayerBar and full-screen player.
// Agent: PROPS playback state + handlers; OPTIONAL queueButtonRef+keyboardHintsId+artworkLink; RENDERS progress row + transport row matching PlayerBar.
import { useCallback, useState, type RefObject } from "react";
import ArtworkImage from "./ArtworkImage";
import QueueDrawer from "./QueueDrawer";
import { resolveTrackDuration } from "../lib/playbackDuration";
import type { Song } from "../types";

// Human: Format seconds as `m:ss` for labels on the seek bar and time readouts.
// Agent: PURE helper; RETURNS "0:00" when non-finite.
function formatTime(t: number) {
  if (!isFinite(t)) return "0:00";
  const m = Math.floor(t / 60);
  const s = Math.floor(t % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

// Human: Show +/- offset from current playback position inside the hover tooltip on the progress bar.
// Agent: PURE helper; FORMATS sign and absolute delta as m:ss.
function formatDelta(seconds: number) {
  const sign = seconds >= 0 ? "+" : "-";
  const absSeconds = Math.abs(Math.round(seconds));
  const m = Math.floor(absSeconds / 60);
  const s = Math.floor(absSeconds % 60);
  return `${sign}${m}:${s.toString().padStart(2, "0")}`;
}

export interface PlayerTransportPanelProps {
  song: Song;
  isPlaying: boolean;
  progress: number;
  duration: number;
  volume: number;
  buffered: number;
  shuffle: boolean;
  queueOpen: boolean;
  onTogglePlay: () => void;
  onPlayPrevious: () => void;
  onPlayNext: () => void;
  onSeek: (timeSeconds: number) => void;
  onVolumeChange: (volume: number) => void;
  onToggleMute: () => void;
  onToggleShuffle: () => void;
  onToggleQueue: () => void;
  onArtworkClick?: () => void;
  queueButtonRef?: RefObject<HTMLButtonElement | null>;
  keyboardHintsId?: string;
  className?: string;
}

export default function PlayerTransportPanel({
  song,
  isPlaying,
  progress,
  duration,
  volume,
  buffered,
  shuffle,
  queueOpen,
  onTogglePlay,
  onPlayPrevious,
  onPlayNext,
  onSeek,
  onVolumeChange,
  onToggleMute,
  onToggleShuffle,
  onToggleQueue,
  onArtworkClick,
  queueButtonRef,
  keyboardHintsId = "player-keyboard-hints",
  className = "",
}: PlayerTransportPanelProps) {
  const [hoverPercent, setHoverPercent] = useState<number | null>(null);

  // Human: Tooltip seeks preview — map mouse X within the bar to a percentage for time preview math.
  // Agent: onMouseMove; SETS hoverPercent 0–100 from clientX/rect.width.
  const handleProgressMouseMove = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const pct = Math.max(0, Math.min(100, (x / rect.width) * 100));
    setHoverPercent(pct);
  }, []);

  // Human: When the cursor leaves the seek bar, drop hover preview and fall back to actual progress dot position.
  // Agent: SETS hoverPercent null.
  const handleProgressMouseLeave = useCallback(() => {
    setHoverPercent(null);
  }, []);

  // Human: Range input reports seconds — forward to parent seek handler.
  // Agent: onChange range; CALLS onSeek(Number).
  const handleSeekInput = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      onSeek(Number(e.target.value));
    },
    [onSeek],
  );

  // Human: Volume slider writes through parent so context and `<audio>` stay matched.
  // Agent: onChange range; CALLS onVolumeChange.
  const handleVolumeInput = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      onVolumeChange(Number(e.target.value));
    },
    [onVolumeChange],
  );

  // Human: One duration drives fill width, range max, tooltips, and time labels so the bar always matches the audible track.
  // Agent: resolveTrackDuration(duration, song.duration_seconds); PERCENTS clamped 0–100; range value min(progress, trackDuration).
  const trackDuration = resolveTrackDuration(duration, song.duration_seconds);
  const progressPercent =
    trackDuration > 0 ? Math.min(100, (progress / trackDuration) * 100) : 0;
  const bufferedPercent =
    trackDuration > 0 && buffered > 0
      ? Math.min(100, (buffered / trackDuration) * 100)
      : 0;
  const seekValue = trackDuration > 0 ? Math.min(progress, trackDuration) : progress;

  return (
    <div className={`relative ${className}`.trim()}>
      <QueueDrawer returnFocusRef={queueButtonRef} />

      <div className="relative rounded-[32px]">
      {/* Clipped background shell */}
      <div className="absolute inset-0 rounded-[32px] overflow-hidden">
        <div className="absolute inset-0 backdrop-blur-2xl bg-surface-950/35" />
        <div className="absolute inset-0 bg-gradient-to-b from-white/[0.12] to-white/[0.02]" />
        <div className="absolute inset-0 shadow-[inset_0_1px_2px_rgba(255,255,255,0.15)]" />
        <div className="absolute inset-0 rounded-[32px] border border-white/20" />
      </div>

      {/* Outer floating shadow */}
      <div className="absolute -inset-1 rounded-[36px] bg-black/20 blur-xl -z-10 pointer-events-none" />

      {/* Content — padding and vertical rhythm match dashboard PlayerBar exactly */}
      <div
        className="relative px-4 sm:px-5 py-3 space-y-2"
        role="region"
        aria-label="Player controls"
        aria-describedby={keyboardHintsId}
      >
        <p className="sr-only" id={keyboardHintsId}>
          Space play or pause. Arrow keys seek five seconds. Shift with arrows for previous or next track. Q toggles
          queue. M mutes. Escape closes the queue.
        </p>

        {/* Progress bar */}
        <div
          className="relative w-full h-2.5 group cursor-pointer"
          onMouseMove={handleProgressMouseMove}
          onMouseLeave={handleProgressMouseLeave}
        >
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

          <div
            className="absolute top-1/2 -translate-y-1/2 w-2.5 h-2.5 bg-white rounded-full shadow pointer-events-none z-10 transition-[left] duration-300 ease-linear"
            style={{ left: `calc(${progressPercent}% - 5px)` }}
          />

          <div
            className="absolute top-1/2 -translate-y-1/2 w-5 h-5 bg-white rounded-full shadow-lg opacity-0 group-hover:opacity-100 transition-[left,opacity] duration-300 ease-linear pointer-events-none flex items-center justify-center z-10"
            style={{ left: `calc(${progressPercent}% - 10px)` }}
          >
            <div className="w-2 h-2 bg-aurora-500 rounded-full" />
          </div>

          <input
            type="range"
            min={0}
            max={trackDuration > 0 ? trackDuration : 1}
            step={0.05}
            value={seekValue}
            onChange={handleSeekInput}
            disabled={trackDuration <= 0}
            aria-label="Seek"
            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer disabled:cursor-not-allowed"
          />

          <div
            className="absolute bottom-full mb-2 pointer-events-none z-50 flex flex-col items-center"
            style={{ left: `${hoverPercent ?? progressPercent}%`, transform: "translateX(-50%)" }}
          >
            <div className="flex flex-col items-center drop-shadow-xl origin-bottom transition-all duration-300 ease-[cubic-bezier(0.34,1.56,0.64,1)] opacity-0 scale-75 translate-y-2 group-hover:opacity-100 group-hover:scale-100 group-hover:translate-y-0">
              <div className="bg-white rounded-xl px-4 py-3 flex flex-col items-center gap-1 relative z-10 shadow-2xl shadow-black/30 ring-2 ring-aurora-500/20">
                <span className="text-base font-bold text-surface-900 leading-none tracking-tight">
                  {formatTime(trackDuration ? (trackDuration * (hoverPercent ?? progressPercent)) / 100 : 0)}
                </span>
                <span className="text-xs font-semibold text-surface-600 leading-none">
                  {formatDelta(
                    trackDuration ? (trackDuration * (hoverPercent ?? progressPercent)) / 100 - progress : 0,
                  )}
                </span>
              </div>
              <div className="w-3 h-3 bg-white rotate-45 -mt-2 relative z-0 shadow-lg shadow-black/20 ring-2 ring-aurora-500/20" />
            </div>
          </div>
        </div>

        {/* Mobile: elapsed / duration under the seek bar */}
        <div className="flex items-center justify-between text-[11px] text-surface-500 font-mono lg:hidden">
          <span>{formatTime(progress)}</span>
          <span>{formatTime(trackDuration)}</span>
        </div>

        {/* Mobile — artwork + shuffle | centered prev/play/next | queue (no volume) */}
        <div className="relative flex items-center min-h-10 lg:hidden">
          <div className="flex flex-1 items-center gap-1.5 min-w-0">
            {onArtworkClick ? (
              <button
                type="button"
                onClick={onArtworkClick}
                className="flex items-center min-w-0 group text-left shrink-0"
              >
                <div className="w-11 h-11 rounded-xl overflow-hidden bg-surface-900/80 ring-1 ring-white/10 shrink-0">
                  <ArtworkImage
                    songId={song.id}
                    title={song.title}
                    artist={song.artist}
                    size="seeker"
                    className="w-full h-full object-cover"
                  />
                </div>
              </button>
            ) : (
              <div className="w-11 h-11 rounded-xl overflow-hidden bg-surface-900/80 ring-1 ring-white/10 shrink-0">
                <ArtworkImage
                  songId={song.id}
                  title={song.title}
                  artist={song.artist}
                  size="seeker"
                  className="w-full h-full object-cover"
                />
              </div>
            )}

            <button
              type="button"
              onClick={onToggleShuffle}
              className={`w-8 h-8 flex items-center justify-center transition-colors rounded-full hover:bg-white/5 ${shuffle ? "text-aurora-400" : "text-surface-400 hover:text-white"}`}
              aria-label="Shuffle"
              title="Shuffle"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                />
              </svg>
            </button>
          </div>

          <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 flex items-center justify-center gap-1 pointer-events-none">
            <button
              type="button"
              onClick={onPlayPrevious}
              className="pointer-events-auto w-8 h-8 flex items-center justify-center text-surface-400 hover:text-white transition-colors rounded-full hover:bg-white/5"
              aria-label="Previous"
            >
              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                <path d="M6 6h2v12H6zm3.5 6l8.5 6V6z" />
              </svg>
            </button>

            <button
              type="button"
              onClick={onTogglePlay}
              aria-label={isPlaying ? "Pause" : "Play"}
              className="pointer-events-auto w-9 h-9 rounded-full bg-white/90 backdrop-blur-sm flex items-center justify-center hover:bg-white hover:scale-105 active:scale-95 transition-all shadow-lg shadow-white/10"
            >
              {isPlaying ? (
                <svg className="w-4 h-4 text-surface-950" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M6 4h4v16H6V4zm8 0h4v16h-4V4z" />
                </svg>
              ) : (
                <svg className="w-4 h-4 text-surface-950 ml-0.5" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M8 5v14l11-7z" />
                </svg>
              )}
            </button>

            <button
              type="button"
              onClick={onPlayNext}
              className="pointer-events-auto w-8 h-8 flex items-center justify-center text-surface-400 hover:text-white transition-colors rounded-full hover:bg-white/5"
              aria-label="Next"
            >
              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                <path d="M6 18l8.5-6L6 6v12zM16 6v12h2V6h-2z" />
              </svg>
            </button>
          </div>

          <div className="flex flex-1 items-center justify-end gap-2 shrink-0">
            <button
              ref={queueButtonRef}
              type="button"
              onClick={onToggleQueue}
              className={`text-surface-400 hover:text-white transition-colors focus:outline-none focus:ring-2 focus:ring-aurora-500/50 rounded-lg p-1 ${queueOpen ? "text-aurora-400" : ""}`}
              aria-label="Queue"
              aria-expanded={queueOpen}
              aria-controls="playback-queue-drawer"
              title="Queue (Q)"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            </button>
          </div>
        </div>

        {/* Desktop — artwork, transport, volume */}
        <div className="hidden lg:flex items-center justify-between gap-3 sm:gap-4">
          {onArtworkClick ? (
            <button
              type="button"
              onClick={onArtworkClick}
              className="flex items-center gap-3 min-w-0 group text-left shrink-0"
            >
              <div className="w-11 h-11 sm:w-12 sm:h-12 rounded-xl overflow-hidden bg-surface-900/80 ring-1 ring-white/10 shrink-0">
                <ArtworkImage
                  songId={song.id}
                  title={song.title}
                  artist={song.artist}
                  size="seeker"
                  className="w-full h-full object-cover"
                />
              </div>
              <div className="min-w-0 hidden sm:block">
                <p className="text-sm font-semibold text-white truncate group-hover:text-aurora-300 transition-colors">
                  {song.title}
                </p>
                <p className="text-xs text-surface-400 truncate">{song.artist}</p>
              </div>
            </button>
          ) : (
            <div className="flex items-center gap-3 min-w-0 shrink-0">
              <div className="w-11 h-11 sm:w-12 sm:h-12 rounded-xl overflow-hidden bg-surface-900/80 ring-1 ring-white/10 shrink-0">
                <ArtworkImage
                  songId={song.id}
                  title={song.title}
                  artist={song.artist}
                  size="seeker"
                  className="w-full h-full object-cover"
                />
              </div>
              <div className="min-w-0 hidden sm:block">
                <p className="text-sm font-semibold text-white truncate">{song.title}</p>
                <p className="text-xs text-surface-400 truncate">{song.artist}</p>
              </div>
            </div>
          )}

          <div className="flex items-center justify-center gap-1 sm:gap-2">
            <button
              type="button"
              onClick={onToggleShuffle}
              className={`w-8 h-8 sm:w-9 sm:h-9 flex items-center justify-center transition-colors rounded-full hover:bg-white/5 ${shuffle ? "text-aurora-400" : "text-surface-400 hover:text-white"}`}
              aria-label="Shuffle"
              title="Shuffle"
            >
              <svg className="w-4 h-4 sm:w-5 sm:h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                />
              </svg>
            </button>

            <button
              type="button"
              onClick={onPlayPrevious}
              className="w-8 h-8 sm:w-9 sm:h-9 flex items-center justify-center text-surface-400 hover:text-white transition-colors rounded-full hover:bg-white/5"
              aria-label="Previous"
            >
              <svg className="w-4 h-4 sm:w-5 sm:h-5" fill="currentColor" viewBox="0 0 24 24">
                <path d="M6 6h2v12H6zm3.5 6l8.5 6V6z" />
              </svg>
            </button>

            <button
              type="button"
              onClick={onTogglePlay}
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
              type="button"
              onClick={onPlayNext}
              className="w-8 h-8 sm:w-9 sm:h-9 flex items-center justify-center text-surface-400 hover:text-white transition-colors rounded-full hover:bg-white/5"
              aria-label="Next"
            >
              <svg className="w-4 h-4 sm:w-5 sm:h-5" fill="currentColor" viewBox="0 0 24 24">
                <path d="M6 18l8.5-6L6 6v12zM16 6v12h2V6h-2z" />
              </svg>
            </button>
          </div>

          <div className="flex items-center justify-end gap-2 sm:gap-3 shrink-0">
            <span className="text-[11px] text-surface-500 font-mono">
              {formatTime(progress)} / {formatTime(trackDuration)}
            </span>

            <button
              ref={queueButtonRef}
              type="button"
              onClick={onToggleQueue}
              className={`text-surface-400 hover:text-white transition-colors focus:outline-none focus:ring-2 focus:ring-aurora-500/50 rounded-lg p-1 ${queueOpen ? "text-aurora-400" : ""}`}
              aria-label="Queue"
              aria-expanded={queueOpen}
              aria-controls="playback-queue-drawer"
              title="Queue (Q)"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            </button>

            <button
              type="button"
              onClick={onToggleMute}
              aria-label={volume === 0 ? "Unmute" : "Mute"}
              className="text-surface-400 hover:text-white transition-colors"
            >
              {volume === 0 ? (
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z"
                  />
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M17 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2"
                  />
                </svg>
              ) : volume < 0.5 ? (
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z"
                  />
                </svg>
              ) : (
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z"
                  />
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
  );
}

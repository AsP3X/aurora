// Human: Shared seek bar with hover time tooltip and optional sync markers for lyric editing.
// Agent: PROPS progress+duration+onSeek+markers; INTERNAL hoverPercent; EMITS onSeek(seconds).
import { useCallback, useState } from "react";

export interface SeekMarker {
  timeSeconds: number;
  label?: string;
}

interface SeekProgressBarProps {
  progress: number;
  duration: number;
  onSeek: (timeSeconds: number) => void;
  buffered?: number;
  disabled?: boolean;
  showTimeLabels?: boolean;
  className?: string;
  markers?: SeekMarker[];
  onMarkerClick?: (timeSeconds: number) => void;
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

export default function SeekProgressBar({
  progress,
  duration,
  onSeek,
  buffered = 0,
  disabled = false,
  showTimeLabels = true,
  className = "",
  markers = [],
  onMarkerClick,
}: SeekProgressBarProps) {
  const [hoverPercent, setHoverPercent] = useState<number | null>(null);

  // Human: Map mouse X on the bar to a percentage for the hover preview tooltip.
  // Agent: onMouseMove; SETS hoverPercent 0–100 from clientX/rect.width.
  const handleProgressMouseMove = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const pct = Math.max(0, Math.min(100, (x / rect.width) * 100));
    setHoverPercent(pct);
  }, []);

  // Human: Clear hover preview when the pointer leaves the seek track.
  // Agent: SETS hoverPercent null.
  const handleProgressMouseLeave = useCallback(() => {
    setHoverPercent(null);
  }, []);

  const max = duration > 0 ? duration : 1;
  const progressPercent = duration > 0 ? (progress / duration) * 100 : 0;
  const bufferedPercent = duration > 0 && buffered > 0 ? (buffered / duration) * 100 : 0;

  function handleSeekInput(e: React.ChangeEvent<HTMLInputElement>) {
    onSeek(Number(e.target.value));
  }

  return (
    <div className={className}>
      <div className="relative pt-4">
        {markers.map((marker, i) => {
          const leftPct = duration > 0 ? (marker.timeSeconds / duration) * 100 : 0;
          return (
            <button
              key={`${marker.timeSeconds}-${marker.label ?? i}`}
              type="button"
              disabled={disabled}
              title={
                marker.label
                  ? `Line ${marker.label} at ${formatTime(marker.timeSeconds)}`
                  : formatTime(marker.timeSeconds)
              }
              onClick={(e) => {
                e.stopPropagation();
                onMarkerClick?.(marker.timeSeconds);
                if (!disabled) onSeek(marker.timeSeconds);
              }}
              className="absolute bottom-[calc(100%-0.25rem)] -translate-x-1/2 z-20 flex flex-col items-center gap-0.5 focus:outline-none focus:ring-2 focus:ring-aurora-500/50 rounded disabled:opacity-40"
              style={{ left: `${leftPct}%` }}
            >
              {marker.label && (
                <span className="text-[10px] font-mono font-semibold text-aurora-300 bg-surface-900/90 border border-aurora-500/40 px-1 rounded">
                  {marker.label}
                </span>
              )}
              <span className="w-0.5 h-3 bg-aurora-400 rounded-full shadow-[0_0_6px_rgba(139,92,246,0.6)]" />
            </button>
          );
        })}

        <div
          className={`relative w-full h-2.5 group ${disabled ? "opacity-50 cursor-not-allowed" : "cursor-pointer"}`}
          onMouseMove={disabled ? undefined : handleProgressMouseMove}
          onMouseLeave={disabled ? undefined : handleProgressMouseLeave}
        >
          <div className="relative w-full h-full bg-surface-800/60 rounded-full overflow-hidden">
            {bufferedPercent > 0 && (
              <div
                className="absolute inset-y-0 left-0 bg-surface-500/40 rounded-full"
                style={{ width: `${bufferedPercent}%` }}
              />
            )}
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
            max={max}
            step={0.05}
            value={Math.min(progress, max)}
            onChange={handleSeekInput}
            disabled={disabled || duration <= 0}
            aria-label="Seek"
            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer disabled:cursor-not-allowed z-30"
          />

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
                  {formatDelta(
                    duration ? (duration * (hoverPercent ?? progressPercent)) / 100 - progress : 0,
                  )}
                </span>
              </div>
              <div className="w-3 h-3 bg-white rotate-45 -mt-2 relative z-0 shadow-lg shadow-black/20 ring-2 ring-aurora-500/20" />
            </div>
          </div>
        </div>
      </div>

      {showTimeLabels && (
        <div className="flex items-center justify-between text-xs text-surface-500 font-mono mt-1.5">
          <span>{formatTime(progress)}</span>
          <span>{formatTime(duration)}</span>
        </div>
      )}
    </div>
  );
}

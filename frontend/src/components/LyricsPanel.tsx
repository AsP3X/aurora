// Human: Full lyric strip slides vertically so the active line stays in the center row — one smooth transform.
// Agent: READS getNonEmptyLyricLines+activeLyricLineIndex; TRANSITION transform only; TYPOGRAPHY by offset −1/0/+1.
import { useEffect, useRef } from "react";
import type { LyricLine } from "../types";
import { activeLyricLineIndex, getNonEmptyLyricLines } from "../utils/lyrics";

interface LyricsPanelProps {
  lines: LyricLine[];
  currentTimeMs: number;
  synced: boolean;
  className?: string;
}

const LINE_HEIGHT_REM = 2.75;

// Human: Style rows by distance from the active line; far rows stay in the strip but invisible.
// Agent: OFFSET −1|0|+1 → classes; |offset|>1 → opacity-0; NO per-line transform transitions.
function lineClassForOffset(offset: number): string {
  const base =
    "h-11 shrink-0 flex items-center justify-center text-center leading-snug px-3 max-w-full";

  if (offset === 0) {
    return `${base} text-white font-semibold text-base sm:text-lg tracking-tight animate-lyrics-current-glow z-10`;
  }
  if (Math.abs(offset) === 1) {
    return `${base} text-surface-500 text-sm sm:text-base font-medium opacity-65 truncate`;
  }
  return `${base} text-transparent text-sm opacity-0 pointer-events-none select-none`;
}

export default function LyricsPanel({
  lines,
  currentTimeMs,
  synced,
  className = "",
}: LyricsPanelProps) {
  const content = getNonEmptyLyricLines(lines);
  const prevActivePosRef = useRef(0);
  const isFirstRenderRef = useRef(true);

  let activePos = 0;
  if (content.length > 0 && synced) {
    const activeIndex = activeLyricLineIndex(lines, currentTimeMs);
    const found = content.findIndex((c) => c.index === activeIndex);
    activePos = found >= 0 ? found : 0;
  }

  const translateY = `${(1 - activePos) * LINE_HEIGHT_REM}rem`;
  const stepDelta = Math.abs(activePos - prevActivePosRef.current);
  const transitionMs = isFirstRenderRef.current
    ? 0
    : stepDelta <= 1
      ? 520
      : Math.min(720, 320 + stepDelta * 80);

  useEffect(() => {
    isFirstRenderRef.current = false;
    prevActivePosRef.current = activePos;
  }, [activePos]);

  if (content.length === 0) {
    return null;
  }

  return (
    <div
      className={`w-full overflow-hidden ${className.includes("max-w-") ? "" : "max-w-md mx-auto"} ${className}`}
      style={{ height: `${LINE_HEIGHT_REM * 3}rem` }}
      aria-live="polite"
      aria-atomic="true"
    >
      <div
        className="lyrics-carousel-track"
        style={{
          transform: `translate3d(0, ${translateY}, 0)`,
          transition: `transform ${transitionMs}ms cubic-bezier(0.22, 1, 0.36, 1)`,
        }}
      >
        {content.map((entry, i) => {
          const offset = i - activePos;
          return (
            <p key={entry.index} className={lineClassForOffset(offset)}>
              {entry.line.text}
            </p>
          );
        })}
      </div>
    </div>
  );
}

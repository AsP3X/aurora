// Human: Player lyrics — compact 3-line carousel or full scroll list, both honor sync timestamps.
// Agent: READS getNonEmptyLyricLines+activeLyricLineIndex; MODES carousel|scroll; scroll CALLS scrollIntoView on active row.
import { useEffect, useRef } from "react";
import type { LyricLine } from "../types";
import { activeLyricLineIndex, getNonEmptyLyricLines } from "../utils/lyrics";

// Human: Compact karaoke strip vs full song text with follow-scroll.
// Agent: UNION carousel|scroll; CONSUMED by LyricsPanel and Player toggle.
export type LyricsViewMode = "carousel" | "scroll";

interface LyricsPanelProps {
  lines: LyricLine[];
  currentTimeMs: number;
  synced: boolean;
  mode?: LyricsViewMode;
  className?: string;
}

const LINE_HEIGHT_REM = 2.75;

// Human: Resolve which non-empty row is active for both carousel and scroll layouts.
// Agent: PURE; synced → activeLyricLineIndex; ELSE activePos 0.
function resolveActivePosition(
  lines: LyricLine[],
  content: { line: LyricLine; index: number }[],
  currentTimeMs: number,
  synced: boolean,
): number {
  if (content.length === 0) return 0;
  if (!synced) return 0;
  const activeIndex = activeLyricLineIndex(lines, currentTimeMs);
  const found = content.findIndex((c) => c.index === activeIndex);
  return found >= 0 ? found : 0;
}

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

// Human: Style each row in full-scroll mode — past, current, and upcoming lines read differently.
// Agent: isActive → glow; isPast → muted; ELSE upcoming dim.
function lineClassForScroll(isActive: boolean, isPast: boolean): string {
  const base =
    "min-h-11 py-2 flex items-center justify-center text-center leading-snug px-3 max-w-full scroll-mt-8 scroll-mb-8";

  if (isActive) {
    return `${base} text-white font-semibold text-base sm:text-lg tracking-tight animate-lyrics-current-glow`;
  }
  if (isPast) {
    return `${base} text-surface-500 text-sm sm:text-base font-medium opacity-55`;
  }
  return `${base} text-surface-400 text-sm sm:text-base font-medium opacity-40`;
}

// Human: Segmented control to switch between 3-line karaoke and full scroll lyrics (player top bar).
// Agent: PURE UI; PROPS mode+onModeChange; aria-pressed; h-11 shell matches LyricsToggleButton in Player.
export function LyricsViewModeToggle({
  mode,
  onModeChange,
  className = "",
}: {
  mode: LyricsViewMode;
  onModeChange: (mode: LyricsViewMode) => void;
  className?: string;
}) {
  const optionClass = (active: boolean) =>
    `flex h-9 w-9 items-center justify-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-aurora-500/50 ${
      active
        ? "bg-aurora-500/25 text-aurora-200"
        : "text-surface-400 hover:bg-white/5 hover:text-surface-200"
    }`;

  return (
    <div
      role="group"
      aria-label="Lyrics display mode"
      className={`inline-flex h-11 shrink-0 items-center gap-0.5 rounded-full border border-white/15 bg-white/5 p-0.5 backdrop-blur-xl ${className}`}
    >
      <button
        type="button"
        onClick={() => onModeChange("carousel")}
        aria-label="Compact lyrics — three-line karaoke window"
        aria-pressed={mode === "carousel"}
        className={optionClass(mode === "carousel")}
      >
        {/* Human: Framed trio of lines — middle row emphasized = “3 visible lines” karaoke. */}
        {/* Agent: ICON carousel; VIEWPORT rect + 3 strokes; CENTER strokeWidth 2.5. */}
        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden>
          <rect x="5" y="4" width="14" height="16" rx="3" strokeWidth={1.75} />
          <path strokeLinecap="round" strokeWidth={1.5} d="M8 9h8" opacity={0.45} />
          <path strokeLinecap="round" strokeWidth={2.25} d="M8 12h8" />
          <path strokeLinecap="round" strokeWidth={1.5} d="M8 15h8" opacity={0.45} />
        </svg>
      </button>
      <button
        type="button"
        onClick={() => onModeChange("scroll")}
        aria-label="Full lyrics — scroll entire song text"
        aria-pressed={mode === "scroll"}
        className={optionClass(mode === "scroll")}
      >
        {/* Human: Tall lyric block with scroll chevrons = full song text you can scroll. */}
        {/* Agent: ICON scroll; MULTI lines + chevron up/down at right. */}
        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden>
          <path
            strokeLinecap="round"
            strokeWidth={1.5}
            d="M6 5.5h9M6 8.5h9M6 11.5h9M6 14.5h7M6 17.5h5"
          />
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M17 7.5v9M14.5 9.5L17 7.5 19.5 9.5M14.5 14.5L17 16.5 19.5 14.5"
          />
        </svg>
      </button>
    </div>
  );
}

// Human: Three-line karaoke strip — active line centered via vertical transform.
// Agent: TRANSITION transform; HEIGHT 3×LINE_HEIGHT_REM; TYPOGRAPHY by offset.
function LyricsCarouselView({
  content,
  activePos,
  className,
}: {
  content: { line: LyricLine; index: number }[];
  activePos: number;
  className: string;
}) {
  const prevActivePosRef = useRef(0);
  const isFirstRenderRef = useRef(true);

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

// Human: Full song text in a scroll region — playhead keeps the active line centered.
// Agent: REF active row; EFFECT scrollIntoView smooth center; PAST/ACTIVE/FUTURE styles.
function LyricsScrollView({
  content,
  activePos,
  className,
}: {
  content: { line: LyricLine; index: number }[];
  activePos: number;
  className: string;
}) {
  const activeLineRef = useRef<HTMLParagraphElement>(null);
  const isFirstScrollRef = useRef(true);

  useEffect(() => {
    const activeEl = activeLineRef.current;
    if (!activeEl) return;
    const behavior: ScrollBehavior = isFirstScrollRef.current ? "auto" : "smooth";
    isFirstScrollRef.current = false;
    activeEl.scrollIntoView({ block: "center", behavior });
  }, [activePos]);

  return (
    <div
      className={`lyrics-scroll-panel relative flex min-h-0 w-full flex-1 flex-col overflow-y-auto overscroll-y-contain scroll-smooth py-6 [mask-image:linear-gradient(to_bottom,transparent,black_12%,black_88%,transparent)] ${className.includes("max-w-") ? "" : "max-w-md mx-auto"} ${className}`}
      aria-live="polite"
    >
      {content.map((entry, i) => {
        const isActive = i === activePos;
        const isPast = i < activePos;
        return (
          <p
            key={entry.index}
            ref={isActive ? activeLineRef : undefined}
            className={lineClassForScroll(isActive, isPast)}
          >
            {entry.line.text}
          </p>
        );
      })}
    </div>
  );
}

export default function LyricsPanel({
  lines,
  currentTimeMs,
  synced,
  mode = "carousel",
  className = "",
}: LyricsPanelProps) {
  const content = getNonEmptyLyricLines(lines);
  const activePos = resolveActivePosition(lines, content, currentTimeMs, synced);

  if (content.length === 0) {
    return null;
  }

  if (mode === "scroll") {
    return <LyricsScrollView content={content} activePos={activePos} className={className} />;
  }

  return <LyricsCarouselView content={content} activePos={activePos} className={className} />;
}

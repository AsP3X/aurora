// Human: Shared helpers for synced lyric display and admin timestamp formatting.
// Agent: PURE functions; READS LyricLine[] + currentTimeMs; NO side effects.
import type { LyricLine } from "../types";

// Human: Format milliseconds as m:ss for sync badges in the admin editor.
// Agent: INPUT ms number; OUTPUT "m:ss" string; FLOORS seconds.
export function formatLyricTime(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

// Human: Pick the active line index for karaoke highlighting based on playback position.
// Agent: FILTERS lines with start_ms; RETURNS last index where start_ms <= currentTimeMs; -1 if none.
export function activeLyricLineIndex(lines: LyricLine[], currentTimeMs: number): number {
  let active = -1;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.start_ms == null || line.text.trim() === "") continue;
    if (line.start_ms <= currentTimeMs) {
      active = i;
    } else {
      break;
    }
  }
  return active;
}

export interface LyricCarouselSlot {
  text: string | null;
  lineIndex: number | null;
}

export interface LyricCarouselWindow {
  prev: LyricCarouselSlot;
  current: LyricCarouselSlot;
  next: LyricCarouselSlot;
  activeLineIndex: number;
}

// Human: Non-empty lyric rows for player carousel (preserves original line indices).
// Agent: MAPS lines with index; FILTERS trim(text).length > 0.
export function getNonEmptyLyricLines(lines: LyricLine[]): { line: LyricLine; index: number }[] {
  return lines
    .map((line, index) => ({ line, index }))
    .filter(({ line }) => line.text.trim().length > 0);
}

// Human: Previous / current / next slots for the 3-line player carousel.
// Agent: READS activeLyricLineIndex when synced; FALLBACK first line before first timestamp.
export function getLyricCarouselWindow(
  lines: LyricLine[],
  currentTimeMs: number,
  synced: boolean,
): LyricCarouselWindow | null {
  const content = getNonEmptyLyricLines(lines);
  if (content.length === 0) return null;

  let activeLineIndex = synced ? activeLyricLineIndex(lines, currentTimeMs) : -1;
  let activePos = content.findIndex((c) => c.index === activeLineIndex);
  if (activePos < 0) {
    activePos = 0;
    activeLineIndex = content[0].index;
  }

  const prevEntry = activePos > 0 ? content[activePos - 1] : null;
  const currentEntry = content[activePos];
  const nextEntry = activePos < content.length - 1 ? content[activePos + 1] : null;

  return {
    prev: {
      text: prevEntry?.line.text ?? null,
      lineIndex: prevEntry?.index ?? null,
    },
    current: {
      text: currentEntry.line.text,
      lineIndex: currentEntry.index,
    },
    next: {
      text: nextEntry?.line.text ?? null,
      lineIndex: nextEntry?.index ?? null,
    },
    activeLineIndex: currentEntry.index,
  };
}

// Human: Split pasted plain text into lyric lines for the admin editor.
// Agent: SPLIT on newlines; TRIM; DROP empty trailing-only runs optional — keeps blank spacer lines as "".
export function parsePlainLyricsText(text: string): LyricLine[] {
  return text
    .split(/\r?\n/)
    .map((line) => ({ text: line.trimEnd() }))
    .filter((line, i, arr) => {
      if (line.text.length > 0) return true;
      return arr.slice(i + 1).some((l) => l.text.length > 0);
    });
}

export interface LyricSeekMarker {
  timeSeconds: number;
  label: string;
  lineIndex: number;
}

// Human: Index of the synced line immediately before the playhead (context anchor while syncing forward).
// Agent: SCANS lines; RETURNS index with max start_ms where start_ms <= currentTimeMs; -1 if none.
export function getLastPassedSyncIndex(lines: LyricLine[], currentTimeMs: number): number {
  let lastIndex = -1;
  let lastMs = -1;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.start_ms == null || line.text.trim() === "") continue;
    if (line.start_ms <= currentTimeMs && line.start_ms > lastMs) {
      lastMs = line.start_ms;
      lastIndex = i;
    }
  }
  return lastIndex;
}

// Human: Sync editor list — unsynced rows, synced rows ahead of playhead, plus only the last passed sync for context.
// Agent: RETURNS true for unsynced; start_ms > currentTimeMs; OR index === getLastPassedSyncIndex; EMPTY text hidden.
export function isLyricLineVisibleAtSeek(
  line: LyricLine,
  lineIndex: number,
  lines: LyricLine[],
  currentTimeMs: number,
): boolean {
  if (line.text.trim() === "") return false;
  if (line.start_ms == null) return true;
  if (line.start_ms > currentTimeMs) return true;
  return lineIndex === getLastPassedSyncIndex(lines, currentTimeMs);
}

// Human: Build the filtered list of editable rows for the current seek position.
// Agent: MAPS lines to {index,line}; FILTERS isLyricLineVisibleAtSeek with full lines context.
export function getVisibleLineEntries(
  lines: LyricLine[],
  currentTimeMs: number,
): { index: number; line: LyricLine }[] {
  return lines
    .map((line, index) => ({ index, line }))
    .filter(({ line, index }) => isLyricLineVisibleAtSeek(line, index, lines, currentTimeMs));
}

// Human: Markers on the seek bar for each line that already has a timestamp.
// Agent: READS lines with start_ms; OUTPUTS LyricSeekMarker[] sorted by timeSeconds.
export function getLyricSeekMarkers(lines: LyricLine[]): LyricSeekMarker[] {
  return lines
    .map((line, lineIndex) => ({ line, lineIndex }))
    .filter(({ line }) => line.start_ms != null && line.text.trim() !== "")
    .map(({ line, lineIndex }) => ({
      timeSeconds: (line.start_ms ?? 0) / 1000,
      label: String(lineIndex + 1),
      lineIndex,
    }))
    .sort((a, b) => a.timeSeconds - b.timeSeconds);
}

// Human: After syncing, focus the next row still visible ahead of the playhead.
// Agent: SCANS lines after fromIndex; RETURNS first index passing isLyricLineVisibleAtSeek or fromIndex+1 fallback.
export function nextVisibleLineIndex(
  lines: LyricLine[],
  fromIndex: number,
  currentTimeMs: number,
): number {
  for (let i = fromIndex + 1; i < lines.length; i++) {
    if (isLyricLineVisibleAtSeek(lines[i], i, lines, currentTimeMs)) return i;
  }
  const first = lines.findIndex((l, i) => isLyricLineVisibleAtSeek(l, i, lines, currentTimeMs));
  return first >= 0 ? first : Math.min(fromIndex, lines.length - 1);
}

// Human: Seek bars and keyboard shortcuts need one trustworthy track length — media when known, else catalog metadata.
// Agent: PURE resolveTrackDuration + readMediaDurationSeconds; IGNORES NaN/Infinity/≤0 from HTMLMediaElement.

/** Human: Use the browser-reported length when it is a normal finite number; otherwise fall back to API `duration_seconds`. */
// Agent: PURE; PREFERS mediaDuration when finite and > 0; ELSE catalogDurationSeconds; RETURNS 0 if neither valid.
export function resolveTrackDuration(
  mediaDuration: number,
  catalogDurationSeconds = 0,
): number {
  if (Number.isFinite(mediaDuration) && mediaDuration > 0) {
    return mediaDuration;
  }
  if (Number.isFinite(catalogDurationSeconds) && catalogDurationSeconds > 0) {
    return catalogDurationSeconds;
  }
  return 0;
}

/** Human: Read `<audio>.duration` only when the element actually knows the track length (HLS often reports Infinity first). */
// Agent: READS audio.duration; RETURNS seconds or null when NaN/Infinity/≤0.
export function readMediaDurationSeconds(audio: HTMLAudioElement): number | null {
  const d = audio.duration;
  if (Number.isFinite(d) && d > 0) {
    return d;
  }
  return null;
}

/** Human: Keep the playhead percent from exceeding 100% when duration shrinks after metadata loads. */
// Agent: PURE clamp; MIN(progress, trackDuration) when trackDuration > 0.
export function clampProgressToTrack(progress: number, trackDuration: number): number {
  if (trackDuration > 0) {
    return Math.min(progress, trackDuration);
  }
  return progress;
}

// Human: Admin-only lyrics editor — paste text, sync timestamps to audio, save to API.
// Agent: ROUTE /admin/library/:songId/lyrics; CALLS saveAdminSongLyrics; LOCAL audio+Hls preview; REQUIRES admin.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import Hls from "hls.js";
import {
  ApiError,
  deleteAdminSongLyrics,
  fetchAdminSongLyrics,
  fetchSong,
  fetchStreamUrl,
  saveAdminSongLyrics,
} from "../../api/client";
import ArtworkImage from "../../components/ArtworkImage";
import SeekProgressBar from "../../components/SeekProgressBar";
import GlassButton from "../../components/admin/GlassButton";
import PageHeader from "../../components/admin/PageHeader";
import type { LyricLine, Song } from "../../types";
import {
  formatLyricTime,
  getLyricSeekMarkers,
  getVisibleLineEntries,
  isLyricLineVisibleAtSeek,
  nextVisibleLineIndex,
  parseLyricsImportText,
  serializeLyricsWithTimestamps,
} from "../../utils/lyrics";

export default function AdminLyricsEditorPage() {
  const { songId } = useParams<{ songId: string }>();
  const navigate = useNavigate();
  const audioRef = useRef<HTMLAudioElement>(null);
  const hlsRef = useRef<Hls | null>(null);

  const [song, setSong] = useState<Song | null>(null);
  const [lines, setLines] = useState<LyricLine[]>([{ text: "" }]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [importText, setImportText] = useState("");
  const [copyFeedback, setCopyFeedback] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [audioReady, setAudioReady] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [hasExisting, setHasExisting] = useState(false);
  // Human: On phones, tuck import/export behind a toggle so the sync list stays above the fold.
  // Agent: STATE importPanelOpen; TOGGLES mobile import section; DESKTOP always shows import in sidebar.
  const [importPanelOpen, setImportPanelOpen] = useState(false);
  // Human: Overflow menu on mobile keeps delete/preview/copy reachable without crowding the dock.
  // Agent: STATE mobileMoreOpen; RENDERS popover; CLOSES on outside tap via backdrop.
  const [mobileMoreOpen, setMobileMoreOpen] = useState(false);

  // Human: Load song metadata and any existing lyrics row (404 → start from one blank line).
  // Agent: PARALLEL fetchSong + fetchAdminSongLyrics; SETS lines or default; DEP [songId].
  useEffect(() => {
    if (!songId) return;
    let cancelled = false;
    setLoading(true);
    setError("");

    Promise.all([
      fetchSong(songId),
      fetchAdminSongLyrics(songId).catch((e) => {
        if (e instanceof ApiError && e.status === 404) return null;
        throw e;
      }),
    ])
      .then(([songData, lyrics]) => {
        if (cancelled) return;
        setSong(songData);
        if (lyrics) {
          setLines(lyrics.lines.length > 0 ? lyrics.lines : [{ text: "" }]);
          setHasExisting(true);
        } else {
          setLines([{ text: "" }]);
          setHasExisting(false);
        }
      })
      .catch((e: unknown) => {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "Failed to load");
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [songId]);

  // Human: Attach HLS or direct stream URL to the preview audio element for sync workflow.
  // Agent: READS song.hls_ready; USES Hls.js with auth header or audio.src; CLEANUP destroy Hls.
  useEffect(() => {
    if (!song || !audioRef.current) return;
    const audio = audioRef.current;
    let cancelled = false;

    async function loadAudio() {
      setAudioReady(false);
      if (hlsRef.current) {
        hlsRef.current.destroy();
        hlsRef.current = null;
      }

      const apiBase =
        import.meta.env.VITE_API_URL ||
        `${window.location.protocol}//${window.location.hostname}:3000/api/v1`;

      let url: string;
      try {
        if (song!.hls_ready) {
          url = `${apiBase}/songs/${song!.id}/playlist`;
        } else {
          url = await fetchStreamUrl(song!.id);
        }
      } catch {
        url = `${apiBase}/songs/${song!.id}/stream`;
      }

      if (cancelled) return;

      if (url.endsWith("/playlist") && Hls.isSupported()) {
        const hls = new Hls({
          enableWorker: true,
          xhrSetup: (xhr) => {
            const token = localStorage.getItem("aurora_token");
            if (token) xhr.setRequestHeader("Authorization", `Bearer ${token}`);
          },
        });
        hls.loadSource(url);
        hls.attachMedia(audio);
        hlsRef.current = hls;
      } else if (url.endsWith("/playlist") && audio.canPlayType("application/vnd.apple.mpegurl")) {
        audio.src = url;
      } else {
        audio.src = url;
      }
      setCurrentTime(0);
      setAudioReady(true);
    }

    void loadAudio();

    return () => {
      cancelled = true;
      if (hlsRef.current) {
        hlsRef.current.destroy();
        hlsRef.current = null;
      }
    };
  }, [song]);

  // Human: Mirror audio element time into React state for sync buttons and the seek bar.
  // Agent: LISTENS timeupdate on audioRef; SETS currentTime seconds.
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    const onTime = () => setCurrentTime(audio.currentTime);
    const onPlay = () => setIsPlaying(true);
    const onPause = () => setIsPlaying(false);
    audio.addEventListener("timeupdate", onTime);
    audio.addEventListener("play", onPlay);
    audio.addEventListener("pause", onPause);
    return () => {
      audio.removeEventListener("timeupdate", onTime);
      audio.removeEventListener("play", onPlay);
      audio.removeEventListener("pause", onPause);
    };
  }, [audioReady]);

  // Human: Track real media duration from the element when HLS/metadata loads (fallback is song metadata).
  // Agent: LISTENS loadedmetadata+durationchange; SETS duration when finite and > 0; DEP [audioReady, song?.duration_seconds].
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const updateDuration = () => {
      if (Number.isFinite(audio.duration) && audio.duration > 0) {
        setDuration(audio.duration);
      }
    };

    updateDuration();
    audio.addEventListener("loadedmetadata", updateDuration);
    audio.addEventListener("durationchange", updateDuration);
    return () => {
      audio.removeEventListener("loadedmetadata", updateDuration);
      audio.removeEventListener("durationchange", updateDuration);
    };
  }, [audioReady, song?.duration_seconds]);

  // Human: Seed seek bar max from catalog duration until the stream reports its own length.
  // Agent: EFFECT sets duration from song.duration_seconds when audio duration still unknown.
  useEffect(() => {
    if (song && duration === 0) {
      setDuration(song.duration_seconds);
    }
  }, [song, duration]);

  const syncLineAt = useCallback(
    (index: number) => {
      const ms = Math.round(currentTime * 1000);
      setLines((prev) => {
        const updated = prev.map((line, i) =>
          i === index ? { ...line, start_ms: ms } : line,
        );
        setSelectedIndex(nextVisibleLineIndex(updated, index, ms));
        return updated;
      });
    },
    [currentTime],
  );

  const currentTimeMs = Math.round(currentTime * 1000);

  const visibleLineEntries = useMemo(
    () => getVisibleLineEntries(lines, currentTimeMs),
    [lines, currentTimeMs],
  );

  const seekMarkers = useMemo(
    () =>
      getLyricSeekMarkers(lines).map((m) => ({
        timeSeconds: m.timeSeconds,
        label: m.label,
      })),
    [lines],
  );

  // Human: If the playhead passes the selected row, jump selection to the next visible line.
  // Agent: EFFECT [currentTimeMs, lines]; READS selectedIndex; MAY SET selectedIndex to first visible.
  useEffect(() => {
    if (lines.length === 0) return;
    const selected = lines[selectedIndex];
    if (selected && isLyricLineVisibleAtSeek(selected, selectedIndex, lines, currentTimeMs)) return;
    const first = lines.findIndex((l, i) => isLyricLineVisibleAtSeek(l, i, lines, currentTimeMs));
    if (first >= 0) setSelectedIndex(first);
  }, [currentTimeMs, lines, selectedIndex]);

  // Human: Spacebar syncs the selected line and auto-advances; ignored while typing in inputs.
  // Agent: KEYDOWN Space preventDefault; CALLS syncLineAt(selectedIndex); ADVANCES selection inside syncLineAt.
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.code !== "Space") return;
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;
      e.preventDefault();
      syncLineAt(selectedIndex);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [selectedIndex, syncLineAt]);

  // Human: Replace editor lines from the import textarea (plain or [timestamp] lines).
  // Agent: CALLS parseLyricsImportText; SETS lines + selectedIndex 0; CLEARS importText.
  function applyImport() {
    const parsed = parseLyricsImportText(importText);
    if (parsed.length === 0) return;
    setLines(parsed);
    setSelectedIndex(0);
    setImportText("");
    setError("");
    setImportPanelOpen(false);
  }

  // Human: Copy all lines to the clipboard in import-compatible [m:ss] format.
  // Agent: CALLS serializeLyricsWithTimestamps; WRITES navigator.clipboard; TOAST copyFeedback 2s.
  async function handleCopyWithTimestamps() {
    const text = serializeLyricsWithTimestamps(lines);
    try {
      await navigator.clipboard.writeText(text);
      setCopyFeedback(true);
      window.setTimeout(() => setCopyFeedback(false), 2000);
      setMobileMoreOpen(false);
    } catch {
      setError("Could not copy to clipboard");
    }
  }

  function updateLineText(index: number, text: string) {
    setLines((prev) => prev.map((line, i) => (i === index ? { ...line, text } : line)));
  }

  function addLine() {
    setLines((prev) => [...prev, { text: "" }]);
    setSelectedIndex(lines.length);
  }

  function removeLine(index: number) {
    setLines((prev) => {
      const next = prev.filter((_, i) => i !== index);
      return next.length > 0 ? next : [{ text: "" }];
    });
    setSelectedIndex((i) => Math.max(0, Math.min(i, lines.length - 2)));
  }

  function clearTimestamp(index: number) {
    setLines((prev) =>
      prev.map((line, i) => (i === index ? { ...line, start_ms: null } : line)),
    );
  }

  async function handleSave() {
    if (!songId) return;
    setSaving(true);
    setError("");
    try {
      const saved = await saveAdminSongLyrics(songId, lines);
      setLines(saved.lines);
      setHasExisting(true);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to save lyrics");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!songId || !hasExisting) return;
    if (!window.confirm("Delete all lyrics for this song?")) return;
    setSaving(true);
    setError("");
    setMobileMoreOpen(false);
    try {
      await deleteAdminSongLyrics(songId);
      setLines([{ text: "" }]);
      setHasExisting(false);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to delete lyrics");
    } finally {
      setSaving(false);
    }
  }

  function togglePlay() {
    const audio = audioRef.current;
    if (!audio) return;
    if (audio.paused) void audio.play();
    else audio.pause();
  }

  // Human: Scrub preview playback so admins can re-sync earlier lines without restarting the track.
  // Agent: WRITES audioRef.currentTime; SETS currentTime state for sync timestamps.
  function handleSeek(t: number) {
    setCurrentTime(t);
    if (audioRef.current) {
      audioRef.current.currentTime = t;
    }
  }

  // Human: Tapping a marker on the seek bar selects that lyric row for re-sync.
  // Agent: FINDS marker by time; SETS selectedIndex to lineIndex when within 50ms.
  const handleMarkerClick = useCallback(
    (t: number) => {
      const hit = getLyricSeekMarkers(lines).find((m) => Math.abs(m.timeSeconds - t) < 0.05);
      if (hit) setSelectedIndex(hit.lineIndex);
    },
    [lines],
  );

  const maxDuration = duration > 0 ? duration : song?.duration_seconds ?? 0;

  const seekBar = (
    <SeekProgressBar
      progress={currentTime}
      duration={maxDuration}
      onSeek={handleSeek}
      disabled={!audioReady || maxDuration <= 0}
      markers={seekMarkers}
      onMarkerClick={handleMarkerClick}
    />
  );

  // Human: Shared import/export block for sidebar (desktop) and collapsible panel (mobile).
  // Agent: RENDERS textarea + import/copy buttons; PROPS idPrefix for label htmlFor.
  function renderImportExportPanel(idPrefix: string) {
    return (
      <div>
        <label
          htmlFor={`${idPrefix}-import`}
          className="block text-xs font-medium text-surface-400 mb-2"
        >
          Import / export lyrics
        </label>
        <p className="text-[11px] text-surface-500 mb-2 leading-relaxed">
          Plain text (one line per row) or synced lines like{" "}
          <span className="font-mono text-surface-400">[0:12.500] Lyric text</span>. Unsynced lines
          paste without a timestamp.
        </p>
        <textarea
          id={`${idPrefix}-import`}
          value={importText}
          onChange={(e) => setImportText(e.target.value)}
          rows={5}
          placeholder={"[0:12] First line\n[0:45.250] Second line\nPlain line without timestamp"}
          className="w-full rounded-xl bg-surface-900 border border-white/10 px-3 py-2 text-sm text-white placeholder:text-surface-600 focus:outline-none focus:ring-2 focus:ring-aurora-500/40 font-mono"
        />
        <div className="mt-2 flex flex-col gap-2 sm:flex-row lg:flex-col">
          <GlassButton
            type="button"
            className="w-full"
            onClick={() => void applyImport()}
            disabled={!importText.trim()}
          >
            Import lyrics
          </GlassButton>
          <GlassButton
            type="button"
            className="w-full"
            onClick={() => void handleCopyWithTimestamps()}
            disabled={lines.every((l) => !l.text.trim())}
          >
            {copyFeedback ? "Copied!" : "Copy with timestamps"}
          </GlassButton>
        </div>
      </div>
    );
  }

  // Human: One list UI for desktop and mobile — mobile uses larger tap targets on row actions.
  // Agent: MAPS visibleLineEntries; CALLS syncLineAt, updateLineText, clearTimestamp, removeLine.
  function renderLineList() {
    if (visibleLineEntries.length === 0) {
      return (
        <p className="text-sm text-surface-500 text-center py-6 rounded-xl border border-dashed border-white/10">
          No lines ahead of the playhead. Drag the seek bar left to bring back synced lines, or save
          when finished.
        </p>
      );
    }

    return visibleLineEntries.map(({ index, line }) => (
      <LyricLineRow
        key={index}
        index={index}
        line={line}
        selected={index === selectedIndex}
        currentTimeMs={currentTimeMs}
        onSelect={() => setSelectedIndex(index)}
        onUpdateText={(text) => updateLineText(index, text)}
        onSync={() => syncLineAt(index)}
        onClearTimestamp={() => clearTimestamp(index)}
        onRemove={() => removeLine(index)}
      />
    ));
  }

  if (loading) {
    return <p className="text-surface-400">Loading lyrics editor…</p>;
  }

  if (!song || !songId) {
    return <p className="text-red-400">Song not found.</p>;
  }

  return (
    <div className="space-y-4 lg:space-y-6 pb-[calc(13.5rem+env(safe-area-inset-bottom,0px))] lg:pb-0">
      <PageHeader title="Lyrics" subtitle={`${song.title} — ${song.artist}`}>
        <Link
          to="/admin/library"
          className="text-sm text-surface-400 hover:text-white transition-colors min-h-[44px] inline-flex items-center"
        >
          Back to library
        </Link>
      </PageHeader>

      {error && (
        <p className="text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-2">
          {error}
        </p>
      )}

      <audio ref={audioRef} className="hidden" preload="metadata" />

      {/* Human: Compact track row on small screens — full artwork block stays in the desktop sidebar. */}
      {/* Agent: lg:hidden; READS song; RENDERS ArtworkImage 56px + title/artist truncate. */}
      <div className="flex gap-3 items-center lg:hidden">
        <ArtworkImage
          songId={song.id}
          title={song.title}
          artist={song.artist}
          className="w-14 h-14 rounded-xl object-cover bg-surface-900 shrink-0"
        />
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-white truncate">{song.title}</p>
          <p className="text-sm text-aurora-400 truncate">{song.artist}</p>
          <p className="text-[11px] text-surface-500 mt-0.5">
            Line {selectedIndex + 1} of {lines.length}
            {lines[selectedIndex]?.start_ms != null
              ? ` · ${formatLyricTime(lines[selectedIndex].start_ms!)}`
              : " · not synced"}
          </p>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,280px)_1fr]">
        {/* Human: Desktop sidebar — artwork, transport hint, import/export (hidden on mobile). */}
        {/* Agent: hidden lg:block; CONTAINS play/sync card + renderImportExportPanel('desktop'). */}
        <aside className="hidden lg:block space-y-4">
          <div className="flex gap-4 items-center">
            <ArtworkImage
              songId={song.id}
              title={song.title}
              artist={song.artist}
              className="w-20 h-20 rounded-xl object-cover bg-surface-900"
            />
            <div>
              <p className="font-semibold text-white truncate">{song.title}</p>
              <p className="text-sm text-aurora-400 truncate">{song.artist}</p>
            </div>
          </div>

          <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
            <div className="flex items-center justify-center gap-3">
              <GlassButton type="button" onClick={togglePlay} disabled={!audioReady}>
                {isPlaying ? "Pause" : "Play"}
              </GlassButton>
              <GlassButton
                type="button"
                onClick={() => syncLineAt(selectedIndex)}
                disabled={!audioReady}
              >
                Sync line (Space)
              </GlassButton>
            </div>
            <p className="text-xs text-surface-500 text-center mt-3">
              Synced lines move to markers on the bar. Seek backward to edit lines you passed.
            </p>
          </div>

          {renderImportExportPanel("desktop")}
        </aside>

        <section className="space-y-3 min-w-0">
          {/* Human: Sticky seek on desktop only — mobile uses the bottom dock. */}
          {/* Agent: hidden lg:block sticky top-0 z-10; WRAPS seekBar. */}
          <div className="hidden lg:block rounded-2xl border border-white/10 bg-white/[0.03] p-4 sticky top-0 z-10 backdrop-blur-md">
            {seekBar}
          </div>

          {renderLineList()}

          <GlassButton type="button" onClick={addLine} className="hidden lg:inline-flex">
            Add line
          </GlassButton>

          <div className="hidden lg:flex flex-wrap gap-3 pt-4 border-t border-white/10">
            <GlassButton type="button" onClick={() => void handleSave()} disabled={saving}>
              {saving ? "Saving…" : "Save lyrics"}
            </GlassButton>
            {hasExisting && (
              <GlassButton type="button" onClick={() => void handleDelete()} disabled={saving}>
                Delete lyrics
              </GlassButton>
            )}
            <GlassButton type="button" onClick={() => navigate(`/player/${songId}`)}>
              Preview in player
            </GlassButton>
          </div>
        </section>
      </div>

      {/* Human: Mobile import/export sits after the line list so sync work stays first. */}
      {/* Agent: lg:hidden; TOGGLES importPanelOpen; RENDERS renderImportExportPanel('mobile') when open. */}
      <div className="lg:hidden rounded-2xl border border-white/10 bg-white/[0.03] overflow-hidden">
        <button
          type="button"
          onClick={() => setImportPanelOpen((open) => !open)}
          className="w-full flex items-center justify-between gap-3 px-4 py-3.5 min-h-[48px] text-left text-sm font-medium text-white hover:bg-white/[0.04] transition-colors"
          aria-expanded={importPanelOpen}
        >
          <span>Import / export lyrics</span>
          <svg
            className={`w-5 h-5 text-surface-400 shrink-0 transition-transform ${importPanelOpen ? "rotate-180" : ""}`}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
            aria-hidden
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
          </svg>
        </button>
        {importPanelOpen && (
          <div className="px-4 pb-4 border-t border-white/10 pt-3">
            {renderImportExportPanel("mobile")}
          </div>
        )}
      </div>

      {/* Human: Fixed bottom dock on mobile — seek, play/sync, and primary actions stay thumb-reachable. */}
      {/* Agent: lg:hidden fixed inset-x-0 bottom-0 z-30; safe-area padding; seekBar + transport + save row. */}
      <div
        className="lg:hidden fixed inset-x-0 bottom-0 z-30 border-t border-white/10 bg-surface-950/95 backdrop-blur-xl shadow-[0_-8px_32px_rgba(0,0,0,0.45)]"
        style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
      >
        <div className="px-4 pt-3 pb-2 space-y-2">
          <div className="rounded-xl bg-white/[0.03] border border-white/10 px-3 py-2">
            {seekBar}
          </div>
          <p className="text-[10px] text-surface-500 text-center leading-snug px-1">
            Tap markers to jump · seek left to edit passed lines
          </p>

          <div className="flex gap-2">
            <button
              type="button"
              onClick={togglePlay}
              disabled={!audioReady}
              aria-label={isPlaying ? "Pause" : "Play"}
              className="shrink-0 min-h-[48px] min-w-[48px] rounded-xl bg-surface-800 border border-white/10 text-white disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-aurora-500/50 flex items-center justify-center"
            >
              {isPlaying ? (
                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24" aria-hidden>
                  <path d="M6 5h4v14H6V5zm8 0h4v14h-4V5z" />
                </svg>
              ) : (
                <svg className="w-5 h-5 ml-0.5" fill="currentColor" viewBox="0 0 24 24" aria-hidden>
                  <path d="M8 5v14l11-7L8 5z" />
                </svg>
              )}
            </button>
            <button
              type="button"
              onClick={() => syncLineAt(selectedIndex)}
              disabled={!audioReady}
              className="flex-1 min-h-[48px] rounded-xl bg-gradient-to-r from-aurora-600 to-aurora-500 text-white font-semibold text-sm disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-aurora-400/60 shadow-lg shadow-aurora-500/25"
            >
              Sync line {selectedIndex + 1}
            </button>
            <button
              type="button"
              onClick={addLine}
              aria-label="Add line"
              className="shrink-0 min-h-[48px] min-w-[48px] rounded-xl bg-surface-800 border border-white/10 text-surface-300 hover:text-white focus:outline-none focus:ring-2 focus:ring-aurora-500/50 flex items-center justify-center"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
              </svg>
            </button>
          </div>

          <div className="flex gap-2 relative">
            <button
              type="button"
              onClick={() => void handleSave()}
              disabled={saving}
              className="flex-1 min-h-[44px] rounded-xl bg-white text-surface-950 font-semibold text-sm disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-white/40"
            >
              {saving ? "Saving…" : "Save lyrics"}
            </button>
            <button
              type="button"
              onClick={() => navigate(`/player/${songId}`)}
              className="min-h-[44px] px-4 rounded-xl bg-surface-800 border border-white/10 text-sm font-medium text-white focus:outline-none focus:ring-2 focus:ring-aurora-500/50"
            >
              Preview
            </button>
            <button
              type="button"
              onClick={() => setMobileMoreOpen((open) => !open)}
              aria-label="More actions"
              aria-expanded={mobileMoreOpen}
              className="min-h-[44px] min-w-[44px] rounded-xl bg-surface-800 border border-white/10 text-surface-300 hover:text-white focus:outline-none focus:ring-2 focus:ring-aurora-500/50 flex items-center justify-center"
            >
              <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24" aria-hidden>
                <path d="M12 8c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2zm0 2c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zm0 6c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2z" />
              </svg>
            </button>

            {mobileMoreOpen && (
              <>
                <button
                  type="button"
                  className="fixed inset-0 z-40 cursor-default"
                  aria-label="Close menu"
                  onClick={() => setMobileMoreOpen(false)}
                />
                <div
                  role="menu"
                  className="absolute right-0 bottom-full mb-2 z-50 w-56 rounded-xl border border-white/10 bg-surface-900/98 backdrop-blur-xl shadow-xl overflow-hidden py-1"
                >
                  <button
                    type="button"
                    role="menuitem"
                    className="w-full text-left px-4 py-3 text-sm text-white hover:bg-white/5 min-h-[44px]"
                    onClick={() => void handleCopyWithTimestamps()}
                    disabled={lines.every((l) => !l.text.trim())}
                  >
                    {copyFeedback ? "Copied!" : "Copy with timestamps"}
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    className="w-full text-left px-4 py-3 text-sm text-white hover:bg-white/5 min-h-[44px]"
                    onClick={() => {
                      setImportPanelOpen(true);
                      setMobileMoreOpen(false);
                    }}
                  >
                    Import / export…
                  </button>
                  {hasExisting && (
                    <button
                      type="button"
                      role="menuitem"
                      className="w-full text-left px-4 py-3 text-sm text-red-400 hover:bg-red-500/10 min-h-[44px]"
                      onClick={() => void handleDelete()}
                      disabled={saving}
                    >
                      Delete lyrics
                    </button>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// Human: Single lyric row — desktop uses compact text links; mobile uses one equal-width action row.
// Agent: PRESENTATIONAL; PROPS index line selected currentTimeMs + callbacks; NO fetch.
function LyricLineRow({
  index,
  line,
  selected,
  currentTimeMs,
  onSelect,
  onUpdateText,
  onSync,
  onClearTimestamp,
  onRemove,
}: {
  index: number;
  line: LyricLine;
  selected: boolean;
  currentTimeMs: number;
  onSelect: () => void;
  onUpdateText: (text: string) => void;
  onSync: () => void;
  onClearTimestamp: () => void;
  onRemove: () => void;
}) {
  const isResync = line.start_ms != null;

  return (
    <div
      className={`rounded-xl border transition-colors ${
        selected
          ? "border-aurora-500/50 bg-aurora-500/10 ring-1 ring-aurora-500/20"
          : "border-white/10 bg-white/[0.02]"
      }`}
    >
      <div className="hidden lg:flex gap-2 items-start p-2">
        <button
          type="button"
          onClick={onSelect}
          className="shrink-0 w-8 pt-2 flex items-center justify-center text-xs font-mono text-surface-500 hover:text-surface-300 focus:outline-none focus:ring-2 focus:ring-aurora-500/40 rounded"
          title="Select line for sync"
          aria-label={`Select line ${index + 1}`}
          aria-current={selected ? "true" : undefined}
        >
          {index + 1}
        </button>
        <div className="flex-1 min-w-0 space-y-1">
          <input
            type="text"
            value={line.text}
            onChange={(e) => onUpdateText(e.target.value)}
            onFocus={onSelect}
            placeholder="Lyric line"
            className="w-full bg-transparent border-none text-white text-sm focus:outline-none placeholder:text-surface-600 py-1"
          />
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <LineMeta
              line={line}
              isResync={isResync}
              currentTimeMs={currentTimeMs}
              variant="desktop"
            />
            <button
              type="button"
              onClick={onSync}
              className="text-aurora-400 hover:text-aurora-300"
            >
              {isResync ? "Update time" : "Sync now"}
            </button>
            {line.start_ms != null && (
              <button
                type="button"
                onClick={onClearTimestamp}
                className="text-surface-500 hover:text-surface-300"
              >
                Clear time
              </button>
            )}
            <button
              type="button"
              onClick={onRemove}
              className="text-red-400/80 hover:text-red-300 ml-auto"
            >
              Remove
            </button>
          </div>
        </div>
      </div>

      <div
        className="lg:hidden p-2.5 space-y-1.5 cursor-pointer"
        onClick={onSelect}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onSelect();
          }
        }}
        role="button"
        tabIndex={0}
        aria-current={selected ? "true" : undefined}
        aria-label={`Line ${index + 1}`}
      >
        <div className="flex gap-2 items-center min-h-[40px]">
          <span className="shrink-0 w-6 text-center text-[11px] font-mono font-semibold text-surface-500 tabular-nums">
            {index + 1}
          </span>
          <input
            type="text"
            value={line.text}
            onChange={(e) => onUpdateText(e.target.value)}
            onFocus={onSelect}
            onClick={(e) => e.stopPropagation()}
            placeholder="Lyric line"
            className="flex-1 min-w-0 bg-transparent border-none text-white text-[15px] leading-snug focus:outline-none placeholder:text-surface-600 py-0.5"
          />
        </div>

        <div className="flex items-center gap-1.5 pl-8">
          <div className="shrink-0 min-w-0 max-w-[36%] truncate">
            <LineMeta
              line={line}
              isResync={isResync}
              currentTimeMs={currentTimeMs}
              variant="mobile"
            />
          </div>
          <div className="flex flex-1 gap-1 min-w-0">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onSync();
              }}
              className="flex-1 min-h-[40px] px-1 rounded-lg bg-aurora-500/20 border border-aurora-500/35 text-aurora-200 text-[11px] font-semibold leading-tight focus:outline-none focus:ring-2 focus:ring-aurora-500/50 active:scale-[0.98]"
            >
              {isResync ? "Update" : "Sync"}
            </button>
            {line.start_ms != null && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onClearTimestamp();
                }}
                className="flex-1 min-h-[40px] px-1 rounded-lg bg-white/5 border border-white/10 text-surface-300 text-[11px] font-medium leading-tight focus:outline-none focus:ring-2 focus:ring-aurora-500/40 active:scale-[0.98]"
              >
                Clear
              </button>
            )}
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onRemove();
              }}
              className="flex-1 min-h-[40px] px-1 rounded-lg bg-red-500/10 border border-red-500/25 text-red-300 text-[11px] font-medium leading-tight focus:outline-none focus:ring-2 focus:ring-red-500/40 active:scale-[0.98]"
            >
              Remove
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function LineMeta({
  line,
  isResync,
  currentTimeMs,
  variant,
}: {
  line: LyricLine;
  isResync: boolean;
  currentTimeMs: number;
  variant: "desktop" | "mobile";
}) {
  if (!isResync) {
    return (
      <span
        className={`text-surface-500 ${variant === "mobile" ? "text-[10px] leading-tight" : ""}`}
      >
        {variant === "mobile" ? "Unsynced" : "Not synced"}
      </span>
    );
  }

  const past = line.start_ms! <= currentTimeMs;
  const badgeClass = past
    ? "text-surface-400 bg-white/5"
    : "text-amber-300/90 bg-amber-500/10";

  const timeLabel = formatLyricTime(line.start_ms!);
  if (variant === "mobile") {
    return (
      <span className={`font-mono text-[10px] leading-tight px-1.5 py-0.5 rounded ${badgeClass}`}>
        {timeLabel}
      </span>
    );
  }

  return (
    <span className={`font-mono px-2 py-0.5 rounded text-xs ${badgeClass}`}>
      {timeLabel}
      {line.start_ms! > currentTimeMs ? " — re-sync" : " — previous"}
    </span>
  );
}

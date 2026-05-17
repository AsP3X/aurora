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
  parsePlainLyricsText,
} from "../../utils/lyrics";

export default function AdminLyricsEditorPage() {
  const { songId } = useParams<{ songId: string }>();
  const navigate = useNavigate();
  const audioRef = useRef<HTMLAudioElement>(null);
  const hlsRef = useRef<Hls | null>(null);

  const [song, setSong] = useState<Song | null>(null);
  const [lines, setLines] = useState<LyricLine[]>([{ text: "" }]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [plainImport, setPlainImport] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [audioReady, setAudioReady] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [hasExisting, setHasExisting] = useState(false);

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

  function applyPlainImport() {
    const parsed = parsePlainLyricsText(plainImport);
    if (parsed.length === 0) return;
    setLines(parsed);
    setSelectedIndex(0);
    setPlainImport("");
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

  const maxDuration =
    duration > 0 ? duration : song?.duration_seconds ?? 0;

  if (loading) {
    return <p className="text-surface-400">Loading lyrics editor…</p>;
  }

  if (!song || !songId) {
    return <p className="text-red-400">Song not found.</p>;
  }

  return (
    <div className="space-y-6">
      <PageHeader title="Lyrics" subtitle={`${song.title} — ${song.artist}`}>
        <Link
          to="/admin/library"
          className="text-sm text-surface-400 hover:text-white transition-colors"
        >
          Back to library
        </Link>
      </PageHeader>

      {error && (
        <p className="text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-2">
          {error}
        </p>
      )}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,280px)_1fr]">
        <div className="space-y-4">
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

          <audio ref={audioRef} className="hidden" preload="metadata" />

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

          <div>
            <label className="block text-xs font-medium text-surface-400 mb-2">
              Import plain lyrics
            </label>
            <textarea
              value={plainImport}
              onChange={(e) => setPlainImport(e.target.value)}
              rows={5}
              placeholder="Paste lyrics, one line per row…"
              className="w-full rounded-xl bg-surface-900 border border-white/10 px-3 py-2 text-sm text-white placeholder:text-surface-600 focus:outline-none focus:ring-2 focus:ring-aurora-500/40"
            />
            <GlassButton
              type="button"
              className="mt-2 w-full"
              onClick={applyPlainImport}
              disabled={!plainImport.trim()}
            >
              Apply to lines
            </GlassButton>
          </div>
        </div>

        <div className="space-y-3">
          <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 sticky top-0 z-10 backdrop-blur-md">
            <SeekProgressBar
              progress={currentTime}
              duration={maxDuration}
              onSeek={handleSeek}
              disabled={!audioReady || maxDuration <= 0}
              markers={seekMarkers}
              onMarkerClick={(t) => {
                const hit = getLyricSeekMarkers(lines).find(
                  (m) => Math.abs(m.timeSeconds - t) < 0.05,
                );
                if (hit) setSelectedIndex(hit.lineIndex);
              }}
            />
          </div>

          {visibleLineEntries.length === 0 ? (
            <p className="text-sm text-surface-500 text-center py-6 rounded-xl border border-dashed border-white/10">
              No lines ahead of the playhead. Drag the seek bar left to bring back synced lines, or save
              when finished.
            </p>
          ) : (
            visibleLineEntries.map(({ index, line }) => {
            const selected = index === selectedIndex;
            const isResync = line.start_ms != null;
            return (
              <div
                key={index}
                className={`flex gap-2 items-start rounded-xl border p-2 transition-colors ${
                  selected
                    ? "border-aurora-500/50 bg-aurora-500/10"
                    : "border-white/10 bg-white/[0.02]"
                }`}
              >
                <button
                  type="button"
                  onClick={() => setSelectedIndex(index)}
                  className="shrink-0 w-8 text-xs font-mono text-surface-500 pt-2"
                  title="Select line for sync"
                >
                  {index + 1}
                </button>
                <div className="flex-1 min-w-0 space-y-1">
                  <input
                    type="text"
                    value={line.text}
                    onChange={(e) => updateLineText(index, e.target.value)}
                    onFocus={() => setSelectedIndex(index)}
                    placeholder="Lyric line"
                    className="w-full bg-transparent border-none text-white text-sm focus:outline-none placeholder:text-surface-600"
                  />
                  <div className="flex flex-wrap items-center gap-2 text-xs">
                    {isResync ? (
                      <span
                        className={`font-mono px-2 py-0.5 rounded ${
                          line.start_ms! <= currentTimeMs
                            ? "text-surface-400 bg-white/5"
                            : "text-amber-300/90 bg-amber-500/10"
                        }`}
                      >
                        {formatLyricTime(line.start_ms!)}
                        {line.start_ms! > currentTimeMs ? " — re-sync" : " — previous"}
                      </span>
                    ) : (
                      <span className="text-surface-500">Not synced</span>
                    )}
                    <button
                      type="button"
                      onClick={() => syncLineAt(index)}
                      className="text-aurora-400 hover:text-aurora-300"
                    >
                      {isResync ? "Update time" : "Sync now"}
                    </button>
                    {line.start_ms != null && (
                      <button
                        type="button"
                        onClick={() => clearTimestamp(index)}
                        className="text-surface-500 hover:text-surface-300"
                      >
                        Clear time
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => removeLine(index)}
                      className="text-red-400/80 hover:text-red-300 ml-auto"
                    >
                      Remove
                    </button>
                  </div>
                </div>
              </div>
            );
          })
          )}

          <GlassButton type="button" onClick={addLine}>
            Add line
          </GlassButton>

          <div className="flex flex-wrap gap-3 pt-4 border-t border-white/10">
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
        </div>
      </div>
    </div>
  );
}

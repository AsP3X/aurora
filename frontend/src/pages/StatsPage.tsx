// Human: Personal listening analytics — period tabs drive all API queries; expandable per-song session drilldown.
// Agent: STATE period; PARALLEL fetch on period change; toggleSongSessions lazy-loads fetchListeningSessions; CHARTS from habits payload.
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  fetchListeningTime,
  fetchListeningHabits,
  fetchTopArtists,
  fetchTopAlbums,
  fetchHistory,
  fetchListeningBySong,
  fetchListeningSessions,
  type ListeningSessionRow,
} from "../api/client";
import ArtworkImage from "../components/ArtworkImage";
import DashboardLayout from "../components/DashboardLayout";
import ApiErrorBanner from "../components/ApiErrorBanner";
import StatCard from "../components/StatCard";

// Human: Compact duration for chart labels — omits seconds when hours present for readability.
// Agent: PURE helper for BarChart formatter inputs.
function formatDuration(seconds: number) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

function formatDurationLong(seconds: number) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  const parts: string[] = [];
  if (h > 0) parts.push(`${h}h`);
  if (m > 0) parts.push(`${m}m`);
  if (s > 0 && h === 0) parts.push(`${s}s`);
  return parts.join(" ") || "0s";
}

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

// Human: Horizontal bar chart with filled width proportional to max — optional formatter for bar label text.
// Agent: MAP items; width pct from value/max; MIN width 1% for visibility.
function BarChart({
  data,
  max,
  formatter,
}: {
  data: Array<{ label: string; value: number }>;
  max: number;
  formatter?: (v: number) => string;
}) {
  return (
    <div className="space-y-1.5">
      {data.map((item) => {
        const pct = max > 0 ? (item.value / max) * 100 : 0;
        return (
          <div key={item.label} className="flex items-center gap-3">
            <span className="text-xs text-surface-400 w-8 text-right shrink-0">{item.label}</span>
            <div className="flex-1 h-6 bg-surface-800/50 rounded-md overflow-hidden relative">
              <div
                className="absolute inset-y-0 left-0 bg-aurora-500/60 rounded-md transition-all"
                style={{ width: `${Math.max(pct, 1)}%` }}
              />
              <span className="absolute inset-0 flex items-center px-2 text-[10px] font-medium text-white/80">
                {formatter ? formatter(item.value) : item.value}
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function formatNumber(n: number) {
  return new Intl.NumberFormat("en-US").format(n);
}

function formatTrackLen(seconds: number) {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function formatDateTime(iso: string) {
  try {
    return new Date(iso).toLocaleString(undefined, { dateStyle: "short", timeStyle: "short" });
  } catch {
    return iso;
  }
}

function formatSessionListened(seconds: number | null) {
  if (seconds === null || seconds === undefined) return "—";
  if (seconds === 0) return "0s";
  return formatDurationLong(seconds);
}

export default function StatsPage() {
  const [period, setPeriod] = useState<"today" | "week" | "month" | "all">("all");
  const [loading, setLoading] = useState(false);
  const [timeStats, setTimeStats] = useState<Record<string, number>>({});
  const [habits, setHabits] = useState<{
    peak_hours: Array<{ hour: number; total_seconds: number }>;
    day_of_week: Array<{ day: number; total_seconds: number }>;
  } | null>(null);
  const [topArtists, setTopArtists] = useState<Array<{ artist: string; total_seconds: number; play_count: number }> | null>(null);
  const [topAlbums, setTopAlbums] = useState<Array<{ album: string; album_artist: string | null; total_seconds: number; play_count: number }> | null>(null);
  const [sessions, setSessions] = useState<Array<{
    id: string;
    song_id: string;
    title: string;
    artist: string;
    album: string | null;
    artwork_key: string | null;
    started_at: string;
    ended_at: string | null;
    duration_listened_seconds: number | null;
    completed: number;
  }> | null>(null);
  const [bySong, setBySong] = useState<Array<{
    song_id: string;
    title: string;
    artist: string;
    album: string | null;
    artwork_key: string | null;
    duration_seconds: number;
    play_count: number;
    total_listened_seconds: number;
  }> | null>(null);

  const [expandedSongId, setExpandedSongId] = useState<string | null>(null);
  const [sessionsBySong, setSessionsBySong] = useState<Record<string, ListeningSessionRow[]>>({});
  const [sessionsLoadingId, setSessionsLoadingId] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [statsRefresh, setStatsRefresh] = useState(0);

  // Human: Changing period refetches everything and collapses any open per-song session tables (fresh data contract).
  // Agent: EFFECT [period]; RESETS expansion cache; Promise.all listening endpoints; WRITES aggregate state.
  useEffect(() => {
    setExpandedSongId(null);
    setSessionsBySong({});
    setSessionsLoadingId(null);
    setLoading(true);
    setLoadError(null);
    Promise.all([
      fetchListeningTime(period),
      fetchListeningHabits(),
      fetchTopArtists(period),
      fetchTopAlbums(period),
      fetchHistory(50),
      fetchListeningBySong(period),
    ])
      .then(([timeData, habitsData, artists, albums, history, songAgg]) => {
        setTimeStats((prev) => ({ ...prev, [period]: timeData.total_seconds }));
        setHabits(habitsData);
        setTopArtists(artists);
        setTopAlbums(albums);
        setSessions(history);
        setBySong(songAgg);
      })
      .catch(() => {
        setLoadError("Could not load listening stats. Try again in a moment.");
      })
      .finally(() => setLoading(false));
  }, [period, statsRefresh]);

  // Human: Lazy-load session rows for a single song the first time its accordion opens (cached in `sessionsBySong`).
  // Agent: TOGGLE expandedSongId; FETCH fetchListeningSessions(period,500,songId); STORES per-song array.
  async function toggleSongSessions(songId: string) {
    if (expandedSongId === songId) {
      setExpandedSongId(null);
      return;
    }
    setExpandedSongId(songId);
    if (sessionsBySong[songId]) return;
    setSessionsLoadingId(songId);
    try {
      const data = await fetchListeningSessions(period, 500, songId);
      setSessionsBySong((prev) => ({ ...prev, [songId]: data }));
    } catch {
      setSessionsBySong((prev) => ({ ...prev, [songId]: [] }));
    } finally {
      setSessionsLoadingId(null);
    }
  }

  // Human: Normalize habit peaks into 24 hour buckets for the chart even when some hours are empty.
  // Agent: USEMEMO from habits.peak_hours; FILLS buckets 0-23.
  const hourData = useMemo(() => {
    const buckets = Array.from({ length: 24 }, (_, i) => ({ label: `${i}`, value: 0 }));
    habits?.peak_hours.forEach((h) => {
      buckets[h.hour] = { label: `${h.hour}`, value: h.total_seconds };
    });
    return buckets;
  }, [habits]);

  // Human: Weekday chart uses fixed Sun–Sat ordering with API `day` indices mapping into labels.
  // Agent: USEMEMO from habits.day_of_week; MERGES into DAYS array.
  const dayData = useMemo(() => {
    const buckets = DAYS.map((d) => ({ label: d, value: 0 }));
    habits?.day_of_week.forEach((d) => {
      buckets[d.day] = { label: DAYS[d.day], value: d.total_seconds };
    });
    return buckets;
  }, [habits]);

  const totalTime = timeStats[period] || 0;
  const playCount = sessions?.length || 0;
  const avgSession = playCount > 0 ? totalTime / playCount : 0;
  const topArtist = topArtists?.[0]?.artist ?? "—";

  return (
    <DashboardLayout>
    <div className="mx-auto max-w-7xl space-y-8">
      {loadError && (
        <ApiErrorBanner message={loadError} onRetry={() => setStatsRefresh((n) => n + 1)} />
      )}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-white">Listening Stats</h1>
        {loading && (
          <div className="w-5 h-5 border-2 border-aurora-500 border-t-transparent rounded-full animate-spin" />
        )}
      </div>

      {/* Period tabs */}
      <div className="flex gap-2" role="tablist" aria-label="Stats period">
        {(["today", "week", "month", "all"] as const).map((p) => (
          <button
            key={p}
            type="button"
            role="tab"
            aria-selected={period === p}
            onClick={() => setPeriod(p)}
            className={`px-4 py-2 rounded-xl text-sm font-medium transition-colors ${
              period === p
                ? "bg-aurora-500/20 text-aurora-300 border border-aurora-500/30"
                : "bg-surface-900 border border-white/5 text-surface-400 hover:text-white hover:border-white/10"
            }`}
          >
            {p === "today" && "Today"}
            {p === "week" && "This Week"}
            {p === "month" && "This Month"}
            {p === "all" && "All Time"}
          </button>
        ))}
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Total Time" value={formatDurationLong(totalTime)} />
        <StatCard label="Plays" value={String(playCount)} />
        <StatCard label="Avg Session" value={formatDurationLong(avgSession)} />
        <StatCard label="Top Artist" value={topArtist} />
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-surface-900 border border-white/5 rounded-2xl p-5">
          <h3 className="text-sm font-semibold text-white mb-4">Peak Hours</h3>
          <BarChart
            data={hourData}
            max={Math.max(...hourData.map((d) => d.value), 1)}
            formatter={(v) => formatDuration(v)}
          />
        </div>

        <div className="bg-surface-900 border border-white/5 rounded-2xl p-5">
          <h3 className="text-sm font-semibold text-white mb-4">Day of Week</h3>
          <BarChart
            data={dayData}
            max={Math.max(...dayData.map((d) => d.value), 1)}
            formatter={(v) => formatDuration(v)}
          />
        </div>
      </div>

      {/* Top Artists & Albums */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-surface-900 border border-white/5 rounded-2xl p-5">
          <h3 className="text-sm font-semibold text-white mb-4">Top Artists</h3>
          <div className="space-y-3">
            {topArtists?.map((a, i) => (
              <div key={a.artist} className="flex items-center gap-3">
                <span className="text-xs text-surface-500 w-5 text-right">{i + 1}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-white truncate">{a.artist}</p>
                  <p className="text-xs text-surface-500">{a.play_count} plays · {formatDuration(a.total_seconds)}</p>
                </div>
              </div>
            ))}
            {(!topArtists || topArtists.length === 0) && (
              <p className="text-sm text-surface-500">No data yet.</p>
            )}
          </div>
        </div>

        <div className="bg-surface-900 border border-white/5 rounded-2xl p-5">
          <h3 className="text-sm font-semibold text-white mb-4">Top Albums</h3>
          <div className="space-y-3">
            {topAlbums?.map((a, i) => (
              <div key={`${a.album}-${a.album_artist}`} className="flex items-center gap-3">
                <span className="text-xs text-surface-500 w-5 text-right">{i + 1}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-white truncate">{a.album}</p>
                  <p className="text-xs text-surface-500 truncate">{a.album_artist ?? "Unknown Artist"} · {a.play_count} plays · {formatDuration(a.total_seconds)}</p>
                </div>
              </div>
            ))}
            {(!topAlbums || topAlbums.length === 0) && (
              <p className="text-sm text-surface-500">No data yet.</p>
            )}
          </div>
        </div>
      </div>

      {/* Per-song totals */}
      <div className="bg-surface-900 border border-white/5 rounded-2xl p-5 overflow-hidden">
        <h3 className="text-sm font-semibold text-white mb-4">Songs you listened to</h3>
        <p className="text-xs text-surface-500 mb-4">
          Play counts are sessions started in this period. Expand a row to see each play with how long you listened (for analytics).
        </p>
        <div className="overflow-x-auto -mx-5 px-5">
          <table className="w-full text-sm text-left min-w-[700px]">
            <thead className="text-xs text-surface-400 uppercase border-b border-white/5">
              <tr>
                <th className="py-2 pr-2 w-10 font-medium" aria-label="Expand sessions" />
                <th className="py-2 pr-4 font-medium">Song</th>
                <th className="py-2 pr-4 font-medium hidden md:table-cell">Album</th>
                <th className="py-2 pr-4 font-medium text-right w-24">Plays</th>
                <th className="py-2 pr-4 font-medium text-right w-28">Time listened</th>
                <th className="py-2 font-medium text-right w-24 hidden sm:table-cell">Track</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {(bySong ?? []).flatMap((row) => {
                const expanded = expandedSongId === row.song_id;
                const sess = sessionsBySong[row.song_id];
                const loadingSessions = sessionsLoadingId === row.song_id;
                const detailRow = expanded ? (
                  <tr key={`${row.song_id}-sessions`} className="bg-surface-950/40">
                    <td colSpan={6} className="py-3 px-4 border-t border-white/5">
                      {loadingSessions ? (
                        <div className="flex justify-center py-6">
                          <div className="w-5 h-5 border-2 border-aurora-500 border-t-transparent rounded-full animate-spin" />
                        </div>
                      ) : (
                        <div className="overflow-x-auto rounded-lg border border-white/5">
                          <table className="w-full text-xs text-left min-w-[640px]">
                            <thead className="text-surface-500 uppercase border-b border-white/5">
                              <tr>
                                <th className="py-2 px-2 font-medium">Started</th>
                                <th className="py-2 px-2 font-medium hidden sm:table-cell">Ended</th>
                                <th className="py-2 px-2 font-medium text-right">Listened</th>
                                <th className="py-2 px-2 font-medium text-right">Track</th>
                                <th className="py-2 px-2 font-medium text-center w-16">Done</th>
                                <th className="py-2 px-2 font-medium font-mono">Session ID</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-white/5 text-surface-300">
                              {(sess ?? []).map((s) => (
                                <tr key={s.id}>
                                  <td className="py-2 px-2 whitespace-nowrap">{formatDateTime(s.started_at)}</td>
                                  <td className="py-2 px-2 whitespace-nowrap hidden sm:table-cell text-surface-500">
                                    {s.ended_at ? formatDateTime(s.ended_at) : "—"}
                                  </td>
                                  <td className="py-2 px-2 text-right tabular-nums">{formatSessionListened(s.duration_listened_seconds)}</td>
                                  <td className="py-2 px-2 text-right tabular-nums text-surface-500">
                                    {formatTrackLen(s.song_duration_seconds)}
                                  </td>
                                  <td className="py-2 px-2 text-center">{s.completed ? "Yes" : "No"}</td>
                                  <td className="py-2 px-2 font-mono text-[10px] text-surface-500 break-all max-w-[10rem]" title={s.id}>
                                    {s.id}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                          {sess && sess.length === 0 && (
                            <p className="text-sm text-surface-500 py-4 text-center">No sessions in this period.</p>
                          )}
                        </div>
                      )}
                    </td>
                  </tr>
                ) : null;

                const mainRow = (
                  <tr key={row.song_id} className="hover:bg-white/[0.02]">
                    <td className="py-2.5 pr-2 align-top">
                      <button
                        type="button"
                        onClick={() => void toggleSongSessions(row.song_id)}
                        className="p-1 rounded-lg text-surface-400 hover:text-white hover:bg-white/5 transition-colors"
                        aria-expanded={expanded}
                        aria-label={expanded ? "Hide play sessions" : "Show play sessions"}
                      >
                        <svg
                          className={`w-4 h-4 transition-transform ${expanded ? "rotate-90" : ""}`}
                          fill="none"
                          viewBox="0 0 24 24"
                          stroke="currentColor"
                          strokeWidth={2}
                        >
                          <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                        </svg>
                      </button>
                    </td>
                    <td className="py-2.5 pr-4">
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="w-9 h-9 rounded-lg overflow-hidden bg-surface-800 shrink-0">
                          <ArtworkImage
                            songId={row.song_id}
                            title={row.title}
                            artist={row.artist}
                            className="w-full h-full object-cover"
                          />
                        </div>
                        <div className="min-w-0">
                          <Link
                            to={`/player/${row.song_id}`}
                            className="font-medium text-white truncate block hover:text-aurora-300 transition-colors"
                          >
                            {row.title}
                          </Link>
                          <span className="text-xs text-surface-500 truncate block">{row.artist}</span>
                        </div>
                      </div>
                    </td>
                    <td className="py-2.5 pr-4 text-surface-400 truncate max-w-[12rem] hidden md:table-cell">
                      {row.album ?? "—"}
                    </td>
                    <td className="py-2.5 pr-4 text-right text-surface-300 tabular-nums">{formatNumber(row.play_count)}</td>
                    <td className="py-2.5 pr-4 text-right text-surface-300 tabular-nums">
                      {formatDurationLong(row.total_listened_seconds)}
                    </td>
                    <td className="py-2.5 text-right text-surface-500 tabular-nums text-xs hidden sm:table-cell">
                      {formatTrackLen(row.duration_seconds)}
                    </td>
                  </tr>
                );

                return detailRow ? [mainRow, detailRow] : [mainRow];
              })}
            </tbody>
          </table>
        </div>
        {(!bySong || bySong.length === 0) && (
          <p className="text-sm text-surface-500 pt-2">No song data for this period yet.</p>
        )}
      </div>

      {/* Recent Sessions */}
      <div className="bg-surface-900 border border-white/5 rounded-2xl p-5">
        <h3 className="text-sm font-semibold text-white mb-4">Recent Sessions</h3>
        <div className="space-y-2">
          {sessions?.map((s) => (
            <div key={s.id} className="flex items-center gap-3 py-2 border-b border-white/5 last:border-0">
              <div className="w-10 h-10 rounded-lg overflow-hidden bg-surface-800 shrink-0">
                <ArtworkImage
                  songId={s.song_id}
                  title={s.title}
                  artist={s.artist}
                  className="w-full h-full object-cover"
                />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-white truncate">{s.title}</p>
                <p className="text-xs text-surface-500 truncate">{s.artist}</p>
              </div>
              <div className="text-right shrink-0">
                <p className="text-xs text-surface-400">
                  {s.duration_listened_seconds
                    ? formatDuration(s.duration_listened_seconds)
                    : s.completed
                    ? "Completed"
                    : "In progress"}
                </p>
                <p className="text-[10px] text-surface-600">
                  {new Date(s.started_at).toLocaleDateString()}
                </p>
              </div>
            </div>
          ))}
          {(!sessions || sessions.length === 0) && (
            <p className="text-sm text-surface-500">No sessions yet.</p>
          )}
        </div>
      </div>
    </div>
    </DashboardLayout>
  );
}

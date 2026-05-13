import { useEffect, useMemo, useState } from "react";
import {
  fetchListeningTime,
  fetchListeningHabits,
  fetchTopArtists,
  fetchTopAlbums,
  fetchHistory,
} from "../api/client";
import ArtworkImage from "../components/ArtworkImage";

/* ─── Helpers ─── */
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

/* ─── Sub-components ─── */

function StatCard({
  label,
  value,
  sub,
}: {
  label: string;
  value: string;
  sub?: string;
}) {
  return (
    <div className="bg-surface-900 border border-white/5 rounded-2xl p-5 hover:border-white/10 transition-colors">
      <p className="text-xs text-surface-400 font-medium uppercase tracking-wider mb-1">{label}</p>
      <p className="text-2xl font-bold text-white tracking-tight">{value}</p>
      {sub && <p className="text-xs text-surface-500 mt-1">{sub}</p>}
    </div>
  );
}

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

/* ─── Page ─── */

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

  useEffect(() => {
    setLoading(true);
    Promise.all([
      fetchListeningTime(period).catch(() => ({ total_seconds: 0 })),
      fetchListeningHabits().catch(() => ({ peak_hours: [], day_of_week: [] })),
      fetchTopArtists(period).catch(() => []),
      fetchTopAlbums(period).catch(() => []),
      fetchHistory(50).catch(() => []),
    ]).then(([timeData, habitsData, artists, albums, history]) => {
      setTimeStats((prev) => ({ ...prev, [period]: timeData.total_seconds }));
      setHabits(habitsData);
      setTopArtists(artists);
      setTopAlbums(albums);
      setSessions(history);
      setLoading(false);
    });
  }, [period]);

  const hourData = useMemo(() => {
    const buckets = Array.from({ length: 24 }, (_, i) => ({ label: `${i}`, value: 0 }));
    habits?.peak_hours.forEach((h) => {
      buckets[h.hour] = { label: `${h.hour}`, value: h.total_seconds };
    });
    return buckets;
  }, [habits]);

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
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-white">Listening Stats</h1>
        {loading && (
          <div className="w-5 h-5 border-2 border-aurora-500 border-t-transparent rounded-full animate-spin" />
        )}
      </div>

      {/* Period tabs */}
      <div className="flex gap-2">
        {(["today", "week", "month", "all"] as const).map((p) => (
          <button
            key={p}
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
  );
}

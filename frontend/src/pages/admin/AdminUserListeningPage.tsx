import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { fetchUsers, fetchAdminUserListeningBySong, fetchAdminUserListeningSessions, type UserSongListeningRow, type ListeningSessionRow } from "../../api/client";
import ArtworkImage from "../../components/ArtworkImage";

type Period = "today" | "week" | "month" | "all";

function formatNumber(n: number) {
  return new Intl.NumberFormat("en-US").format(n);
}

function formatListenDuration(seconds: number) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
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
  return formatListenDuration(seconds);
}

export default function AdminUserListeningPage() {
  const [searchParams, setSearchParams] = useSearchParams();

  const [users, setUsers] = useState<Array<{ id: string; email: string; role: string; enabled: boolean }>>([]);
  const [usersLoading, setUsersLoading] = useState(true);
  const [selectedUserId, setSelectedUserId] = useState("");
  const [period, setPeriod] = useState<Period>("all");
  const [rows, setRows] = useState<UserSongListeningRow[] | null>(null);
  const [tableLoading, setTableLoading] = useState(false);
  const [error, setError] = useState("");

  const [expandedSongId, setExpandedSongId] = useState<string | null>(null);
  const [sessionsBySong, setSessionsBySong] = useState<Record<string, ListeningSessionRow[]>>({});
  const [sessionsLoadingId, setSessionsLoadingId] = useState<string | null>(null);

  useEffect(() => {
    setExpandedSongId(null);
    setSessionsBySong({});
    setSessionsLoadingId(null);
  }, [selectedUserId, period]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      setUsersLoading(true);
      setError("");
      try {
        const data = await fetchUsers();
        if (!cancelled) setUsers(data);
      } catch (e: unknown) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Failed to load users");
      } finally {
        if (!cancelled) setUsersLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (users.length === 0) return;
    const param = searchParams.get("user");
    const valid = param && users.some((u) => u.id === param);
    const next = valid ? param! : users[0].id;
    setSelectedUserId((prev) => (prev === next ? prev : next));
    if (param && !valid) {
      setSearchParams({ user: next }, { replace: true });
    }
  }, [users, searchParams, setSearchParams]);

  useEffect(() => {
    if (!selectedUserId) {
      setRows(null);
      return;
    }

    let cancelled = false;

    void (async () => {
      setTableLoading(true);
      try {
        const data = await fetchAdminUserListeningBySong(selectedUserId, period);
        if (!cancelled) {
          setRows(data);
          setError("");
        }
      } catch (e: unknown) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "Failed to load listening data");
          setRows([]);
        }
      } finally {
        if (!cancelled) setTableLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [selectedUserId, period]);

  function handleUserChange(id: string) {
    setSelectedUserId(id);
    if (id) setSearchParams({ user: id }, { replace: true });
    else setSearchParams({}, { replace: true });
  }

  async function toggleSongSessions(songId: string) {
    if (expandedSongId === songId) {
      setExpandedSongId(null);
      return;
    }
    setExpandedSongId(songId);
    if (sessionsBySong[songId] || !selectedUserId) return;
    setSessionsLoadingId(songId);
    try {
      const data = await fetchAdminUserListeningSessions(selectedUserId, period, 500, songId);
      setSessionsBySong((prev) => ({ ...prev, [songId]: data }));
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to load play sessions");
      setSessionsBySong((prev) => ({ ...prev, [songId]: [] }));
    } finally {
      setSessionsLoadingId(null);
    }
  }

  const selectedEmail = users.find((u) => u.id === selectedUserId)?.email;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">User listening</h1>
          <p className="text-sm text-surface-400 mt-1">
            Per-song totals and each play session with how long the user listened (for analytics exports).
          </p>
        </div>
        {error && (
          <div className="text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2 shrink-0">
            {error}
          </div>
        )}
      </div>

      <div className="flex flex-col lg:flex-row gap-4 lg:items-end">
        <div className="flex-1 min-w-0">
          <label htmlFor="admin-listening-user" className="block text-xs text-surface-400 mb-1.5 font-medium uppercase tracking-wider">
            User
          </label>
          <select
            id="admin-listening-user"
            value={selectedUserId}
            onChange={(e) => handleUserChange(e.target.value)}
            disabled={usersLoading || users.length === 0}
            className="w-full max-w-xl bg-surface-900 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:ring-1 focus:ring-aurora-500 disabled:opacity-50"
          >
            {users.length === 0 && !usersLoading ? (
              <option value="">No users</option>
            ) : (
              users.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.email} {!u.enabled ? "(disabled)" : ""}
                </option>
              ))
            )}
          </select>
        </div>
        <div className="flex flex-wrap gap-2">
          {(["today", "week", "month", "all"] as const).map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => setPeriod(p)}
              className={`px-4 py-2 rounded-xl text-sm font-medium transition-colors ${
                period === p
                  ? "bg-aurora-500/20 text-aurora-300 border border-aurora-500/30"
                  : "bg-surface-900 border border-white/5 text-surface-400 hover:text-white hover:border-white/10"
              }`}
            >
              {p === "today" && "Today"}
              {p === "week" && "This week"}
              {p === "month" && "This month"}
              {p === "all" && "All time"}
            </button>
          ))}
        </div>
      </div>

      {selectedEmail && (
        <p className="text-sm text-surface-500">
          Showing data for <span className="text-surface-300">{selectedEmail}</span>
        </p>
      )}

      <div className="bg-surface-900 border border-white/5 rounded-2xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left min-w-[640px]">
            <thead className="bg-surface-950/50 text-surface-400 text-xs uppercase border-b border-white/5">
              <tr>
                <th className="px-2 py-3 w-10 font-medium" aria-label="Expand sessions" />
                <th className="px-4 py-3 font-medium">Song</th>
                <th className="px-4 py-3 font-medium hidden md:table-cell">Album</th>
                <th className="px-4 py-3 font-medium text-right w-24">Plays</th>
                <th className="px-4 py-3 font-medium text-right w-32">Listened</th>
                <th className="px-4 py-3 font-medium text-right w-24 hidden sm:table-cell">Track</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {tableLoading ? (
                <tr>
                  <td colSpan={6} className="px-4 py-16 text-center">
                    <div className="w-6 h-6 border-2 border-aurora-500 border-t-transparent rounded-full animate-spin mx-auto" />
                  </td>
                </tr>
              ) : (
                (rows ?? []).flatMap((row) => {
                  const expanded = expandedSongId === row.song_id;
                  const sessions = sessionsBySong[row.song_id];
                  const loadingSessions = sessionsLoadingId === row.song_id;
                  const detailRow = expanded ? (
                    <tr key={`${row.song_id}-sessions`} className="bg-surface-950/40">
                      <td colSpan={6} className="px-4 py-4 border-t border-white/5">
                        <p className="text-xs text-surface-500 mb-3">
                          Each row is one play. Listened is reported seconds for that session (up to 500 plays per song in this period).
                        </p>
                        {loadingSessions ? (
                          <div className="flex justify-center py-8">
                            <div className="w-5 h-5 border-2 border-aurora-500 border-t-transparent rounded-full animate-spin" />
                          </div>
                        ) : (
                          <div className="overflow-x-auto rounded-xl border border-white/5">
                            <table className="w-full text-xs text-left min-w-[720px]">
                              <thead className="text-surface-500 uppercase border-b border-white/5">
                                <tr>
                                  <th className="py-2 px-3 font-medium">Started</th>
                                  <th className="py-2 px-3 font-medium hidden sm:table-cell">Ended</th>
                                  <th className="py-2 px-3 font-medium text-right">Listened</th>
                                  <th className="py-2 px-3 font-medium text-right">Track</th>
                                  <th className="py-2 px-3 font-medium text-center w-20">Done</th>
                                  <th className="py-2 px-3 font-medium font-mono">Session ID</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-white/5 text-surface-300">
                                {(sessions ?? []).map((s) => (
                                  <tr key={s.id}>
                                    <td className="py-2 px-3 whitespace-nowrap">{formatDateTime(s.started_at)}</td>
                                    <td className="py-2 px-3 whitespace-nowrap hidden sm:table-cell text-surface-500">
                                      {s.ended_at ? formatDateTime(s.ended_at) : "—"}
                                    </td>
                                    <td className="py-2 px-3 text-right tabular-nums">{formatSessionListened(s.duration_listened_seconds)}</td>
                                    <td className="py-2 px-3 text-right tabular-nums text-surface-500">
                                      {formatTrackLen(s.song_duration_seconds)}
                                    </td>
                                    <td className="py-2 px-3 text-center">{s.completed ? "Yes" : "No"}</td>
                                    <td className="py-2 px-3 font-mono text-[10px] text-surface-500 break-all max-w-[12rem]" title={s.id}>
                                      {s.id}
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                            {sessions && sessions.length === 0 && (
                              <p className="text-sm text-surface-500 py-6 text-center">No sessions in this period.</p>
                            )}
                          </div>
                        )}
                      </td>
                    </tr>
                  ) : null;

                  const mainRow = (
                    <tr key={row.song_id} className="hover:bg-white/[0.02]">
                      <td className="px-2 py-3 align-top">
                        <button
                          type="button"
                          onClick={() => void toggleSongSessions(row.song_id)}
                          className="p-1.5 rounded-lg text-surface-400 hover:text-white hover:bg-white/5 transition-colors"
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
                      <td className="px-4 py-3">
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
                      <td className="px-4 py-3 text-surface-400 truncate max-w-[14rem] hidden md:table-cell">
                        {row.album ?? "—"}
                      </td>
                      <td className="px-4 py-3 text-right text-surface-300 tabular-nums">{formatNumber(row.play_count)}</td>
                      <td className="px-4 py-3 text-right text-surface-300 tabular-nums text-sm">
                        {formatListenDuration(row.total_listened_seconds)}
                      </td>
                      <td className="px-4 py-3 text-right text-surface-500 tabular-nums text-xs hidden sm:table-cell">
                        {formatTrackLen(row.duration_seconds)}
                      </td>
                    </tr>
                  );

                  return detailRow ? [mainRow, detailRow] : [mainRow];
                })
              )}
            </tbody>
          </table>
        </div>
        {!tableLoading && rows && rows.length === 0 && selectedUserId && (
          <p className="text-sm text-surface-500 px-4 py-8 text-center border-t border-white/5">
            No playback data for this period.
          </p>
        )}
      </div>
    </div>
  );
}

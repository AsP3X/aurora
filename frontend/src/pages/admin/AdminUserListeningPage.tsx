import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import {
  fetchUsers,
  fetchAdminListeningBySong,
  fetchAdminListeningSessions,
  ApiError,
  type UserSongListeningRow,
  type ListeningSessionRow,
} from "../../api/client";
import ArtworkImage from "../../components/ArtworkImage";
import UserPickerDialog from "../../components/admin/UserPickerDialog";

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
  const [selectedUserIds, setSelectedUserIds] = useState<string[]>([]);
  const [period, setPeriod] = useState<Period>("all");
  const [rows, setRows] = useState<UserSongListeningRow[] | null>(null);
  const [tableLoading, setTableLoading] = useState(false);
  const [error, setError] = useState("");

  const [expandedSongId, setExpandedSongId] = useState<string | null>(null);
  const [sessionsBySong, setSessionsBySong] = useState<Record<string, ListeningSessionRow[]>>({});
  const [sessionsLoadingId, setSessionsLoadingId] = useState<string | null>(null);
  const [userPickerOpen, setUserPickerOpen] = useState(false);
  const sessionsFetchAc = useRef<AbortController | null>(null);

  const selectionKey = selectedUserIds.join(",");

  const syncUrl = useCallback(
    (ids: string[], multi: boolean) => {
      setSearchParams(
        (prev) => {
          const p = new URLSearchParams(prev);
          p.delete("user");
          if (ids.length === 0) {
            p.delete("users");
            p.delete("multi");
            return p;
          }
          p.set("users", ids.join(","));
          if (multi && ids.length === 1) p.set("multi", "1");
          else p.delete("multi");
          return p;
        },
        { replace: true }
      );
    },
    [setSearchParams]
  );

  useEffect(() => {
    queueMicrotask(() => {
      setExpandedSongId(null);
      setSessionsBySong({});
      setSessionsLoadingId(null);
    });
    sessionsFetchAc.current?.abort();
    sessionsFetchAc.current = null;
  }, [selectionKey, period]);

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

  useLayoutEffect(() => {
    if (users.length === 0) return;

    const defaultId = users[0]?.id;
    if (!defaultId) return;

    const rawUsers = searchParams.get("users");
    const legacyUser = searchParams.get("user");
    const raw = rawUsers ?? legacyUser ?? "";
    const parsed = raw
      .split(",")
      .map((s) => s.trim())
      .filter((id) => id.length > 0 && users.some((u) => u.id === id));

    const nextIds = parsed.length > 0 ? parsed : [defaultId];

    setSelectedUserIds((prev) =>
      prev.length === nextIds.length && prev.every((id, i) => id === nextIds[i]) ? prev : nextIds
    );

    if (legacyUser && !rawUsers) {
      syncUrl(nextIds, nextIds.length === 1 && searchParams.get("multi") === "1");
    } else if (!rawUsers && !legacyUser && nextIds.length > 0) {
      syncUrl(nextIds, nextIds.length === 1 && searchParams.get("multi") === "1");
    }
  }, [users, searchParams, syncUrl]);

  useEffect(() => {
    const listeningUserIds = selectedUserIds.filter((id) => typeof id === "string" && id.trim() !== "");
    if (listeningUserIds.length === 0) {
      queueMicrotask(() => setRows(null));
      return;
    }

    const ac = new AbortController();
    let cancelled = false;

    void (async () => {
      setTableLoading(true);
      try {
        const data = await fetchAdminListeningBySong(listeningUserIds, period, 500, { signal: ac.signal });
        if (!cancelled) {
          setRows(data);
          setError("");
        }
      } catch (e: unknown) {
        if (e instanceof DOMException && e.name === "AbortError") return;
        if (!cancelled) {
          const msg =
            e instanceof ApiError ? `${e.message} (HTTP ${e.status})` : e instanceof Error ? e.message : "Failed to load listening data";
          setError(msg);
          setRows([]);
        }
      } finally {
        if (!cancelled) setTableLoading(false);
      }
    })();

    return () => {
      cancelled = true;
      ac.abort();
    };
  }, [selectedUserIds, period]);

  function handleUsersConfirm(ids: string[]) {
    const cleaned = ids.map((id) => id.trim()).filter((id) => id.length > 0);
    if (cleaned.length === 0) return;
    setSelectedUserIds(cleaned);
    syncUrl(cleaned, false);
  }

  async function toggleSongSessions(songId: string) {
    if (expandedSongId === songId) {
      setExpandedSongId(null);
      return;
    }
    setExpandedSongId(songId);
    const sessionUserIds = selectedUserIds.filter((id) => typeof id === "string" && id.trim() !== "");
    if (sessionsBySong[songId] || sessionUserIds.length === 0) return;
    sessionsFetchAc.current?.abort();
    const ac = new AbortController();
    sessionsFetchAc.current = ac;
    setSessionsLoadingId(songId);
    try {
      const data = await fetchAdminListeningSessions(sessionUserIds, period, 500, songId, { signal: ac.signal });
      if (sessionsFetchAc.current === ac) {
        setSessionsBySong((prev) => ({ ...prev, [songId]: data }));
      }
    } catch (e: unknown) {
      if (e instanceof DOMException && e.name === "AbortError") return;
      const msg =
        e instanceof ApiError ? `${e.message} (HTTP ${e.status})` : e instanceof Error ? e.message : "Failed to load play sessions";
      setError(msg);
      if (sessionsFetchAc.current === ac) {
        setSessionsBySong((prev) => ({ ...prev, [songId]: [] }));
      }
    } finally {
      if (sessionsFetchAc.current === ac) {
        setSessionsLoadingId(null);
        sessionsFetchAc.current = null;
      }
    }
  }

  const userById = useMemo(() => new Map(users.map((u) => [u.id, u.email])), [users]);

  const pickerButtonLabel = useMemo(() => {
    if (usersLoading) return "Loading users…";
    if (users.length === 0) return "No users";
    if (selectedUserIds.length === 0) return "Select users";
    if (selectedUserIds.length === 1) return userById.get(selectedUserIds[0]) ?? "Select users";
    return `${selectedUserIds.length} users`;
  }, [usersLoading, users.length, selectedUserIds, userById]);

  const summaryLine = useMemo(() => {
    if (selectedUserIds.length === 0) return null;
    if (selectedUserIds.length === 1) {
      const em = userById.get(selectedUserIds[0]);
      return em ? `Showing data for ${em}` : null;
    }
    const emails = selectedUserIds.map((id) => userById.get(id) ?? id.slice(0, 8));
    const joined = emails.slice(0, 4).join(", ");
    const extra = emails.length > 4 ? ` +${emails.length - 4} more` : "";
    return `Combined listening for ${joined}${extra}`;
  }, [selectedUserIds, userById]);

  const showSessionUser = selectedUserIds.length > 1;

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
          <button
            type="button"
            onClick={() => setUserPickerOpen(true)}
            disabled={usersLoading || users.length === 0}
            className="flex w-full max-w-xl items-center justify-between gap-3 rounded-xl border border-white/10 bg-surface-900 px-4 py-2.5 text-left text-sm text-white transition-colors hover:border-white/20 hover:bg-surface-800/80 disabled:cursor-not-allowed disabled:opacity-50 focus:outline-none focus:ring-1 focus:ring-aurora-500/50"
            aria-haspopup="dialog"
          >
            <span className="min-w-0 truncate">{pickerButtonLabel}</span>
            <svg className="h-5 w-5 shrink-0 text-surface-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
            </svg>
          </button>
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

      <UserPickerDialog
        key={`${String(userPickerOpen)}-${selectionKey}`}
        open={userPickerOpen}
        onClose={() => setUserPickerOpen(false)}
        users={users}
        mode="multi"
        selectedUserIds={selectedUserIds}
        onConfirm={handleUsersConfirm}
      />

      {summaryLine && <p className="text-sm text-surface-500">{summaryLine}</p>}

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
                          Each row is one play. Listened is reported seconds for that session (up to 500 plays per song in this
                          period).
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
                                  {showSessionUser && <th className="py-2 px-3 font-medium">User</th>}
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
                                    {showSessionUser && (
                                      <td className="py-2 px-3 whitespace-nowrap text-surface-400 max-w-[10rem] truncate" title={s.user_id}>
                                        {userById.get(s.user_id) ?? `${s.user_id.slice(0, 8)}…`}
                                      </td>
                                    )}
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
        {!tableLoading && rows && rows.length === 0 && selectedUserIds.length > 0 && (
          <p className="text-sm text-surface-500 px-4 py-8 text-center border-t border-white/5">
            No playback data for this period.
          </p>
        )}
      </div>
    </div>
  );
}

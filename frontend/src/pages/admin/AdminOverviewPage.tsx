// Human: Admin home dashboard — server-wide totals plus cross-user listening KPIs with refresh on mount.
// Agent: loadStats callback; fetchAdminStats+fetchAdminListeningStats; QUICK ACTIONS useNavigate to admin subroutes.
import { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { fetchAdminStats, fetchAdminListeningStats } from "../../api/client";
import AdminStatCard from "../../components/admin/AdminStatCard";
import AdminGlassCard from "../../components/admin/AdminGlassCard";
import AdminActionCard from "../../components/admin/AdminActionCard";
import PageHeader from "../../components/admin/PageHeader";

function formatBytes(bytes: number) {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
}

function formatNumber(n: number) {
  return new Intl.NumberFormat("en-US").format(n);
}

function formatDurationShort(seconds: number) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

export default function AdminOverviewPage() {
  const navigate = useNavigate();
  const [stats, setStats] = useState<{
    total_users: number;
    total_songs: number;
    total_playlists: number;
    total_storage_bytes: number;
  } | null>(null);
  const [listeningStats, setListeningStats] = useState<{
    total_plays: number;
    active_users: number;
    total_listening_seconds: number;
    avg_duration_seconds: number;
  } | null>(null);
  const [error, setError] = useState("");
  const [listeningStatsError, setListeningStatsError] = useState("");

  const loadStats = useCallback(async () => {
    try {
      const data = await fetchAdminStats();
      setStats(data);
      setError("");
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to load stats");
    }
    try {
      const lData = await fetchAdminListeningStats();
      setListeningStats(lData);
      setListeningStatsError("");
    } catch (e: unknown) {
      setListeningStats(null);
      setListeningStatsError(e instanceof Error ? e.message : "Failed to load listening stats");
    }
  }, []);

  useEffect(() => {
    loadStats();
  }, [loadStats]);

  const headerError = [error, listeningStatsError].filter(Boolean).join(" · ") || undefined;

  return (
    <div className="space-y-6">
      <PageHeader title="Overview" error={headerError} />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <AdminStatCard
          label="Users"
          value={stats ? formatNumber(stats.total_users) : "—"}
          icon={
            <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197m13.5-9a2.5 2.5 0 11-5 0 2.5 2.5 0 015 0z" />
            </svg>
          }
          colorClass="bg-aurora-600/20 text-aurora-400"
        />
        <AdminStatCard
          label="Songs"
          value={stats ? formatNumber(stats.total_songs) : "—"}
          icon={
            <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3" />
            </svg>
          }
          colorClass="bg-emerald-500/20 text-emerald-400"
        />
        <AdminStatCard
          label="Playlists"
          value={stats ? formatNumber(stats.total_playlists) : "—"}
          icon={
            <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
            </svg>
          }
          colorClass="bg-amber-500/20 text-amber-400"
        />
        <AdminStatCard
          label="Storage Used"
          value={stats ? formatBytes(stats.total_storage_bytes) : "—"}
          icon={
            <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4m0 5c0 2.21-3.582 4-8 4s-8-1.79-8-4" />
            </svg>
          }
          colorClass="bg-rose-500/20 text-rose-400"
        />
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <AdminStatCard
          label="Total Plays"
          value={listeningStats ? formatNumber(listeningStats.total_plays) : "—"}
          icon={
            <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          }
          colorClass="bg-sky-500/20 text-sky-400"
        />
        <AdminStatCard
          label="Active Listeners"
          value={listeningStats ? formatNumber(listeningStats.active_users) : "—"}
          icon={
            <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
            </svg>
          }
          colorClass="bg-violet-500/20 text-violet-400"
        />
        <AdminStatCard
          label="Total Listening Time"
          value={listeningStats ? formatDurationShort(listeningStats.total_listening_seconds) : "—"}
          icon={
            <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          }
          colorClass="bg-orange-500/20 text-orange-400"
        />
        <AdminStatCard
          label="Avg Session"
          value={listeningStats ? formatDurationShort(listeningStats.avg_duration_seconds) : "—"}
          icon={
            <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
            </svg>
          }
          colorClass="bg-pink-500/20 text-pink-400"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <AdminGlassCard title="Quick Actions">
          <div className="grid grid-cols-2 gap-3">
            <AdminActionCard icon={<UsersIcon />} label="Manage Users" onClick={() => navigate("/admin/users")} />
            <AdminActionCard icon={<LibraryIcon />} label="Browse Library" onClick={() => navigate("/admin/library")} />
            <AdminActionCard icon={<PlaylistsIcon />} label="View Playlists" onClick={() => navigate("/admin/playlists")} />
            <AdminActionCard icon={<SettingsIcon />} label="Edit Settings" onClick={() => navigate("/admin/settings")} />
          </div>
        </AdminGlassCard>

        <AdminGlassCard title="System Info">
          <div className="space-y-3 text-sm">
            <InfoRow label="Total registered users" value={stats ? formatNumber(stats.total_users) : "—"} />
            <InfoRow label="Tracks in library" value={stats ? formatNumber(stats.total_songs) : "—"} />
            <InfoRow label="User playlists" value={stats ? formatNumber(stats.total_playlists) : "—"} />
            <InfoRow label="Library storage" value={stats ? formatBytes(stats.total_storage_bytes) : "—"} />
          </div>
        </AdminGlassCard>
      </div>
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between text-surface-400">
      <span>{label}</span>
      <span className="text-white font-medium">{value}</span>
    </div>
  );
}

function UsersIcon() {
  return (
    <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128A9.373 9.373 0 0112.005 21m0 0v-.003c0-1.113-.285-2.16-.786-3.07m0 0a9.378 9.378 0 00-4.252 1.935M12.005 21a9.38 9.38 0 01-2.625-.372m0 0a9.337 9.337 0 01-4.121-.952 4.125 4.125 0 007.533 2.493m0 0v.003c0 1.113.285 2.16.786 3.07m0 0a9.378 9.378 0 004.252-1.935M12.005 21v.005" />
    </svg>
  );
}
function LibraryIcon() {
  return (
    <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3" />
    </svg>
  );
}
function PlaylistsIcon() {
  return (
    <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
    </svg>
  );
}
function SettingsIcon() {
  return (
    <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
    </svg>
  );
}

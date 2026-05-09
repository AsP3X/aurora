import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import {
  fetchSongs,
  fetchRecentSongs,
  fetchHistory,
  fetchStats,
  fetchPlaylists,
  createPlaylist,
} from "../api/client";
import ArtworkImage from "../components/ArtworkImage";
import { useAuth } from "../context/AuthContext";
import type { Song, Playlist } from "../types";

/* ─── Helpers ─── */
function formatDuration(seconds: number) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

function formatNumber(n: number) {
  return new Intl.NumberFormat("en-US").format(n);
}

/* ─── Sub-components ─── */
function SongCard({ song }: { song: Song }) {
  return (
    <Link
      to={`/player/${song.id}`}
      className="group block space-y-3 hover:bg-surface-900/40 rounded-xl p-2 transition-all duration-200"
    >
      <div className="relative aspect-square bg-surface-900 border border-white/5 rounded-xl overflow-hidden shadow-sm">
        <ArtworkImage
          songId={song.id}
          title={song.title}
          artist={song.artist}
          className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
        />
        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-colors flex items-center justify-center opacity-0 group-hover:opacity-100">
          <div className="w-10 h-10 rounded-full bg-aurora-600/90 backdrop-blur-sm flex items-center justify-center shadow-lg">
            <svg className="w-5 h-5 text-white ml-0.5" fill="currentColor" viewBox="0 0 24 24">
              <path d="M8 5v14l11-7z" />
            </svg>
          </div>
        </div>
      </div>
      <div className="px-1">
        <p className="text-sm font-medium text-white truncate group-hover:text-aurora-300 transition-colors">
          {song.title}
        </p>
        <p className="text-xs text-surface-400 truncate">{song.artist}</p>
      </div>
    </Link>
  );
}

function StatCard({
  label,
  value,
  icon,
  colorClass,
}: {
  label: string;
  value: string;
  icon: React.ReactNode;
  colorClass: string;
}) {
  return (
    <div className="bg-surface-900 border border-white/5 rounded-2xl p-5 flex items-center gap-4 hover:border-white/10 transition-colors">
      <div className={`w-12 h-12 rounded-xl flex items-center justify-center shrink-0 ${colorClass}`}>
        {icon}
      </div>
      <div>
        <p className="text-2xl font-bold text-white tracking-tight">{value}</p>
        <p className="text-xs text-surface-400 font-medium uppercase tracking-wider">{label}</p>
      </div>
    </div>
  );
}

function SidebarPlaylistItem({ playlist }: { playlist: Playlist }) {
  return (
    <Link
      to={`/playlist/${playlist.id}`}
      className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-white/5 transition-colors group"
    >
      <div className="w-8 h-8 rounded-md bg-surface-900 border border-white/5 flex items-center justify-center shrink-0 group-hover:border-aurora-500/30 transition-colors">
        <svg className="w-4 h-4 text-surface-500 group-hover:text-aurora-400 transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3" />
        </svg>
      </div>
      <span className="text-sm text-surface-300 truncate group-hover:text-white transition-colors">{playlist.name}</span>
    </Link>
  );
}

function MiniPlayer({ lastPlayed }: { lastPlayed: { id: string; title: string; artist: string; artwork_key: string | null; duration_seconds: number } | null }) {
  const navigate = useNavigate();
  if (!lastPlayed) {
    return (
      <div className="p-4 border-t border-white/5">
        <div className="h-20 bg-surface-900/60 border border-white/5 rounded-xl flex items-center justify-center">
          <span className="text-xs text-surface-500">Nothing played recently</span>
        </div>
      </div>
    );
  }
  return (
    <div className="p-4 border-t border-white/5">
      <div className="bg-surface-900/60 border border-white/5 rounded-xl p-3 flex items-center gap-3">
        <div className="w-10 h-10 rounded-lg bg-surface-950 overflow-hidden shrink-0">
          <ArtworkImage
            songId={lastPlayed.id}
            title={lastPlayed.title}
            artist={lastPlayed.artist}
            className="w-full h-full object-cover"
          />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-xs font-medium text-white truncate">{lastPlayed.title}</p>
          <p className="text-[11px] text-surface-400 truncate">{lastPlayed.artist}</p>
        </div>
        <button
          onClick={() => navigate(`/player/${lastPlayed.id}`)}
          className="w-8 h-8 rounded-full bg-aurora-600 hover:bg-aurora-500 flex items-center justify-center transition-colors shrink-0"
        >
          <svg className="w-4 h-4 text-white ml-0.5" fill="currentColor" viewBox="0 0 24 24">
            <path d="M8 5v14l11-7z" />
          </svg>
        </button>
      </div>
    </div>
  );
}

/* ─── Main page ─── */
export default function Library() {
  const { user, logout, can } = useAuth();
  const { pathname } = useLocation();
  const searchRef = useRef<HTMLInputElement>(null);

  /* Data states */
  const [stats, setStats] = useState<{ total_songs: number; total_artists: number; total_albums: number; total_duration_seconds: number } | null>(null);
  const [recentSongs, setRecentSongs] = useState<Song[]>([]);
  const [history, setHistory] = useState<Array<{ id: string; song_id: string; title: string; artist: string; album: string | null; artwork_key: string | null; duration_seconds: number; started_at: string }> | null>(null);
  const [playlists, setPlaylists] = useState<Playlist[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<Song[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [showNewPlaylist, setShowNewPlaylist] = useState(false);
  const [newPlaylistName, setNewPlaylistName] = useState("");
  const [creatingPlaylist, setCreatingPlaylist] = useState(false);

  /* Keyboard shortcut: / to focus search */
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "/" && !["INPUT", "TEXTAREA"].includes((e.target as HTMLElement).tagName)) {
        e.preventDefault();
        searchRef.current?.focus();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  /* Load dashboard data */
  useEffect(() => {
    let mounted = true;
    setLoading(true);

    Promise.all([
      fetchStats().catch(() => null),
      fetchRecentSongs(12).catch(() => []),
      fetchHistory().catch(() => []),
      fetchPlaylists().catch(() => []),
    ]).then(([statsData, recent, historyData, playlistsData]) => {
      if (!mounted) return;
      setStats(statsData);
      setRecentSongs(recent);
      setHistory(historyData);
      setPlaylists(playlistsData);
      setLoading(false);
    });

    return () => { mounted = false; };
  }, []);

  /* Search handler */
  useEffect(() => {
    if (!searchQuery.trim()) {
      setSearchResults(null);
      return;
    }
    const timer = setTimeout(() => {
      fetchSongs({ q: searchQuery.trim(), limit: 12 }).then(setSearchResults).catch(() => setSearchResults([]));
    }, 250);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  const lastPlayed = useMemo(() => {
    if (!history || history.length === 0) return null;
    return history[0];
  }, [history]);

  const displaySongs = searchResults !== null ? searchResults : recentSongs;
  const isSearching = searchQuery.trim().length > 0;

  async function handleCreatePlaylist(e: React.FormEvent) {
    e.preventDefault();
    if (!newPlaylistName.trim()) return;
    setCreatingPlaylist(true);
    try {
      const p = await createPlaylist(newPlaylistName.trim());
      setPlaylists((prev) => [p, ...prev]);
      setNewPlaylistName("");
      setShowNewPlaylist(false);
    } finally {
      setCreatingPlaylist(false);
    }
  }

  if (loading) {
    return (
      <div className="h-screen flex flex-col bg-surface-950">
        <div className="flex-1 flex items-center justify-center">
          <div className="flex flex-col items-center gap-4">
            <div className="w-8 h-8 border-2 border-aurora-500 border-t-transparent rounded-full animate-spin" />
            <p className="text-surface-400 text-sm">Loading dashboard...</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col bg-surface-950">
      {/* ─── Topbar ─── */}
      <div className="h-16 bg-white/5 border-b border-white/10 backdrop-blur-xl shrink-0 flex items-center justify-between px-6">
        {/* Logo */}
        <Link to="/" className="flex items-center gap-3 group">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-aurora-500 to-aurora-700 flex items-center justify-center shadow-lg shadow-aurora-500/20 group-hover:shadow-aurora-500/30 transition-shadow">
            <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3" />
            </svg>
          </div>
          <span className="font-bold tracking-tight text-white">Aurora</span>
        </Link>

        {/* Global search */}
        <div className="flex-1 max-w-xl mx-8 relative">
          <div className="relative">
            <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-surface-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input
              ref={searchRef}
              type="text"
              placeholder="Search songs, artists, albums..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full h-10 bg-surface-900 border border-white/5 rounded-full pl-10 pr-4 text-sm text-white placeholder-surface-500 focus:outline-none focus:ring-1 focus:ring-aurora-500/50 focus:border-aurora-500/30 transition-all"
            />
            {isSearching && (
              <button
                onClick={() => setSearchQuery("")}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-surface-500 hover:text-white transition-colors"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            )}
          </div>
        </div>

        {/* Right actions */}
        <div className="flex items-center gap-3">
          {/* Notification bell */}
          <button className="w-9 h-9 rounded-full bg-surface-900 border border-white/5 flex items-center justify-center text-surface-400 hover:text-white hover:border-white/10 transition-colors relative">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
            </svg>
          </button>

          {/* User avatar + dropdown */}
          <div className="relative">
            <button
              onClick={() => setShowUserMenu((v) => !v)}
              className="flex items-center gap-2 pl-1 pr-2 py-1 rounded-full bg-surface-900 border border-white/5 hover:border-white/10 transition-colors"
            >
              <div className="w-7 h-7 rounded-full bg-gradient-to-br from-aurora-500 to-aurora-700 flex items-center justify-center text-xs font-bold text-white">
                {user?.email?.[0]?.toUpperCase() || "?"}
              </div>
              <span className="text-xs text-surface-300 hidden sm:block max-w-[120px] truncate">{user?.email}</span>
              <svg className="w-3 h-3 text-surface-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
              </svg>
            </button>
            {showUserMenu && (
              <>
                <div className="absolute right-0 mt-2 w-48 bg-surface-900 border border-white/10 rounded-xl shadow-xl z-50 overflow-hidden">
                  <div className="px-4 py-3 border-b border-white/5">
                    <p className="text-sm font-medium text-white truncate">{user?.email}</p>
                    <p className="text-xs text-surface-500 capitalize">{user?.role}</p>
                  </div>
                  {can("admin.access") && (
                    <Link
                      to="/admin"
                      onClick={() => setShowUserMenu(false)}
                      className="flex items-center gap-2 px-4 py-2 text-sm text-surface-300 hover:text-white hover:bg-white/5 transition-colors"
                    >
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                        <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                      </svg>
                      Admin
                    </Link>
                  )}
                  <button
                    onClick={() => { logout(); setShowUserMenu(false); }}
                    className="w-full text-left flex items-center gap-2 px-4 py-2 text-sm text-surface-300 hover:text-red-400 hover:bg-red-500/5 transition-colors"
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                    </svg>
                    Sign out
                  </button>
                </div>
                <div className="fixed inset-0 z-40" onClick={() => setShowUserMenu(false)} />
              </>
            )}
          </div>
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* ─── Sidebar ─── */}
        <div className="w-64 bg-white/5 border-r border-white/10 backdrop-blur-xl shrink-0 flex flex-col">
          {/* Main nav */}
          <div className="p-4 space-y-1">
            <SidebarNavItem to="/" label="Library" icon={<LibraryIcon />} active={pathname === "/"} />
            <SidebarNavItem to="/playlists" label="Playlists" icon={<PlaylistsIcon />} active={pathname === "/playlists" || pathname.startsWith("/playlist/")} />
            <SidebarNavItem to="/artists" label="Artists" icon={<ArtistsIcon />} active={pathname === "/artists"} disabled />
            <SidebarNavItem to="/albums" label="Albums" icon={<AlbumsIcon />} active={pathname === "/albums"} disabled />
            <SidebarNavItem to="/genres" label="Genres" icon={<GenresIcon />} active={pathname === "/genres"} disabled />
          </div>

          {/* Divider */}
          <div className="mx-4 h-px bg-white/5" />

          {/* Quick actions */}
          <div className="p-4 space-y-2">
            <button
              onClick={() => setShowNewPlaylist(true)}
              className="w-full flex items-center gap-2 px-3 py-2 rounded-lg bg-surface-900/60 border border-white/5 hover:border-aurora-500/30 hover:bg-surface-900 transition-colors text-sm text-surface-300 hover:text-white"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
              </svg>
              New Playlist
            </button>
            <button
              disabled
              className="w-full flex items-center gap-2 px-3 py-2 rounded-lg bg-surface-900/60 border border-white/5 text-sm text-surface-500 cursor-not-allowed"
              title="Library scan coming soon"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
              </svg>
              Import Music
            </button>
          </div>

          {/* New playlist inline form */}
          {showNewPlaylist && (
            <div className="px-4 pb-2">
              <form onSubmit={handleCreatePlaylist} className="flex gap-2">
                <input
                  autoFocus
                  type="text"
                  placeholder="Playlist name..."
                  value={newPlaylistName}
                  onChange={(e) => setNewPlaylistName(e.target.value)}
                  className="flex-1 min-w-0 px-3 py-1.5 bg-surface-950 border border-white/10 rounded-lg text-sm text-white placeholder-surface-500 focus:outline-none focus:ring-1 focus:ring-aurora-500"
                />
                <button
                  type="submit"
                  disabled={creatingPlaylist || !newPlaylistName.trim()}
                  className="px-3 py-1.5 bg-aurora-600 hover:bg-aurora-500 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50"
                >
                  {creatingPlaylist ? "..." : "Add"}
                </button>
              </form>
            </div>
          )}

          {/* Divider */}
          <div className="mx-4 h-px bg-white/5" />

          {/* Playlists section */}
          <div className="p-4 flex-1 overflow-auto min-h-0">
            <div className="text-xs font-semibold text-surface-500 uppercase tracking-wider mb-3">
              Your Playlists
            </div>
            <div className="space-y-1">
              {playlists.length === 0 ? (
                <p className="text-xs text-surface-500 px-3">No playlists yet</p>
              ) : (
                playlists.map((p) => <SidebarPlaylistItem key={p.id} playlist={p} />)
              )}
            </div>
          </div>

          {/* Mini player */}
          <MiniPlayer lastPlayed={lastPlayed} />
        </div>

        {/* ─── Main content ─── */}
        <div className="flex-1 bg-surface-950 p-8 overflow-auto">
          {/* Stats row */}
          {stats && !isSearching && (
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
              <StatCard
                label="Total Songs"
                value={formatNumber(stats.total_songs)}
                icon={
                  <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3" />
                  </svg>
                }
                colorClass="bg-aurora-600/20 text-aurora-400"
              />
              <StatCard
                label="Artists"
                value={formatNumber(stats.total_artists)}
                icon={
                  <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                  </svg>
                }
                colorClass="bg-rose-500/20 text-rose-400"
              />
              <StatCard
                label="Albums"
                value={formatNumber(stats.total_albums)}
                icon={
                  <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                }
                colorClass="bg-amber-500/20 text-amber-400"
              />
              <StatCard
                label="Total Duration"
                value={formatDuration(stats.total_duration_seconds)}
                icon={
                  <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                }
                colorClass="bg-emerald-500/20 text-emerald-400"
              />
            </div>
          )}

          {/* Search results or Recently Added */}
          <div className="space-y-8">
            <div>
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold text-white">
                  {isSearching ? `Search results for "${searchQuery}"` : "Recently Added"}
                </h2>
                {isSearching && searchResults !== null && (
                  <span className="text-xs text-surface-500">{searchResults.length} found</span>
                )}
              </div>
              {displaySongs.length === 0 ? (
                <div className="text-center py-12">
                  <p className="text-surface-500 text-sm">
                    {isSearching ? "No songs match your search." : "No songs in the library yet."}
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
                  {displaySongs.map((song) => (
                    <SongCard key={song.id} song={song} />
                  ))}
                </div>
              )}
            </div>

            {/* Recently Played */}
            {!isSearching && history && history.length > 0 && (
              <div>
                <h2 className="text-lg font-semibold text-white mb-4">Recently Played</h2>
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
                  {history.slice(0, 6).map((entry) => (
                    <Link
                      key={entry.id}
                      to={`/player/${entry.song_id}`}
                      className="group block space-y-3 hover:bg-surface-900/40 rounded-xl p-2 transition-all duration-200"
                    >
                      <div className="relative aspect-square bg-surface-900 border border-white/5 rounded-xl overflow-hidden shadow-sm">
                        <ArtworkImage
                          songId={entry.song_id}
                          title={entry.title}
                          artist={entry.artist || undefined}
                          className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
                        />
                        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-colors flex items-center justify-center opacity-0 group-hover:opacity-100">
                          <div className="w-10 h-10 rounded-full bg-aurora-600/90 backdrop-blur-sm flex items-center justify-center shadow-lg">
                            <svg className="w-5 h-5 text-white ml-0.5" fill="currentColor" viewBox="0 0 24 24">
                              <path d="M8 5v14l11-7z" />
                            </svg>
                          </div>
                        </div>
                      </div>
                      <div className="px-1">
                        <p className="text-sm font-medium text-white truncate group-hover:text-aurora-300 transition-colors">
                          {entry.title}
                        </p>
                        <p className="text-xs text-surface-400 truncate">{entry.artist}</p>
                      </div>
                    </Link>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ─── Sidebar nav item ─── */
function SidebarNavItem({
  to,
  label,
  icon,
  active,
  disabled,
}: {
  to: string;
  label: string;
  icon: React.ReactNode;
  active: boolean;
  disabled?: boolean;
}) {
  if (disabled) {
    return (
      <div className="flex items-center gap-3 px-3 py-2 rounded-lg text-surface-600 cursor-not-allowed" title="Coming soon">
        <span className="text-surface-600">{icon}</span>
        <span className="text-sm">{label}</span>
        <span className="ml-auto text-[10px] uppercase tracking-wider font-medium text-surface-700 border border-surface-700/30 px-1.5 py-0.5 rounded">Soon</span>
      </div>
    );
  }
  return (
    <Link
      to={to}
      className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
        active
          ? "bg-white/10 text-white"
          : "text-surface-400 hover:text-white hover:bg-white/5"
      }`}
    >
      <span className={active ? "text-aurora-400" : "text-surface-500"}>{icon}</span>
      {label}
    </Link>
  );
}

/* ─── Icons ─── */
function LibraryIcon() {
  return (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
    </svg>
  );
}

function PlaylistsIcon() {
  return (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3" />
    </svg>
  );
}

function ArtistsIcon() {
  return (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
    </svg>
  );
}

function AlbumsIcon() {
  return (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
    </svg>
  );
}

function GenresIcon() {
  return (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M7 20l4-16m2 16l4-16M6 9h14M4 15h14" />
    </svg>
  );
}

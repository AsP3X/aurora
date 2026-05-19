// Human: Library-mode shell — fixed sidebar with playlists + nav, top search slot, and “mini player” from last history entry.
// Agent: LOADS fetchPlaylists+fetchHistory on pathname; CLOSES mobile sidebar on route change; CHILDREN in scroll main; topbarExtra slot.
import { useEffect, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { fetchPlaylists, fetchHistory, createPlaylist } from "../api/client";
import { useAuth } from "../context/AuthContext";
import ArtworkImage from "./ArtworkImage";
import type { Playlist } from "../types";
import SkipLink from "./SkipLink";

export default function DashboardLayout({
  children,
  topbarExtra,
}: {
  children: React.ReactNode;
  topbarExtra?: React.ReactNode;
}) {
  const { user, logout, can } = useAuth();
  const { pathname } = useLocation();

  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [showNewPlaylist, setShowNewPlaylist] = useState(false);
  const [newPlaylistName, setNewPlaylistName] = useState("");
  const [creatingPlaylist, setCreatingPlaylist] = useState(false);
  const [playlists, setPlaylists] = useState<Playlist[]>([]);
  const [lastPlayed, setLastPlayed] = useState<{
    id: string;
    title: string;
    artist: string;
    artwork_key: string | null;
    duration_seconds: number;
  } | null>(null);

  // Human: Refresh sidebar playlists and “last played” card whenever navigation changes so lists feel current.
  // Agent: EFFECT [pathname]; PARALLEL fetchPlaylists+fetchHistory; DERIVES lastPlayed from hist[0].
  useEffect(() => {
    let mounted = true;
    Promise.all([
      fetchPlaylists().catch(() => []),
      fetchHistory().catch(() => []),
    ]).then(([pls, hist]) => {
      if (!mounted) return;
      setPlaylists(pls);
      if (hist && hist.length > 0) {
        const h = hist[0];
        setLastPlayed({
          id: h.song_id,
          title: h.title,
          artist: h.artist,
          artwork_key: h.artwork_key,
          duration_seconds: h.duration_seconds,
        });
      }
    });
    return () => { mounted = false; };
  }, [pathname]);

  // Human: Mobile drawer should not stay open after navigating — otherwise it obscures the new page.
  // Agent: EFFECT [pathname]; SETS sidebarOpen false.
  useEffect(() => {
    setSidebarOpen(false);
  }, [pathname]);

  // Human: Inline “New playlist” form posts to API then prepends the created row for instant sidebar feedback.
  // Agent: handleSubmit; CALLS createPlaylist; UPDATES playlists state; RESETS form fields.
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

  return (
    <div className="flex flex-col bg-surface-950 h-screen">
      <SkipLink />
      {/* ─── Topbar ─── */}
      <div className="h-16 bg-white/5 border-b border-white/10 backdrop-blur-xl shrink-0 flex items-center justify-between px-4 md:px-6">
        <div className="flex items-center gap-3">
          <button
            onClick={() => setSidebarOpen((v) => !v)}
            className="md:hidden p-2 rounded-lg text-surface-300 hover:text-white hover:bg-white/5 transition-colors"
            aria-label="Toggle sidebar"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              {sidebarOpen ? (
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              ) : (
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
              )}
            </svg>
          </button>
          <Link to="/" className="flex items-center gap-3 group">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-aurora-500 to-aurora-700 flex items-center justify-center shadow-lg shadow-aurora-500/20 group-hover:shadow-aurora-500/30 transition-shadow">
              <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3" />
              </svg>
            </div>
            <span className="font-bold tracking-tight text-white hidden sm:block">Aurora</span>
          </Link>
        </div>

        {/* Extra topbar content (e.g. search) */}
        {topbarExtra && <div className="flex-1 max-w-xl mx-4 md:mx-8">{topbarExtra}</div>}

        {/* Right actions */}
        <div className="flex items-center gap-3">
          <div className="relative">
            <button
              type="button"
              onClick={() => setShowUserMenu((v) => !v)}
              className="flex items-center gap-2 pl-1 pr-2 py-1 rounded-full bg-surface-900 border border-white/5 hover:border-white/10 transition-colors focus:outline-none focus:ring-2 focus:ring-aurora-500/50"
              aria-expanded={showUserMenu}
              aria-haspopup="menu"
              aria-label={`Account menu for ${user?.email ?? "user"}`}
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

      {/* Mobile sidebar overlay */}
      {sidebarOpen && (
        <div
          className="md:hidden fixed top-16 left-0 right-0 bottom-0 z-40 bg-black/50 backdrop-blur-sm"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* ─── Sidebar ─── */}
      <div className={`fixed left-0 top-16 w-64 z-50 md:z-30 bg-white/5 border-r border-white/10 backdrop-blur-xl flex flex-col h-[calc(100vh-4rem)] transition-transform duration-300 ${sidebarOpen ? "translate-x-0" : "-translate-x-full"} md:translate-x-0`}>
        {/* Main nav */}
        <div className="p-4 space-y-1">
          <SidebarNavItem to="/" label="Library" icon={<LibraryIcon />} active={pathname === "/"} />
          <SidebarNavItem to="/playlists" label="Playlists" icon={<PlaylistsIcon />} active={pathname === "/playlists" || pathname.startsWith("/playlist/")} />
          <SidebarNavItem to="/artists" label="Artists" icon={<ArtistsIcon />} active={pathname === "/artists"} disabled />
          <SidebarNavItem to="/albums" label="Albums" icon={<AlbumsIcon />} active={pathname === "/albums"} disabled />
          <SidebarNavItem to="/genres" label="Genres" icon={<GenresIcon />} active={pathname === "/genres"} disabled />
        </div>

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
      <main
        id="main-content"
        tabIndex={-1}
        className="md:ml-64 flex-1 bg-surface-950 p-4 md:p-8 pb-28 md:pb-8 overflow-auto"
      >
        {children}
      </main>
    </div>
  );
}

// Human: Nav row in sidebar — `disabled` renders a static “Soon” placeholder instead of a link.
// Agent: NavItem; CONDITIONAL disabled div vs Link; highlights when `active` prop true.
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

// Human: Single playlist shortcut row in the sidebar list — navigates to `/playlist/:id`.
// Agent: Link; DISPLAYS avatar placeholder icon + name.
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

// Human: Footer teaser that deep-links to the last history entry’s full player — purely navigational, no playback start.
// Agent: Link /player/:id; USES ArtworkImage for thumb.
function MiniPlayer({ lastPlayed }: { lastPlayed: { id: string; title: string; artist: string; artwork_key: string | null; duration_seconds: number } | null }) {
  if (!lastPlayed) {
    return (
      <div className="p-4 border-t border-white/5">
        <div className="h-20 bg-surface-900/60 border border-white/5 rounded-xl flex items-center justify-center">
          <span className="text-xs text-surface-500">Start listening</span>
        </div>
      </div>
    );
  }
  return (
    <div className="p-4 border-t border-white/5">
      <Link to={`/player/${lastPlayed.id}`} className="bg-surface-900/60 border border-white/5 rounded-xl p-3 flex items-center gap-3 hover:border-white/10 transition-colors">
        <div className="w-10 h-10 rounded-lg bg-surface-950 overflow-hidden shrink-0">
          <ArtworkImage
            songId={lastPlayed.id}
            title={lastPlayed.title}
            artist={lastPlayed.artist}
            size="seeker"
            className="w-full h-full object-cover"
          />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-xs font-medium text-white truncate">{lastPlayed.title}</p>
          <p className="text-[11px] text-surface-400 truncate">{lastPlayed.artist}</p>
        </div>
        <div className="w-8 h-8 rounded-full bg-aurora-600 flex items-center justify-center shrink-0">
          <svg className="w-4 h-4 text-white ml-0.5" fill="currentColor" viewBox="0 0 24 24">
            <path d="M8 5v14l11-7z" />
          </svg>
        </div>
      </Link>
    </div>
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

import { useEffect, useState } from "react";
import { BrowserRouter, Routes, Route, Navigate, Link, useLocation, useNavigate } from "react-router-dom";
import { AuthProvider, useAuth } from "./context/AuthContext";
import { PlayerProvider, usePlayer } from "./context/PlayerContext";
import PlayerBar from "./components/PlayerBar";
import { setupStatus } from "./api/client";
import Login from "./pages/Login";
import Setup from "./pages/Setup";
import Library from "./pages/Library";
import Player from "./pages/Player";
import Playlists from "./pages/Playlists";
import PlaylistDetail from "./pages/PlaylistDetail";
import SongDetail from "./pages/SongDetail";
import StatsPage from "./pages/StatsPage";
import AdminLayout from "./components/admin/AdminLayout";
import RequireAdmin from "./components/admin/RequireAdmin";
import AdminOverviewPage from "./pages/admin/AdminOverviewPage";
import AdminUsersPage from "./pages/admin/AdminUsersPage";
import AdminUserListeningPage from "./pages/admin/AdminUserListeningPage";
import AdminGroupsPage from "./pages/admin/AdminGroupsPage";
import AdminLibraryPage from "./pages/admin/AdminLibraryPage";
import AdminPlaylistsPage from "./pages/admin/AdminPlaylistsPage";
import AdminSettingsPage from "./pages/admin/AdminSettingsPage";

// Human: Application shell — providers, setup gate, route table, and the main nav layout around authenticated pages.
// Agent: WRAPS BrowserRouter+AuthProvider+PlayerProvider; ROUTES /setup /login / library /admin/*; SETUPGUARD reads setupStatus; LAYOUT hides chrome on dashboard paths.

function NavLink({ to, children }: { to: string; children: React.ReactNode }) {
  const { pathname } = useLocation();
  // Human: Treat child paths as active for section tabs (e.g. `/playlist/…` highlights Playlists).
  // Agent: active = path exact match OR (to not "/" AND pathname.startsWith(to)).
  const active = pathname === to || (to !== "/" && pathname.startsWith(to));
  return (
    <Link
      to={to}
      className={`relative px-3 py-2 text-sm font-medium transition-colors duration-200 rounded-lg ${
        active
          ? "text-white bg-white/10"
          : "text-surface-300 hover:text-white hover:bg-white/5"
      }`}
    >
      {children}
      {active && (
        <span className="absolute bottom-0 left-1/2 -translate-x-1/2 w-4 h-0.5 rounded-full bg-aurora-500" />
      )}
    </Link>
  );
}

// Human: Same active styling as `NavLink`, but block layout for the mobile drawer and optional close handler.
// Agent: REUSES prefix active rule; FORWARDS onClick to close overlay when link used.
function MobileNavLink({ to, onClick, children }: { to: string; onClick?: () => void; children: React.ReactNode }) {
  const { pathname } = useLocation();
  const active = pathname === to || (to !== "/" && pathname.startsWith(to));
  return (
    <Link
      to={to}
      onClick={onClick}
      className={`block px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
        active
          ? "text-white bg-white/10"
          : "text-surface-300 hover:text-white hover:bg-white/5"
      }`}
    >
      {children}
    </Link>
  );
}

// Human: Standard chrome for non-dashboard routes: top nav, optional bottom padding when PlayerBar is visible.
// Agent: HIDES header on library/playlists/playlist detail; ADDS pb when currentSong and not player page; RENDERS PlayerBar globally.
function Layout({ children }: { children: React.ReactNode }) {
  const { user, logout, can } = useAuth();
  const { currentSong } = usePlayer();
  const { pathname } = useLocation();
  const isDashboard = pathname === "/" || pathname === "/playlists" || pathname.startsWith("/playlist/");
  const hasPlayer = !!currentSong;
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  return (
    <div className="min-h-screen bg-surface-950 text-white relative">
      {/* Human: DashboardLayout on library pages already provides its own top chrome — skip duplicate header here. */}
      {/* Agent: CONDITIONAL RENDER !isDashboard for header block. */}
      {!isDashboard && (
        <header className="sticky top-0 z-50 border-b border-white/10 backdrop-blur-2xl bg-white/5">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex items-center justify-between h-16">
              <div className="flex items-center gap-3 sm:gap-8">
                <button
                  onClick={() => setMobileMenuOpen((v) => !v)}
                  className="sm:hidden p-2 rounded-lg text-surface-300 hover:text-white hover:bg-white/5 transition-colors"
                  aria-label="Toggle menu"
                >
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    {mobileMenuOpen ? (
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                    ) : (
                      <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
                    )}
                  </svg>
                </button>
                <Link to="/" className="flex items-center gap-2.5 group">
                  <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-aurora-500 to-aurora-700 flex items-center justify-center shadow-lg shadow-aurora-500/20 group-hover:shadow-aurora-500/30 transition-shadow">
                    <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3" />
                    </svg>
                  </div>
                  <span className="text-lg font-bold tracking-tight">Aurora</span>
                </Link>
                <nav className="hidden sm:flex items-center gap-1">
                  <NavLink to="/">Library</NavLink>
                  <NavLink to="/playlists">Playlists</NavLink>
                  {can("stats.view") && <NavLink to="/stats">Stats</NavLink>}
                  {can("admin.access") && <NavLink to="/admin">Admin</NavLink>}
                </nav>
              </div>
              {user && (
                <div className="flex items-center gap-4">
                  <span className="hidden sm:block text-sm text-surface-400">{user.email}</span>
                  <button
                    onClick={logout}
                    className="text-sm text-surface-400 hover:text-white transition-colors px-3 py-1.5 rounded-lg hover:bg-white/5"
                  >
                    Sign out
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Mobile menu */}
          {mobileMenuOpen && (
            <div className="sm:hidden border-t border-white/10 bg-surface-900/95 backdrop-blur-xl">
              <div className="px-4 py-3 space-y-1">
                <MobileNavLink to="/" onClick={() => setMobileMenuOpen(false)}>Library</MobileNavLink>
                <MobileNavLink to="/playlists" onClick={() => setMobileMenuOpen(false)}>Playlists</MobileNavLink>
                {can("stats.view") && (
                  <MobileNavLink to="/stats" onClick={() => setMobileMenuOpen(false)}>Stats</MobileNavLink>
                )}
                {can("admin.access") && (
                  <MobileNavLink to="/admin" onClick={() => setMobileMenuOpen(false)}>Admin</MobileNavLink>
                )}
              </div>
              {user && (
                <div className="px-4 py-3 border-t border-white/10">
                  <p className="text-sm text-surface-400 mb-2">{user.email}</p>
                  <button
                    onClick={() => { logout(); setMobileMenuOpen(false); }}
                    className="text-sm text-surface-400 hover:text-white transition-colors px-3 py-1.5 rounded-lg hover:bg-white/5"
                  >
                    Sign out
                  </button>
                </div>
              )}
            </div>
          )}
        </header>
      )}
      <main className={`${isDashboard ? "" : "max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8"} ${hasPlayer && !isDashboard && !pathname.startsWith("/player/") ? "pb-32" : ""}`}>{children}</main>
      <PlayerBar />
    </div>
  );
}

// Human: Block protected pages until auth is resolved — show spinner, redirect guests to `/login`.
// Agent: READS token+loading; RETURNS Navigate /login when no token after load; WRAPS children in Layout when ok.
function RequireAuth({ children }: { children: React.ReactNode }) {
  const { token, loading } = useAuth();
  if (loading) {
    return (
      <div className="min-h-screen bg-surface-950 flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="w-8 h-8 border-2 border-aurora-500 border-t-transparent rounded-full animate-spin" />
          <p className="text-surface-400 text-sm">Loading...</p>
        </div>
      </div>
    );
  }
  if (!token) return <Navigate to="/login" replace />;
  return <Layout>{children}</Layout>;
}

// Human: Like RequireAuth but without Layout — admin area uses its own full-screen shell (AdminLayout).
// Agent: SAME gate as RequireAuth; RETURNS children fragment only.
function RequireAuthNoLayout({ children }: { children: React.ReactNode }) {
  const { token, loading } = useAuth();
  if (loading) {
    return (
      <div className="min-h-screen bg-surface-950 flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="w-8 h-8 border-2 border-aurora-500 border-t-transparent rounded-full animate-spin" />
          <p className="text-surface-400 text-sm">Loading...</p>
        </div>
      </div>
    );
  }
  if (!token) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

// Human: First-run wizard gate — if the API says setup is incomplete, only `/setup` is reachable until finished.
// Agent: CALLS setupStatus; ON ERROR assumes setup complete; NAVIGATES between /setup and / or /login; DEPENDS token for re-fetch.
function SetupGuard({ children }: { children: React.ReactNode }) {
  const [setupComplete, setSetupComplete] = useState<boolean | null>(null);
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const { token } = useAuth();

  // Human: Load setup completion whenever token changes (e.g. after setup finishes and JWT appears).
  // Agent: CALLS setupStatus; SETS setupComplete; CATCH sets true; cancellation guard on unmount.
  useEffect(() => {
    let cancelled = false;
    setupStatus()
      .then((s) => {
        if (!cancelled) setSetupComplete(s.setup_complete);
      })
      .catch(() => {
        if (!cancelled) setSetupComplete(true);
      });
    return () => { cancelled = true; };
  }, [token]);

  // Human: Keep URL aligned with setup state — bounce users away from `/setup` once done, or force setup until complete.
  // Agent: READS setupComplete pathname token; NAVIGATES replace to /setup or / or /login.
  useEffect(() => {
    if (setupComplete === null) return;

    if (setupComplete && pathname === "/setup") {
      navigate(token ? "/" : "/login", { replace: true });
      return;
    }

    if (!setupComplete && pathname !== "/setup") {
      navigate("/setup", { replace: true });
    }
  }, [setupComplete, pathname, token, navigate]);

  if (setupComplete === null) {
    return (
      <div className="min-h-screen bg-surface-950 flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="w-8 h-8 border-2 border-aurora-500 border-t-transparent rounded-full animate-spin" />
          <p className="text-surface-400 text-sm">Loading...</p>
        </div>
      </div>
    );
  }

  if (setupComplete && pathname === "/setup") {
    return null;
  }

  if (!setupComplete && pathname !== "/setup") {
    return null;
  }

  return <>{children}</>;
}

// Human: Dev-oriented navigation trace — logs each pathname change with timestamp and current user role/email.
// Agent: EFFECT on location+user; WRITES console.group with path and user label.
function NavigationLogger() {
  const location = useLocation();
  const { user } = useAuth();

  useEffect(() => {
    const timestamp = new Date().toISOString();
    const page = location.pathname + location.search;
    const userInfo = user ? `${user.email} (${user.role})` : "anonymous";
    console.group(`[NAV] ${timestamp}`);
    console.log("Page:", page);
    console.log("User:", userInfo);
    console.groupEnd();
  }, [location.pathname, location.search, user]);

  return null;
}

// Human: Declarative route table — every leaf is wrapped with SetupGuard; admin subtree nests under `/admin/*`.
// Agent: DEFINES Routes + nested admin Route; USES RequireAdmin inside AdminLayout outlet.
function AppRoutes() {
  return (
    <>
      <NavigationLogger />
      <Routes>
        <Route path="/setup" element={<SetupGuard><Setup /></SetupGuard>} />
        <Route path="/login" element={<SetupGuard><Login /></SetupGuard>} />
        <Route path="/" element={<SetupGuard><RequireAuth><Library /></RequireAuth></SetupGuard>} />
        <Route path="/player/:id" element={<SetupGuard><RequireAuth><Player /></RequireAuth></SetupGuard>} />
        <Route path="/playlists" element={<SetupGuard><RequireAuth><Playlists /></RequireAuth></SetupGuard>} />
        <Route path="/playlist/:id" element={<SetupGuard><RequireAuth><PlaylistDetail /></RequireAuth></SetupGuard>} />
        <Route path="/song/:id" element={<SetupGuard><RequireAuth><SongDetail /></RequireAuth></SetupGuard>} />
        <Route path="/stats" element={<SetupGuard><RequireAuth><StatsPage /></RequireAuth></SetupGuard>} />
        <Route path="/admin/*" element={
          <SetupGuard>
            <RequireAuthNoLayout>
              <RequireAdmin>
                <AdminLayout />
              </RequireAdmin>
            </RequireAuthNoLayout>
          </SetupGuard>
        }>
          <Route index element={<AdminOverviewPage />} />
          <Route path="users" element={<AdminUsersPage />} />
          <Route path="listening" element={<AdminUserListeningPage />} />
          <Route path="groups" element={<AdminGroupsPage />} />
          <Route path="library" element={<AdminLibraryPage />} />
          <Route path="playlists" element={<AdminPlaylistsPage />} />
          <Route path="settings" element={<AdminSettingsPage />} />
        </Route>
      </Routes>
    </>
  );
}

// Human: Root providers — router wraps auth, auth wraps player, so any route can read both contexts.
// Agent: BrowserRouter → AuthProvider → PlayerProvider → AppRoutes.
export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <PlayerProvider>
          <AppRoutes />
        </PlayerProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}

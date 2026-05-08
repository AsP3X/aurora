import { BrowserRouter, Routes, Route, Navigate, Link, useLocation } from "react-router-dom";
import { AuthProvider, useAuth } from "./context/AuthContext";
import Login from "./pages/Login";
import Library from "./pages/Library";
import Player from "./pages/Player";
import Playlists from "./pages/Playlists";
import PlaylistDetail from "./pages/PlaylistDetail";
import AdminDashboard from "./pages/admin/AdminDashboard";
import SetupWireframe from "./pages/Setup";

function NavLink({ to, children }: { to: string; children: React.ReactNode }) {
  const { pathname } = useLocation();
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

function Layout({ children }: { children: React.ReactNode }) {
  const { user, logout, can } = useAuth();
  const { pathname } = useLocation();
  const isHome = pathname === "/";

  return (
    <div className="min-h-screen bg-surface-950 text-white relative">
      {!isHome && (
        <header className="sticky top-0 z-50 border-b border-white/5 backdrop-blur-xl bg-surface-950/80">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex items-center justify-between h-16">
              <div className="flex items-center gap-8">
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
        </header>
      )}
      <main className={isHome ? "" : "max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8"}>{children}</main>
    </div>
  );
}

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

function AppRoutes() {
  return (
    <Routes>
      <Route path="/setup" element={<SetupWireframe />} />
      <Route path="/login" element={<Login />} />
      <Route path="/" element={<RequireAuth><Library /></RequireAuth>} />
      <Route path="/player/:id" element={<RequireAuth><Player /></RequireAuth>} />
      <Route path="/playlists" element={<RequireAuth><Playlists /></RequireAuth>} />
      <Route path="/playlist/:id" element={<RequireAuth><PlaylistDetail /></RequireAuth>} />
      <Route path="/admin/*" element={<RequireAuth><AdminDashboard /></RequireAuth>} />
    </Routes>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <AppRoutes />
      </AuthProvider>
    </BrowserRouter>
  );
}

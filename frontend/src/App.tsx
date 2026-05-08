import { BrowserRouter, Routes, Route, Navigate, Link } from "react-router-dom";
import { AuthProvider, useAuth } from "./context/AuthContext";
import Login from "./pages/Login";
import Library from "./pages/Library";
import Player from "./pages/Player";
import Playlists from "./pages/Playlists";
import PlaylistDetail from "./pages/PlaylistDetail";
import "./App.css";

function Layout({ children }: { children: React.ReactNode }) {
  const { user, logout } = useAuth();

  return (
    <div className="app">
      <header className="top-bar">
        <Link to="/" className="logo">Aurora Music</Link>
        <nav>
          <Link to="/">Library</Link>
          <Link to="/playlists">Playlists</Link>
          {user && (
            <span className="user">
              {user.email}{" "}
              <button className="link" onClick={logout}>Logout</button>
            </span>
          )}
        </nav>
      </header>
      <main>{children}</main>
    </div>
  );
}

function RequireAuth({ children }: { children: React.ReactNode }) {
  const { token, loading } = useAuth();
  if (loading) return <p>Loading...</p>;
  if (!token) return <Navigate to="/login" replace />;
  return <Layout>{children}</Layout>;
}

function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/" element={<RequireAuth><Library /></RequireAuth>} />
      <Route path="/player/:id" element={<RequireAuth><Player /></RequireAuth>} />
      <Route path="/playlists" element={<RequireAuth><Playlists /></RequireAuth>} />
      <Route path="/playlist/:id" element={<RequireAuth><PlaylistDetail /></RequireAuth>} />
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

// Human: Shared sidebar data (playlists + last played) so DashboardLayout does not refetch on every route change.
// Agent: PROVIDER mounts once under PlayerProvider; EXPOSES playlists, lastPlayed, refresh(); CALLS fetchPlaylists+fetchHistory.

import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { fetchHistory, fetchPlaylists } from "../api/client";
import { useAuth } from "./AuthContext";
import type { Playlist } from "../types";

type LastPlayed = {
  id: string;
  title: string;
  artist: string;
  artwork_key: string | null;
  duration_seconds: number;
};

type LibraryShellContextValue = {
  playlists: Playlist[];
  lastPlayed: LastPlayed | null;
  loading: boolean;
  error: string | null;
  refresh: () => void;
  addPlaylist: (playlist: Playlist) => void;
};

const LibraryShellContext = createContext<LibraryShellContextValue | null>(null);

export function LibraryShellProvider({ children }: { children: React.ReactNode }) {
  const { token, loading: authLoading } = useAuth();
  const [playlists, setPlaylists] = useState<Playlist[]>([]);
  const [lastPlayed, setLastPlayed] = useState<LastPlayed | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    Promise.all([fetchPlaylists(), fetchHistory(20)])
      .then(([pls, hist]) => {
        setPlaylists(pls);
        if (hist.length > 0) {
          const h = hist[0];
          setLastPlayed({
            id: h.song_id,
            title: h.title,
            artist: h.artist,
            artwork_key: h.artwork_key,
            duration_seconds: h.duration_seconds,
          });
        } else {
          setLastPlayed(null);
        }
      })
      .catch(() => {
        setError("Could not load library sidebar data.");
      })
      .finally(() => setLoading(false));
  }, []);

  // Human: Login/setup pages mount this provider too — skip protected sidebar fetches until a session exists.
  // Agent: READS token+authLoading; IF !token THEN clear sidebar state; ELSE CALLS load().
  useEffect(() => {
    if (authLoading) return;
    if (!token) {
      setPlaylists([]);
      setLastPlayed(null);
      setError(null);
      setLoading(false);
      return;
    }
    load();
  }, [load, token, authLoading]);

  const addPlaylist = useCallback((playlist: Playlist) => {
    setPlaylists((prev) => [playlist, ...prev]);
  }, []);

  return (
    <LibraryShellContext.Provider
      value={{ playlists, lastPlayed, loading, error, refresh: load, addPlaylist }}
    >
      {children}
    </LibraryShellContext.Provider>
  );
}

export function useLibraryShell() {
  const ctx = useContext(LibraryShellContext);
  if (!ctx) {
    throw new Error("useLibraryShell must be used within LibraryShellProvider");
  }
  return ctx;
}

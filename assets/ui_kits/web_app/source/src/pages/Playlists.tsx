import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { fetchPlaylists, createPlaylist } from "../api/client";
import DashboardLayout from "../components/DashboardLayout";
import type { Playlist } from "../types";

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export default function Playlists() {
  const [playlists, setPlaylists] = useState<Playlist[]>([]);
  const [name, setName] = useState("");
  const [desc, setDesc] = useState("");
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [showForm, setShowForm] = useState(false);

  useEffect(() => {
    fetchPlaylists()
      .then(setPlaylists)
      .finally(() => setLoading(false));
  }, []);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setCreating(true);
    try {
      const p = await createPlaylist(name, desc || undefined);
      setPlaylists([p, ...playlists]);
      setName("");
      setDesc("");
      setShowForm(false);
    } finally {
      setCreating(false);
    }
  }

  if (loading) {
    return (
      <DashboardLayout>
        <div className="flex-1 flex items-center justify-center h-full">
          <div className="flex flex-col items-center gap-3">
            <div className="w-8 h-8 border-2 border-aurora-500 border-t-transparent rounded-full animate-spin" />
            <p className="text-surface-400 text-sm">Loading playlists...</p>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="space-y-8">
        <div className="flex items-end justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Playlists</h1>
            <p className="text-surface-400 text-sm mt-1">
              {playlists.length} playlist{playlists.length !== 1 ? "s" : ""}
            </p>
          </div>
          <button
            onClick={() => setShowForm(!showForm)}
            className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-aurora-600 to-aurora-700 hover:from-aurora-500 hover:to-aurora-600 text-white text-sm font-medium rounded-xl shadow-lg shadow-aurora-500/20 hover:shadow-aurora-500/30 transition-all"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" />
            </svg>
            New Playlist
          </button>
        </div>

        {showForm && (
          <form onSubmit={handleCreate} className="bg-surface-900/50 backdrop-blur-sm border border-white/5 rounded-2xl p-6 space-y-4 animate-in fade-in slide-in-from-top-2 duration-300">
            <div>
              <label className="block text-sm font-medium text-surface-300 mb-1.5">Name</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="My Awesome Playlist"
                required
                className="w-full px-4 py-2.5 bg-surface-950 border border-white/10 rounded-xl text-white placeholder-surface-500 focus:outline-none focus:ring-2 focus:ring-aurora-500/50 focus:border-aurora-500/50 transition-all"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-surface-300 mb-1.5">Description <span className="text-surface-500 font-normal">(optional)</span></label>
              <input
                type="text"
                value={desc}
                onChange={(e) => setDesc(e.target.value)}
                placeholder="A mix of my favorite tracks"
                className="w-full px-4 py-2.5 bg-surface-950 border border-white/10 rounded-xl text-white placeholder-surface-500 focus:outline-none focus:ring-2 focus:ring-aurora-500/50 focus:border-aurora-500/50 transition-all"
              />
            </div>
            <div className="flex items-center justify-end gap-3">
              <button type="button" onClick={() => setShowForm(false)} className="px-4 py-2 text-sm text-surface-400 hover:text-white transition-colors">
                Cancel
              </button>
              <button
                type="submit"
                disabled={creating}
                className="px-5 py-2 bg-aurora-600 hover:bg-aurora-500 text-white text-sm font-medium rounded-xl transition-colors disabled:opacity-50"
              >
                {creating ? "Creating..." : "Create Playlist"}
              </button>
            </div>
          </form>
        )}

        {playlists.length === 0 ? (
          <div className="text-center py-20">
            <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-surface-900 flex items-center justify-center">
              <svg className="w-8 h-8 text-surface-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3" />
              </svg>
            </div>
            <p className="text-surface-400 font-medium">No playlists yet</p>
            <p className="text-surface-500 text-sm mt-1">Create your first playlist to get started</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {playlists.map((p) => (
              <Link
                to={`/playlist/${p.id}`}
                key={p.id}
                className="group bg-surface-900/40 backdrop-blur-sm border border-white/5 rounded-2xl p-5 hover:bg-surface-900/70 hover:border-white/10 transition-all duration-300 hover:-translate-y-0.5"
              >
                <div className="flex items-start justify-between mb-4">
                  <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-aurora-600/80 to-aurora-800/80 flex items-center justify-center shadow-lg shadow-aurora-500/10">
                    <svg className="w-6 h-6 text-white/90" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3" />
                    </svg>
                  </div>
                  {p.is_public && (
                    <span className="text-[10px] uppercase tracking-wider font-medium text-aurora-400 bg-aurora-500/10 border border-aurora-500/20 px-2 py-0.5 rounded-full">
                      Public
                    </span>
                  )}
                </div>
                <h3 className="font-semibold text-white truncate group-hover:text-aurora-300 transition-colors">{p.name}</h3>
                {p.description && <p className="text-sm text-surface-400 mt-1 line-clamp-2">{p.description}</p>}
                <p className="text-xs text-surface-500 mt-3">{formatDate(p.created_at)}</p>
              </Link>
            ))}
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}

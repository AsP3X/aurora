import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  fetchPlaylists,
  createPlaylist,
  updatePlaylist,
  deletePlaylist,
} from "../api/client";
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
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editDesc, setEditDesc] = useState("");
  const [editPublic, setEditPublic] = useState(false);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

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

  function startEdit(playlist: Playlist) {
    setEditingId(playlist.id);
    setEditName(playlist.name);
    setEditDesc(playlist.description || "");
    setEditPublic(playlist.is_public);
  }

  async function handleSaveEdit(e: React.FormEvent) {
    e.preventDefault();
    if (!editingId) return;
    setSavingId(editingId);
    try {
      const updated = await updatePlaylist(editingId, {
        name: editName,
        description: editDesc || undefined,
        is_public: editPublic,
      });
      setPlaylists((prev) =>
        prev.map((p) => (p.id === updated.id ? updated : p))
      );
      setEditingId(null);
    } finally {
      setSavingId(null);
    }
  }

  async function handleDelete(id: string) {
    setDeletingId(id);
    try {
      await deletePlaylist(id);
      setPlaylists((prev) => prev.filter((p) => p.id !== id));
    } finally {
      setDeletingId(null);
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
              <div
                key={p.id}
                className="group bg-surface-900/40 backdrop-blur-sm border border-white/5 rounded-2xl p-5 hover:bg-surface-900/70 hover:border-white/10 transition-all duration-300 hover:-translate-y-0.5 flex flex-col"
              >
                {editingId === p.id ? (
                  <form onSubmit={handleSaveEdit} className="space-y-3 flex-1">
                    <input
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      placeholder="Playlist name"
                      required
                      className="w-full px-3 py-2 bg-surface-950 border border-white/10 rounded-xl text-white placeholder-surface-500 focus:outline-none focus:ring-2 focus:ring-aurora-500/50 focus:border-aurora-500/50 transition-all text-sm"
                    />
                    <input
                      value={editDesc}
                      onChange={(e) => setEditDesc(e.target.value)}
                      placeholder="Description"
                      className="w-full px-3 py-2 bg-surface-950 border border-white/10 rounded-xl text-white placeholder-surface-500 focus:outline-none focus:ring-2 focus:ring-aurora-500/50 focus:border-aurora-500/50 transition-all text-sm"
                    />
                    <label className="flex items-center gap-2 text-sm text-surface-300 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={editPublic}
                        onChange={(e) => setEditPublic(e.target.checked)}
                        className="w-4 h-4 rounded border-white/10 bg-surface-950 text-aurora-500 focus:ring-aurora-500/50"
                      />
                      Public
                    </label>
                    <div className="flex items-center gap-2 pt-1">
                      <button
                        type="button"
                        onClick={() => setEditingId(null)}
                        className="px-3 py-1.5 text-xs text-surface-400 hover:text-white transition-colors"
                      >
                        Cancel
                      </button>
                      <button
                        type="submit"
                        disabled={savingId === p.id || !editName.trim()}
                        className="px-3 py-1.5 bg-aurora-600 hover:bg-aurora-500 text-white text-xs font-medium rounded-lg transition-colors disabled:opacity-50"
                      >
                        {savingId === p.id ? "Saving..." : "Save"}
                      </button>
                    </div>
                  </form>
                ) : (
                  <>
                    <div className="flex items-start justify-between mb-4">
                      <Link to={`/playlist/${p.id}`} className="w-12 h-12 rounded-xl bg-gradient-to-br from-aurora-600/80 to-aurora-800/80 flex items-center justify-center shadow-lg shadow-aurora-500/10 shrink-0">
                        <svg className="w-6 h-6 text-white/90" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3" />
                        </svg>
                      </Link>
                      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button
                          onClick={() => startEdit(p)}
                          className="p-1.5 rounded-lg text-surface-400 hover:text-white hover:bg-white/5 transition-colors"
                          title="Edit"
                        >
                          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                          </svg>
                        </button>
                        <button
                          onClick={() => handleDelete(p.id)}
                          disabled={deletingId === p.id}
                          className="p-1.5 rounded-lg text-surface-400 hover:text-red-400 hover:bg-red-500/5 transition-colors disabled:opacity-50"
                          title="Delete"
                        >
                          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                          </svg>
                        </button>
                      </div>
                    </div>
                    <Link to={`/playlist/${p.id}`} className="block flex-1 min-w-0">
                      <h3 className="font-semibold text-white truncate group-hover:text-aurora-300 transition-colors">{p.name}</h3>
                      {p.description && <p className="text-sm text-surface-400 mt-1 line-clamp-2">{p.description}</p>}
                      <div className="flex items-center gap-2 mt-3">
                        {p.is_public && (
                          <span className="text-[10px] uppercase tracking-wider font-medium text-aurora-400 bg-aurora-500/10 border border-aurora-500/20 px-2 py-0.5 rounded-full">
                            Public
                          </span>
                        )}
                        <span className="text-xs text-surface-500">{formatDate(p.created_at)}</span>
                      </div>
                    </Link>
                  </>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}

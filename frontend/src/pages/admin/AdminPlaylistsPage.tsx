import { useState, useEffect, useCallback } from "react";
import { fetchAdminPlaylists, deleteAdminPlaylist } from "../../api/client";
import ConfirmModal from "../../components/admin/ConfirmModal";

interface AdminPlaylist {
  id: string;
  user_id: string;
  name: string;
  description: string | null;
  is_public: boolean;
  created_at: string;
  owner_email: string;
  song_count: number;
}

export default function AdminPlaylistsPage() {
  const [playlists, setPlaylists] = useState<AdminPlaylist[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [confirmModal, setConfirmModal] = useState<{ id: string; name: string } | null>(null);
  const [deleting, setDeleting] = useState(false);

  const loadPlaylists = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchAdminPlaylists();
      setPlaylists(data);
    } catch (e: any) {
      setError(e.message || "Failed to load playlists");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadPlaylists();
  }, [loadPlaylists]);

  async function handleDelete() {
    if (!confirmModal) return;
    setDeleting(true);
    try {
      await deleteAdminPlaylist(confirmModal.id);
      setPlaylists((prev) => prev.filter((p) => p.id !== confirmModal.id));
      setConfirmModal(null);
    } catch (e: any) {
      setError(e.message || "Failed to delete playlist");
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-white">Playlists</h1>
        {error && (
          <div className="text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
            {error}
          </div>
        )}
      </div>

      <div className="bg-surface-900 border border-white/5 rounded-2xl overflow-hidden overflow-x-auto">
        <table className="w-full text-sm text-left min-w-[600px]">
          <thead className="text-xs text-surface-400 uppercase bg-surface-950/50 border-b border-white/5">
            <tr>
              <th className="px-4 py-3 font-medium">Name</th>
              <th className="px-4 py-3 font-medium">Owner</th>
              <th className="px-4 py-3 font-medium">Songs</th>
              <th className="px-4 py-3 font-medium">Visibility</th>
              <th className="px-4 py-3 font-medium">Created</th>
              <th className="px-4 py-3 font-medium text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {loading ? (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-surface-500">
                  <div className="w-5 h-5 border-2 border-aurora-500 border-t-transparent rounded-full animate-spin mx-auto" />
                </td>
              </tr>
            ) : playlists.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-surface-500">
                  No playlists found.
                </td>
              </tr>
            ) : (
              playlists.map((p) => (
                <tr key={p.id} className="hover:bg-white/[0.02] transition-colors">
                  <td className="px-4 py-3 text-white font-medium">{p.name}</td>
                  <td className="px-4 py-3 text-surface-300">{p.owner_email}</td>
                  <td className="px-4 py-3 text-surface-400">{p.song_count}</td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border ${
                        p.is_public
                          ? "bg-emerald-500/10 text-emerald-300 border-emerald-500/20"
                          : "bg-surface-800 text-surface-400 border-white/10"
                      }`}
                    >
                      {p.is_public ? "Public" : "Private"}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-surface-400">
                    {new Date(p.created_at).toLocaleDateString()}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button
                      onClick={() => setConfirmModal({ id: p.id, name: p.name })}
                      className="text-xs text-red-400 hover:text-red-300 px-2 py-1 rounded hover:bg-red-500/10 transition-colors"
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {confirmModal && (
        <ConfirmModal
          title="Delete Playlist"
          message={`Are you sure you want to delete "${confirmModal.name}"? This action cannot be undone.`}
          onConfirm={handleDelete}
          onCancel={() => setConfirmModal(null)}
          loading={deleting}
        />
      )}
    </div>
  );
}

// Human: All playlists across users — glass DataTable, visibility pill, delete confirm.
// Agent: fetchAdminPlaylists on mount; deleteAdminPlaylist; USES PageHeader DataTable MobileDataCard.
import { useState, useEffect, useCallback } from "react";
import { fetchAdminPlaylists, deleteAdminPlaylist } from "../../api/client";
import ConfirmModal from "../../components/admin/ConfirmModal";
import PageHeader from "../../components/admin/PageHeader";
import DataTable from "../../components/admin/DataTable";
import type { DataTableColumn } from "../../components/admin/DataTable";
import MobileDataCard from "../../components/admin/MobileDataCard";

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
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : "Failed to load playlists";
      setError(message);
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
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : "Failed to delete playlist";
      setError(message);
    } finally {
      setDeleting(false);
    }
  }

  const columns: DataTableColumn<AdminPlaylist>[] = [
    { key: "name", header: "Name", render: (p) => <span className="text-white font-medium">{p.name}</span> },
    { key: "owner", header: "Owner", render: (p) => <span className="text-surface-300">{p.owner_email}</span> },
    { key: "songs", header: "Songs", render: (p) => <span className="text-surface-400">{p.song_count}</span> },
    { key: "visibility", header: "Visibility", render: (p) => <VisibilityPill isPublic={p.is_public} /> },
    {
      key: "created",
      header: "Created",
      render: (p) => (
        <span className="text-surface-400">{new Date(p.created_at).toLocaleDateString()}</span>
      ),
    },
    {
      key: "actions",
      header: <span className="sr-only">Actions</span>,
      headerClassName: "text-right",
      className: "text-right",
      render: (p) => (
        <button
          type="button"
          onClick={() => setConfirmModal({ id: p.id, name: p.name })}
          className="text-xs text-red-400 hover:text-red-300 px-2 py-1 rounded hover:bg-red-500/10 transition-colors focus:outline-none focus:ring-2 focus:ring-red-500/40"
        >
          Delete
        </button>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader title="Playlists" error={error || undefined} />

      <DataTable<AdminPlaylist>
        columns={columns}
        data={playlists}
        rowKey={(p) => p.id}
        loading={loading}
        renderMobileCard={(p) => (
          <MobileDataCard
            primary={p.name}
            secondary={`${p.owner_email} · ${p.song_count} songs`}
            trailing={
              <div className="flex flex-col items-end gap-2 shrink-0">
                <VisibilityPill isPublic={p.is_public} />
                <span className="text-[10px] text-surface-500">
                  {new Date(p.created_at).toLocaleDateString()}
                </span>
                <button
                  type="button"
                  onClick={() => setConfirmModal({ id: p.id, name: p.name })}
                  className="text-xs text-red-400 hover:text-red-300 px-2 py-1 rounded hover:bg-red-500/10 transition-colors focus:outline-none focus:ring-2 focus:ring-red-500/40"
                >
                  Delete
                </button>
              </div>
            }
          />
        )}
      />

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

// Human: Public vs private — globe vs lock icon so visibility isn’t color-only.
// Agent: PROPS isPublic; RETURNS bordered pill with stroke icon + label.
function VisibilityPill({ isPublic }: { isPublic: boolean }) {
  return (
    <span
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium border ${
        isPublic
          ? "bg-emerald-500/10 text-emerald-300 border-emerald-500/20"
          : "bg-surface-800 text-surface-400 border-white/10"
      }`}
    >
      {isPublic ? (
        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M3.055 11H5a2 2 0 012 2v1a2 2 0 002 2 2 2 0 012 2v2.945M8 3.935V5.5A2.5 2.5 0 0010.5 8h.5a2 2 0 012 2 2 2 0 104 0 2 2 0 012-2h1.064M15 20.488V18a2 2 0 012-2h3.064M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      ) : (
        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
        </svg>
      )}
      {isPublic ? "Public" : "Private"}
    </span>
  );
}

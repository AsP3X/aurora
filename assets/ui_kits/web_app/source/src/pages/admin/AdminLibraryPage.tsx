import { useState, useEffect, useCallback, useMemo } from "react";
import {
  fetchAdminSongs,
  deleteAdminSong,
  updateAdminSong,
  toggleAdminSongEnabled,
  artworkUrl,
} from "../../api/client";
import ArtworkImage from "../../components/ArtworkImage";
import ContextMenu from "../../components/ui/ContextMenu";
import type { ContextMenuItem } from "../../components/ui/ContextMenu";
import UploadSongDialog from "../../components/admin/UploadSongDialog";
import MultiGenreField from "../../components/admin/MultiGenreField";
import ConfirmModal from "../../components/admin/ConfirmModal";
import ArtworkCropper from "../../components/admin/ArtworkCropper";
import type { Song } from "../../types";

function formatDuration(seconds: number) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export default function AdminLibraryPage() {
  const [songs, setSongs] = useState<Song[]>([]);
  const [songQuery, setSongQuery] = useState("");
  const [songOffset, setSongOffset] = useState(0);
  const [songLoading, setSongLoading] = useState(false);
  const [error, setError] = useState("");
  const [showUploadDialog, setShowUploadDialog] = useState(false);
  const SONG_LIMIT = 20;

  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    song: Song;
  } | null>(null);

  const [editingSong, setEditingSong] = useState<Song | null>(null);
  const [editForm, setEditForm] = useState({
    title: "",
    artist: "",
    album: "",
    album_artist: "",
    track_number: "",
    year: "",
    genres: [] as string[],
    studio: "",
  });
  const [savingEdit, setSavingEdit] = useState(false);
  const [editImageSrc, setEditImageSrc] = useState<string | null>(null);
  const [editCroppedBlob, setEditCroppedBlob] = useState<Blob | null>(null);
  const [editArtworkChanged, setEditArtworkChanged] = useState(false);
  const [editRemoveArtwork, setEditRemoveArtwork] = useState(false);

  const [confirmModal, setConfirmModal] = useState<{ id: string; name: string } | null>(null);
  const [deleting, setDeleting] = useState(false);

  const existingGenres = useMemo(() => {
    const genres = new Set<string>();
    songs.forEach((s) => s.genres.forEach((g) => genres.add(g)));
    return Array.from(genres).sort();
  }, [songs]);

  const loadSongs = useCallback(async (q?: string, offset = 0) => {
    setSongLoading(true);
    try {
      const data = await fetchAdminSongs({ q, limit: SONG_LIMIT, offset, order_by: "title" });
      setSongs(data);
    } catch (e: any) {
      setError(e.message || "Failed to load songs");
    } finally {
      setSongLoading(false);
    }
  }, []);

  useEffect(() => {
    loadSongs(songQuery || undefined, songOffset);
  }, [songQuery, songOffset, loadSongs]);

  function openEditDialog(song: Song) {
    setEditingSong(song);
    setEditForm({
      title: song.title,
      artist: song.artist,
      album: song.album || "",
      album_artist: song.album_artist || "",
      track_number: song.track_number?.toString() || "",
      year: song.year?.toString() || "",
      genres: song.genres,
      studio: song.studio || "",
    });
    setEditImageSrc(song.artwork_key ? artworkUrl(song.id) : null);
    setEditCroppedBlob(null);
    setEditArtworkChanged(false);
    setEditRemoveArtwork(false);
  }

  async function handleSaveEdit() {
    if (!editingSong) return;
    setSavingEdit(true);
    try {
      const updated = await updateAdminSong(
        editingSong.id,
        {
          title: editForm.title,
          artist: editForm.artist,
          album: editForm.album || undefined,
          album_artist: editForm.album_artist || undefined,
          track_number: editForm.track_number ? parseInt(editForm.track_number, 10) : undefined,
          year: editForm.year ? parseInt(editForm.year, 10) : undefined,
          genres: editForm.genres,
          studio: editForm.studio || undefined,
        },
        editCroppedBlob ?? undefined,
        editArtworkChanged ? editRemoveArtwork : undefined
      );
      setSongs((prev) => prev.map((s) => (s.id === updated.id ? updated : s)));
      setEditingSong(null);
      setEditImageSrc(null);
      setEditCroppedBlob(null);
      setEditArtworkChanged(false);
      setEditRemoveArtwork(false);
    } catch (e: any) {
      setError(e.message || "Failed to update song");
    } finally {
      setSavingEdit(false);
    }
  }

  async function handleToggleEnabled(song: Song) {
    try {
      const updated = await toggleAdminSongEnabled(song.id, !song.enabled);
      setSongs((prev) => prev.map((s) => (s.id === updated.id ? updated : s)));
    } catch (e: any) {
      setError(e.message || "Failed to toggle enabled state");
    }
  }

  const handleEditReplaceArtwork = useCallback((file: File) => {
    const reader = new FileReader();
    reader.onload = () => {
      setEditImageSrc(reader.result as string);
      setEditCroppedBlob(null);
      setEditArtworkChanged(true);
      setEditRemoveArtwork(false);
    };
    reader.readAsDataURL(file);
  }, []);

  const handleEditCropComplete = useCallback((blob: Blob) => {
    setEditCroppedBlob(blob);
    setEditImageSrc(URL.createObjectURL(blob));
    setEditArtworkChanged(true);
    setEditRemoveArtwork(false);
  }, []);

  const handleEditRemoveArtwork = useCallback(() => {
    setEditImageSrc(null);
    setEditCroppedBlob(null);
    setEditArtworkChanged(true);
    setEditRemoveArtwork(true);
  }, []);

  async function handleDelete() {
    if (!confirmModal) return;
    setDeleting(true);
    try {
      await deleteAdminSong(confirmModal.id);
      setSongs((prev) => prev.filter((s) => s.id !== confirmModal.id));
      setConfirmModal(null);
    } catch (e: any) {
      setError(e.message || "Failed to delete song");
    } finally {
      setDeleting(false);
    }
  }

  function handleContextMenu(e: React.MouseEvent, song: Song) {
    e.preventDefault();
    setContextMenu({ x: e.clientX, y: e.clientY, song });
  }

  function buildMenuItems(song: Song): ContextMenuItem[] {
    return [
      {
        label: "Edit",
        icon: (
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
          </svg>
        ),
        onClick: () => openEditDialog(song),
      },
      {
        label: song.enabled ? "Disable" : "Enable",
        icon: (
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            {song.enabled ? (
              <path strokeLinecap="round" strokeLinejoin="round" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
            ) : (
              <>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
              </>
            )}
          </svg>
        ),
        onClick: () => handleToggleEnabled(song),
      },
      {
        label: "Delete",
        danger: true,
        icon: (
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
          </svg>
        ),
        onClick: () => setConfirmModal({ id: song.id, name: song.title }),
      },
    ];
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-white">Library</h1>
        {error && (
          <div className="text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
            {error}
          </div>
        )}
      </div>

      <div className="flex items-center gap-3">
        <input
          type="text"
          placeholder="Search songs..."
          value={songQuery}
          onChange={(e) => { setSongQuery(e.target.value); setSongOffset(0); }}
          className="flex-1 max-w-md px-3 py-2 bg-surface-900 border border-white/10 rounded-lg text-sm text-white placeholder-surface-500 focus:outline-none focus:ring-1 focus:ring-aurora-500"
        />
        <button
          onClick={() => setShowUploadDialog(true)}
          className="px-4 py-2 bg-aurora-600 hover:bg-aurora-500 text-white text-sm font-medium rounded-lg transition-colors"
        >
          + Upload Song
        </button>
        {songLoading && <div className="w-5 h-5 border-2 border-aurora-500 border-t-transparent rounded-full animate-spin" />}
      </div>

      <div className="bg-surface-900 border border-white/5 rounded-2xl overflow-hidden overflow-x-auto">
        <table className="w-full text-sm text-left min-w-[700px]">
          <thead className="text-xs text-surface-400 uppercase bg-surface-950/50 border-b border-white/5">
            <tr>
              <th className="px-4 py-3 font-medium">Artwork</th>
              <th className="px-4 py-3 font-medium">Title</th>
              <th className="px-4 py-3 font-medium">Artist</th>
              <th className="px-4 py-3 font-medium">Album</th>
              <th className="px-4 py-3 font-medium">Duration</th>
              <th className="px-4 py-3 font-medium">Format</th>
              <th className="px-4 py-3 font-medium text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {songs.map((song) => (
              <tr
                key={song.id}
                onContextMenu={(e) => handleContextMenu(e, song)}
                className={`hover:bg-white/[0.02] transition-colors ${!song.enabled ? "opacity-50" : ""}`}
              >
                <td className="px-4 py-3">
                  <ArtworkImage
                    songId={song.id}
                    title={song.title}
                    artist={song.artist}
                    className="w-10 h-10 rounded-lg object-cover bg-surface-950"
                  />
                </td>
                <td className="px-4 py-3 text-white font-medium">
                  <div className="flex items-center gap-2">
                    {song.title}
                    {!song.enabled && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-surface-700 text-surface-400 border border-white/5">
                        Disabled
                      </span>
                    )}
                  </div>
                </td>
                <td className="px-4 py-3 text-surface-300">{song.artist}</td>
                <td className="px-4 py-3 text-surface-400">{song.album || "—"}</td>
                <td className="px-4 py-3 text-surface-400">{formatDuration(song.duration_seconds)}</td>
                <td className="px-4 py-3 text-surface-400 uppercase">{song.file_format}</td>
                <td className="px-4 py-3 text-right">
                  <button
                    onClick={(e) => {
                      const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
                      setContextMenu({
                        x: rect.left + rect.width / 2,
                        y: rect.bottom + 4,
                        song,
                      });
                    }}
                    className="text-surface-400 hover:text-white p-1 rounded hover:bg-white/5 transition-colors"
                  >
                    <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                      <circle cx="12" cy="6" r="1.5" />
                      <circle cx="12" cy="12" r="1.5" />
                      <circle cx="12" cy="18" r="1.5" />
                    </svg>
                  </button>
                </td>
              </tr>
            ))}
            {songs.length === 0 && !songLoading && (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-surface-500">
                  No songs found.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between">
        <button
          onClick={() => setSongOffset((o) => Math.max(0, o - SONG_LIMIT))}
          disabled={songOffset === 0}
          className="px-3 py-1.5 bg-surface-800 hover:bg-surface-700 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50"
        >
          Previous
        </button>
        <span className="text-sm text-surface-400">
          Showing {songs.length > 0 ? songOffset + 1 : 0}–{songOffset + songs.length}
        </span>
        <button
          onClick={() => setSongOffset((o) => o + SONG_LIMIT)}
          disabled={songs.length < SONG_LIMIT}
          className="px-3 py-1.5 bg-surface-800 hover:bg-surface-700 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50"
        >
          Next
        </button>
      </div>

      {contextMenu && (
        <ContextMenu
          items={buildMenuItems(contextMenu.song)}
          x={contextMenu.x}
          y={contextMenu.y}
          onClose={() => setContextMenu(null)}
        />
      )}

      {/* Edit Song Dialog */}
      {editingSong && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-surface-900 border border-white/10 rounded-2xl p-6 w-full max-w-lg shadow-2xl max-h-[90vh] overflow-y-auto">
            <h3 className="text-lg font-semibold text-white mb-4">Edit Song</h3>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs text-surface-400 mb-1">Title</label>
                <input
                  value={editForm.title}
                  onChange={(e) => setEditForm((f) => ({ ...f, title: e.target.value }))}
                  className="w-full bg-surface-800 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-1 focus:ring-aurora-500"
                />
              </div>
              <div>
                <label className="block text-xs text-surface-400 mb-1">Artist</label>
                <input
                  value={editForm.artist}
                  onChange={(e) => setEditForm((f) => ({ ...f, artist: e.target.value }))}
                  className="w-full bg-surface-800 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-1 focus:ring-aurora-500"
                />
              </div>
              <div>
                <label className="block text-xs text-surface-400 mb-1">Album</label>
                <input
                  value={editForm.album}
                  onChange={(e) => setEditForm((f) => ({ ...f, album: e.target.value }))}
                  className="w-full bg-surface-800 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-1 focus:ring-aurora-500"
                />
              </div>
              <div>
                <label className="block text-xs text-surface-400 mb-1">Album Artist</label>
                <input
                  value={editForm.album_artist}
                  onChange={(e) => setEditForm((f) => ({ ...f, album_artist: e.target.value }))}
                  className="w-full bg-surface-800 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-1 focus:ring-aurora-500"
                />
              </div>
              <div>
                <label className="block text-xs text-surface-400 mb-1">Track Number</label>
                <input
                  type="number"
                  value={editForm.track_number}
                  onChange={(e) => setEditForm((f) => ({ ...f, track_number: e.target.value }))}
                  className="w-full bg-surface-800 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-1 focus:ring-aurora-500"
                />
              </div>
              <div>
                <label className="block text-xs text-surface-400 mb-1">Year</label>
                <input
                  type="number"
                  value={editForm.year}
                  onChange={(e) => setEditForm((f) => ({ ...f, year: e.target.value }))}
                  className="w-full bg-surface-800 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-1 focus:ring-aurora-500"
                />
              </div>
              <div className="col-span-2">
                <MultiGenreField
                  label="Genre"
                  values={editForm.genres}
                  onChange={(v) => setEditForm((f) => ({ ...f, genres: v }))}
                  existingValues={existingGenres}
                />
              </div>
              <div>
                <label className="block text-xs text-surface-400 mb-1">Studio</label>
                <input
                  value={editForm.studio}
                  onChange={(e) => setEditForm((f) => ({ ...f, studio: e.target.value }))}
                  className="w-full bg-surface-800 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-1 focus:ring-aurora-500"
                />
              </div>
            </div>
            <div className="col-span-2 mt-2">
              <h3 className="mb-2 text-sm font-medium text-white">Artwork</h3>
              <ArtworkCropper
                imageSrc={editImageSrc}
                onCropComplete={handleEditCropComplete}
                onReplace={handleEditReplaceArtwork}
                onRemove={handleEditRemoveArtwork}
              />
            </div>
            <div className="flex gap-3 justify-end mt-6">
              <button
                onClick={() => setEditingSong(null)}
                disabled={savingEdit}
                className="px-4 py-2 bg-surface-800 hover:bg-surface-700 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveEdit}
                disabled={savingEdit || !editForm.title.trim() || !editForm.artist.trim()}
                className="px-4 py-2 bg-aurora-600 hover:bg-aurora-500 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50"
              >
                {savingEdit ? "Saving..." : "Save Changes"}
              </button>
            </div>
          </div>
        </div>
      )}

      {confirmModal && (
        <ConfirmModal
          title="Delete Song"
          message={`Are you sure you want to delete "${confirmModal.name}"? This action cannot be undone.`}
          onConfirm={handleDelete}
          onCancel={() => setConfirmModal(null)}
          loading={deleting}
        />
      )}

      {showUploadDialog && (
        <UploadSongDialog
          onClose={() => setShowUploadDialog(false)}
          onSuccess={() => loadSongs(songQuery || undefined, 0)}
        />
      )}
    </div>
  );
}

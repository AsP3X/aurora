// Human: Admin music table — glass DataTable, search/upload toolbar, HLS badges, context menu, edit in GlassDialog, glass pagination.
// Agent: fetchAdminSongs offset+query; ContextMenu; UploadSongDialog; updateAdminSong+deleteAdminSong+toggleEnabled; USES PageHeader DataTable GlassDialog GlassButton.
import { useState, useEffect, useCallback, useMemo } from "react";
import {
  fetchAdminSongs,
  deleteAdminSong,
  updateAdminSong,
  toggleAdminSongEnabled,
  fetchArtworkUrl,
  retryAdminSongHls,
  fetchSearchSyncStatus,
  retrySearchSync,
  type SearchSyncStatus,
} from "../../api/client";
import ArtworkImage from "../../components/ArtworkImage";
import ContextMenu from "../../components/ui/ContextMenu";
import type { ContextMenuItem } from "../../components/ui/ContextMenu";
import UploadSongDialog from "../../components/admin/UploadSongDialog";
import MultiGenreField from "../../components/admin/MultiGenreField";
import ConfirmModal from "../../components/admin/ConfirmModal";
import ArtworkCropper from "../../components/admin/ArtworkCropper";
import PageHeader from "../../components/admin/PageHeader";
import DataTable from "../../components/admin/DataTable";
import type { DataTableColumn } from "../../components/admin/DataTable";
import MobileDataCard from "../../components/admin/MobileDataCard";
import GlassDialog from "../../components/admin/GlassDialog";
import GlassButton from "../../components/admin/GlassButton";
import type { Song } from "../../types";

function formatDuration(seconds: number) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

// Human: Map backend HLS fields to a short label and Tailwind colors for the admin table.
// Agent: READS hls_ready, hls_encode_status, conversion_progress; RETURNS label + badge classes.
function hlsEncodeBadge(song: Song): { label: string; className: string; title?: string } {
  if (song.hls_ready) {
    return {
      label: "Ready",
      className: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
    };
  }
  if (song.hls_encode_status === "failed") {
    return {
      label: "Failed",
      className: "bg-red-500/15 text-red-300 border-red-500/30",
      title: song.hls_encode_error || "HLS encode failed",
    };
  }
  if (song.hls_encode_status === "processing" || song.conversion_progress > 0) {
    return {
      label: song.conversion_progress > 0 ? `${song.conversion_progress}%` : "Encoding",
      className: "bg-amber-500/15 text-amber-300 border-amber-500/30",
    };
  }
  return {
    label: "Pending",
    className: "bg-surface-700 text-surface-400 border-white/10",
  };
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
  const [searchSync, setSearchSync] = useState<SearchSyncStatus | null>(null);
  const [retryingHlsId, setRetryingHlsId] = useState<string | null>(null);

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
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : "Failed to load songs";
      setError(message);
    } finally {
      setSongLoading(false);
    }
  }, []);

  useEffect(() => {
    loadSongs(songQuery || undefined, songOffset);
  }, [songQuery, songOffset, loadSongs]);

  useEffect(() => {
    fetchSearchSyncStatus()
      .then(setSearchSync)
      .catch(() => setSearchSync(null));
  }, []);

  // Human: Refresh the table while any row is still transcoding so progress badges stay current.
  // Agent: INTERVAL 3s when processing songs exist; CALLS loadSongs with current query/offset.
  useEffect(() => {
    const processing = songs.some(
      (s) =>
        !s.hls_ready &&
        (s.hls_encode_status === "processing" || s.conversion_progress > 0),
    );
    if (!processing) return;
    const timer = setInterval(() => {
      loadSongs(songQuery || undefined, songOffset);
    }, 3000);
    return () => clearInterval(timer);
  }, [songs, songQuery, songOffset, loadSongs]);

  // Human: Re-queue ffmpeg for failed or never-started encodes without re-uploading source audio.
  // Agent: CALLS retryAdminSongHls; REFRESHES table; SETS retryingHlsId for menu disabled state.
  async function handleRetryHls(song: Song) {
    setRetryingHlsId(song.id);
    setError("");
    try {
      await retryAdminSongHls(song.id);
      await loadSongs(songQuery || undefined, songOffset);
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : "Failed to retry HLS encode";
      setError(message);
    } finally {
      setRetryingHlsId(null);
    }
  }

  async function openEditDialog(song: Song) {
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
    setEditCroppedBlob(null);
    setEditArtworkChanged(false);
    setEditRemoveArtwork(false);
    if (song.artwork_key) {
      const url = await fetchArtworkUrl(song.id).catch(() => null);
      setEditImageSrc(url);
    } else {
      setEditImageSrc(null);
    }
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
        editArtworkChanged ? editRemoveArtwork : undefined,
      );
      setSongs((prev) => prev.map((s) => (s.id === updated.id ? updated : s)));
      setEditingSong(null);
      setEditImageSrc(null);
      setEditCroppedBlob(null);
      setEditArtworkChanged(false);
      setEditRemoveArtwork(false);
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : "Failed to update song";
      setError(message);
    } finally {
      setSavingEdit(false);
    }
  }

  async function handleToggleEnabled(song: Song) {
    try {
      const updated = await toggleAdminSongEnabled(song.id, !song.enabled);
      setSongs((prev) => prev.map((s) => (s.id === updated.id ? updated : s)));
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : "Failed to toggle enabled state";
      setError(message);
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
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : "Failed to delete song";
      setError(message);
    } finally {
      setDeleting(false);
    }
  }

  function handleContextMenu(e: React.MouseEvent, song: Song) {
    e.preventDefault();
    setContextMenu({ x: e.clientX, y: e.clientY, song });
  }

  function openRowMenu(e: React.MouseEvent, song: Song) {
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    setContextMenu({
      x: rect.left + rect.width / 2,
      y: rect.bottom + 4,
      song,
    });
  }

  function buildMenuItems(song: Song): ContextMenuItem[] {
    const items: ContextMenuItem[] = [
      {
        label: "Edit",
        icon: (
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
          </svg>
        ),
        onClick: () => void openEditDialog(song),
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
        onClick: () => void handleToggleEnabled(song),
      },
    ];

    // Human: Offer retry when encode failed or never reached ready/processing (stuck pending).
    // Agent: CONTEXT MENU item; CALLS handleRetryHls; DISABLED while retryingHlsId matches row.
    if (song.hls_encode_status === "failed" || (!song.hls_ready && song.hls_encode_status !== "processing")) {
      items.push({
        label: retryingHlsId === song.id ? "Retrying HLS…" : "Retry HLS encode",
        onClick: () => void handleRetryHls(song),
        disabled: retryingHlsId === song.id,
      });
    }

    items.push({
      label: "Delete",
      danger: true,
      icon: (
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
        </svg>
      ),
      onClick: () => setConfirmModal({ id: song.id, name: song.title }),
    });

    return items;
  }

  const columns: DataTableColumn<Song>[] = [
    {
      key: "artwork",
      header: "Artwork",
      render: (song) => (
        <ArtworkImage
          songId={song.id}
          title={song.title}
          artist={song.artist}
          className="w-10 h-10 rounded-lg object-cover bg-surface-950"
        />
      ),
    },
    {
      key: "title",
      header: "Title",
      render: (song) => (
        <div className="flex items-center gap-2 min-w-0">
          <span className="font-medium text-white truncate">{song.title}</span>
          {!song.enabled && (
            <span className="shrink-0 text-[10px] px-1.5 py-0.5 rounded-full bg-surface-700 text-surface-400 border border-white/5">
              Disabled
            </span>
          )}
        </div>
      ),
    },
    { key: "artist", header: "Artist", render: (song) => <span className="text-surface-300">{song.artist}</span> },
    {
      key: "album",
      header: "Album",
      render: (song) => <span className="text-surface-400">{song.album || "—"}</span>,
    },
    {
      key: "duration",
      header: "Duration",
      render: (song) => <span className="text-surface-400">{formatDuration(song.duration_seconds)}</span>,
    },
    {
      key: "format",
      header: "Format",
      render: (song) => <span className="text-surface-400 uppercase">{song.file_format}</span>,
    },
    {
      key: "streaming",
      header: "Streaming",
      render: (song) => {
        const badge = hlsEncodeBadge(song);
        return (
          <span title={badge.title} className={`text-[10px] px-1.5 py-0.5 rounded-full border ${badge.className}`}>
            {badge.label}
          </span>
        );
      },
    },
    {
      key: "actions",
      header: <span className="sr-only">Actions</span>,
      headerClassName: "text-right",
      className: "text-right",
      render: (song) => (
        <button
          type="button"
          onClick={(e) => openRowMenu(e, song)}
          className="text-surface-400 hover:text-white p-1 rounded hover:bg-white/5 transition-colors focus:outline-none focus:ring-2 focus:ring-aurora-500/50"
          aria-label={`Actions for ${song.title}`}
        >
          <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
            <circle cx="12" cy="6" r="1.5" />
            <circle cx="12" cy="12" r="1.5" />
            <circle cx="12" cy="18" r="1.5" />
          </svg>
        </button>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader title="Library" error={error || undefined} />

      {searchSync?.warning && (
        <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-amber-200 bg-amber-500/10 border border-amber-500/25 rounded-xl px-3 py-2 admin-panel !rounded-xl">
          <span>{searchSync.warning}</span>
          {(searchSync.pending_count > 0 || searchSync.failed_count > 0) && (
            <button
              type="button"
              onClick={() => retrySearchSync().then(setSearchSync).catch(() => undefined)}
              className="px-2 py-1 rounded-lg bg-amber-600/30 hover:bg-amber-600/50 text-amber-100 text-xs font-medium focus:outline-none focus:ring-2 focus:ring-amber-400/50"
            >
              Retry search sync
            </button>
          )}
        </div>
      )}

      {/* Human: Toolbar sits in its own glass strip so search + upload read as one admin control cluster. */}
      {/* Agent: admin-panel WRAPS flex row; INPUT filter; BUTTON opens UploadSongDialog. */}
      <div className="admin-panel p-4 flex flex-wrap items-center gap-3">
        <label htmlFor="admin-library-search" className="sr-only">
          Search songs in library
        </label>
        <input
          id="admin-library-search"
          type="search"
          placeholder="Search songs..."
          value={songQuery}
          onChange={(e) => {
            setSongQuery(e.target.value);
            setSongOffset(0);
          }}
          className="flex-1 min-w-[200px] max-w-md px-3 py-2 bg-surface-950/50 border border-white/10 rounded-xl text-sm text-white placeholder-surface-500 focus:outline-none focus:ring-2 focus:ring-aurora-500/50"
        />
        <button
          type="button"
          onClick={() => setShowUploadDialog(true)}
          className="px-4 py-2 bg-aurora-600 hover:bg-aurora-500 text-white text-sm font-medium rounded-xl transition-colors focus:outline-none focus:ring-2 focus:ring-aurora-500/50 shrink-0"
        >
          + Upload Song
        </button>
        {songLoading && (
          <div className="w-5 h-5 border-2 border-aurora-500 border-t-transparent rounded-full animate-spin shrink-0" />
        )}
      </div>

      <DataTable<Song>
        columns={columns}
        data={songs}
        rowKey={(song) => song.id}
        loading={songLoading}
        rowClassName={(song) => (!song.enabled ? "opacity-50" : "")}
        onRowContextMenu={handleContextMenu}
        renderMobileCard={(song) => {
          const badge = hlsEncodeBadge(song);
          return (
            <MobileDataCard
              leading={
                <ArtworkImage
                  songId={song.id}
                  title={song.title}
                  artist={song.artist}
                  className="w-12 h-12 rounded-lg object-cover bg-surface-950 shrink-0"
                />
              }
              primary={song.title}
              secondary={`${!song.enabled ? "Disabled · " : ""}${song.artist} · ${song.album || "—"} · ${formatDuration(
                song.duration_seconds,
              )} · ${song.file_format.toUpperCase()} · ${badge.label}`}
              trailing={
                <button
                  type="button"
                  onClick={(e) => openRowMenu(e, song)}
                  className="text-surface-400 hover:text-white p-1 rounded hover:bg-white/5 transition-colors focus:outline-none focus:ring-2 focus:ring-aurora-500/50 shrink-0"
                  aria-label={`Actions for ${song.title}`}
                >
                  <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                    <circle cx="12" cy="6" r="1.5" />
                    <circle cx="12" cy="12" r="1.5" />
                    <circle cx="12" cy="18" r="1.5" />
                  </svg>
                </button>
              }
            />
          );
        }}
      />

      <div className="admin-panel px-4 py-3 flex flex-wrap items-center justify-between gap-3">
        <GlassButton onClick={() => setSongOffset((o) => Math.max(0, o - SONG_LIMIT))} disabled={songOffset === 0}>
          Previous
        </GlassButton>
        <span className="text-sm text-surface-400 font-mono">
          Showing {songs.length > 0 ? songOffset + 1 : 0}–{songOffset + songs.length}
        </span>
        <GlassButton onClick={() => setSongOffset((o) => o + SONG_LIMIT)} disabled={songs.length < SONG_LIMIT}>
          Next
        </GlassButton>
      </div>

      {contextMenu && (
        <ContextMenu
          items={buildMenuItems(contextMenu.song)}
          x={contextMenu.x}
          y={contextMenu.y}
          onClose={() => setContextMenu(null)}
        />
      )}

      <GlassDialog
        open={!!editingSong}
        onClose={() => !savingEdit && setEditingSong(null)}
        title="Edit Song"
        size="lg"
        className="max-h-[90vh] overflow-y-auto"
      >
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-xs text-surface-400 mb-1">Title</label>
            <input
              value={editForm.title}
              onChange={(e) => setEditForm((f) => ({ ...f, title: e.target.value }))}
              className="w-full bg-surface-950/80 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-aurora-500/50"
            />
          </div>
          <div>
            <label className="block text-xs text-surface-400 mb-1">Artist</label>
            <input
              value={editForm.artist}
              onChange={(e) => setEditForm((f) => ({ ...f, artist: e.target.value }))}
              className="w-full bg-surface-950/80 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-aurora-500/50"
            />
          </div>
          <div>
            <label className="block text-xs text-surface-400 mb-1">Album</label>
            <input
              value={editForm.album}
              onChange={(e) => setEditForm((f) => ({ ...f, album: e.target.value }))}
              className="w-full bg-surface-950/80 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-aurora-500/50"
            />
          </div>
          <div>
            <label className="block text-xs text-surface-400 mb-1">Album Artist</label>
            <input
              value={editForm.album_artist}
              onChange={(e) => setEditForm((f) => ({ ...f, album_artist: e.target.value }))}
              className="w-full bg-surface-950/80 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-aurora-500/50"
            />
          </div>
          <div>
            <label className="block text-xs text-surface-400 mb-1">Track Number</label>
            <input
              type="number"
              value={editForm.track_number}
              onChange={(e) => setEditForm((f) => ({ ...f, track_number: e.target.value }))}
              className="w-full bg-surface-950/80 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-aurora-500/50"
            />
          </div>
          <div>
            <label className="block text-xs text-surface-400 mb-1">Year</label>
            <input
              type="number"
              value={editForm.year}
              onChange={(e) => setEditForm((f) => ({ ...f, year: e.target.value }))}
              className="w-full bg-surface-950/80 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-aurora-500/50"
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
              className="w-full bg-surface-950/80 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-aurora-500/50"
            />
          </div>
        </div>
        {/* Human: Artwork editor spans full dialog width below the metadata grid. */}
        {/* Agent: BLOCK mt-2; NOT grid child — avoids invalid col-span without grid parent. */}
        <div className="mt-4">
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
            type="button"
            onClick={() => setEditingSong(null)}
            disabled={savingEdit}
            className="px-4 py-2 bg-surface-950/80 hover:bg-surface-900 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50 border border-white/10 focus:outline-none focus:ring-2 focus:ring-aurora-500/50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => void handleSaveEdit()}
            disabled={savingEdit || !editForm.title.trim() || !editForm.artist.trim()}
            className="px-4 py-2 bg-aurora-600 hover:bg-aurora-500 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-aurora-500/50"
          >
            {savingEdit ? "Saving..." : "Save Changes"}
          </button>
        </div>
      </GlassDialog>

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

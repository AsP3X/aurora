import { useEffect, useState, useMemo, useRef } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import {
  fetchPlaylist,
  updatePlaylist,
  deletePlaylist,
  removeSongFromPlaylist,
  reorderPlaylistSongs,
  addSongToPlaylist,
  fetchSongs,
} from "../api/client";
import { usePlayer } from "../context/PlayerContext";
import DashboardLayout from "../components/DashboardLayout";
import ArtworkImage from "../components/ArtworkImage";
import type { Song, Playlist } from "../types";

function formatDuration(seconds: number) {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function PlayButton({ song }: { song: Song }) {
  const { playSong } = usePlayer();

  function handleClick(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    playSong(song);
  }

  return (
    <button onClick={handleClick} className="text-aurora-400 hover:text-aurora-300 transition-colors">
      <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z" /></svg>
    </button>
  );
}

interface SongOption {
  id: string;
  title: string;
  artist: string;
  album: string | null;
  duration_seconds: number;
}

function fuzzyScore(query: string, song: SongOption): number {
  const q = query.trim().toLowerCase();
  if (!q) return 1;
  const words = q.split(/\s+/).filter(Boolean);
  const haystack = `${song.title} ${song.artist} ${song.album || ""}`.toLowerCase();
  let score = 0;
  for (const word of words) {
    if (haystack.includes(word)) score += 1;
  }
  return score;
}

export default function PlaylistDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { playSong, playSongs } = usePlayer();
  const [playlist, setPlaylist] = useState<Playlist | null>(null);
  const [songs, setSongs] = useState<Song[]>([]);
  const [loading, setLoading] = useState(true);
  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState("");
  const [editDesc, setEditDesc] = useState("");
  const [editPublic, setEditPublic] = useState(false);
  const [saving, setSaving] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [removingSongId, setRemovingSongId] = useState<string | null>(null);
  const [reordering, setReordering] = useState(false);

  /* Add-songs dialog state */
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [librarySongs, setLibrarySongs] = useState<SongOption[]>([]);
  const [addDialogLoading, setAddDialogLoading] = useState(false);
  const [addSearch, setAddSearch] = useState("");
  const [selectedSongIds, setSelectedSongIds] = useState<Set<string>>(new Set());
  const [addingSongs, setAddingSongs] = useState(false);
  const addSearchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    fetchPlaylist(id)
      .then((data) => {
        setPlaylist(data.playlist);
        setSongs(data.songs);
      })
      .finally(() => setLoading(false));
  }, [id]);

  const totalDuration = songs.reduce((sum, s) => sum + s.duration_seconds, 0);

  /* Load library songs when dialog opens */
  useEffect(() => {
    if (!showAddDialog) return;
    setAddDialogLoading(true);
    fetchSongs({ order_by: "title", limit: 10000 })
      .then((data) => {
        const mapped: SongOption[] = data.map((s) => ({
          id: s.id,
          title: s.title,
          artist: s.artist,
          album: s.album,
          duration_seconds: s.duration_seconds,
        }));
        setLibrarySongs(mapped);
      })
      .catch(() => setLibrarySongs([]))
      .finally(() => setAddDialogLoading(false));
  }, [showAddDialog]);

  /* Focus search when dialog opens */
  useEffect(() => {
    if (showAddDialog) {
      const t = setTimeout(() => addSearchRef.current?.focus(), 100);
      return () => clearTimeout(t);
    }
  }, [showAddDialog]);

  const existingIds = useMemo(() => new Set(songs.map((s) => s.id)), [songs]);

  const filteredOptions = useMemo(() => {
    const scored = librarySongs
      .filter((s) => !existingIds.has(s.id))
      .map((s) => ({ song: s, score: fuzzyScore(addSearch, s) }))
      .filter((x) => x.score > 0)
      .sort((a, b) => b.score - a.score || a.song.title.localeCompare(b.song.title));
    return scored.map((x) => x.song);
  }, [librarySongs, addSearch, existingIds]);

  function toggleSelection(songId: string) {
    setSelectedSongIds((prev) => {
      const next = new Set(prev);
      if (next.has(songId)) {
        next.delete(songId);
      } else {
        next.add(songId);
      }
      return next;
    });
  }

  function selectAllVisible() {
    setSelectedSongIds((prev) => {
      const next = new Set(prev);
      for (const s of filteredOptions) next.add(s.id);
      return next;
    });
  }

  function deselectAllVisible() {
    setSelectedSongIds((prev) => {
      const next = new Set(prev);
      for (const s of filteredOptions) next.delete(s.id);
      return next;
    });
  }

  async function handleAddSelected() {
    if (!id || selectedSongIds.size === 0) return;
    setAddingSongs(true);
    try {
      for (const songId of selectedSongIds) {
        await addSongToPlaylist(id, songId);
      }
      // Refresh playlist
      const data = await fetchPlaylist(id);
      setPlaylist(data.playlist);
      setSongs(data.songs);
      setShowAddDialog(false);
      setSelectedSongIds(new Set());
      setAddSearch("");
    } finally {
      setAddingSongs(false);
    }
  }

  function startEdit() {
    if (!playlist) return;
    setEditName(playlist.name);
    setEditDesc(playlist.description || "");
    setEditPublic(playlist.is_public);
    setIsEditing(true);
  }

  async function handleSaveEdit(e: React.FormEvent) {
    e.preventDefault();
    if (!id || !playlist) return;
    setSaving(true);
    try {
      const updated = await updatePlaylist(id, {
        name: editName,
        description: editDesc || undefined,
        is_public: editPublic,
      });
      setPlaylist(updated);
      setIsEditing(false);
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!id) return;
    setSaving(true);
    try {
      await deletePlaylist(id);
      navigate("/playlists");
    } finally {
      setSaving(false);
    }
  }

  async function handleRemoveSong(songId: string) {
    if (!id) return;
    setRemovingSongId(songId);
    try {
      await removeSongFromPlaylist(id, songId);
      setSongs((prev) => prev.filter((s) => s.id !== songId));
    } finally {
      setRemovingSongId(null);
    }
  }

  function moveSong(songId: string, direction: "up" | "down") {
    setSongs((prev) => {
      const idx = prev.findIndex((s) => s.id === songId);
      if (idx < 0) return prev;
      if (direction === "up" && idx === 0) return prev;
      if (direction === "down" && idx === prev.length - 1) return prev;
      const newSongs = [...prev];
      const swapIdx = direction === "up" ? idx - 1 : idx + 1;
      [newSongs[idx], newSongs[swapIdx]] = [newSongs[swapIdx], newSongs[idx]];
      return newSongs;
    });
  }

  async function handleSaveOrder() {
    if (!id) return;
    setReordering(true);
    try {
      await reorderPlaylistSongs(id, songs.map((s) => s.id));
    } finally {
      setReordering(false);
    }
  }

  function handlePlayAll() {
    if (songs.length === 0) return;
    playSongs(songs, 0);
  }

  function handleShuffle() {
    if (songs.length === 0) return;
    const shuffled = [...songs].sort(() => Math.random() - 0.5);
    playSongs(shuffled, 0);
  }

  if (loading) {
    return (
      <DashboardLayout>
        <div className="flex-1 flex items-center justify-center h-full">
          <div className="flex flex-col items-center gap-3">
            <div className="w-8 h-8 border-2 border-aurora-500 border-t-transparent rounded-full animate-spin" />
            <p className="text-surface-400 text-sm">Loading playlist...</p>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  if (!playlist) {
    return (
      <DashboardLayout>
        <p className="text-surface-400 text-center py-20">Playlist not found.</p>
      </DashboardLayout>
    );
  }

  const addableCount = filteredOptions.length;
  const selectedAddableCount = Array.from(selectedSongIds).filter((sid) => filteredOptions.some((s) => s.id === sid)).length;

  return (
    <DashboardLayout>
      <div className="space-y-8">
        {/* Hero */}
        <div className="flex flex-col sm:flex-row items-start gap-6">
          <div className="w-40 h-40 sm:w-52 sm:h-52 shrink-0 rounded-3xl bg-gradient-to-br from-aurora-600/80 to-aurora-800/80 flex items-center justify-center shadow-2xl shadow-aurora-500/10">
            <svg className="w-16 h-16 sm:w-20 sm:h-20 text-white/80" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.2} d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3" />
            </svg>
          </div>
          <div className="flex-1 min-w-0">
            <Link to="/playlists" className="text-sm text-aurora-400 hover:text-aurora-300 transition-colors font-medium">
              Playlists
            </Link>
            {isEditing ? (
              <form onSubmit={handleSaveEdit} className="mt-3 space-y-3 max-w-lg">
                <input
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  placeholder="Playlist name"
                  required
                  className="w-full px-4 py-2 bg-surface-950 border border-white/10 rounded-xl text-white placeholder-surface-500 focus:outline-none focus:ring-2 focus:ring-aurora-500/50 focus:border-aurora-500/50 transition-all"
                />
                <input
                  value={editDesc}
                  onChange={(e) => setEditDesc(e.target.value)}
                  placeholder="Description (optional)"
                  className="w-full px-4 py-2 bg-surface-950 border border-white/10 rounded-xl text-white placeholder-surface-500 focus:outline-none focus:ring-2 focus:ring-aurora-500/50 focus:border-aurora-500/50 transition-all"
                />
                <label className="flex items-center gap-2 text-sm text-surface-300 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={editPublic}
                    onChange={(e) => setEditPublic(e.target.checked)}
                    className="w-4 h-4 rounded border-white/10 bg-surface-950 text-aurora-500 focus:ring-aurora-500/50"
                  />
                  Public Playlist
                </label>
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => setIsEditing(false)}
                    className="px-4 py-2 text-sm text-surface-400 hover:text-white transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={saving || !editName.trim()}
                    className="px-5 py-2 bg-aurora-600 hover:bg-aurora-500 text-white text-sm font-medium rounded-xl transition-colors disabled:opacity-50"
                  >
                    {saving ? "Saving..." : "Save"}
                  </button>
                </div>
              </form>
            ) : (
              <>
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <h1 className="text-3xl sm:text-4xl font-bold tracking-tight mt-1">{playlist.name}</h1>
                    {playlist.description && <p className="text-surface-400 mt-2 max-w-lg">{playlist.description}</p>}
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      onClick={startEdit}
                      className="p-2 rounded-lg text-surface-400 hover:text-white hover:bg-white/5 transition-colors"
                      title="Edit playlist"
                    >
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                      </svg>
                    </button>
                    <button
                      onClick={() => setShowDeleteConfirm(true)}
                      className="p-2 rounded-lg text-surface-400 hover:text-red-400 hover:bg-red-500/5 transition-colors"
                      title="Delete playlist"
                    >
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                    </button>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2 mt-3">
                  <p className="text-sm text-surface-500">
                    {songs.length} tracks · {formatDuration(totalDuration)} total
                  </p>
                  {playlist.is_public && (
                    <span className="text-[10px] uppercase tracking-wider font-medium text-aurora-400 bg-aurora-500/10 border border-aurora-500/20 px-2 py-0.5 rounded-full">
                      Public
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-3 mt-4 flex-wrap">
                  {songs.length > 0 && (
                    <>
                      <button
                        onClick={handlePlayAll}
                        className="inline-flex items-center gap-2 px-5 py-2.5 bg-aurora-600 hover:bg-aurora-500 text-white text-sm font-medium rounded-xl transition-colors shadow-lg shadow-aurora-500/20"
                      >
                        <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z" /></svg>
                        Play All
                      </button>
                      <button
                        onClick={handleShuffle}
                        className="inline-flex items-center gap-2 px-5 py-2.5 bg-surface-900 hover:bg-surface-800 border border-white/10 text-white text-sm font-medium rounded-xl transition-colors"
                      >
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.058M20 20v-5h-.058M4 14a8 8 0 0113.647-5.647M20 10a8 8 0 01-13.647 5.647" />
                        </svg>
                        Shuffle
                      </button>
                      <button
                        onClick={handleSaveOrder}
                        disabled={reordering}
                        className="inline-flex items-center gap-2 px-4 py-2.5 bg-surface-900 hover:bg-surface-800 border border-white/10 text-surface-300 hover:text-white text-sm font-medium rounded-xl transition-colors disabled:opacity-50"
                      >
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
                        </svg>
                        {reordering ? "Saving..." : "Save Order"}
                      </button>
                    </>
                  )}
                  <button
                    onClick={() => setShowAddDialog(true)}
                    className="inline-flex items-center gap-2 px-5 py-2.5 bg-surface-900 hover:bg-surface-800 border border-white/10 text-white text-sm font-medium rounded-xl transition-colors"
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                    </svg>
                    Add Songs
                  </button>
                </div>
              </>
            )}
          </div>
        </div>

        {/* Delete confirmation modal */}
        {showDeleteConfirm && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm px-4">
            <div className="bg-surface-900 border border-white/10 rounded-2xl p-6 max-w-sm w-full shadow-2xl">
              <h3 className="text-lg font-semibold text-white">Delete Playlist?</h3>
              <p className="text-sm text-surface-400 mt-2">
                This will permanently delete "{playlist.name}" and remove all {songs.length} songs from it.
              </p>
              <div className="flex items-center justify-end gap-3 mt-6">
                <button
                  onClick={() => setShowDeleteConfirm(false)}
                  className="px-4 py-2 text-sm text-surface-400 hover:text-white transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleDelete}
                  disabled={saving}
                  className="px-5 py-2 bg-red-600 hover:bg-red-500 text-white text-sm font-medium rounded-xl transition-colors disabled:opacity-50"
                >
                  {saving ? "Deleting..." : "Delete"}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Add Songs Dialog */}
        {showAddDialog && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm px-4">
            <div className="bg-surface-900 border border-white/10 rounded-2xl w-full max-w-lg shadow-2xl flex flex-col max-h-[80vh]">
              {/* Header */}
              <div className="px-5 py-4 border-b border-white/5 flex items-center justify-between shrink-0">
                <div>
                  <h3 className="text-lg font-semibold text-white">Add Songs</h3>
                  <p className="text-xs text-surface-500 mt-0.5">
                    {selectedAddableCount > 0
                      ? `${selectedAddableCount} selected`
                      : `${addableCount} available`}
                  </p>
                </div>
                <button
                  onClick={() => {
                    setShowAddDialog(false);
                    setSelectedSongIds(new Set());
                    setAddSearch("");
                  }}
                  className="p-1.5 rounded-lg text-surface-400 hover:text-white hover:bg-white/5 transition-colors"
                >
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              {/* Search */}
              <div className="px-5 py-3 border-b border-white/5 shrink-0">
                <div className="relative">
                  <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-surface-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                  </svg>
                  <input
                    ref={addSearchRef}
                    type="text"
                    value={addSearch}
                    onChange={(e) => setAddSearch(e.target.value)}
                    placeholder="Search songs, artists, albums..."
                    className="w-full h-10 bg-surface-950 border border-white/10 rounded-xl pl-10 pr-4 text-sm text-white placeholder-surface-500 focus:outline-none focus:ring-2 focus:ring-aurora-500/50 focus:border-aurora-500/50 transition-all"
                  />
                  {addSearch && (
                    <button
                      onClick={() => setAddSearch("")}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-surface-500 hover:text-white transition-colors"
                    >
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  )}
                </div>
                <div className="flex items-center justify-between mt-2">
                  <div className="flex items-center gap-2">
                    <button
                      onClick={selectAllVisible}
                      className="text-xs text-aurora-400 hover:text-aurora-300 transition-colors font-medium"
                    >
                      Select All
                    </button>
                    <span className="text-surface-700">·</span>
                    <button
                      onClick={deselectAllVisible}
                      className="text-xs text-surface-400 hover:text-white transition-colors font-medium"
                    >
                      Deselect All
                    </button>
                  </div>
                </div>
              </div>

              {/* Song list */}
              <div className="flex-1 overflow-auto min-h-0">
                {addDialogLoading ? (
                  <div className="flex flex-col items-center justify-center py-12">
                    <div className="w-6 h-6 border-2 border-aurora-500 border-t-transparent rounded-full animate-spin" />
                    <p className="text-surface-500 text-sm mt-3">Loading songs...</p>
                  </div>
                ) : filteredOptions.length === 0 ? (
                  <div className="text-center py-12">
                    <p className="text-surface-500 text-sm">
                      {addSearch ? "No songs match your search." : "No songs available."}
                    </p>
                  </div>
                ) : (
                  <div className="divide-y divide-white/5">
                    {filteredOptions.map((song) => {
                      const isSelected = selectedSongIds.has(song.id);
                      return (
                        <div
                          key={song.id}
                          onClick={() => toggleSelection(song.id)}
                          className="flex items-center gap-3 px-5 py-3 transition-colors hover:bg-white/5 cursor-pointer"
                        >
                          <input
                            type="checkbox"
                            checked={isSelected}
                            readOnly
                            className="w-4 h-4 rounded border-white/10 bg-surface-950 text-aurora-500 focus:ring-aurora-500/50 shrink-0 pointer-events-none"
                          />
                          <div className="w-9 h-9 rounded-lg bg-surface-800 overflow-hidden shrink-0">
                            <ArtworkImage
                              songId={song.id}
                              title={song.title}
                              artist={song.artist}
                              className="w-full h-full object-cover"
                            />
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-medium truncate text-white">{song.title}</p>
                            <p className="text-xs text-surface-400 truncate">{song.artist}{song.album ? ` · ${song.album}` : ""}</p>
                          </div>
                          <div className="text-xs text-surface-500 font-mono shrink-0">
                            {formatDuration(song.duration_seconds)}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Footer */}
              <div className="px-5 py-4 border-t border-white/5 flex items-center justify-end gap-3 shrink-0">
                <button
                  onClick={() => {
                    setShowAddDialog(false);
                    setSelectedSongIds(new Set());
                    setAddSearch("");
                  }}
                  className="px-4 py-2 text-sm text-surface-400 hover:text-white transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleAddSelected}
                  disabled={addingSongs || selectedAddableCount === 0}
                  className="px-5 py-2 bg-aurora-600 hover:bg-aurora-500 text-white text-sm font-medium rounded-xl transition-colors disabled:opacity-50 inline-flex items-center gap-2"
                >
                  {addingSongs && <div className="w-3.5 h-3.5 border border-white border-t-transparent rounded-full animate-spin" />}
                  Add {selectedAddableCount > 0 ? selectedAddableCount : ""} Song{selectedAddableCount !== 1 ? "s" : ""}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Songs list */}
        {songs.length === 0 ? (
          <div className="text-center py-16 bg-surface-900/30 border border-white/5 rounded-2xl">
            <p className="text-surface-400 font-medium">No songs in this playlist yet</p>
            <p className="text-surface-500 text-sm mt-1">Click Add Songs to get started</p>
          </div>
        ) : (
          <div className="bg-surface-900/40 border border-white/5 rounded-2xl overflow-hidden">
            <div className="px-4 py-2 border-b border-white/5 text-xs text-surface-400 uppercase tracking-wider font-medium grid grid-cols-[3rem_1fr_1fr_4rem_3rem] gap-3 items-center hidden sm:grid">
              <span>#</span>
              <span>Title</span>
              <span className="hidden md:block">Album</span>
              <span className="text-right">Duration</span>
              <span />
            </div>
            <div className="divide-y divide-white/5">
              {songs.map((song, i) => (
                <div
                  key={song.id}
                  className="group flex items-center gap-3 px-4 py-3 hover:bg-white/5 transition-colors cursor-pointer"
                  onClick={() => playSong(song)}
                >
                  <div className="w-8 text-center text-sm text-surface-500 shrink-0">
                    <span className="group-hover:hidden">{i + 1}</span>
                    <div className="hidden group-hover:block">
                      <PlayButton song={song} />
                    </div>
                  </div>
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    <div className="w-10 h-10 rounded-lg bg-surface-800 overflow-hidden shrink-0">
                      <ArtworkImage
                        songId={song.id}
                        title={song.title}
                        artist={song.artist}
                        className="w-full h-full object-cover"
                      />
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-white truncate">{song.title}</p>
                      <p className="text-xs text-surface-400 truncate">{song.artist}</p>
                    </div>
                  </div>
                  <div className="hidden md:block text-sm text-surface-400 truncate flex-1">{song.album || "—"}</div>
                  <div className="text-sm text-surface-500 font-mono text-xs w-12 text-right shrink-0">
                    {formatDuration(song.duration_seconds)}
                  </div>
                  <div className="w-12 flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        moveSong(song.id, "up");
                      }}
                      disabled={i === 0}
                      className="p-1 rounded text-surface-400 hover:text-white hover:bg-white/5 transition-colors disabled:opacity-30"
                      title="Move up"
                    >
                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 15l7-7 7 7" />
                      </svg>
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        moveSong(song.id, "down");
                      }}
                      disabled={i === songs.length - 1}
                      className="p-1 rounded text-surface-400 hover:text-white hover:bg-white/5 transition-colors disabled:opacity-30"
                      title="Move down"
                    >
                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                      </svg>
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleRemoveSong(song.id);
                      }}
                      disabled={removingSongId === song.id}
                      className="p-1 rounded text-surface-400 hover:text-red-400 hover:bg-red-500/5 transition-colors"
                      title="Remove from playlist"
                    >
                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}

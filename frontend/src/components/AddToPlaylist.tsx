// Human: Dropdown anchored to a custom trigger — lists playlists and POSTs addSongToPlaylist for the given song.
// Agent: OPEN fetches playlists; mousedown-outside closes; CALLS onAdded optional after success.
import { useState, useEffect, useRef } from "react";
import { fetchPlaylists, addSongToPlaylist } from "../api/client";
import type { Playlist, Song } from "../types";

export default function AddToPlaylist({
  song,
  children,
  onAdded,
}: {
  song: Song;
  children: React.ReactNode;
  onAdded?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [playlists, setPlaylists] = useState<Playlist[]>([]);
  const [loading, setLoading] = useState(false);
  const [addingTo, setAddingTo] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Human: Each time the popover opens, refresh playlist names so new lists appear without a full page reload.
  // Agent: EFFECT [open]; fetchPlaylists when open true.
  useEffect(() => {
    if (!open) return;
    setLoading(true);
    fetchPlaylists()
      .then(setPlaylists)
      .finally(() => setLoading(false));
  }, [open]);

  // Human: Click-away dismiss — uses capture-phase mousedown on document while open.
  // Agent: EFFECT [open]; LISTENS mousedown; CHECKS contains target.
  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    if (open) {
      document.addEventListener("mousedown", onClick);
      return () => document.removeEventListener("mousedown", onClick);
    }
  }, [open]);

  // Human: After a successful membership POST, close UI and let parent invalidate lists if needed.
  // Agent: addSongToPlaylist; SETS open false; INVOKES onAdded?.
  async function handleAdd(playlistId: string) {
    setAddingTo(playlistId);
    try {
      await addSongToPlaylist(playlistId, song.id);
      setOpen(false);
      onAdded?.();
    } finally {
      setAddingTo(null);
    }
  }

  return (
    <div ref={containerRef} className="relative">
      {/* Human: children render the visible trigger; stopPropagation avoids parent cards interpreting click as play. */}
      {/* Agent: TOGGLE open on button click */}
      <button
        onClick={(e) => {
          e.stopPropagation();
          setOpen((v) => !v);
        }}
        className="outline-none"
      >
        {children}
      </button>

      {open && (
        <div className="absolute right-0 mt-2 w-56 bg-surface-900 border border-white/10 rounded-2xl shadow-xl z-50 overflow-hidden">
          <div className="px-4 py-3 border-b border-white/5">
            <p className="text-sm font-medium text-white">Add to Playlist</p>
            <p className="text-xs text-surface-500 truncate mt-0.5">{song.title}</p>
          </div>
          <div className="max-h-60 overflow-auto py-1">
            {loading ? (
              <div className="flex items-center justify-center py-4">
                <div className="w-5 h-5 border-2 border-aurora-500 border-t-transparent rounded-full animate-spin" />
              </div>
            ) : playlists.length === 0 ? (
              <p className="text-xs text-surface-500 text-center py-4">No playlists yet</p>
            ) : (
              playlists.map((p) => (
                <button
                  key={p.id}
                  onClick={() => handleAdd(p.id)}
                  disabled={addingTo === p.id}
                  className="w-full text-left px-4 py-2.5 text-sm text-surface-300 hover:text-white hover:bg-white/5 transition-colors flex items-center gap-2"
                >
                  <div className="w-6 h-6 rounded-md bg-surface-800 border border-white/5 flex items-center justify-center shrink-0">
                    <svg className="w-3 h-3 text-surface-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3" />
                    </svg>
                  </div>
                  <span className="truncate">{p.name}</span>
                  {addingTo === p.id && (
                    <div className="ml-auto w-3 h-3 border border-aurora-500 border-t-transparent rounded-full animate-spin" />
                  )}
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}

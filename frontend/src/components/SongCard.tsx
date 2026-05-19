// Human: Library grid tile with context menu — left click plays (optionally as part of a list), right click adds to queue/playlist.
// Agent: OPTIONAL songs+index enables playSongs; CONTEXT MENU loads playlists on demand; CLAMPS menu position to viewport.
import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { usePlayer } from "../context/PlayerContext";
import { fetchPlaylists, addSongToPlaylist } from "../api/client";
import ArtworkImage from "./ArtworkImage";
import type { Song, Playlist } from "../types";

export default function SongCard({
  song,
  songs,
  index,
}: {
  song: Song;
  songs?: Song[];
  index?: number;
}) {
  const navigate = useNavigate();
  const { playSong, playSongs, addToQueue } = usePlayer();

  const [menuOpen, setMenuOpen] = useState(false);
  const [menuPos, setMenuPos] = useState({ x: 0, y: 0 });
  const [showPlaylists, setShowPlaylists] = useState(false);
  const [playlists, setPlaylists] = useState<Playlist[]>([]);
  const [loadingPlaylists, setLoadingPlaylists] = useState(false);
  const [addingTo, setAddingTo] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);

  // Human: Primary click plays either a single song or the surrounding list starting at `index` (library search uses the latter).
  // Agent: BRANCH songs+index vs playSong(song).
  function handleClick() {
    if (songs && index !== undefined) {
      playSongs(songs, index);
    } else {
      playSong(song);
    }
  }

  // Human: Right-click opens a fixed custom menu at cursor — browser default menu suppressed.
  // Agent: preventDefault; RESETS playlist submenu; STORES clientX/Y; SETS menuOpen true.
  function handleContextMenu(e: React.MouseEvent) {
    e.preventDefault();
    setShowPlaylists(false);
    setMenuPos({ x: e.clientX, y: e.clientY });
    setMenuOpen(true);
  }

  // Human: Dismiss the menu on outside mouse down or Escape — standard overlay pattern without a focus trap.
  // Agent: EFFECT [menuOpen]; DOCUMENT listeners mousedown+keydown; CLEANUP removes.
  useEffect(() => {
    if (!menuOpen) return;
    function onMouseDown(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setMenuOpen(false);
    }
    document.addEventListener("mousedown", onMouseDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onMouseDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [menuOpen]);

  function handleAddToQueue(e: React.MouseEvent) {
    e.stopPropagation();
    addToQueue(song);
    setMenuOpen(false);
  }

  // Human: Second-level picker loads playlists lazily only when user chooses “Add to playlist”.
  // Agent: stopPropagation; fetchPlaylists; SETS showPlaylists+loading flags.
  async function handleOpenPlaylists(e: React.MouseEvent) {
    e.stopPropagation();
    setShowPlaylists(true);
    setLoadingPlaylists(true);
    try {
      const data = await fetchPlaylists();
      setPlaylists(data);
    } finally {
      setLoadingPlaylists(false);
    }
  }

  async function handleAddToPlaylist(playlistId: string) {
    setAddingTo(playlistId);
    try {
      await addSongToPlaylist(playlistId, song.id);
      setMenuOpen(false);
      setShowPlaylists(false);
    } finally {
      setAddingTo(null);
    }
  }

  function handleViewDetails(e: React.MouseEvent) {
    e.stopPropagation();
    navigate(`/song/${song.id}`);
    setMenuOpen(false);
  }

  // Human: Keep floating menu from spilling past the viewport edge — dimensions differ for playlist subview.
  // Agent: useCallback READS menuPos+showPlaylists; RETURNS {left,top} clamped with guessed menu size.
  const menuStyle = useCallback(() => {
    const menuWidth = showPlaylists ? 224 : 192;
    const menuHeight = showPlaylists ? 280 : 160;
    const x = Math.min(menuPos.x, window.innerWidth - menuWidth - 8);
    const y = Math.min(menuPos.y, window.innerHeight - menuHeight - 8);
    return { left: x, top: y };
  }, [menuPos, showPlaylists]);

  return (
    <>
      {/* Human: Whole tile is the play target — hover reveals centered play affordance on artwork. */}
      {/* Agent: onClick handleClick; onContextMenu opens menu; cardRef currently unused beyond future hit tests */}
      <div
        ref={cardRef}
        role="button"
        tabIndex={0}
        aria-label={`Play ${song.title} by ${song.artist}`}
        onClick={handleClick}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            handleClick();
          }
        }}
        onContextMenu={handleContextMenu}
        className="group block w-full cursor-pointer space-y-3 rounded-xl p-2 text-left transition-all duration-200 hover:bg-surface-900/40 focus:outline-none focus:ring-2 focus:ring-aurora-500/50"
      >
        <div className="relative aspect-square bg-surface-900 border border-white/5 rounded-xl overflow-hidden shadow-sm">
          <ArtworkImage
            songId={song.id}
            title={song.title}
            artist={song.artist}
            className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
          />
          <div className="absolute inset-0 flex items-center justify-center bg-black/0 opacity-0 transition-colors group-hover:bg-black/30 group-hover:opacity-100 group-focus-within:opacity-100">
            <div className="w-12 h-12 rounded-full bg-aurora-600/90 backdrop-blur-sm flex items-center justify-center shadow-lg">
              <svg className="w-6 h-6 text-white ml-0.5" fill="currentColor" viewBox="0 0 24 24">
                <path d="M8 5v14l11-7z" />
              </svg>
            </div>
          </div>
        </div>
        <div className="px-1">
          <p className="text-sm font-medium text-white truncate group-hover:text-aurora-300 transition-colors">
            {song.title}
          </p>
          <p className="text-xs text-surface-400 truncate">{song.artist}</p>
        </div>
      </div>

      {/* Human: Portal-like fixed menu — positioned with computed style; contains either root actions or playlist picker. */}
      {/* Agent: CONDITIONAL menuOpen; ref menuRef for outside-click detection; style menuStyle() */}
      {menuOpen && (
        <div
          ref={menuRef}
          role="menu"
          className="fixed z-[100] bg-surface-900 border border-white/10 rounded-xl shadow-2xl overflow-hidden"
          style={menuStyle()}
        >
          {!showPlaylists ? (
            <div className="py-1 w-48" role="presentation">
              <button
                onClick={handleAddToQueue}
                className="w-full text-left px-4 py-2.5 text-sm text-surface-300 hover:text-white hover:bg-white/5 transition-colors flex items-center gap-3"
              >
                <svg className="w-4 h-4 text-surface-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                </svg>
                Add to Queue
              </button>
              <button
                onClick={handleOpenPlaylists}
                className="w-full text-left px-4 py-2.5 text-sm text-surface-300 hover:text-white hover:bg-white/5 transition-colors flex items-center gap-3"
              >
                <svg className="w-4 h-4 text-surface-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3" />
                </svg>
                Add to Playlist
              </button>
              <div className="mx-3 my-1 h-px bg-white/5" />
              <button
                onClick={handleViewDetails}
                className="w-full text-left px-4 py-2.5 text-sm text-surface-300 hover:text-white hover:bg-white/5 transition-colors flex items-center gap-3"
              >
                <svg className="w-4 h-4 text-surface-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                View Details
              </button>
            </div>
          ) : (
            <div className="w-56">
              <div className="px-4 py-3 border-b border-white/5 flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-white">Add to Playlist</p>
                  <p className="text-xs text-surface-500 truncate mt-0.5 max-w-[180px]">{song.title}</p>
                </div>
                <button
                  onClick={() => setShowPlaylists(false)}
                  className="text-surface-500 hover:text-white transition-colors"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
              <div className="max-h-60 overflow-auto py-1">
                {loadingPlaylists ? (
                  <div className="flex items-center justify-center py-4">
                    <div className="w-5 h-5 border-2 border-aurora-500 border-t-transparent rounded-full animate-spin" />
                  </div>
                ) : playlists.length === 0 ? (
                  <p className="text-xs text-surface-500 text-center py-4">No playlists yet</p>
                ) : (
                  playlists.map((p) => (
                    <button
                      key={p.id}
                      onClick={() => handleAddToPlaylist(p.id)}
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
      )}
    </>
  );
}

import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { fetchPlaylist } from "../api/client";
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

export default function PlaylistDetail() {
  const { id } = useParams<{ id: string }>();
  const { playSong } = usePlayer();
  const [playlist, setPlaylist] = useState<Playlist | null>(null);
  const [songs, setSongs] = useState<Song[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return;
    fetchPlaylist(id)
      .then((data) => {
        setPlaylist(data.playlist);
        setSongs(data.songs);
      })
      .finally(() => setLoading(false));
  }, [id]);

  const totalDuration = songs.reduce((sum, s) => sum + s.duration_seconds, 0);

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

  return (
    <DashboardLayout>
      <div className="space-y-8">
        {/* Hero */}
        <div className="flex flex-col sm:flex-row items-start gap-6">
          <div className="w-40 h-40 shrink-0 rounded-2xl bg-gradient-to-br from-aurora-600/80 to-aurora-800/80 flex items-center justify-center shadow-2xl shadow-aurora-500/10">
            <svg className="w-16 h-16 text-white/80" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.2} d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3" />
            </svg>
          </div>
          <div className="flex-1 min-w-0">
          <Link to="/playlists" className="text-sm text-aurora-400 hover:text-aurora-300 transition-colors font-medium">
            Playlists
          </Link>
          <h1 className="text-3xl font-bold tracking-tight mt-1">{playlist.name}</h1>
          {playlist.description && <p className="text-surface-400 mt-2 max-w-lg">{playlist.description}</p>}
          <p className="text-sm text-surface-500 mt-3">
            {songs.length} tracks · {formatDuration(totalDuration)} total
          </p>
          {songs.length > 0 && (
            <button
              onClick={() => playSong(songs[0])}
              className="mt-4 inline-flex items-center gap-2 px-5 py-2.5 bg-aurora-600 hover:bg-aurora-500 text-white text-sm font-medium rounded-xl transition-colors shadow-lg shadow-aurora-500/20"
            >
              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z" /></svg>
              Play All
            </button>
          )}
        </div>
        </div>

        {/* Songs list */}
        {songs.length === 0 ? (
          <div className="text-center py-16 bg-surface-900/30 border border-white/5 rounded-2xl">
            <p className="text-surface-400 font-medium">No songs in this playlist yet</p>
            <p className="text-surface-500 text-sm mt-1">Add songs from your library</p>
          </div>
        ) : (
          <div className="bg-surface-900/40 border border-white/5 rounded-2xl overflow-hidden">
            <div className="px-4 py-2 border-b border-white/5 text-xs text-surface-400 uppercase tracking-wider font-medium grid grid-cols-[3rem_1fr_1fr_4rem] gap-3 items-center hidden sm:grid">
              <span>#</span>
              <span>Title</span>
              <span className="hidden md:block">Album</span>
              <span className="text-right">Duration</span>
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
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}

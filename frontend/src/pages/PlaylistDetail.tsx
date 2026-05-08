import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { fetchPlaylist } from "../api/client";
import type { Song, Playlist } from "../types";

function formatDuration(seconds: number) {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export default function PlaylistDetail() {
  const { id } = useParams<{ id: string }>();
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
      <div className="flex items-center justify-center h-96">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-2 border-aurora-500 border-t-transparent rounded-full animate-spin" />
          <p className="text-surface-400 text-sm">Loading playlist...</p>
        </div>
      </div>
    );
  }

  if (!playlist) return <p className="text-surface-400 text-center py-20">Playlist not found.</p>;

  return (
    <div className="max-w-4xl mx-auto space-y-8">
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
        </div>
      </div>

      {songs.length === 0 ? (
        <div className="text-center py-16 bg-surface-900/30 border border-white/5 rounded-2xl">
          <p className="text-surface-400 font-medium">No songs in this playlist yet</p>
          <p className="text-surface-500 text-sm mt-1">Add songs from your library</p>
        </div>
      ) : (
        <div className="bg-surface-900/40 border border-white/5 rounded-2xl overflow-hidden">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-white/5 text-surface-400 text-xs uppercase tracking-wider">
                <th className="px-4 py-3 font-medium w-12">#</th>
                <th className="px-4 py-3 font-medium">Title</th>
                <th className="px-4 py-3 font-medium hidden sm:table-cell">Artist</th>
                <th className="px-4 py-3 font-medium hidden md:table-cell">Album</th>
                <th className="px-4 py-3 font-medium text-right">Duration</th>
              </tr>
            </thead>
            <tbody>
              {songs.map((song, i) => (
                <tr key={song.id} className="group hover:bg-white/5 transition-colors">
                  <td className="px-4 py-3 text-surface-500">
                    <span className="group-hover:hidden">{i + 1}</span>
                    <Link to={`/player/${song.id}`} className="hidden group-hover:block">
                      <svg className="w-4 h-4 text-aurora-400" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z" /></svg>
                    </Link>
                  </td>
                  <td className="px-4 py-3">
                    <Link to={`/player/${song.id}`} className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-lg bg-surface-800 overflow-hidden shrink-0 flex items-center justify-center">
                        <img
                          src={`http://localhost:3000/api/v1/songs/${song.id}/artwork`}
                          alt=""
                          className="w-full h-full object-cover"
                          loading="lazy"
                          onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                        />
                      </div>
                      <span className="font-medium text-white truncate">{song.title}</span>
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-surface-300 hidden sm:table-cell">{song.artist}</td>
                  <td className="px-4 py-3 text-surface-400 hidden md:table-cell">{song.album || "—"}</td>
                  <td className="px-4 py-3 text-surface-400 text-right font-mono text-xs">{formatDuration(song.duration_seconds)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

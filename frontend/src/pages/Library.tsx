import { useEffect, useState, useMemo } from "react";
import { Link } from "react-router-dom";
import { fetchSongs } from "../api/client";
import type { Song } from "../types";

function formatDuration(seconds: number) {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export default function Library() {
  const [songs, setSongs] = useState<Song[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");

  useEffect(() => {
    fetchSongs({ limit: 500 })
      .then(setSongs)
      .finally(() => setLoading(false));
  }, []);

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();
    if (!q) return songs;
    return songs.filter(
      (s) =>
        s.title.toLowerCase().includes(q) ||
        s.artist.toLowerCase().includes(q) ||
        (s.album && s.album.toLowerCase().includes(q)) ||
        (s.genre && s.genre.toLowerCase().includes(q))
    );
  }, [songs, search]);

  const artists = useMemo(() => {
    const set = new Set<string>();
    songs.forEach((s) => set.add(s.artist));
    return set.size;
  }, [songs]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-2 border-aurora-500 border-t-transparent rounded-full animate-spin" />
          <p className="text-surface-400 text-sm">Loading your library...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Library</h1>
          <p className="text-surface-400 text-sm mt-1">
            {songs.length.toLocaleString()} tracks · {artists.toLocaleString()} artists
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="relative">
            <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-surface-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search songs, artists, albums..."
              className="w-64 pl-9 pr-4 py-2 bg-surface-900/60 border border-white/5 rounded-xl text-sm text-white placeholder-surface-500 focus:outline-none focus:ring-2 focus:ring-aurora-500/30 focus:border-aurora-500/30 transition-all"
            />
          </div>
          <div className="flex items-center bg-surface-900/60 border border-white/5 rounded-lg p-0.5">
            <button
              onClick={() => setViewMode("grid")}
              className={`p-1.5 rounded-md transition-colors ${viewMode === "grid" ? "bg-white/10 text-white" : "text-surface-500 hover:text-surface-300"}`}
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" /></svg>
            </button>
            <button
              onClick={() => setViewMode("list")}
              className={`p-1.5 rounded-md transition-colors ${viewMode === "list" ? "bg-white/10 text-white" : "text-surface-500 hover:text-surface-300"}`}
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" /></svg>
            </button>
          </div>
        </div>
      </div>

      {viewMode === "grid" ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
          {filtered.map((song) => (
            <Link to={`/player/${song.id}`} key={song.id} className="group block">
              <div className="relative aspect-square rounded-xl overflow-hidden bg-surface-900 mb-3">
                <img
                  src={`http://localhost:3000/api/v1/songs/${song.id}/artwork`}
                  alt={song.title}
                  loading="lazy"
                  className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                  onError={(e) => {
                    (e.target as HTMLImageElement).style.display = "none";
                    (e.target as HTMLImageElement).parentElement!.classList.add("flex", "items-center", "justify-center");
                    const placeholder = document.createElement("div");
                    placeholder.className = "text-surface-600";
                    placeholder.innerHTML = `<svg class="w-10 h-10" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3" /></svg>`;
                    (e.target as HTMLImageElement).parentElement!.appendChild(placeholder);
                  }}
                />
                <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors duration-300 flex items-center justify-center opacity-0 group-hover:opacity-100">
                  <div className="w-12 h-12 rounded-full bg-aurora-600/90 backdrop-blur-sm flex items-center justify-center shadow-lg transform scale-75 group-hover:scale-100 transition-transform duration-300">
                    <svg className="w-5 h-5 text-white ml-0.5" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z" /></svg>
                  </div>
                </div>
              </div>
              <div className="space-y-0.5">
                <p className="text-sm font-medium text-white truncate group-hover:text-aurora-300 transition-colors">{song.title}</p>
                <p className="text-xs text-surface-400 truncate">{song.artist}</p>
              </div>
            </Link>
          ))}
        </div>
      ) : (
        <div className="bg-surface-900/40 border border-white/5 rounded-2xl overflow-hidden">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-white/5 text-surface-400 text-xs uppercase tracking-wider">
                <th className="px-4 py-3 font-medium">#</th>
                <th className="px-4 py-3 font-medium">Title</th>
                <th className="px-4 py-3 font-medium hidden sm:table-cell">Artist</th>
                <th className="px-4 py-3 font-medium hidden md:table-cell">Album</th>
                <th className="px-4 py-3 font-medium hidden lg:table-cell">Genre</th>
                <th className="px-4 py-3 font-medium text-right">Duration</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((song, i) => (
                <tr key={song.id} className="group hover:bg-white/5 transition-colors cursor-pointer">
                  <td className="px-4 py-3 text-surface-500 w-12">
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
                  <td className="px-4 py-3 text-surface-400 hidden lg:table-cell">{song.genre || "—"}</td>
                  <td className="px-4 py-3 text-surface-400 text-right font-mono text-xs">{formatDuration(song.duration_seconds)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {filtered.length === 0 && search && (
        <div className="text-center py-20">
          <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-surface-900 flex items-center justify-center">
            <svg className="w-8 h-8 text-surface-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
          </div>
          <p className="text-surface-400 font-medium">No results found</p>
          <p className="text-surface-500 text-sm mt-1">Try adjusting your search terms</p>
        </div>
      )}
    </div>
  );
}

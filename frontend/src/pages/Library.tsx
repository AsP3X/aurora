import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { fetchSongs } from "../api/client";
import type { Song } from "../types";

export default function Library() {
  const [songs, setSongs] = useState<Song[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  useEffect(() => {
    fetchSongs({ limit: 200 })
      .then(setSongs)
      .finally(() => setLoading(false));
  }, []);

  const filtered = songs.filter(
    (s) =>
      s.title.toLowerCase().includes(search.toLowerCase()) ||
      s.artist.toLowerCase().includes(search.toLowerCase()) ||
      (s.album && s.album.toLowerCase().includes(search.toLowerCase()))
  );

  if (loading) return <p>Loading library...</p>;

  return (
    <div className="library">
      <input
        type="text"
        placeholder="Search songs, artists, albums..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="search"
      />
      <div className="song-grid">
        {filtered.map((song) => (
          <Link to={`/player/${song.id}`} key={song.id} className="song-card">
            <div className="artwork">
              <img
                src={`http://localhost:3000/api/v1/songs/${song.id}/artwork`}
                alt={song.title}
                loading="lazy"
                onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
              />
            </div>
            <div className="info">
              <div className="title">{song.title}</div>
              <div className="artist">{song.artist}</div>
              {song.album && <div className="album">{song.album}</div>}
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}

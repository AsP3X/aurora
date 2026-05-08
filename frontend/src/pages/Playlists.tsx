import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { fetchPlaylists, createPlaylist } from "../api/client";
import type { Playlist } from "../types";

export default function Playlists() {
  const [playlists, setPlaylists] = useState<Playlist[]>([]);
  const [name, setName] = useState("");
  const [desc, setDesc] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchPlaylists()
      .then(setPlaylists)
      .finally(() => setLoading(false));
  }, []);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    const p = await createPlaylist(name, desc || undefined);
    setPlaylists([p, ...playlists]);
    setName("");
    setDesc("");
  }

  if (loading) return <p>Loading...</p>;

  return (
    <div className="playlists">
      <h2>Playlists</h2>
      <form onSubmit={handleCreate} className="create-form">
        <input
          type="text"
          placeholder="Playlist name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
        />
        <input
          type="text"
          placeholder="Description (optional)"
          value={desc}
          onChange={(e) => setDesc(e.target.value)}
        />
        <button type="submit">Create</button>
      </form>

      <div className="playlist-list">
        {playlists.map((p) => (
          <Link to={`/playlist/${p.id}`} key={p.id} className="playlist-card">
            <h3>{p.name}</h3>
            {p.description && <p>{p.description}</p>}
          </Link>
        ))}
      </div>
    </div>
  );
}

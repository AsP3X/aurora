import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { fetchPlaylist } from "../api/client";
import type { Song, Playlist } from "../types";

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

  if (loading) return <p>Loading playlist...</p>;
  if (!playlist) return <p>Playlist not found.</p>;

  return (
    <div className="playlist-detail">
      <Link to="/playlists">&larr; Back to playlists</Link>
      <h2>{playlist.name}</h2>
      {playlist.description && <p>{playlist.description}</p>}
      <div className="song-list">
        {songs.map((song) => (
          <Link to={`/player/${song.id}`} key={song.id} className="song-row">
            <span>{song.title}</span>
            <span>{song.artist}</span>
            <span>{formatDuration(song.duration_seconds)}</span>
          </Link>
        ))}
      </div>
    </div>
  );
}

function formatDuration(seconds: number) {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

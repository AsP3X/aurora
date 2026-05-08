import { useEffect, useRef, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { fetchSong, streamUrl, logHistory } from "../api/client";
import type { Song } from "../types";

export default function Player() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const audioRef = useRef<HTMLAudioElement>(null);
  const [song, setSong] = useState<Song | null>(null);
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);

  useEffect(() => {
    if (!id) return;
    fetchSong(id).then(setSong);
  }, [id]);

  function togglePlay() {
    const audio = audioRef.current;
    if (!audio) return;
    if (audio.paused) {
      audio.play();
      setPlaying(true);
    } else {
      audio.pause();
      setPlaying(false);
    }
  }

  function handleTimeUpdate() {
    const audio = audioRef.current;
    if (!audio) return;
    setProgress(audio.currentTime);
    setDuration(audio.duration || 0);
  }

  function handleSeek(e: React.ChangeEvent<HTMLInputElement>) {
    const audio = audioRef.current;
    if (!audio) return;
    audio.currentTime = Number(e.target.value);
    setProgress(audio.currentTime);
  }

  function handleEnded() {
    if (id) {
      logHistory(id, undefined, true).catch(() => {});
    }
    setPlaying(false);
  }

  function formatTime(t: number) {
    if (!isFinite(t)) return "0:00";
    const m = Math.floor(t / 60);
    const s = Math.floor(t % 60);
    return `${m}:${s.toString().padStart(2, "0")}`;
  }

  if (!song) return <p>Loading...</p>;

  return (
    <div className="player">
      <button className="back" onClick={() => navigate("/")}>&larr; Library</button>
      <div className="player-card">
        <div className="artwork-large">
          <img
            src={`http://localhost:3000/api/v1/songs/${song.id}/artwork`}
            alt={song.title}
            onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
          />
        </div>
        <div className="track-info">
          <h2>{song.title}</h2>
          <p>{song.artist}</p>
          {song.album && <p className="album">{song.album}</p>}
        </div>

        <div className="controls">
          <input
            type="range"
            min={0}
            max={duration || song.duration_seconds}
            value={progress}
            onChange={handleSeek}
            className="seek-bar"
          />
          <div className="time">
            <span>{formatTime(progress)}</span>
            <span>{formatTime(duration || song.duration_seconds)}</span>
          </div>
          <button className="play-btn" onClick={togglePlay}>
            {playing ? "⏸️ Pause" : "▶️ Play"}
          </button>
        </div>

        <audio
          ref={audioRef}
          src={streamUrl(song.id)}
          onTimeUpdate={handleTimeUpdate}
          onEnded={handleEnded}
          preload="metadata"
        />
      </div>
    </div>
  );
}

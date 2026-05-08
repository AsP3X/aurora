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
  const [volume, setVolume] = useState(1);
  const [loading, setLoading] = useState(true);
  const [buffered, setBuffered] = useState(0);

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    fetchSong(id)
      .then(setSong)
      .finally(() => setLoading(false));
  }, [id]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !id) return;
    audio.load();
    setProgress(0);
    setPlaying(false);
  }, [id]);

  function togglePlay() {
    const audio = audioRef.current;
    if (!audio) return;
    if (audio.paused) {
      audio.play().then(() => setPlaying(true)).catch(() => {});
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
    if (audio.buffered.length > 0) {
      setBuffered(audio.buffered.end(audio.buffered.length - 1));
    }
  }

  function handleSeek(e: React.ChangeEvent<HTMLInputElement>) {
    const audio = audioRef.current;
    if (!audio) return;
    audio.currentTime = Number(e.target.value);
    setProgress(audio.currentTime);
  }

  function handleVolume(e: React.ChangeEvent<HTMLInputElement>) {
    const v = Number(e.target.value);
    setVolume(v);
    if (audioRef.current) audioRef.current.volume = v;
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

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-2 border-aurora-500 border-t-transparent rounded-full animate-spin" />
          <p className="text-surface-400 text-sm">Loading track...</p>
        </div>
      </div>
    );
  }

  if (!song) return <p className="text-surface-400 text-center py-20">Song not found.</p>;

  const progressPercent = duration ? (progress / duration) * 100 : 0;
  const bufferedPercent = duration ? (buffered / duration) * 100 : 0;

  return (
    <div className="max-w-3xl mx-auto">
      <button
        onClick={() => navigate(-1)}
        className="flex items-center gap-2 text-sm text-surface-400 hover:text-white transition-colors mb-8 group"
      >
        <svg className="w-4 h-4 transition-transform group-hover:-translate-x-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
        Back
      </button>

      <div className="flex flex-col md:flex-row gap-8 md:gap-12 items-start">
        <div className="w-full md:w-80 shrink-0">
          <div className="relative aspect-square rounded-2xl overflow-hidden bg-surface-900 shadow-2xl shadow-black/40">
            <img
              src={`http://localhost:3000/api/v1/songs/${song.id}/artwork`}
              alt={song.title}
              className="w-full h-full object-cover"
              onError={(e) => {
                (e.target as HTMLImageElement).style.display = "none";
                (e.target as HTMLImageElement).parentElement!.classList.add("flex", "items-center", "justify-center");
              }}
            />
          </div>
        </div>

        <div className="flex-1 min-w-0 w-full">
          <div className="mb-8">
            <h1 className="text-2xl md:text-3xl font-bold tracking-tight truncate mb-1">{song.title}</h1>
            <p className="text-lg text-aurora-400 font-medium truncate">{song.artist}</p>
            {song.album && <p className="text-sm text-surface-400 mt-1">{song.album}</p>}
            <div className="flex items-center gap-3 mt-3 text-xs text-surface-500">
              {song.year && <span className="px-2 py-0.5 bg-surface-900 rounded-md">{song.year}</span>}
              {song.genre && <span className="px-2 py-0.5 bg-surface-900 rounded-md">{song.genre}</span>}
              <span className="px-2 py-0.5 bg-surface-900 rounded-md uppercase">{song.file_format}</span>
              {song.bitrate_kbps && <span className="px-2 py-0.5 bg-surface-900 rounded-md">{song.bitrate_kbps} kbps</span>}
            </div>
          </div>

          <div className="space-y-4">
            <div className="relative h-1.5 bg-surface-800 rounded-full overflow-hidden group">
              <div className="absolute inset-y-0 left-0 bg-surface-600 rounded-full" style={{ width: `${bufferedPercent}%` }} />
              <div className="absolute inset-y-0 left-0 bg-gradient-to-r from-aurora-500 to-aurora-400 rounded-full" style={{ width: `${progressPercent}%` }} />
              <input
                type="range"
                min={0}
                max={duration || song.duration_seconds}
                value={progress}
                onChange={handleSeek}
                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
              />
            </div>

            <div className="flex items-center justify-between text-xs text-surface-500 font-mono">
              <span>{formatTime(progress)}</span>
              <span>{formatTime(duration || song.duration_seconds)}</span>
            </div>

            <div className="flex items-center justify-center gap-6 pt-2">
              <button className="p-2 text-surface-400 hover:text-white transition-colors">
                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24"><path d="M11 18V6l-8.5 6 8.5 6zm.5-6l8.5 6V6l-8.5 6z" /></svg>
              </button>
              <button
                onClick={togglePlay}
                className="w-14 h-14 rounded-full bg-gradient-to-br from-aurora-500 to-aurora-700 hover:from-aurora-400 hover:to-aurora-600 flex items-center justify-center shadow-lg shadow-aurora-500/25 hover:shadow-aurora-500/40 transition-all hover:scale-105 active:scale-95"
              >
                {playing ? (
                  <svg className="w-6 h-6 text-white" fill="currentColor" viewBox="0 0 24 24"><path d="M6 4h4v16H6V4zm8 0h4v16h-4V4z" /></svg>
                ) : (
                  <svg className="w-6 h-6 text-white ml-1" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z" /></svg>
                )}
              </button>
              <button className="p-2 text-surface-400 hover:text-white transition-colors">
                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24"><path d="M4 18l8.5-6L4 6v12zm9-12v12l8.5-6L13 6z" /></svg>
              </button>
            </div>

            <div className="flex items-center gap-3 pt-4">
              <button onClick={() => setVolume(v => v === 0 ? 1 : 0)} className="text-surface-400 hover:text-white transition-colors">
                {volume === 0 ? (
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2" /></svg>
                ) : volume < 0.5 ? (
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" /></svg>
                ) : (
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" /></svg>
                )}
              </button>
              <div className="relative flex-1 h-1 bg-surface-800 rounded-full overflow-hidden">
                <div className="absolute inset-y-0 left-0 bg-surface-400 rounded-full" style={{ width: `${volume * 100}%` }} />
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.01}
                  value={volume}
                  onChange={handleVolume}
                  className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                />
              </div>
            </div>
          </div>
        </div>
      </div>

      <audio
        ref={audioRef}
        src={streamUrl(song.id)}
        onTimeUpdate={handleTimeUpdate}
        onEnded={handleEnded}
        preload="metadata"
      />
    </div>
  );
}

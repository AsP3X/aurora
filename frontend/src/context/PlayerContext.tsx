import { createContext, useContext, useState, useRef, useCallback } from "react";
import type { Song } from "../types";
import { fetchStreamUrl, fetchSong } from "../api/client";

interface PlayerState {
  currentSong: Song | null;
  isPlaying: boolean;
  progress: number;
  duration: number;
  volume: number;
  buffered: number;
  currentStreamUrl: string | null;
}

interface PlayerContextType extends PlayerState {
  playSong: (song: Song) => Promise<void>;
  togglePlay: () => void;
  pause: () => void;
  seek: (time: number) => void;
  setVolume: (vol: number) => void;
  toggleMute: () => void;
  setProgress: (p: number) => void;
  setDuration: (d: number) => void;
  setBuffered: (b: number) => void;
  audioRef: React.RefObject<HTMLAudioElement | null>;
}

const PlayerContext = createContext<PlayerContextType | null>(null);

export function PlayerProvider({ children }: { children: React.ReactNode }) {
  const [currentSong, setCurrentSong] = useState<Song | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolumeState] = useState(1);
  const [buffered, setBuffered] = useState(0);
  const [currentStreamUrl, setCurrentStreamUrl] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement>(null);

  const playSong = useCallback(async (song: Song) => {
    setCurrentSong(song);
    setIsPlaying(true);
    setProgress(0);
    setDuration(song.duration_seconds || 0);
    setBuffered(0);

    let url: string;
    try {
      const songData = await fetchSong(song.id);
      if (songData.hls_ready) {
        url = `${import.meta.env.VITE_API_URL || `${window.location.protocol}//${window.location.hostname}:3000/api/v1`}/songs/${song.id}/playlist`;
      } else {
        url = await fetchStreamUrl(song.id);
      }
    } catch {
      url = `${import.meta.env.VITE_API_URL || `${window.location.protocol}//${window.location.hostname}:3000/api/v1`}/songs/${song.id}/stream`;
    }
    setCurrentStreamUrl(url);
  }, []);

  const togglePlay = useCallback(() => {
    if (!currentSong) return;
    setIsPlaying((prev) => !prev);
  }, [currentSong]);

  const pause = useCallback(() => {
    setIsPlaying(false);
  }, []);

  const seek = useCallback((time: number) => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.currentTime = time;
    setProgress(time);
  }, []);

  const setVolume = useCallback((vol: number) => {
    const audio = audioRef.current;
    setVolumeState(vol);
    if (audio) audio.volume = vol;
  }, []);

  const [prevVolume, setPrevVolume] = useState(1);

  const toggleMute = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;
    if (volume === 0) {
      const restored = prevVolume || 1;
      setVolumeState(restored);
      audio.volume = restored;
    } else {
      setPrevVolume(volume);
      setVolumeState(0);
      audio.volume = 0;
    }
  }, [volume, prevVolume]);

  return (
    <PlayerContext.Provider
      value={{
        currentSong,
        isPlaying,
        progress,
        duration,
        volume,
        buffered,
        currentStreamUrl,
        playSong,
        togglePlay,
        pause,
        seek,
        setVolume,
        toggleMute,
        setProgress,
        setDuration,
        setBuffered,
        audioRef,
      }}
    >
      {children}
    </PlayerContext.Provider>
  );
}

export function usePlayer() {
  const ctx = useContext(PlayerContext);
  if (!ctx) throw new Error("usePlayer must be used within PlayerProvider");
  return ctx;
}

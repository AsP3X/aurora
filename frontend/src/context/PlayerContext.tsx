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
  queue: Song[];
  currentIndex: number;
  shuffle: boolean;
  queueOpen: boolean;
}

interface PlayerContextType extends PlayerState {
  playSong: (song: Song) => Promise<void>;
  playSongs: (songs: Song[], startIndex?: number) => Promise<void>;
  addToQueue: (song: Song) => void;
  removeFromQueue: (index: number) => void;
  clearQueue: () => void;
  playNext: () => void;
  playPrevious: () => void;
  togglePlay: () => void;
  pause: () => void;
  seek: (time: number) => void;
  setVolume: (vol: number) => void;
  toggleMute: () => void;
  setProgress: (p: number) => void;
  setDuration: (d: number) => void;
  setBuffered: (b: number) => void;
  toggleShuffle: () => void;
  setQueueOpen: (open: boolean) => void;
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
  const [queue, setQueue] = useState<Song[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [shuffle, setShuffle] = useState(false);
  const [queueOpen, setQueueOpen] = useState(false);
  const audioRef = useRef<HTMLAudioElement>(null);

  const loadStreamUrl = useCallback(async (song: Song) => {
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

  const playSong = useCallback(async (song: Song) => {
    setCurrentSong(song);
    setIsPlaying(true);
    setProgress(0);
    setDuration(song.duration_seconds || 0);
    setBuffered(0);
    setQueue([]);
    setCurrentIndex(0);
    await loadStreamUrl(song);
  }, [loadStreamUrl]);

  const playSongs = useCallback(async (songs: Song[], startIndex = 0) => {
    if (songs.length === 0) return;
    const idx = Math.max(0, Math.min(startIndex, songs.length - 1));
    const song = songs[idx];
    setQueue(songs);
    setCurrentIndex(idx);
    setCurrentSong(song);
    setIsPlaying(true);
    setProgress(0);
    setDuration(song.duration_seconds || 0);
    setBuffered(0);
    await loadStreamUrl(song);
  }, [loadStreamUrl]);

  const playNext = useCallback(() => {
    if (queue.length === 0) return;
    let nextIndex: number;
    if (shuffle) {
      if (queue.length === 1) {
        nextIndex = 0;
      } else {
        do {
          nextIndex = Math.floor(Math.random() * queue.length);
        } while (nextIndex === currentIndex);
      }
    } else {
      nextIndex = currentIndex + 1;
    }
    if (nextIndex >= queue.length) {
      nextIndex = 0;
    }
    const song = queue[nextIndex];
    setCurrentIndex(nextIndex);
    setCurrentSong(song);
    setIsPlaying(true);
    setProgress(0);
    setDuration(song.duration_seconds || 0);
    setBuffered(0);
    loadStreamUrl(song);
  }, [queue, currentIndex, shuffle, loadStreamUrl]);

  const playPrevious = useCallback(() => {
    if (queue.length === 0) return;
    let prevIndex = currentIndex - 1;
    if (prevIndex < 0) {
      prevIndex = queue.length - 1;
    }
    const song = queue[prevIndex];
    setCurrentIndex(prevIndex);
    setCurrentSong(song);
    setIsPlaying(true);
    setProgress(0);
    setDuration(song.duration_seconds || 0);
    setBuffered(0);
    loadStreamUrl(song);
  }, [queue, currentIndex, loadStreamUrl]);

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

  const toggleShuffle = useCallback(() => {
    setShuffle((prev) => !prev);
  }, []);

  const addToQueue = useCallback((song: Song) => {
    if (!currentSong) {
      setQueue([song]);
      setCurrentIndex(0);
      setCurrentSong(song);
      setIsPlaying(true);
      setProgress(0);
      setDuration(song.duration_seconds || 0);
      setBuffered(0);
      loadStreamUrl(song);
    } else {
      setQueue((prev) => [...prev, song]);
    }
  }, [currentSong, loadStreamUrl]);

  const removeFromQueue = useCallback((index: number) => {
    const newQueue = queue.filter((_, i) => i !== index);
    setQueue(newQueue);

    if (index < currentIndex) {
      setCurrentIndex(currentIndex - 1);
    } else if (index === currentIndex) {
      if (newQueue.length === 0) {
        setCurrentIndex(0);
        setCurrentSong(null);
        setIsPlaying(false);
        setCurrentStreamUrl(null);
        setProgress(0);
        setDuration(0);
        setBuffered(0);
      } else {
        const nextIndex = currentIndex >= newQueue.length ? 0 : currentIndex;
        setCurrentIndex(nextIndex);
        const song = newQueue[nextIndex];
        setCurrentSong(song);
        setProgress(0);
        setDuration(song.duration_seconds || 0);
        setBuffered(0);
        loadStreamUrl(song);
      }
    }
  }, [queue, currentIndex, loadStreamUrl]);

  const clearQueue = useCallback(() => {
    setQueue([]);
    setCurrentIndex(0);
    setCurrentSong(null);
    setIsPlaying(false);
    setCurrentStreamUrl(null);
    setProgress(0);
    setDuration(0);
    setBuffered(0);
  }, []);

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
        queue,
        currentIndex,
        shuffle,
        queueOpen,
        playSong,
        playSongs,
        addToQueue,
        removeFromQueue,
        clearQueue,
        playNext,
        playPrevious,
        togglePlay,
        pause,
        seek,
        setVolume,
        toggleMute,
        setProgress,
        setDuration,
        setBuffered,
        toggleShuffle,
        setQueueOpen,
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

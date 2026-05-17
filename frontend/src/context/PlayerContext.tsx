// Human: Global playback model: one shared audio element (wired in PlayerBar), queue, shuffle, and stream URLs (HLS vs progressive).
// Agent: PROVIDES currentSong, queue, shuffle, volume, progress mirrors; CALLS fetchSong/fetchStreamUrl; SETS playlist URL when hls_ready.
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

// Human: Provides global player state to the whole app tree — the visible `<audio>` element lives in PlayerBar.
// Agent: RENDERS Provider; HOLDS audioRef for PlayerBar; EXPOSES queue + playback actions.
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

  // Human: Ask the API whether this song is HLS-ready; use master playlist URL or signed stream URL, with a same-origin fallback.
  // Agent: CALLS fetchSong; IF hls_ready USES `/songs/:id/playlist` else fetchStreamUrl; CATCH falls back to `/stream`; READS VITE_API_URL.
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

  // Human: Replace the queue with a single track — typical “play this now” from library cards or song pages.
  // Agent: CLEARS queue; RESETS index 0; SETS playing+progress; AWAITS loadStreamUrl.
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

  // Human: Start playback from a list (playlist or search grid) while preserving full order as the new queue.
  // Agent: SETS queue+currentIndex; CLAMPs startIndex; RESETS progress; AWAITS loadStreamUrl for start track.
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

  // Human: Advance queue — sequential wrap, or random different index when shuffle is on (single-track queues just repeat).
  // Agent: READS queue, currentIndex, shuffle; COMPUTES nextIndex; CALLS loadStreamUrl; KEEPS isPlaying true.
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

  // Human: Move to prior queue item with wrap-around; shuffle does not affect “previous” (still linear step).
  // Agent: DECREMENTS currentIndex with wrap; CALLS loadStreamUrl.
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

  // Human: Flip play/pause for whatever is currently loaded — no-op if there is no current track.
  // Agent: REQUIRES currentSong; TOGGLES isPlaying boolean.
  const togglePlay = useCallback(() => {
    if (!currentSong) return;
    setIsPlaying((prev) => !prev);
  }, [currentSong]);

  // Human: Explicit pause used when we only need to stop transport without clearing the queue.
  // Agent: SETS isPlaying false.
  const pause = useCallback(() => {
    setIsPlaying(false);
  }, []);

  // Human: Seek the real `<audio>` element and mirror `progress` into context for UI sliders.
  // Agent: WRITES audio.currentTime; CALLS setProgress.
  const seek = useCallback((time: number) => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.currentTime = time;
    setProgress(time);
  }, []);

  // Human: Keep the audible volume and the React state in sync for sliders in PlayerBar / full player.
  // Agent: WRITES setVolumeState; IF audio exists SETS audio.volume.
  const setVolume = useCallback((vol: number) => {
    const audio = audioRef.current;
    setVolumeState(vol);
    if (audio) audio.volume = vol;
  }, []);

  const [prevVolume, setPrevVolume] = useState(1);

  // Human: Toggle between silent and the last non-zero volume (defaults restored volume to 1 if it was zero).
  // Agent: READS volume+prevVolume; WRITES audio.volume and volume state.
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

  // Human: Shuffle only affects `playNext` pick strategy — the underlying queue order stays unchanged.
  // Agent: TOGGLES shuffle boolean state.
  const toggleShuffle = useCallback(() => {
    setShuffle((prev) => !prev);
  }, []);

  // Human: If nothing is playing, start this song; otherwise append — the queue drawer reflects the same array.
  // Agent: BRANCH idle vs playing; MAY CALL loadStreamUrl; APPENDS to queue state.
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

  // Human: Removing the current track jumps to the next slot (or clears playback); earlier removals shift the current index.
  // Agent: FILTERS queue; ADJUSTS currentIndex; MAY loadStreamUrl or clear currentSong/stream.
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

  // Human: Stop playback and drop all queued items — used from the queue drawer “Clear” control.
  // Agent: RESETS queue, index, song, url, progress, duration, buffered, playing.
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

// Human: Typed accessor for player context — ensures hooks only run under PlayerProvider (App wraps routes).
// Agent: READS PlayerContext; THROWS if null.
export function usePlayer() {
  const ctx = useContext(PlayerContext);
  if (!ctx) throw new Error("usePlayer must be used within PlayerProvider");
  return ctx;
}

import { useEffect } from "react";
import { usePlayer } from "../context/PlayerContext";

// Human: Global transport shortcuts when focus is not in a text field — space play/pause, arrows seek/skip, Q queue.
// Agent: LISTENS window keydown; IGNORES INPUT/TEXTAREA/SELECT/contenteditable; REQUIRES currentSong; CALLS player actions.

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
  return target.isContentEditable;
}

export function usePlayerKeyboard() {
  const {
    currentSong,
    progress,
    duration,
    queueOpen,
    togglePlay,
    playNext,
    playPrevious,
    seek,
    setQueueOpen,
    toggleMute,
  } = usePlayer();

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (isTypingTarget(e.target)) return;
      if (!currentSong) return;

      switch (e.key) {
        case " ":
          e.preventDefault();
          togglePlay();
          break;
        case "ArrowLeft":
          e.preventDefault();
          if (e.shiftKey) {
            playPrevious();
          } else {
            seek(Math.max(0, progress - 5));
          }
          break;
        case "ArrowRight":
          e.preventDefault();
          if (e.shiftKey) {
            playNext();
          } else {
            const max = duration || currentSong.duration_seconds;
            seek(Math.min(max, progress + 5));
          }
          break;
        case "q":
        case "Q":
          e.preventDefault();
          setQueueOpen(!queueOpen);
          break;
        case "m":
        case "M":
          e.preventDefault();
          toggleMute();
          break;
        case "Escape":
          if (queueOpen) {
            e.preventDefault();
            setQueueOpen(false);
          }
          break;
        default:
          break;
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [
    currentSong,
    progress,
    duration,
    queueOpen,
    togglePlay,
    playNext,
    playPrevious,
    seek,
    setQueueOpen,
    toggleMute,
  ]);
}

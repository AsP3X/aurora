// Human: Slide-over queue editor — focus trap, Escape to close, keyboard-friendly row actions.
// Agent: READS queueOpen; useFocusTrap; RENDERS backdrop+drawer; CALLS playSongs, removeFromQueue, clearQueue.
import { useEffect, useId, useRef, type RefObject } from "react";
import { usePlayer } from "../context/PlayerContext";
import { useFocusTrap } from "../hooks/useFocusTrap";
import ArtworkImage from "./ArtworkImage";

// Human: Compact mm:ss helper for list duration cells in the drawer.
// Agent: PURE; FLOOR minutes and seconds.
function formatDuration(seconds: number) {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

type QueueDrawerProps = {
  /** Human: Button that opened the drawer — focus returns here on close. */
  /** Agent: OPTIONAL RefObject<HTMLButtonElement>; useFocusTrap restore uses this when set. */
  returnFocusRef?: RefObject<HTMLButtonElement | null>;
};

export default function QueueDrawer({ returnFocusRef }: QueueDrawerProps) {
  const {
    queue,
    currentIndex,
    currentSong,
    queueOpen,
    setQueueOpen,
    removeFromQueue,
    clearQueue,
    playSongs,
  } = usePlayer();

  const panelRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const previousFocusRef = useRef<HTMLElement | null>(null);

  useFocusTrap(queueOpen, panelRef);

  useEffect(() => {
    if (!queueOpen) return;
    previousFocusRef.current = document.activeElement as HTMLElement | null;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        setQueueOpen(false);
      }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      const target = returnFocusRef?.current ?? previousFocusRef.current;
      target?.focus?.();
    };
  }, [queueOpen, setQueueOpen, returnFocusRef]);

  if (!queueOpen) return null;

  return (
    <>
      <div
        className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50"
        role="presentation"
        aria-hidden
        onClick={() => setQueueOpen(false)}
      />

      <div
        ref={panelRef}
        id="playback-queue-drawer"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="fixed top-0 right-0 bottom-0 w-full max-w-md bg-surface-950 border-l border-white/10 z-50 flex flex-col shadow-2xl outline-none"
        tabIndex={-1}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/10">
          <div>
            <h2 id={titleId} className="text-lg font-semibold text-white">
              Queue
            </h2>
            <p className="text-xs text-surface-500">
              {queue.length} song{queue.length !== 1 ? "s" : ""}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {queue.length > 0 && (
              <button
                type="button"
                onClick={clearQueue}
                className="text-xs text-surface-400 hover:text-red-400 transition-colors px-3 py-1.5 rounded-lg hover:bg-white/5 focus:outline-none focus:ring-2 focus:ring-aurora-500/50"
                aria-label="Clear queue"
              >
                Clear
              </button>
            )}
            <button
              type="button"
              onClick={() => setQueueOpen(false)}
              className="w-8 h-8 flex items-center justify-center text-surface-400 hover:text-white hover:bg-white/5 rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-aurora-500/50"
              aria-label="Close queue"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto" role="list" aria-label="Queued tracks">
          {queue.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-surface-500 px-8">
              <svg className="w-12 h-12 mb-3 opacity-40" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5} aria-hidden>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3" />
              </svg>
              <p className="text-sm">Your queue is empty.</p>
              <p className="text-xs mt-1 opacity-60">Add songs from the library or a playlist.</p>
            </div>
          ) : (
            <div className="divide-y divide-white/5">
              {queue.map((song, i) => {
                const isCurrent = i === currentIndex;
                return (
                  <div
                    key={`${song.id}-${i}`}
                    role="listitem"
                    className={`flex items-center gap-3 px-5 py-3 transition-colors ${
                      isCurrent ? "bg-white/5" : "hover:bg-white/[0.02]"
                    }`}
                  >
                    <div className="w-6 text-center shrink-0" aria-hidden>
                      {isCurrent && currentSong ? (
                        <div className="flex items-end justify-center gap-0.5 h-4">
                          <span className="w-0.5 h-2 bg-aurora-400 rounded-full animate-[bounce_1s_infinite]" />
                          <span className="w-0.5 h-3 bg-aurora-400 rounded-full animate-[bounce_1.2s_infinite]" />
                          <span className="w-0.5 h-1.5 bg-aurora-400 rounded-full animate-[bounce_0.8s_infinite]" />
                        </div>
                      ) : (
                        <span className="text-xs text-surface-500">{i + 1}</span>
                      )}
                    </div>

                    <div className="w-10 h-10 rounded-lg bg-surface-800 overflow-hidden shrink-0" aria-hidden>
                      <ArtworkImage
                        songId={song.id}
                        title={song.title}
                        artist={song.artist}
                        className="w-full h-full object-cover"
                      />
                    </div>

                    <button
                      type="button"
                      onClick={() => playSongs(queue, i)}
                      className="flex-1 min-w-0 text-left focus:outline-none focus:ring-2 focus:ring-aurora-500/50 rounded-lg"
                      aria-label={`Play ${song.title} by ${song.artist}`}
                      aria-current={isCurrent ? "true" : undefined}
                    >
                      <p className={`text-sm font-medium truncate ${isCurrent ? "text-aurora-400" : "text-white"}`}>
                        {song.title}
                      </p>
                      <p className="text-xs text-surface-400 truncate">{song.artist}</p>
                    </button>

                    <span className="text-xs text-surface-500 shrink-0" aria-hidden>
                      {formatDuration(song.duration_seconds)}
                    </span>

                    <button
                      type="button"
                      onClick={() => removeFromQueue(i)}
                      className="w-7 h-7 flex items-center justify-center text-surface-500 hover:text-red-400 hover:bg-white/5 rounded-lg transition-colors shrink-0 focus:outline-none focus:ring-2 focus:ring-red-500/40"
                      aria-label={`Remove ${song.title} from queue`}
                    >
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </>
  );
}

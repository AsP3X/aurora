// Human: Queue list that slides up above the transport bar — toggled by the queue button, not dismissed by outside clicks.
// Agent: READS queueOpen; NO backdrop dismiss; aria-modal false; CALLS playSongs, removeFromQueue, clearQueue; CLOSE via toggle/Escape/X.
import { useEffect, useId, useRef, type RefObject } from "react";
import { usePlayer } from "../context/PlayerContext";
import ArtworkImage from "./ArtworkImage";

function formatDuration(seconds: number) {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

type QueueDrawerProps = {
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

  // Human: Escape and explicit close restore focus to the queue toggle; outside clicks do not close the panel.
  // Agent: LISTENS keydown Escape; CLEANUP focus returnFocusRef; NO overlay onClick dismiss.
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

  return (
    <>
      {/* Human: On desktop the sheet sits above the queue control and is narrower; mobile keeps full bar width. */}
      {/* Agent: MOBILE left-0 right-0 full width; lg+ left-auto right-0 w-[40rem] max-w-full anchored right. */}
      <div
        className={`absolute bottom-full left-0 right-0 z-50 mb-2 transition-[opacity,transform] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] lg:left-auto lg:right-0 lg:w-[40rem] lg:max-w-full ${
          queueOpen ? "pointer-events-auto translate-y-0 opacity-100" : "pointer-events-none translate-y-3 opacity-0"
        }`}
        aria-hidden={!queueOpen}
      >
        <div
          ref={panelRef}
          id="playback-queue-drawer"
          role="region"
          aria-labelledby={titleId}
          tabIndex={-1}
          className="glass-pill flex max-h-[min(50vh,22rem)] flex-col overflow-hidden outline-none shadow-2xl shadow-black/40"
        >
          <div className="relative flex items-center justify-between border-b border-white/10 px-4 py-3 sm:px-5">
            <div>
              <h2 id={titleId} className="text-sm font-semibold text-white">
                Queue
              </h2>
              <p className="text-[11px] text-surface-500">
                {queue.length} song{queue.length !== 1 ? "s" : ""}
              </p>
            </div>
            <div className="flex items-center gap-1.5">
              {queue.length > 0 && (
                <button
                  type="button"
                  onClick={clearQueue}
                  className="rounded-lg px-2.5 py-1 text-[11px] text-surface-400 transition-colors hover:bg-white/5 hover:text-red-400 focus:outline-none focus:ring-2 focus:ring-aurora-500/50"
                  aria-label="Clear queue"
                  tabIndex={queueOpen ? 0 : -1}
                >
                  Clear
                </button>
              )}
              <button
                type="button"
                onClick={() => setQueueOpen(false)}
                className="flex h-7 w-7 items-center justify-center rounded-lg text-surface-400 transition-colors hover:bg-white/5 hover:text-white focus:outline-none focus:ring-2 focus:ring-aurora-500/50"
                aria-label="Close queue"
                tabIndex={queueOpen ? 0 : -1}
              >
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          </div>

          <div className="relative min-h-0 flex-1 overflow-y-auto" role="list" aria-label="Queued tracks">
            {queue.length === 0 ? (
              <div className="flex flex-col items-center justify-center px-6 py-10 text-surface-500">
                <svg
                  className="mb-2 h-10 w-10 opacity-40"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={1.5}
                  aria-hidden
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3"
                  />
                </svg>
                <p className="text-sm">Your queue is empty.</p>
                <p className="mt-0.5 text-xs opacity-60">Add songs from the library or a playlist.</p>
              </div>
            ) : (
              <div className="divide-y divide-white/5">
                {queue.map((song, i) => {
                  const isCurrent = i === currentIndex;
                  return (
                    <div
                      key={`${song.id}-${i}`}
                      role="listitem"
                      className={`flex items-center gap-2.5 px-4 py-2.5 transition-colors sm:gap-3 sm:px-5 sm:py-3 ${
                        isCurrent ? "bg-white/5" : "hover:bg-white/[0.02]"
                      }`}
                    >
                      <div className="w-5 shrink-0 text-center" aria-hidden>
                        {isCurrent && currentSong ? (
                          <div className="flex h-3.5 items-end justify-center gap-0.5">
                            <span className="h-2 w-0.5 animate-[bounce_1s_infinite] rounded-full bg-aurora-400" />
                            <span className="h-3 w-0.5 animate-[bounce_1.2s_infinite] rounded-full bg-aurora-400" />
                            <span className="h-1.5 w-0.5 animate-[bounce_0.8s_infinite] rounded-full bg-aurora-400" />
                          </div>
                        ) : (
                          <span className="text-[11px] text-surface-500">{i + 1}</span>
                        )}
                      </div>

                      <div className="h-9 w-9 shrink-0 overflow-hidden rounded-lg bg-surface-800 sm:h-10 sm:w-10" aria-hidden>
                        <ArtworkImage
                          songId={song.id}
                          title={song.title}
                          artist={song.artist}
                          size="seeker"
                          className="h-full w-full object-cover"
                        />
                      </div>

                      <button
                        type="button"
                        onClick={() => playSongs(queue, i)}
                        className="min-w-0 flex-1 rounded-lg text-left focus:outline-none focus:ring-2 focus:ring-aurora-500/50"
                        aria-label={`Play ${song.title} by ${song.artist}`}
                        aria-current={isCurrent ? "true" : undefined}
                        tabIndex={queueOpen ? 0 : -1}
                      >
                        <p className={`truncate text-sm font-medium ${isCurrent ? "text-aurora-400" : "text-white"}`}>
                          {song.title}
                        </p>
                        <p className="truncate text-xs text-surface-400">{song.artist}</p>
                      </button>

                      <span className="shrink-0 text-[11px] text-surface-500" aria-hidden>
                        {formatDuration(song.duration_seconds)}
                      </span>

                      <button
                        type="button"
                        onClick={() => removeFromQueue(i)}
                        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-surface-500 transition-colors hover:bg-white/5 hover:text-red-400 focus:outline-none focus:ring-2 focus:ring-red-500/40"
                        aria-label={`Remove ${song.title} from queue`}
                        tabIndex={queueOpen ? 0 : -1}
                      >
                        <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden>
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
      </div>
    </>
  );
}

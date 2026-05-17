// Human: Slide-over queue editor — shows current track, reorder targets via `playSongs`, clear/remove controls.
// Agent: READS queueOpen; RENDERS backdrop+drawer; CALLS playSongs(queue,i), removeFromQueue, clearQueue.
import { usePlayer } from "../context/PlayerContext";
import ArtworkImage from "./ArtworkImage";

// Human: Compact mm:ss helper for list duration cells in the drawer.
// Agent: PURE; FLOOR minutes and seconds.
function formatDuration(seconds: number) {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export default function QueueDrawer() {
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

  // Human: PlayerBar toggles `queueOpen` — render nothing when closed to avoid trapping focus or hit targets.
  // Agent: EARLY RETURN when !queueOpen.
  if (!queueOpen) return null;

  return (
    <>
      {/* Human: Click-away closes the drawer — sits under the panel but above main content. */}
      {/* Agent: onClick setQueueOpen(false); z-50 backdrop */}
      <div
        className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50"
        onClick={() => setQueueOpen(false)}
      />

      {/* Human: Fixed right sheet listing queue rows; row click jumps playback via `playSongs`. */}
      {/* Agent: max-w-md panel; MAP queue; highlight currentIndex; remove button per row */}
      <div className="fixed top-0 right-0 bottom-0 w-full max-w-md bg-surface-950 border-l border-white/10 z-50 flex flex-col shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/10">
          <div>
            <h2 className="text-lg font-semibold text-white">Queue</h2>
            <p className="text-xs text-surface-500">
              {queue.length} song{queue.length !== 1 ? "s" : ""}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {queue.length > 0 && (
              <button
                onClick={clearQueue}
                className="text-xs text-surface-400 hover:text-red-400 transition-colors px-3 py-1.5 rounded-lg hover:bg-white/5"
              >
                Clear
              </button>
            )}
            <button
              onClick={() => setQueueOpen(false)}
              className="w-8 h-8 flex items-center justify-center text-surface-400 hover:text-white hover:bg-white/5 rounded-lg transition-colors"
              aria-label="Close queue"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto">
          {queue.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-surface-500 px-8">
              <svg className="w-12 h-12 mb-3 opacity-40" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
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
                    className={`flex items-center gap-3 px-5 py-3 transition-colors ${
                      isCurrent ? "bg-white/5" : "hover:bg-white/[0.02]"
                    }`}
                  >
                    {/* Index / Playing indicator */}
                    <div className="w-6 text-center shrink-0">
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

                    {/* Artwork */}
                    <div className="w-10 h-10 rounded-lg bg-surface-800 overflow-hidden shrink-0">
                      <ArtworkImage
                        songId={song.id}
                        title={song.title}
                        artist={song.artist}
                        className="w-full h-full object-cover"
                      />
                    </div>

                    {/* Info */}
                    <button
                      onClick={() => playSongs(queue, i)}
                      className="flex-1 min-w-0 text-left"
                    >
                      <p className={`text-sm font-medium truncate ${isCurrent ? "text-aurora-400" : "text-white"}`}>
                        {song.title}
                      </p>
                      <p className="text-xs text-surface-400 truncate">{song.artist}</p>
                    </button>

                    {/* Duration */}
                    <span className="text-xs text-surface-500 shrink-0">
                      {formatDuration(song.duration_seconds)}
                    </span>

                    {/* Remove */}
                    <button
                      onClick={() => removeFromQueue(i)}
                      className="w-7 h-7 flex items-center justify-center text-surface-500 hover:text-red-400 hover:bg-white/5 rounded-lg transition-colors shrink-0"
                      aria-label="Remove from queue"
                      title="Remove from queue"
                    >
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
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

// Human: Full-screen now-playing view — loads song by route id if needed and mirrors PlayerContext transport.
// Agent: fetchSong+playSong when id differs; SYNCs audio element time to context on visit; BOTTOM BAR controls queue/shuffle when queue length > 0.
import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { usePlayer } from "../context/PlayerContext";
import { fetchSong, fetchSongLyrics } from "../api/client";
import ArtworkImage from "../components/ArtworkImage";
import LyricsPanel from "../components/LyricsPanel";
import PlayerTransportPanel from "../components/PlayerTransportPanel";
import { readMediaDurationSeconds, resolveTrackDuration } from "../lib/playbackDuration";
import type { SongLyrics } from "../types";

export default function Player() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const {
    currentSong,
    isPlaying,
    progress,
    duration,
    volume,
    buffered,
    shuffle,
    queueOpen,
    togglePlay,
    playNext,
    playPrevious,
    seek,
    setVolume,
    toggleMute,
    toggleShuffle,
    playSong,
    setDuration,
    setBuffered,
    setProgress,
    setQueueOpen,
    audioRef,
  } = usePlayer();
  const [loading, setLoading] = useState(!currentSong || currentSong.id !== id);
  const [lyrics, setLyrics] = useState<SongLyrics | null>(null);
  const [lyricsPanelOpen, setLyricsPanelOpen] = useState(false);

  // Human: When opening `/player/:id` for a different track than what is loaded, fetch full metadata and start it via context.
  // Agent: EFFECT [id, currentSong, playSong]; CANCELS on id change; SETS loading around fetchSong.
  useEffect(() => {
    if (!id) return;
    if (currentSong?.id === id) {
      setLoading(false);
      return;
    }
    setLoading(true);
    let cancelled = false;
    fetchSong(id)
      .then((song) => {
        if (!cancelled) {
          playSong(song);
        }
      })
      .catch(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [id, currentSong, playSong]);

  // Human: If the global `<audio>` advanced while user was elsewhere, re-read element state when landing on this page.
  // Agent: EFFECT [currentSong]; READS audioRef currentTime/duration/buffered; WRITES context setters.
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !currentSong) return;
    setProgress(audio.currentTime);
    const fromMedia = readMediaDurationSeconds(audio);
    setDuration(
      fromMedia ?? resolveTrackDuration(0, currentSong.duration_seconds),
    );
    if (audio.buffered.length > 0) {
      setBuffered(audio.buffered.end(audio.buffered.length - 1));
    }
  }, [currentSong, audioRef, setProgress, setDuration, setBuffered]);

  // Human: Load synced lyrics when the playing track changes; 404 means no lyrics for this song.
  // Agent: EFFECT [currentSong?.id]; CALLS fetchSongLyrics; SETS lyrics null on 404.
  useEffect(() => {
    if (!currentSong) {
      setLyrics(null);
      return;
    }
    let cancelled = false;
    fetchSongLyrics(currentSong.id)
      .then((data) => {
        if (!cancelled) {
          setLyrics(data);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setLyrics(null);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [currentSong?.id]);

  // Human: New track should start in the classic centered view — lyrics panel stays closed until the user opts in.
  // Agent: EFFECT [currentSong?.id]; SETS lyricsPanelOpen false on song change.
  useEffect(() => {
    setLyricsPanelOpen(false);
  }, [currentSong?.id]);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[calc(100vh-4rem)] px-4">
        <div className="w-full max-w-md space-y-8">
          <div className="relative">
            <div className="aspect-square rounded-3xl bg-surface-800 animate-pulse" />
          </div>
          <div className="space-y-3 text-center">
            <div className="h-8 w-3/4 mx-auto bg-surface-800 animate-pulse rounded" />
            <div className="h-5 w-1/2 mx-auto bg-surface-800 animate-pulse rounded" />
          </div>
        </div>
      </div>
    );
  }

  if (!currentSong) return <p className="text-surface-400 text-center py-20">Song not found.</p>;

  const hasLyrics = Boolean(
    lyrics && lyrics.lines.some((line) => line.text.trim().length > 0),
  );
  const showLyricsLayout = hasLyrics && lyricsPanelOpen;

  return (
    <div className="flex flex-col min-h-[calc(100dvh-8rem)] sm:min-h-[calc(100dvh-7rem)] px-4 sm:px-6">
      {/* Human: Floating glass pill keeps the back affordance visible on busy artwork without a full chrome bar. */}
      {/* Agent: USES glass-pill; navigates -1; focus ring aurora. */}
      <div className="py-4">
        <button
          type="button"
          onClick={() => navigate(-1)}
          className="glass-pill inline-flex items-center gap-2 px-4 py-2.5 text-sm text-surface-300 hover:text-white transition-colors group focus:outline-none focus:ring-2 focus:ring-aurora-500/50"
        >
          <svg className="w-4 h-4 transition-transform group-hover:-translate-x-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          Back
        </button>
      </div>

      {/* Human: Centered now-playing by default; music icon animates one DOM tree left via CSS grid to show lyrics. */}
      {/* Agent: STATE lyricsPanelOpen; showLyricsLayout; player-stage--open|--closed; SINGLE artwork rounded-3xl aspect-square. */}
      <div className="relative flex-1 flex flex-col min-h-0 w-full max-w-6xl mx-auto pb-4 sm:pb-8">
        {hasLyrics && (
          <button
            type="button"
            onClick={() => setLyricsPanelOpen((open) => !open)}
            aria-label={lyricsPanelOpen ? "Hide lyrics" : "Show lyrics"}
            aria-expanded={lyricsPanelOpen}
            className={`absolute z-20 right-0 top-0 sm:top-1 flex h-11 w-11 items-center justify-center rounded-full border transition-all duration-300 focus:outline-none focus:ring-2 focus:ring-aurora-500/50 ${
              lyricsPanelOpen
                ? "border-aurora-500/50 bg-aurora-500/20 text-aurora-300 shadow-lg shadow-aurora-500/20"
                : "border-white/15 bg-white/5 text-surface-300 hover:border-white/25 hover:bg-white/10 hover:text-white backdrop-blur-xl"
            }`}
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3"
              />
            </svg>
          </button>
        )}

        <div
          className={`player-stage ${showLyricsLayout ? "player-stage--open" : "player-stage--closed"}`}
        >
          <div className="player-track-cell">
            <div
              className={`player-track-inner flex w-full flex-col ${
                showLyricsLayout
                  ? "items-stretch gap-4 sm:gap-5 md:items-center"
                  : "items-center gap-8"
              }`}
            >
              <div
                className={`flex w-full ${
                  showLyricsLayout
                    ? "flex-row items-center gap-4 sm:gap-5 md:flex-col md:items-center md:gap-5"
                    : "flex-col items-center gap-8 sm:gap-10"
                }`}
              >
                <div
                  className={`player-artwork-frame relative mx-auto shrink-0 ${
                    showLyricsLayout
                      ? "w-[7.5rem] sm:w-36 md:w-full md:max-w-[280px]"
                      : "w-full max-w-sm sm:max-w-md"
                  }`}
                >
                  <div
                    className={`pointer-events-none absolute opacity-70 blur-3xl rounded-[2rem] ${
                      showLyricsLayout ? "-inset-4 md:-inset-6" : "-inset-8"
                    }`}
                    style={{
                      background:
                        "radial-gradient(ellipse at 50% 45%, rgba(139,92,246,0.28) 0%, transparent 62%)",
                    }}
                  />
                  <div
                    className={`pointer-events-none absolute rounded-[2rem] ${
                      showLyricsLayout ? "-inset-4 opacity-70" : "-inset-4 opacity-90"
                    }`}
                    style={{
                      background:
                        "radial-gradient(ellipse at 50% 50%, rgba(139,92,246,0.15) 0%, transparent 70%)",
                    }}
                  />
                  <div className="relative aspect-square w-full overflow-hidden rounded-3xl bg-surface-900 shadow-2xl shadow-black/50 ring-1 ring-white/10">
                    <ArtworkImage
                      songId={currentSong.id}
                      title={currentSong.title}
                      artist={currentSong.artist}
                      size="detail"
                      className="h-full w-full object-cover"
                    />
                  </div>
                </div>

                <div
                  className={`player-meta-block min-w-0 flex-1 space-y-1 ${
                    showLyricsLayout
                      ? "mt-0 text-left md:mt-5 md:w-full md:flex-none md:text-center"
                      : "mt-0 w-full text-center"
                  }`}
                >
                  <h1
                    className={`font-bold tracking-tight text-white ${
                      showLyricsLayout
                        ? "line-clamp-2 text-lg sm:text-xl md:text-2xl"
                        : "truncate text-2xl sm:text-3xl"
                    }`}
                  >
                    {currentSong.title}
                  </h1>
                  <p
                    className={`truncate font-medium text-aurora-400 ${
                      showLyricsLayout ? "text-base sm:text-lg md:text-lg" : "text-lg sm:text-xl"
                    }`}
                  >
                    {currentSong.artist}
                  </p>
                  <p
                    className={`truncate text-surface-400 ${
                      showLyricsLayout ? "text-xs sm:text-sm md:text-sm" : "text-sm"
                    }`}
                  >
                    {currentSong.album && currentSong.year
                      ? `${currentSong.album} — ${currentSong.year}`
                      : currentSong.album || (currentSong.year ? String(currentSong.year) : "")}
                  </p>
                </div>
              </div>

              <div
                className={`player-chips-row flex w-full flex-wrap gap-2 overflow-hidden ${
                  showLyricsLayout
                    ? "max-h-24 justify-start opacity-100 md:justify-center"
                    : "max-h-40 justify-center"
                }`}
              >
                {(showLyricsLayout ? currentSong.genres.slice(0, 3) : currentSong.genres).map((genre) => (
                  <span
                    key={genre}
                    className={`rounded-full bg-white/5 font-medium text-surface-400 ${
                      showLyricsLayout ? "px-2 py-0.5 text-[10px] md:px-2.5 md:py-1 md:text-xs" : "px-2.5 py-1 text-xs"
                    }`}
                  >
                    {genre}
                  </span>
                ))}
                {showLyricsLayout && currentSong.genres.length > 3 && (
                  <span className="text-[10px] text-surface-500 md:text-xs">
                    +{currentSong.genres.length - 3}
                  </span>
                )}
                <span
                  className={`rounded-full bg-white/5 font-medium uppercase text-surface-400 ${
                    showLyricsLayout ? "px-2 py-0.5 text-[10px] md:px-2.5 md:py-1 md:text-xs" : "px-2.5 py-1 text-xs"
                  }`}
                >
                  {currentSong.file_format}
                </span>
                {!showLyricsLayout && currentSong.bitrate_kbps && (
                  <span className="rounded-full bg-white/5 px-2.5 py-1 text-xs font-medium text-surface-400">
                    {currentSong.bitrate_kbps} kbps
                  </span>
                )}
                {!showLyricsLayout && currentSong.studio && (
                  <span className="rounded-full bg-white/5 px-2.5 py-1 text-xs font-medium text-surface-400">
                    {currentSong.studio}
                  </span>
                )}
              </div>
            </div>
          </div>

          {hasLyrics && (
            <div className="player-lyrics-cell flex flex-col justify-center" aria-hidden={!showLyricsLayout}>
              <LyricsPanel
                lines={lyrics!.lines}
                currentTimeMs={Math.round(progress * 1000)}
                synced={lyrics!.synced}
                className="max-w-none mx-0 w-full"
              />
            </div>
          )}
        </div>

      </div>
      {/* Human: Bottom transport uses the same panel as dashboard PlayerBar for matching width, padding, and control scale. */}
      {/* Agent: CALLS PlayerTransportPanel; WRAPS max-w-6xl w-full; NO max-w-3xl constraint; artwork static (no link). */}
      <div className="sticky bottom-0 left-0 right-0 mt-auto pb-4 pt-2 w-full -mx-4 sm:-mx-6 px-4 sm:px-6">
        <div className="mx-auto w-full max-w-6xl">
          <PlayerTransportPanel
            song={currentSong}
            isPlaying={isPlaying}
            progress={progress}
            duration={duration}
            volume={volume}
            buffered={buffered}
            shuffle={shuffle}
            queueOpen={queueOpen}
            onTogglePlay={togglePlay}
            onPlayPrevious={playPrevious}
            onPlayNext={playNext}
            onSeek={seek}
            onVolumeChange={setVolume}
            onToggleMute={toggleMute}
            onToggleShuffle={toggleShuffle}
            onToggleQueue={() => setQueueOpen(!queueOpen)}
            keyboardHintsId="player-page-keyboard-hints"
          />
        </div>
      </div>
    </div>
  );
}
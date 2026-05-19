// Human: Full-screen now-playing view — loads song by route id if needed and mirrors PlayerContext transport.
// Agent: fetchSong+playSong when id differs; SYNCs audio element time to context on visit; BOTTOM BAR controls queue/shuffle when queue length > 0.
import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { usePlayer } from "../context/PlayerContext";
import { fetchSong, fetchSongLyrics } from "../api/client";
import ArtworkImage from "../components/ArtworkImage";
import LyricsPanel, {
  LyricsViewModeToggle,
  type LyricsViewMode,
} from "../components/LyricsPanel";
import PlayerTransportPanel from "../components/PlayerTransportPanel";
import { readMediaDurationSeconds, resolveTrackDuration } from "../lib/playbackDuration";
import type { Song, SongLyrics } from "../types";

// Human: Shared lyrics toggle affordance — used in the mobile top bar and the desktop floating control.
// Agent: PURE UI; CALLS onToggle; aria-expanded from lyricsPanelOpen; STYLES active vs idle border/background.
function LyricsToggleButton({
  lyricsPanelOpen,
  onToggle,
  className = "",
}: {
  lyricsPanelOpen: boolean;
  onToggle: () => void;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-label={lyricsPanelOpen ? "Hide lyrics" : "Show lyrics"}
      aria-expanded={lyricsPanelOpen}
      className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full border transition-all duration-300 focus:outline-none focus:ring-2 focus:ring-aurora-500/50 ${
        lyricsPanelOpen
          ? "border-aurora-500/50 bg-aurora-500/20 text-aurora-300 shadow-lg shadow-aurora-500/20"
          : "border-white/15 bg-white/5 text-surface-300 hover:border-white/25 hover:bg-white/10 hover:text-white backdrop-blur-xl"
      } ${className}`}
    >
      <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3"
        />
      </svg>
    </button>
  );
}

// Human: Genre/format chips under the title on mobile lyrics view, or below artwork when lyrics are closed.
// Agent: PURE; compact slices genres to 3 when showLyricsLayout; HIDES bitrate/studio when lyrics open.
function PlayerGenreChips({
  song,
  showLyricsLayout,
  className = "",
}: {
  song: Song;
  showLyricsLayout: boolean;
  className?: string;
}) {
  const genres = showLyricsLayout ? song.genres.slice(0, 3) : song.genres;

  return (
    <div
      className={`player-chips-row flex w-full gap-2 overflow-hidden ${
        showLyricsLayout
          ? "max-md:flex-nowrap max-md:overflow-x-auto max-md:justify-start max-md:pb-0 max-md:[scrollbar-width:none] max-h-16 md:flex-wrap md:justify-center md:max-h-24"
          : "flex-wrap max-h-40 justify-center"
      } ${className}`}
    >
      {genres.map((genre) => (
        <span
          key={genre}
          className={`shrink-0 rounded-full bg-white/5 font-medium text-surface-400 ${
            showLyricsLayout
              ? "px-2 py-0.5 text-[10px] md:px-2.5 md:py-1 md:text-xs"
              : "px-2.5 py-1 text-xs"
          }`}
        >
          {genre}
        </span>
      ))}
      {showLyricsLayout && song.genres.length > 3 && (
        <span className="shrink-0 text-[10px] text-surface-500 md:text-xs">
          +{song.genres.length - 3}
        </span>
      )}
      <span
        className={`shrink-0 rounded-full bg-white/5 font-medium uppercase text-surface-400 ${
          showLyricsLayout ? "px-2 py-0.5 text-[10px] md:px-2.5 md:py-1 md:text-xs" : "px-2.5 py-1 text-xs"
        }`}
      >
        {song.file_format}
      </span>
      {!showLyricsLayout && song.bitrate_kbps && (
        <span className="shrink-0 rounded-full bg-white/5 px-2.5 py-1 text-xs font-medium text-surface-400">
          {song.bitrate_kbps} kbps
        </span>
      )}
      {!showLyricsLayout && song.studio && (
        <span className="shrink-0 rounded-full bg-white/5 px-2.5 py-1 text-xs font-medium text-surface-400">
          {song.studio}
        </span>
      )}
    </div>
  );
}

// Human: Top-bar cluster — show/hide lyrics always; layout toggle only while lyrics panel is open.
// Agent: RENDERS LyricsViewModeToggle iff lyricsPanelOpen; ALWAYS LyricsToggleButton.
function PlayerLyricsTopControls({
  lyricsPanelOpen,
  lyricsViewMode,
  onToggleLyrics,
  onLyricsViewModeChange,
}: {
  lyricsPanelOpen: boolean;
  lyricsViewMode: LyricsViewMode;
  onToggleLyrics: () => void;
  onLyricsViewModeChange: (mode: LyricsViewMode) => void;
}) {
  return (
    <div className="flex shrink-0 items-center gap-2">
      {lyricsPanelOpen && (
        <LyricsViewModeToggle mode={lyricsViewMode} onModeChange={onLyricsViewModeChange} />
      )}
      <LyricsToggleButton lyricsPanelOpen={lyricsPanelOpen} onToggle={onToggleLyrics} />
    </div>
  );
}

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
  // Human: Set when fetchSong/playSong fails so we can exit the skeleton and show “not found”.
  // Agent: STATE boolean; RESET on id change; SET true in load catch.
  const [loadFailed, setLoadFailed] = useState(false);
  const [lyrics, setLyrics] = useState<SongLyrics | null>(null);
  const [lyricsPanelOpen, setLyricsPanelOpen] = useState(false);
  // Human: Compact 3-line karaoke vs full scroll — remembered for the browser session.
  // Agent: STATE LyricsViewMode; READS sessionStorage aurora:lyrics-view-mode on mount; WRITES on change.
  const [lyricsViewMode, setLyricsViewMode] = useState<LyricsViewMode>(() => {
    try {
      const stored = sessionStorage.getItem("aurora:lyrics-view-mode");
      return stored === "scroll" ? "scroll" : "carousel";
    } catch {
      return "carousel";
    }
  });

  // Human: Skeleton while the URL id and PlayerContext track are out of sync (derived — no loading state flicker).
  // Agent: BOOL id && !loadFailed && currentSong?.id !== id; FALSE when already playing this id or fetch failed.
  const loading = Boolean(id && !loadFailed && currentSong?.id !== id);

  // Human: Clear fetch-failed flag when navigating to another song route.
  // Agent: EFFECT [id]; SETS loadFailed false.
  useEffect(() => {
    setLoadFailed(false);
  }, [id]);

  // Human: When opening `/player/:id`, fetch metadata and start playback unless context already has that exact track.
  // Agent: EFFECT [id, playSong, currentSong?.id]; SKIPS fetch when match; AWAITS playSong; SETS loadFailed on catch.
  useEffect(() => {
    if (!id) return;
    if (currentSong?.id === id) return;

    let cancelled = false;

    const load = async () => {
      try {
        const song = await fetchSong(id);
        if (cancelled) return;
        await playSong(song);
      } catch {
        if (!cancelled) setLoadFailed(true);
      }
    };

    void load();

    return () => {
      cancelled = true;
    };
  }, [id, playSong, currentSong?.id]);

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
      <div className="flex flex-col items-center justify-center min-h-dvh px-4 pt-[max(1rem,env(safe-area-inset-top))] pb-[max(1rem,env(safe-area-inset-bottom))]">
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

  if (loadFailed || !currentSong) {
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center gap-4 px-4 text-center">
        <p className="text-lg text-white">Could not load this track</p>
        <p className="max-w-sm text-sm text-surface-400">
          The song may have been removed or you may not have permission to play it.
        </p>
        <div className="flex gap-3">
          <button
            type="button"
            onClick={() => navigate(-1)}
            className="rounded-lg border border-white/10 px-4 py-2 text-sm text-surface-300 hover:bg-white/5"
          >
            Go back
          </button>
          {id && (
            <button
              type="button"
              onClick={() => {
                setLoadFailed(false);
                void fetchSong(id).then(playSong).catch(() => setLoadFailed(true));
              }}
              className="rounded-lg bg-aurora-600 px-4 py-2 text-sm font-medium text-white hover:bg-aurora-500"
            >
              Retry
            </button>
          )}
        </div>
      </div>
    );
  }

  const hasLyrics = Boolean(
    lyrics && lyrics.lines.some((line) => line.text.trim().length > 0),
  );
  const showLyricsLayout = hasLyrics && lyricsPanelOpen;
  const toggleLyrics = () => setLyricsPanelOpen((open) => !open);

  // Human: Persist lyrics layout choice so the next track opens the same way.
  // Agent: CALLS sessionStorage.setItem aurora:lyrics-view-mode when lyricsViewMode changes.
  function handleLyricsViewModeChange(mode: LyricsViewMode) {
    setLyricsViewMode(mode);
    try {
      sessionStorage.setItem("aurora:lyrics-view-mode", mode);
    } catch {
      // ignore private mode / quota errors
    }
  }

  // Human: On phones with lyrics open, lock page scroll so only the lyrics list moves under a sticky header.
  // Agent: BOOL mobileLyricsChrome; DRIVES h-dvh overflow-hidden + player-mobile-lyrics-chrome sticky block.
  const mobileLyricsChrome = showLyricsLayout;
  // Human: Carousel fills the stage on small screens; scroll mode uses a capped box instead of full viewport height.
  // Agent: BOOL lyricsScrollMode; INVERTS flex-1 / h-dvh fill rules for scroll vs carousel.
  const lyricsScrollMode = showLyricsLayout && lyricsViewMode === "scroll";

  return (
    <div
      className={`flex flex-col min-h-dvh max-md:px-0 md:min-h-[calc(100dvh-7rem)] md:px-6 ${
        mobileLyricsChrome && !lyricsScrollMode ? "max-md:h-dvh max-md:overflow-hidden" : ""
      }`}
    >
      {/* Human: Mobile top chrome — sticky nav row + genre chips when lyrics are open. */}
      {/* Agent: CLASS player-mobile-lyrics-chrome; CONTAINS back/title/controls + PlayerGenreChips. */}
      <div
        className={`max-md:flex md:hidden flex-col shrink-0 ${
          mobileLyricsChrome ? "player-mobile-lyrics-chrome" : ""
        }`}
      >
        <div className="flex items-center gap-2 px-4 pt-[max(0.75rem,env(safe-area-inset-top))] pb-2">
        <button
          type="button"
          onClick={() => navigate(-1)}
          aria-label="Go back"
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-surface-300 hover:text-white hover:bg-white/5 transition-colors focus:outline-none focus:ring-2 focus:ring-aurora-500/50"
        >
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
        </button>

        {showLyricsLayout && (
          <div className="min-w-0 flex-1 px-1">
            <p className="truncate text-base font-semibold text-white">{currentSong.title}</p>
            <p className="truncate text-sm text-aurora-400">{currentSong.artist}</p>
          </div>
        )}

        {!showLyricsLayout && <div className="flex-1" aria-hidden />}

        {hasLyrics && (
          <PlayerLyricsTopControls
            lyricsPanelOpen={lyricsPanelOpen}
            lyricsViewMode={lyricsViewMode}
            onToggleLyrics={toggleLyrics}
            onLyricsViewModeChange={handleLyricsViewModeChange}
          />
        )}
        </div>

        {mobileLyricsChrome && (
          <PlayerGenreChips
            song={currentSong}
            showLyricsLayout={showLyricsLayout}
            className="px-4 pb-2.5"
          />
        )}
      </div>

      {/* Human: Desktop top row — back on the left, lyrics + mode toggle on the right (not clipped by stage overflow). */}
      {/* Agent: hidden md:flex justify-between; PlayerLyricsTopControls when hasLyrics; REPLACES absolute stage controls. */}
      <div className="hidden md:flex items-center justify-between gap-4 py-4 px-4 sm:px-0">
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
        {hasLyrics && (
          <PlayerLyricsTopControls
            lyricsPanelOpen={lyricsPanelOpen}
            lyricsViewMode={lyricsViewMode}
            onToggleLyrics={toggleLyrics}
            onLyricsViewModeChange={handleLyricsViewModeChange}
          />
        )}
      </div>

      {/* Human: Centered now-playing; lyrics grid lives below the desktop/mobile top bars. */}
      {/* Agent: overflow-hidden only max-md lyrics chrome or md scroll; NO absolute lyrics controls. */}
      <div
        className={`relative flex flex-1 flex-col min-h-0 w-full max-w-6xl mx-auto px-4 max-md:px-4 pb-2 sm:pb-8 md:pb-4 ${
          mobileLyricsChrome && !lyricsScrollMode ? "max-md:min-h-0 max-md:overflow-hidden" : ""
        } ${showLyricsLayout ? "md:min-h-0 md:flex-1 md:overflow-hidden" : ""}`}
      >
        <div
          className={`player-stage ${showLyricsLayout ? "player-stage--open" : "player-stage--closed"} ${
            mobileLyricsChrome ? "player-stage--mobile-lyrics" : ""
          } ${
            showLyricsLayout && lyricsViewMode === "scroll" ? "player-stage--lyrics-scroll" : ""
          }`}
        >
          <div className={`player-track-cell ${mobileLyricsChrome ? "max-md:hidden" : ""}`}>
            <div
              className={`player-track-inner flex w-full flex-col ${
                showLyricsLayout
                  ? "max-md:gap-3 md:gap-4 sm:gap-5 md:items-center"
                  : "items-center gap-6 max-md:gap-5 sm:gap-8"
              }`}
            >
              <div
                className={`flex w-full ${
                  showLyricsLayout
                    ? "max-md:hidden md:flex-col md:items-center md:gap-5"
                    : "flex-col items-center gap-6 max-md:gap-5 sm:gap-10"
                }`}
              >
                <div
                  className={`player-artwork-frame relative shrink-0 ${
                    showLyricsLayout
                      ? "max-md:hidden md:mx-auto w-[7.5rem] sm:w-36 md:w-full md:max-w-[280px]"
                      : "mx-auto w-full max-w-[min(85vw,20rem)] sm:max-w-md"
                  }`}
                >
                  <div
                    className={`pointer-events-none absolute opacity-70 blur-3xl rounded-[2rem] ${
                      showLyricsLayout ? "max-md:-inset-2 md:-inset-6" : "-inset-8"
                    }`}
                    style={{
                      background:
                        "radial-gradient(ellipse at 50% 45%, rgba(139,92,246,0.28) 0%, transparent 62%)",
                    }}
                  />
                  <div
                    className={`pointer-events-none absolute rounded-[2rem] ${
                      showLyricsLayout ? "max-md:-inset-2 max-md:opacity-50 md:-inset-4 md:opacity-70" : "-inset-4 opacity-90"
                    }`}
                    style={{
                      background:
                        "radial-gradient(ellipse at 50% 50%, rgba(139,92,246,0.15) 0%, transparent 70%)",
                    }}
                  />
                  <div
                    className={`relative aspect-square w-full overflow-hidden bg-surface-900 shadow-2xl shadow-black/50 ring-1 ring-white/10 ${
                      showLyricsLayout ? "max-md:rounded-xl md:rounded-3xl" : "rounded-3xl"
                    }`}
                  >
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
                  className={`player-meta-block min-w-0 flex-1 space-y-0.5 ${
                    showLyricsLayout
                      ? "max-md:hidden mt-0 md:mt-5 md:w-full md:flex-none md:text-center"
                      : "mt-0 w-full text-center"
                  }`}
                >
                  <h1
                    className={`font-bold tracking-tight text-white ${
                      showLyricsLayout
                        ? "max-md:line-clamp-2 max-md:text-base md:line-clamp-2 md:text-2xl sm:text-xl"
                        : "text-xl max-md:px-2 sm:text-3xl truncate max-w-full"
                    }`}
                  >
                    {currentSong.title}
                  </h1>
                  <p
                    className={`truncate font-medium text-aurora-400 ${
                      showLyricsLayout
                        ? "max-md:text-sm md:text-lg sm:text-lg"
                        : "text-base sm:text-xl"
                    }`}
                  >
                    {currentSong.artist}
                  </p>
                  <p
                    className={`truncate text-surface-400 ${
                      showLyricsLayout
                        ? "max-md:hidden md:block md:text-sm text-xs sm:text-sm"
                        : "text-sm"
                    }`}
                  >
                    {currentSong.album && currentSong.year
                      ? `${currentSong.album} — ${currentSong.year}`
                      : currentSong.album || (currentSong.year ? String(currentSong.year) : "")}
                  </p>
                </div>
              </div>

              <PlayerGenreChips
                song={currentSong}
                showLyricsLayout={showLyricsLayout}
                className={showLyricsLayout ? "max-md:hidden" : ""}
              />
            </div>
          </div>

          {/* Human: Mount lyrics column only when open — hidden full-text lyrics were collapsing the closed grid on reload. */}
          {/* Agent: RENDER lyrics cell iff showLyricsLayout; AVOIDS LyricsPanel in 0fr column when panel closed. */}
          {hasLyrics && showLyricsLayout && (
            <div
              className={`player-lyrics-cell flex flex-col min-h-0 ${
                lyricsScrollMode
                  ? "player-lyrics-cell--scroll max-md:flex-none justify-center items-center max-md:justify-start max-md:items-stretch"
                  : "max-md:min-h-0 md:min-h-0 max-md:flex-1 justify-center items-center"
              }`}
            >
              <LyricsPanel
                lines={lyrics!.lines}
                currentTimeMs={Math.round(progress * 1000)}
                synced={lyrics!.synced}
                mode={lyricsViewMode}
                className={
                  lyricsScrollMode
                    ? "max-w-none mx-0 w-full"
                    : "max-w-none mx-0 w-full max-md:max-w-lg max-md:mx-auto"
                }
              />
            </div>
          )}
        </div>
      </div>

      {/* Human: Bottom transport uses the same panel as dashboard PlayerBar for matching width, padding, and control scale. */}
      {/* Agent: CALLS PlayerTransportPanel; WRAPS max-w-6xl w-full; safe-area bottom on phones. */}
      <div className="sticky bottom-0 left-0 right-0 mt-auto w-full shrink-0 px-4 pt-2 pb-[max(1rem,env(safe-area-inset-bottom))] md:-mx-6 md:px-6">
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

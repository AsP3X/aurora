// Human: Drives the DOM `<audio>` element, wires HLS where needed, and syncs time/volume with PlayerContext.
// Agent: READS currentStreamUrl; USES hls.js when URL ends with `/playlist`; CALLS logHistory/updateHistory; RENDERS QueueDrawer + hidden audio.
import { useCallback, useEffect, useRef } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import Hls from "hls.js";
import { usePlayer } from "../context/PlayerContext";
import { logHistory, updateHistory } from "../api/client";
import { clampProgressToTrack, readMediaDurationSeconds } from "../lib/playbackDuration";
import PlayerTransportPanel from "./PlayerTransportPanel";
import QueueDrawer from "./QueueDrawer";

export default function PlayerBar() {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  // Human: Library layout (`DashboardLayout`) already offsets content — align floating bar with sidebar gutter on md+.
  // Agent: READS pathname; SETS isDashboard and isPlayerPage for positioning and visibility rules.
  const isDashboard = pathname === "/" || pathname === "/playlists" || pathname.startsWith("/playlist/");
  const isPlayerPage = pathname.startsWith("/player/");
  const {
    currentSong,
    isPlaying,
    progress,
    duration,
    volume,
    buffered,
    currentStreamUrl,
    queue,
    shuffle,
    togglePlay,
    playNext,
    playPrevious,
    seek,
    setVolume,
    toggleMute,
    setProgress,
    setDuration,
    setBuffered,
    toggleShuffle,
    queueOpen,
    setQueueOpen,
    audioRef,
  } = usePlayer();

  const prevStreamUrl = useRef<string | null>(null);
  const queueButtonRef = useRef<HTMLButtonElement>(null);
  const lastLoggedStart = useRef<string | null>(null);
  const historySessionId = useRef<string | null>(null);
  const listenAccumulator = useRef(0);
  const lastTimeUpdate = useRef<{ time: number; ts: number } | null>(null);

  // Human: When switching tracks or stream URLs, flush partial listen time to the server (best-effort).
  // Agent: CLEANUP on effect; READS historySessionId+listenAccumulator; CALLS updateHistory.
  useEffect(() => {
    return () => {
      if (historySessionId.current) {
        const duration = Math.round(listenAccumulator.current);
        updateHistory(historySessionId.current, duration, false).catch(() => {});
      }
      historySessionId.current = null;
      listenAccumulator.current = 0;
      lastTimeUpdate.current = null;
    };
  }, [currentSong?.id, currentStreamUrl]);

  // Human: Start a “play session” row server-side when a new song actually begins loading.
  // Agent: WHEN song id changes vs lastLoggedStart; CALLS logHistory; STORES session id in ref.
  useEffect(() => {
    if (currentSong && currentStreamUrl && currentSong.id !== lastLoggedStart.current) {
      logHistory(currentSong.id, undefined, false)
        .then((res) => { historySessionId.current = res.id; })
        .catch(() => {});
      lastLoggedStart.current = currentSong.id;
      listenAccumulator.current = 0;
      lastTimeUpdate.current = null;
    }
  }, [currentSong, currentStreamUrl]);

  // Human: Pause should not accrue listen time — drop the last timing anchor when transport stops.
  // Agent: CLEARS lastTimeUpdate when !isPlaying.
  useEffect(() => {
    if (!isPlaying) {
      lastTimeUpdate.current = null;
    }
  }, [isPlaying]);

  // Human: Attach a new media source when the stream URL changes — HLS master playlists use hls.js + auth header on XHR.
  // Agent: IF url ends with `/playlist` THEN new Hls else audio.src; CLEANUP destroys Hls instance.
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !currentStreamUrl) return;

    let hls: Hls | null = null;

    if (currentStreamUrl.endsWith("/playlist")) {
      if (Hls.isSupported()) {
        hls = new Hls({
          enableWorker: true,
          xhrSetup: (xhr) => {
            const token = localStorage.getItem("aurora_token");
            if (token) {
              xhr.setRequestHeader("Authorization", `Bearer ${token}`);
            }
          },
        });
        hls.loadSource(currentStreamUrl);
        hls.attachMedia(audio);
      } else if (audio.canPlayType("application/vnd.apple.mpegurl")) {
        audio.src = currentStreamUrl;
      }
    } else {
      audio.src = currentStreamUrl;
    }

    return () => {
      if (hls) {
        hls.destroy();
      }
    };
  }, [currentStreamUrl]);

  // Human: Reset playback position on URL swap and honor `isPlaying` by calling play/pause on the element.
  // Agent: RESETS currentTime when url changes; CALLS audio.play() or pause(); LOGS play() rejections.
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    if (currentStreamUrl && currentStreamUrl !== prevStreamUrl.current) {
      audio.currentTime = 0;
      prevStreamUrl.current = currentStreamUrl;
    }

    if (!currentStreamUrl) return;

    if (isPlaying) {
      const promise = audio.play();
      if (promise !== undefined) {
        promise.catch((err: Error) => {
          console.error("Audio play failed:", err);
        });
      }
    } else {
      audio.pause();
    }
  }, [currentStreamUrl, isPlaying, audioRef]);

  // Human: Keep `progress`/`buffered` synced from native events and accumulate honest listen seconds when clocks agree.
  // Agent: onTimeUpdate; READS buffered end; ACCUMULATES when wall delta ~ audio delta and playing.
  const handleTimeUpdate = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;
    setProgress(audio.currentTime);
    if (audio.buffered.length > 0) {
      setBuffered(audio.buffered.end(audio.buffered.length - 1));
    }

    if (isPlaying) {
      const now = Date.now();
      if (lastTimeUpdate.current) {
        const deltaAudio = audio.currentTime - lastTimeUpdate.current.time;
        const deltaWall = (now - lastTimeUpdate.current.ts) / 1000;
        if (Math.abs(deltaAudio - deltaWall) < 2 && deltaAudio > 0) {
          listenAccumulator.current += Math.min(deltaAudio, deltaWall);
        }
      }
      lastTimeUpdate.current = { time: audio.currentTime, ts: now };
    }
  }, [audioRef, setProgress, setBuffered, isPlaying]);

  // Human: HLS and progressive streams may report length late or as Infinity — listen for real updates without wiping catalog duration.
  // Agent: EFFECT on currentStreamUrl+currentSong.id; LISTENS loadedmetadata+durationchange; SETS finite audio.duration; CLAMPS progress.
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !currentSong) return;

    const syncDurationFromElement = () => {
      const fromMedia = readMediaDurationSeconds(audio);
      if (fromMedia == null) return;
      setDuration(fromMedia);
      setProgress(clampProgressToTrack(audio.currentTime, fromMedia));
    };

    syncDurationFromElement();
    audio.addEventListener("loadedmetadata", syncDurationFromElement);
    audio.addEventListener("durationchange", syncDurationFromElement);
    return () => {
      audio.removeEventListener("loadedmetadata", syncDurationFromElement);
      audio.removeEventListener("durationchange", syncDurationFromElement);
    };
  }, [currentStreamUrl, currentSong?.id, audioRef, setDuration, setProgress]);

  // Human: Finalize listen stats for the finished track then auto-advance if a queue exists.
  // Agent: onEnded; CALLS updateHistory with completed flag; CLEARS session refs; CALLS playNext when queue non-empty.
  const handleEnded = useCallback(() => {
    if (currentSong && historySessionId.current) {
      const duration = Math.round(listenAccumulator.current);
      updateHistory(historySessionId.current, duration, true).catch(() => {});
    }
    historySessionId.current = null;
    listenAccumulator.current = 0;
    lastTimeUpdate.current = null;
    lastLoggedStart.current = null;
    if (queue.length > 0) {
      playNext();
    }
  }, [currentSong, queue, playNext]);

  // Human: Surface element errors to the console — the UI does not show a toast here today.
  // Agent: onError; LOGS audio.error.
  const handleAudioError = useCallback(() => {
    const audio = audioRef.current;
    console.error("Audio element error:", audio?.error);
  }, [audioRef]);

  // Human: Dragging the range resets listen-sample anchors so we don’t count seek jumps as listening time.
  // Agent: CLEARS lastTimeUpdate; CALLS seek(seconds).
  const handleSeek = useCallback(
    (timeSeconds: number) => {
      lastTimeUpdate.current = null;
      seek(timeSeconds);
    },
    [seek],
  );

  // Human: No floating chrome on `/player/:id` — that page has an integrated bottom transport.
  // Agent: RETURNS null early when !currentSong; HIDES floating bar when isPlayerPage.
  if (!currentSong) return null;

  return (
    <>
      {/* Human: Mini-player floats above content except on the dedicated full player route. */}
      {/* Agent: CONDITIONAL !isPlayerPage around fixed bar; APPLIES isDashboard left offset. */}
      {!isPlayerPage && (
        <div
          className={`fixed bottom-4 z-40 ${
            isDashboard ? "md:left-72 left-4" : "md:left-8 left-4"
          } right-4 md:right-8`}
        >
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
          onSeek={handleSeek}
          onVolumeChange={setVolume}
          onToggleMute={toggleMute}
          onToggleShuffle={toggleShuffle}
          onToggleQueue={() => setQueueOpen(!queueOpen)}
          onArtworkClick={() => navigate(`/player/${currentSong.id}`)}
          queueButtonRef={queueButtonRef}
        />
      </div>
      )}

      <QueueDrawer returnFocusRef={queueButtonRef} />

      {/* Human: Shared element referenced by PlayerContext — all transport state funnels through this node. */}
      {/* Agent: ref=audioRef; WIRES time/metadata/end/error handlers; preload metadata. */}
      <audio
        ref={audioRef}
        onTimeUpdate={handleTimeUpdate}
        onEnded={handleEnded}
        onError={handleAudioError}
        preload="metadata"
      />
    </>
  );
}

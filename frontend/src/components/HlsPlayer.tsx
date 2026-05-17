// Human: Standalone `<audio>` that plays an HLS master playlist with Bearer auth on segment requests (or native Safari HLS).
// Agent: EFFECT on playlistUrl; USES hls.js attachMedia+loadSource OR audio.src; CLEANUP destroys HLS; CALLS onError on fatal.
import { useEffect, useRef } from "react";
import Hls from "hls.js";

interface HlsPlayerProps {
  playlistUrl: string;
  onTimeUpdate?: () => void;
  onLoadedMetadata?: () => void;
  onEnded?: () => void;
  onError?: () => void;
  autoPlay?: boolean;
  preload?: string;
}

// Human: Encapsulates browser differences — Chrome needs hls.js; Safari can play `application/vnd.apple.mpegurl` directly.
// Agent: PROPS playlistUrl + audio callbacks; REFS audio+hls; DEP [playlistUrl, onError].
export default function HlsPlayer({
  playlistUrl,
  onTimeUpdate,
  onLoadedMetadata,
  onEnded,
  onError,
  autoPlay = false,
  preload = "metadata",
}: HlsPlayerProps) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const hlsRef = useRef<Hls | null>(null);

  // Human: Rebuild the pipeline whenever the playlist URL changes so we never append stale HLS state.
  // Agent: DESTROY prior Hls; xhrSetup adds Authorization; ERROR fatal triggers onError; Safari fallback sets src.
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !playlistUrl) return;

    // Clean up previous Hls instance
    if (hlsRef.current) {
      hlsRef.current.destroy();
      hlsRef.current = null;
    }

    if (Hls.isSupported()) {
      const hls = new Hls({
        enableWorker: true,
        xhrSetup: (xhr) => {
          const token = localStorage.getItem("aurora_token");
          if (token) {
            xhr.setRequestHeader("Authorization", `Bearer ${token}`);
          }
        },
      });

      hls.on(Hls.Events.MEDIA_ATTACHED, () => {
        hls.loadSource(playlistUrl);
      });

      hls.on(Hls.Events.ERROR, (_event, data) => {
        if (data.fatal) {
          console.error("HLS fatal error:", data);
          onError?.();
        }
      });

      hls.attachMedia(audio);
      hlsRef.current = hls;
    } else if (audio.canPlayType("application/vnd.apple.mpegurl")) {
      // Native HLS support (Safari)
      audio.src = playlistUrl;
    } else {
      console.error("HLS is not supported in this browser");
      onError?.();
    }

    return () => {
      if (hlsRef.current) {
        hlsRef.current.destroy();
        hlsRef.current = null;
      }
    };
  }, [playlistUrl, onError]);

  return (
    <audio
      ref={audioRef}
      onTimeUpdate={onTimeUpdate}
      onLoadedMetadata={onLoadedMetadata}
      onEnded={onEnded}
      onError={onError}
      autoPlay={autoPlay}
      preload={preload}
    />
  );
}

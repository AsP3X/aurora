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

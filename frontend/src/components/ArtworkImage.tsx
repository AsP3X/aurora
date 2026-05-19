// Human: Show artwork from the API when available; otherwise render a deterministic initial-based placeholder tile.
// Agent: EFFECT fetchArtworkUrl per songId+size; STATE url+hasError; FALLBACK stringToHslColor(title+artist).
import { useEffect, useState } from "react";
import { fetchArtworkUrl, type ArtworkSize } from "../api/client";
import { stringToHslColor } from "../utils/color";

interface ArtworkImageProps {
  songId: string;
  title: string;
  artist?: string;
  className?: string;
  /** Human: Request seeker (transport), library (cards), or detail (hero) WebP from the API. */
  size?: ArtworkSize;
}

// Human: `songId` drives cache key; `title`/`artist` improve alt text and placeholder color entropy.
// Agent: PROPS songId, title, optional artist, optional size; LAZY loads img; onError flips to placeholder.
export default function ArtworkImage({
  songId,
  title,
  artist = "",
  className = "",
  size = "library",
}: ArtworkImageProps) {
  const [hasError, setHasError] = useState(false);
  const [url, setUrl] = useState<string | null>(null);

  // Human: Each new `songId` or size refetches presigned artwork — reset so we never flash the previous cover.
  // Agent: CANCELS stale responses; CALLS fetchArtworkUrl(songId, size); SETS hasError on failure.
  useEffect(() => {
    let cancelled = false;
    setHasError(false);
    setUrl(null);

    fetchArtworkUrl(songId, size)
      .then((u) => {
        if (!cancelled) setUrl(u);
      })
      .catch(() => {
        if (!cancelled) setHasError(true);
      });

    return () => {
      cancelled = true;
    };
  }, [songId, size]);

  if (hasError || !url) {
    const initial = title.charAt(0).toUpperCase();
    const color = stringToHslColor(title + artist);
    return (
      <div
        className={`flex items-center justify-center text-white font-bold select-none ${className}`}
        style={{ backgroundColor: color }}
        title={`${title}${artist ? ` — ${artist}` : ""}`}
      >
        <span className="text-2xl md:text-3xl lg:text-4xl drop-shadow-sm">
          {initial}
        </span>
      </div>
    );
  }

  return (
    <img
      src={url}
      alt={title}
      className={className}
      loading="lazy"
      onError={() => setHasError(true)}
    />
  );
}

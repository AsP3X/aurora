import { useEffect, useState } from "react";
import { fetchArtworkUrl, artworkUrl } from "../api/client";
import { stringToHslColor } from "../utils/color";

interface ArtworkImageProps {
  songId: string;
  title: string;
  artist?: string;
  className?: string;
}

export default function ArtworkImage({ songId, title, artist = "", className = "" }: ArtworkImageProps) {
  const [hasError, setHasError] = useState(false);
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setHasError(false);
    setUrl(null);

    fetchArtworkUrl(songId)
      .then((u) => {
        if (!cancelled) setUrl(u);
      })
      .catch(() => {
        if (!cancelled) setHasError(true);
      });

    return () => { cancelled = true; };
  }, [songId]);

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

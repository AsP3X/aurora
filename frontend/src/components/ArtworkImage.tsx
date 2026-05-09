import { useState } from "react";
import { artworkUrl } from "../api/client";
import { stringToHslColor } from "../utils/color";

interface ArtworkImageProps {
  songId: string;
  title: string;
  artist?: string;
  className?: string;
}

export default function ArtworkImage({ songId, title, artist = "", className = "" }: ArtworkImageProps) {
  const [hasError, setHasError] = useState(false);

  if (hasError) {
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
      src={artworkUrl(songId)}
      alt={title}
      className={className}
      loading="lazy"
      onError={() => setHasError(true)}
    />
  );
}

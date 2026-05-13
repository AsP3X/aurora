import { usePlayer } from "../context/PlayerContext";
import ArtworkImage from "./ArtworkImage";
import type { Song } from "../types";

export default function SongCard({ song }: { song: Song }) {
  const { playSong } = usePlayer();

  function handleClick() {
    playSong(song);
  }

  return (
    <button
      onClick={handleClick}
      className="group block w-full text-left space-y-3 hover:bg-surface-900/40 rounded-xl p-2 transition-all duration-200"
    >
      <div className="relative aspect-square bg-surface-900 border border-white/5 rounded-xl overflow-hidden shadow-sm">
        <ArtworkImage
          songId={song.id}
          title={song.title}
          artist={song.artist}
          className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
        />
        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-colors flex items-center justify-center opacity-0 group-hover:opacity-100">
          <div className="w-10 h-10 rounded-full bg-aurora-600/90 backdrop-blur-sm flex items-center justify-center shadow-lg">
            <svg className="w-5 h-5 text-white ml-0.5" fill="currentColor" viewBox="0 0 24 24">
              <path d="M8 5v14l11-7z" />
            </svg>
          </div>
        </div>
      </div>
      <div className="px-1">
        <p className="text-sm font-medium text-white truncate group-hover:text-aurora-300 transition-colors">
          {song.title}
        </p>
        <p className="text-xs text-surface-400 truncate">{song.artist}</p>
      </div>
    </button>
  );
}

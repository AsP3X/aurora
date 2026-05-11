import { useState, useEffect } from "react";
import type { SongDraft } from "../../types";
import EntityField from "./EntityField";
import MultiGenreField from "./MultiGenreField";
import { fetchValues, fetchAlbumSongCount } from "../../api/client";

interface SongMetadataFormProps {
  draft: SongDraft;
  onChange: (draft: SongDraft) => void;
}

const inputClass =
  "w-full rounded-lg border border-surface-700 bg-surface-900 px-3 py-2 text-sm text-white placeholder-surface-500 focus:border-aurora-400 focus:outline-none";

const labelClass = "mb-1 block text-xs font-medium text-surface-300";

type EntityType = "artist" | "album" | "album_artist" | "genre" | "studio";

export default function SongMetadataForm({ draft, onChange }: SongMetadataFormProps) {
  const [existingValues, setExistingValues] = useState<Record<EntityType, string[]>>({
    artist: [],
    album: [],
    album_artist: [],
    genre: [],
    studio: [],
  });

  useEffect(() => {
    let cancelled = false;

    Promise.all([
      fetchValues("artist"),
      fetchValues("album"),
      fetchValues("album_artist"),
      fetchValues("genre"),
      fetchValues("studio"),
    ])
      .then(([artists, albums, albumArtists, genres, studios]) => {
        if (cancelled) return;
        const mergedArtists = Array.from(new Set([...artists, ...albumArtists])).sort();
        setExistingValues({
          artist: mergedArtists,
          album: albums,
          album_artist: mergedArtists,
          genre: genres,
          studio: studios,
        });
      })
      .catch((err) => {
        if (!cancelled) {
          console.error("Failed to fetch existing values:", err);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [draft.staging_id]);

  useEffect(() => {
    let cancelled = false;

    if (!draft.album) {
      onChange({ ...draft, track_number: null });
      return;
    }

    fetchAlbumSongCount(draft.album)
      .then((count) => {
        if (!cancelled) {
          onChange({ ...draft, track_number: count + 1 });
        }
      })
      .catch(console.error);

    return () => {
      cancelled = true;
    };
  }, [draft.album]); // eslint-disable-line react-hooks/exhaustive-deps

  const update = <K extends keyof SongDraft>(field: K, value: SongDraft[K]) => {
    onChange({ ...draft, [field]: value });
  };

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      <div className="sm:col-span-2">
        <label className={labelClass}>Title *</label>
        <input
          className={inputClass}
          value={draft.title}
          onChange={(e) => update("title", e.target.value)}
          required
        />
      </div>

      <div className="sm:col-span-2">
        <EntityField
          label="Artist *"
          value={draft.artist}
          onChange={(v) => update("artist", v ?? "")}
          entityType="artist"
          existingValues={existingValues.artist}
        />
      </div>

      <div>
        <EntityField
          label="Album"
          value={draft.album}
          onChange={(v) => update("album", v)}
          entityType="album"
          existingValues={existingValues.album}
        />
      </div>

      <div>
        <EntityField
          label="Album Artist"
          value={draft.album_artist}
          onChange={(v) => update("album_artist", v)}
          entityType="album_artist"
          existingValues={existingValues.album_artist}
        />
      </div>

      <div>
        {!draft.album ? (
          <div className="flex h-[38px] items-center">
            <span className="rounded-full bg-surface-800 px-2 py-0.5 text-xs font-medium text-surface-400">
              Single
            </span>
          </div>
        ) : (
          <>
            <label className={labelClass}>Track Number</label>
            <input
              className={inputClass}
              type="text"
              value={
                draft.track_number !== null && draft.track_number !== undefined
                  ? String(draft.track_number).padStart(2, "0")
                  : ""
              }
              onChange={(e) => {
                const val = parseInt(e.target.value, 10);
                update("track_number", isNaN(val) ? null : val);
              }}
              placeholder="01"
            />
          </>
        )}
      </div>

      <div>
        <label className={labelClass}>Year</label>
        <input
          className={inputClass}
          type="number"
          value={draft.year ?? ""}
          onChange={(e) => {
            const val = e.target.value ? parseInt(e.target.value, 10) : null;
            update("year", val);
          }}
          placeholder="Optional"
        />
      </div>

      <div>
        <MultiGenreField
          label="Genre"
          values={draft.genres}
          onChange={(v) => update("genres", v)}
          existingValues={existingValues.genre}
        />
      </div>

      <div>
        <EntityField
          label="Studio / Label"
          value={draft.studio}
          onChange={(v) => update("studio", v)}
          entityType="studio"
          existingValues={existingValues.studio}
        />
      </div>

      <div className="sm:col-span-2">
        <div className="flex flex-wrap gap-4 text-xs text-surface-400">
          <span>Duration: {formatDuration(draft.duration_seconds)}</span>
          <span>Format: {draft.file_format.toUpperCase()}</span>
          {draft.bitrate_kbps && <span>Bitrate: {draft.bitrate_kbps} kbps</span>}
          {draft.sample_rate_hz && <span>Sample Rate: {draft.sample_rate_hz} Hz</span>}
        </div>
      </div>
    </div>
  );
}

function formatDuration(seconds: number) {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

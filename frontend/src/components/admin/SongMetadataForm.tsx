import type { SongDraft } from "../../types";

interface SongMetadataFormProps {
  draft: SongDraft;
  onChange: (draft: SongDraft) => void;
}

const inputClass =
  "w-full rounded-lg border border-surface-700 bg-surface-900 px-3 py-2 text-sm text-white placeholder-surface-500 focus:border-aurora-400 focus:outline-none";

const labelClass = "mb-1 block text-xs font-medium text-surface-300";

export default function SongMetadataForm({ draft, onChange }: SongMetadataFormProps) {
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
        <label className={labelClass}>Artist *</label>
        <input
          className={inputClass}
          value={draft.artist}
          onChange={(e) => update("artist", e.target.value)}
          required
        />
      </div>

      <div>
        <label className={labelClass}>Album</label>
        <input
          className={inputClass}
          value={draft.album ?? ""}
          onChange={(e) => update("album", e.target.value || null)}
          placeholder="Optional"
        />
      </div>

      <div>
        <label className={labelClass}>Album Artist</label>
        <input
          className={inputClass}
          value={draft.album_artist ?? ""}
          onChange={(e) => update("album_artist", e.target.value || null)}
          placeholder="Optional"
        />
      </div>

      <div>
        <label className={labelClass}>Track Number</label>
        <input
          className={inputClass}
          type="number"
          value={draft.track_number ?? ""}
          onChange={(e) => {
            const val = e.target.value ? parseInt(e.target.value, 10) : null;
            update("track_number", val);
          }}
          placeholder="Optional"
        />
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
        <label className={labelClass}>Genre</label>
        <input
          className={inputClass}
          value={draft.genre ?? ""}
          onChange={(e) => update("genre", e.target.value || null)}
          placeholder="Optional"
        />
      </div>

      <div>
        <label className={labelClass}>Studio / Label</label>
        <input
          className={inputClass}
          value={draft.studio ?? ""}
          onChange={(e) => update("studio", e.target.value || null)}
          placeholder="Optional"
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

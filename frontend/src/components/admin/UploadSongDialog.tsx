// Human: Multi-step admin upload modal — stages file with XHR progress, edits metadata+artwork, commits, then polls HLS readiness.
// Agent: STATES idle|uploading|editing|committing|processing|complete; POLL fetchSong 2s until hls_ready; NAVIGATE on view.
import { useState, useCallback, useRef, useEffect, useId } from "react";
import { useNavigate } from "react-router-dom";
import { useFocusTrap } from "../../hooks/useFocusTrap";
import {
  stageSongWithProgress,
  commitSongWithProgress,
  stagedArtworkUrl,
  fetchSong,
} from "../../api/client";
import type { SongDraft, Song } from "../../types";
import SongMetadataForm from "./SongMetadataForm";
import ArtworkCropper from "./ArtworkCropper";

// Human: Mobile Safari and several mobile WebViews treat `accept="audio/*"` as a strict MIME filter, which often hides `.wav` and other valid files even though the OS can open them; we combine `audio/*` with concrete extensions and MIME tokens that mirror the backend stage allowlist.
// Agent: READS only by `<input accept>`; MUST stay aligned with `allowed` in `backend/src/admin/upload.rs` (mp3, flac, ogg, opus, m4a, aac, wma, wav); BROADENS picker on iOS/Android without relaxing server validation.
const ADMIN_AUDIO_UPLOAD_ACCEPT =
  "audio/*,.mp3,.flac,.ogg,.opus,.m4a,.aac,.wma,.wav,audio/mpeg,audio/mp4,audio/x-m4a,audio/flac,audio/x-flac,audio/ogg,audio/opus,audio/aac,audio/x-ms-wma,audio/wav,audio/x-wav,audio/wave";

type UploadState =
  | "idle"
  | "uploading"
  | "editing"
  | "committing"
  | "processing"
  | "complete";

interface UploadSongDialogProps {
  onClose: () => void;
  onSuccess: (song: Song) => void;
}

function ProgressBar({
  percent,
  label,
}: {
  percent: number;
  label: string;
}) {
  return (
    <div className="py-8 space-y-4">
      <p className="text-sm text-surface-300 text-center">{label}</p>
      <div className="w-full h-2 bg-surface-800 rounded-full overflow-hidden">
        <div
          className="h-full bg-aurora-500 rounded-full transition-all duration-200"
          style={{ width: `${percent}%` }}
        />
      </div>
      <p className="text-xs text-surface-500 text-center">{percent}%</p>
    </div>
  );
}

function ProcessingIndicator({ percent }: { percent: number }) {
  return (
    <ProgressBar
      percent={percent}
      label="Converting audio for streaming…"
    />
  );
}

export default function UploadSongDialog({
  onClose,
  onSuccess,
}: UploadSongDialogProps) {
  const navigate = useNavigate();
  const [state, setState] = useState<UploadState>("idle");
  const [uploadProgress, setUploadProgress] = useState(0);
  const [draft, setDraft] = useState<SongDraft | null>(null);
  const [imageSrc, setImageSrc] = useState<string | null>(null);
  const [croppedBlob, setCroppedBlob] = useState<Blob | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [committedSong, setCommittedSong] = useState<Song | null>(null);
  const [processingProgress, setProcessingProgress] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const fileInputId = useId();

  useFocusTrap(true, panelRef);

  const isBusy =
    state === "uploading" || state === "committing" || state === "processing";

  // Human: Stage binary on server — progress callback wired to the same bar reused during commit upload.
  // Agent: stageSongWithProgress; SETS draft+imageSrc from has_artwork; TRANSITIONS to editing/idle on result.
  const handleFileSelect = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      setError(null);
      setUploadProgress(0);
      setState("uploading");
      try {
        const result = await stageSongWithProgress(file, (pct) =>
          setUploadProgress(pct)
        );
        setDraft(result);
        if (result.has_artwork) {
          setImageSrc(stagedArtworkUrl(result.staging_id));
        } else {
          setImageSrc(null);
        }
        setState("editing");
      } catch (err) {
        setError(err instanceof Error ? err.message : "Upload failed");
        setState("idle");
      }
    },
    []
  );

  // Human: User replaced embedded art locally — reset crop blob until they apply a fresh square crop.
  // Agent: FileReader readAsDataURL; SETS imageSrc; CLEARS croppedBlob.
  const handleReplaceArtwork = useCallback((file: File) => {
    const reader = new FileReader();
    reader.onload = () => {
      setImageSrc(reader.result as string);
      setCroppedBlob(null);
    };
    reader.readAsDataURL(file);
  }, []);

  // Human: Apply square crop produces the blob submitted on commit — preview swaps to object URL immediately.
  // Agent: SETS croppedBlob; REVOKES prior object URL implicitly by overwrite; sets imageSrc to blob URL.
  const handleCropComplete = useCallback((blob: Blob) => {
    setCroppedBlob(blob);
    setImageSrc(URL.createObjectURL(blob));
  }, []);

  const handleRemoveArtwork = useCallback(() => {
    setImageSrc(null);
    setCroppedBlob(null);
  }, []);

  // Human: Persist staged audio + metadata + optional cropped JPEG — then move to processing state while HLS transcodes.
  // Agent: commitSongWithProgress; onSuccess(song); SET state processing; REUSES upload progress for PUTs.
  const handleCommit = useCallback(async () => {
    if (!draft) return;
    if (!draft.title.trim() || !draft.artist.trim()) {
      setError("Title and artist are required");
      return;
    }
    setError(null);
    setUploadProgress(0);
    setState("committing");
    try {
      const song = await commitSongWithProgress(
        draft,
        croppedBlob ?? undefined,
        (pct) => setUploadProgress(pct)
      );
      setCommittedSong(song);
      onSuccess(song);
      setState("processing");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Commit failed");
      setState("editing");
    }
  }, [draft, croppedBlob, onSuccess]);

  // Human: After commit succeeds, poll until `hls_ready` so the success screen reflects real streaming availability.
  // Agent: EFFECT [state, committedSong]; INTERVAL 2s fetchSong; SET processingProgress; state complete at 100%.
  useEffect(() => {
    if (state !== "processing" || !committedSong) return;
    let cancelled = false;

    const songId = committedSong.id;
    async function poll() {
      try {
        const song = await fetchSong(songId);
        if (cancelled) return;
        setProcessingProgress(song.conversion_progress);
        if (song.hls_ready) {
          setProcessingProgress(100);
          setState("complete");
        }
      } catch {
        // ignore polling errors, will retry
      }
    }

    poll();
    const interval = setInterval(poll, 2000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [state, committedSong]);

  const handleClose = useCallback(() => {
    if (isBusy) return;
    onClose();
  }, [isBusy, onClose]);

  const handleViewSong = useCallback(() => {
    if (committedSong) {
      navigate(`/song/${committedSong.id}`);
    }
    onClose();
  }, [committedSong, navigate, onClose]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !isBusy) handleClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [isBusy, handleClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      role="presentation"
      onMouseDown={(e) => {
        if (!isBusy && e.target === e.currentTarget) handleClose();
      }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-xl border border-surface-700 bg-surface-950 p-6 shadow-2xl outline-none"
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 id={titleId} className="text-lg font-semibold text-white">
            Upload Song
          </h2>
          <button
            type="button"
            onClick={handleClose}
            className="text-surface-400 hover:text-white disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-aurora-500/50 rounded-lg p-1"
            disabled={isBusy}
            aria-label="Close upload dialog"
          >
            ✕
          </button>
        </div>

        {error && (
          <div className="mb-4 rounded-md bg-red-900/30 px-3 py-2 text-sm text-red-300">
            {error}
          </div>
        )}

        {state === "idle" && (
          <div className="flex flex-col items-center gap-4 py-8">
            <div className="rounded-full bg-surface-900 p-4">
              <svg
                className="h-8 w-8 text-aurora-400"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3"
                />
              </svg>
            </div>
            <p className="text-sm text-surface-300">
              Select an audio file to upload
            </p>
            <button
              onClick={() => fileInputRef.current?.click()}
              className="rounded-md bg-aurora-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-aurora-500"
            >
              Choose File
            </button>
            <label htmlFor={fileInputId} className="sr-only">
              Audio file to upload
            </label>
            <input
              id={fileInputId}
              ref={fileInputRef}
              type="file"
              accept={ADMIN_AUDIO_UPLOAD_ACCEPT}
              className="hidden"
              onChange={handleFileSelect}
            />
          </div>
        )}

        {state === "uploading" && (
          <ProgressBar percent={uploadProgress} label="Uploading audio file…" />
        )}

        {state === "editing" && draft && (
          <div className="flex flex-col gap-6">
            <SongMetadataForm draft={draft} onChange={setDraft} />

            <div>
              <h3 className="mb-2 text-sm font-medium text-white">Artwork</h3>
              <ArtworkCropper
                imageSrc={imageSrc}
                onCropComplete={handleCropComplete}
                onReplace={handleReplaceArtwork}
                onRemove={handleRemoveArtwork}
              />
            </div>

            <div className="flex justify-end gap-2">
              <button
                onClick={handleClose}
                className="rounded-md bg-surface-800 px-4 py-2 text-sm font-medium text-white hover:bg-surface-700"
              >
                Cancel
              </button>
              <button
                onClick={handleCommit}
                className="rounded-md bg-aurora-600 px-4 py-2 text-sm font-medium text-white hover:bg-aurora-500"
              >
                Save to Library
              </button>
            </div>
          </div>
        )}

        {state === "committing" && (
          <ProgressBar percent={uploadProgress} label="Saving to library…" />
        )}

        {state === "processing" && (
          <ProcessingIndicator percent={processingProgress} />
        )}

        {state === "complete" && committedSong && (
          <div className="py-8 flex flex-col items-center gap-6">
            <div className="w-12 h-12 rounded-full bg-emerald-500/20 flex items-center justify-center">
              <svg
                className="w-6 h-6 text-emerald-400"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M5 13l4 4L19 7"
                />
              </svg>
            </div>
            <div className="text-center space-y-1">
              <p className="text-white font-medium">
                “{committedSong.title}” is ready
              </p>
              <p className="text-sm text-surface-400">
                The song has been uploaded and processed successfully.
              </p>
            </div>
            <div className="flex gap-3">
              <button
                onClick={handleClose}
                className="rounded-md bg-surface-800 px-5 py-2.5 text-sm font-medium text-white hover:bg-surface-700"
              >
                Close
              </button>
              <button
                onClick={handleViewSong}
                className="rounded-md bg-aurora-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-aurora-500"
              >
                View Song
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

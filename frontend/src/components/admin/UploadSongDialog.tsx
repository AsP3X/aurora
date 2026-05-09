import { useState, useCallback, useRef } from "react";
import { stageSong, commitSong } from "../../api/client";
import type { SongDraft, Song } from "../../types";
import SongMetadataForm from "./SongMetadataForm";
import ArtworkCropper from "./ArtworkCropper";

type UploadState = "idle" | "uploading" | "editing" | "committing" | "done";

interface UploadSongDialogProps {
  onClose: () => void;
  onSuccess: (song: Song) => void;
}

export default function UploadSongDialog({ onClose, onSuccess }: UploadSongDialogProps) {
  const [state, setState] = useState<UploadState>("idle");
  const [draft, setDraft] = useState<SongDraft | null>(null);
  const [imageSrc, setImageSrc] = useState<string | null>(null);
  const [croppedBlob, setCroppedBlob] = useState<Blob | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      setError(null);
      setState("uploading");
      try {
        const result = await stageSong(file);
        setDraft(result);
        setImageSrc(null);
        setState("editing");
      } catch (err) {
        setError(err instanceof Error ? err.message : "Upload failed");
        setState("idle");
      }
    },
    []
  );

  const handleReplaceArtwork = useCallback((file: File) => {
    const reader = new FileReader();
    reader.onload = () => {
      setImageSrc(reader.result as string);
      setCroppedBlob(null);
    };
    reader.readAsDataURL(file);
  }, []);

  const handleCropComplete = useCallback((blob: Blob) => {
    setCroppedBlob(blob);
    setImageSrc(URL.createObjectURL(blob));
  }, []);

  const handleRemoveArtwork = useCallback(() => {
    setImageSrc(null);
    setCroppedBlob(null);
  }, []);

  const handleCommit = useCallback(async () => {
    if (!draft) return;
    if (!draft.title.trim() || !draft.artist.trim()) {
      setError("Title and artist are required");
      return;
    }
    setError(null);
    setState("committing");
    try {
      const song = await commitSong(draft, croppedBlob ?? undefined);
      setState("done");
      onSuccess(song);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Commit failed");
      setState("editing");
    }
  }, [draft, croppedBlob, onSuccess, onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-xl border border-surface-700 bg-surface-950 p-6 shadow-2xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-white">Upload Song</h2>
          <button
            onClick={onClose}
            className="text-surface-400 hover:text-white"
            disabled={state === "uploading" || state === "committing"}
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
            <p className="text-sm text-surface-300">Select an audio file to upload</p>
            <button
              onClick={() => fileInputRef.current?.click()}
              className="rounded-md bg-aurora-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-aurora-500"
            >
              Choose File
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="audio/*"
              className="hidden"
              onChange={handleFileSelect}
            />
          </div>
        )}

        {state === "uploading" && (
          <div className="py-12 text-center text-sm text-surface-400">
            Extracting metadata…
          </div>
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
                onClick={onClose}
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
          <div className="py-12 text-center text-sm text-surface-400">Saving to library…</div>
        )}
      </div>
    </div>
  );
}

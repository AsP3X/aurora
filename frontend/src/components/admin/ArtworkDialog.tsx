// Human: Nested modal for upload artwork editing — upload a file, generate a procedural cover, crop, then apply back to the parent form.
// Agent: LOCAL state while open; CALLS generateShaderArtwork on generate; COMMITS imageSrc+croppedBlob via onApply on Done.
import { useCallback, useEffect, useRef, useState } from "react";
import type { SongDraft } from "../../types";
import { generateShaderArtwork } from "../../utils/shaderArtwork";
import GlassDialog from "./GlassDialog";
import ArtworkCropper from "./ArtworkCropper";
interface ArtworkDialogProps {
  open: boolean;
  onClose: () => void;
  draft: SongDraft;
  imageSrc: string | null;
  croppedBlob: Blob | null;
  onApply: (imageSrc: string | null, croppedBlob: Blob | null) => void;
}
export default function ArtworkDialog({
  open,
  onClose,
  draft,
  imageSrc,
  croppedBlob,
  onApply,
}: ArtworkDialogProps) {
  const [localImageSrc, setLocalImageSrc] = useState<string | null>(imageSrc);
  const [localCroppedBlob, setLocalCroppedBlob] = useState<Blob | null>(croppedBlob);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const previewUrlRef = useRef<string | null>(null);
  const uploadInputRef = useRef<HTMLInputElement>(null);
  // Human: When the dialog opens, mirror parent artwork state so cancel does not mutate the upload form.
  // Agent: EFFECT [open, imageSrc, croppedBlob]; RESETS localImageSrc/localCroppedBlob; CLEARS error.
  useEffect(() => {
    if (!open) return;
    setLocalImageSrc(imageSrc);
    setLocalCroppedBlob(croppedBlob);
    setError(null);
  }, [open, imageSrc, croppedBlob]);
  // Human: Revoke object URLs created for generated previews when the dialog closes or unmounts.
  // Agent: EFFECT cleanup; READS previewUrlRef; CALLS URL.revokeObjectURL.
  useEffect(() => {
    return () => {
      if (previewUrlRef.current) {
        URL.revokeObjectURL(previewUrlRef.current);
        previewUrlRef.current = null;
      }
    };
  }, []);
  // Human: Point the cropper at a fresh object URL and drop any previous generated preview URL.
  // Agent: REVOKES prior previewUrlRef; SETS localImageSrc; MUTATES previewUrlRef.
  const setPreviewFromBlob = useCallback((blob: Blob) => {
    if (previewUrlRef.current) {
      URL.revokeObjectURL(previewUrlRef.current);
    }
    const url = URL.createObjectURL(blob);
    previewUrlRef.current = url;
    setLocalImageSrc(url);
  }, []);
  // Human: User picked a replacement image — show it in the cropper and clear any prior cropped output.
  // Agent: FileReader readAsDataURL; SETS localImageSrc; CLEARS localCroppedBlob.
  const handleReplaceArtwork = useCallback((file: File) => {
    const reader = new FileReader();
    reader.onload = () => {
      setLocalImageSrc(reader.result as string);
      setLocalCroppedBlob(null);
    };
    reader.readAsDataURL(file);
  }, []);
  // Human: Apply square crop produces the blob that will be committed on Save to Library.
  // Agent: SETS localCroppedBlob; CALLS setPreviewFromBlob for immediate preview.
  const handleCropComplete = useCallback(
    (blob: Blob) => {
      setLocalCroppedBlob(blob);
      setPreviewFromBlob(blob);
    },
    [setPreviewFromBlob],
  );
  const handleRemoveArtwork = useCallback(() => {
    if (previewUrlRef.current) {
      URL.revokeObjectURL(previewUrlRef.current);
      previewUrlRef.current = null;
    }
    setLocalImageSrc(null);
    setLocalCroppedBlob(null);
  }, []);
  // Human: Build a nebula cover from current metadata — letters-only title plus artist/album/year footer.
  // Agent: CALLS generateShaderArtwork; SETS localCroppedBlob+preview; square output skips extra crop step.
  const handleGenerate = useCallback(async () => {
    setGenerating(true);
    setError(null);
    try {
      const blob = await generateShaderArtwork({
        seed: `${draft.title}\u0000${draft.artist}\u0000${draft.studio ?? ""}\u0000${draft.album ?? ""}\u0000${draft.year ?? ""}`,
        title: draft.title,
        artist: draft.artist,
        studio: draft.studio,
        album: draft.album,
        year: draft.year,
      });
      setLocalCroppedBlob(blob);
      setPreviewFromBlob(blob);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not generate cover art");
    } finally {
      setGenerating(false);
    }
  }, [draft, setPreviewFromBlob]);
  const handleDone = useCallback(() => {
    onApply(localImageSrc, localCroppedBlob);
    onClose();
  }, [localImageSrc, localCroppedBlob, onApply, onClose]);
  const handleUploadClick = useCallback(() => {
    uploadInputRef.current?.click();
  }, []);
  const handleUploadChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      if (file) {
        handleReplaceArtwork(file);
      }
      event.target.value = "";
    },
    [handleReplaceArtwork],
  );
  return (
    <GlassDialog
      open={open}
      onClose={onClose}
      title="Cover art"
      size="lg"
      zIndexClass="z-[60]"
    >
      <div className="flex flex-col gap-4">
        <p className="text-sm text-surface-400">
          Upload an image or generate an Aurora cover from the song metadata. Generated covers
          show title initials in the center with artist and studio on the bottom row, plus album
          and year below.
        </p>
        {error ? (
          <div className="rounded-md bg-red-900/30 px-3 py-2 text-sm text-red-300">{error}</div>
        ) : null}
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={handleUploadClick}
            disabled={generating}
            className="rounded-md bg-aurora-600 px-4 py-2 text-sm font-medium text-white hover:bg-aurora-500 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Upload image
          </button>
          <button
            type="button"
            onClick={() => void handleGenerate()}
            disabled={generating || !draft.title.trim() || !draft.artist.trim()}
            className="rounded-md bg-surface-700 px-4 py-2 text-sm font-medium text-white hover:bg-surface-600 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {generating ? "Generating…" : "Generate cover"}
          </button>
          <input
            ref={uploadInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handleUploadChange}
          />
        </div>
        <ArtworkCropper
          imageSrc={localImageSrc}
          onCropComplete={handleCropComplete}
          onReplace={handleReplaceArtwork}
          onRemove={handleRemoveArtwork}
        />
        <div className="flex justify-end gap-2 border-t border-surface-800 pt-4">
          <button
            type="button"
            onClick={onClose}
            className="rounded-md bg-surface-800 px-4 py-2 text-sm font-medium text-white hover:bg-surface-700"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleDone}
            disabled={generating}
            className="rounded-md bg-aurora-600 px-4 py-2 text-sm font-medium text-white hover:bg-aurora-500 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Done
          </button>
        </div>
      </div>
    </GlassDialog>
  );
}

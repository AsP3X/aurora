// Human: Square 1:1 crop UI for artwork — draws to canvas max 1200px and emits JPEG blob for upload forms.
// Agent: react-image-crop; onImageLoad seeds center crop; generateCroppedImage uses canvas+toBlob 0.92 quality JPEG.
import { useState, useRef, useCallback } from "react";
import ReactCrop, { type Crop, type PixelCrop, centerCrop, makeAspectCrop } from "react-image-crop";
import "react-image-crop/dist/ReactCrop.css";

interface ArtworkCropperProps {
  imageSrc: string | null;
  onCropComplete: (croppedBlob: Blob) => void;
  onReplace: (file: File) => void;
  onRemove: () => void;
}

export default function ArtworkCropper({
  imageSrc,
  onCropComplete,
  onReplace,
  onRemove,
}: ArtworkCropperProps) {
  const [crop, setCrop] = useState<Crop>();
  const [completedCrop, setCompletedCrop] = useState<PixelCrop>();
  const imgRef = useRef<HTMLImageElement | null>(null);

  // Human: When image dimensions are known, start with a centered square crop filling most of the frame.
  // Agent: onLoad; makeAspectCrop 90% width aspect 1; DERIVES initial PixelCrop for completedCrop.
  const onImageLoad = useCallback((e: React.SyntheticEvent<HTMLImageElement>) => {
    const { width, height } = e.currentTarget;
    const crop = centerCrop(
      makeAspectCrop({ unit: "%", width: 90 }, 1, width, height),
      width,
      height
    );
    setCrop(crop);
    setCompletedCrop({
      x: Math.round((crop.x / 100) * width),
      y: Math.round((crop.y / 100) * height),
      width: Math.round((crop.width / 100) * width),
      height: Math.round((crop.height / 100) * height),
      unit: "px",
    });
    imgRef.current = e.currentTarget;
  }, []);

  // Human: Rasterize crop using natural image pixel ratio — caps output to 1200px square max to bound upload size.
  // Agent: canvas drawImage scaled; toBlob image/jpeg; CALLS onCropComplete(blob).
  const generateCroppedImage = useCallback(async () => {
    if (!imgRef.current || !completedCrop) return;
    const canvas = document.createElement("canvas");
    const scaleX = imgRef.current.naturalWidth / imgRef.current.width;
    const scaleY = imgRef.current.naturalHeight / imgRef.current.height;
    const size = Math.min(
      completedCrop.width * scaleX,
      completedCrop.height * scaleY,
      1200
    );
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.drawImage(
      imgRef.current,
      completedCrop.x * scaleX,
      completedCrop.y * scaleY,
      completedCrop.width * scaleX,
      completedCrop.height * scaleY,
      0,
      0,
      size,
      size
    );

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", 0.92)
    );
    if (blob) {
      onCropComplete(blob);
    }
  }, [completedCrop, onCropComplete]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) onReplace(file);
  };

  if (!imageSrc) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-lg border-2 border-dashed border-surface-700 bg-surface-900/50 p-6">
        <p className="text-sm text-surface-400">No artwork. Upload an image:</p>
        <label className="cursor-pointer rounded-md bg-aurora-600 px-4 py-2 text-sm font-medium text-white hover:bg-aurora-500">
          Choose Image
          <input type="file" accept="image/*" className="hidden" onChange={handleFileChange} />
        </label>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="mx-auto max-w-xs">
        <ReactCrop
          crop={crop}
          onChange={(_, percentCrop) => setCrop(percentCrop)}
          onComplete={(c) => setCompletedCrop(c)}
          aspect={1}
          circularCrop={false}
        >
          <img
            src={imageSrc}
            alt="Artwork"
            onLoad={onImageLoad}
            className="max-h-64 w-auto rounded-md"
          />
        </ReactCrop>
      </div>
      <p className="text-center text-xs text-surface-400">
        Drag to adjust the crop. Aspect ratio is locked to 1:1.
      </p>
      <div className="flex justify-center gap-2">
        <button
          type="button"
          onClick={generateCroppedImage}
          className="rounded-md bg-aurora-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-aurora-500"
        >
          Apply Crop
        </button>
        <label className="cursor-pointer rounded-md bg-surface-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-surface-600">
          Replace
          <input type="file" accept="image/*" className="hidden" onChange={handleFileChange} />
        </label>
        <button
          type="button"
          onClick={onRemove}
          className="rounded-md bg-red-900/50 px-3 py-1.5 text-sm font-medium text-red-200 hover:bg-red-900"
        >
          Remove
        </button>
      </div>
    </div>
  );
}

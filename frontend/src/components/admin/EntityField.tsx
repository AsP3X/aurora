// Human: Button that opens `EntityPickerDialog` for a single string value (artist/album/etc.) with clear affordance.
// Agent: LOCAL open state; onChange from picker; entityType prop currently unused in JSX (reserved for future copy).
import { useState } from "react";
import EntityPickerDialog from "./EntityPickerDialog";

interface EntityFieldProps {
  label: string;
  value: string | null;
  onChange: (value: string | null) => void;
  entityType: "artist" | "album" | "album_artist" | "genre" | "studio";
  existingValues: string[];
}

const labelClass = "mb-1 block text-xs font-medium text-surface-300";

export default function EntityField({
  label,
  value,
  onChange,
  existingValues,
}: EntityFieldProps) {
  const [open, setOpen] = useState(false);

  return (
    <div>
      <label className={labelClass}>{label}</label>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="w-full rounded-lg border border-surface-700 bg-surface-900 px-3 py-2 text-left text-sm text-white transition-colors hover:border-surface-600 focus:border-aurora-400 focus:outline-none"
        >
          {value ?? (
            <span className="text-surface-500">
              Select {label.toLowerCase()}...
            </span>
          )}
        </button>
        {value && (
          <button
            type="button"
            onClick={() => onChange(null)}
            className="shrink-0 rounded-md p-1.5 text-surface-500 hover:bg-surface-800 hover:text-white"
            title="Clear"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="h-4 w-4"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        )}
      </div>

      <EntityPickerDialog
        open={open}
        onClose={() => setOpen(false)}
        onSelect={onChange}
        title={`Select ${label}`}
        existingValues={existingValues}
        currentValue={value}
      />
    </div>
  );
}

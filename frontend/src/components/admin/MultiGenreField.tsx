// Human: Chip list + picker for many genres — uses multi-select EntityPickerDialog and per-chip remove buttons.
// Agent: onMultiSelect wired; onSelect noop passthrough for dialog API; LOCAL open state.
import { useState } from "react";
import EntityPickerDialog from "./EntityPickerDialog";

interface MultiGenreFieldProps {
  label: string;
  values: string[];
  onChange: (values: string[]) => void;
  existingValues: string[];
}

const labelClass = "mb-1 block text-xs font-medium text-surface-300";

export default function MultiGenreField({
  label,
  values,
  onChange,
  existingValues,
}: MultiGenreFieldProps) {
  const [open, setOpen] = useState(false);

  const removeGenre = (genre: string) => {
    onChange(values.filter((v) => v !== genre));
  };

  return (
    <div>
      <label className={labelClass}>{label}</label>
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="rounded-lg border border-surface-700 bg-surface-900 px-3 py-2 text-left text-sm text-white transition-colors hover:border-surface-600 focus:border-aurora-400 focus:outline-none"
        >
          {values.length > 0 ? (
            <span className="text-white">{values.length} selected</span>
          ) : (
            <span className="text-surface-500">Select {label.toLowerCase()}...</span>
          )}
        </button>
        {values.map((genre) => (
          <span
            key={genre}
            className="inline-flex items-center gap-1 rounded-full bg-aurora-600/20 px-2.5 py-1 text-xs text-aurora-400"
          >
            {genre}
            <button
              type="button"
              onClick={() => removeGenre(genre)}
              className="text-aurora-400 hover:text-aurora-300"
              title="Remove"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className="h-3 w-3"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </span>
        ))}
      </div>

      <EntityPickerDialog
        open={open}
        onClose={() => setOpen(false)}
        onSelect={() => {}}
        onMultiSelect={onChange}
        title={`Select ${label}`}
        existingValues={existingValues}
        currentValue={null}
        selectedValues={values}
        multiSelect
      />
    </div>
  );
}

import { useState, useEffect, useRef, useMemo } from "react";
import Fuse from "fuse.js";

interface EntityPickerDialogProps {
  open: boolean;
  onClose: () => void;
  onSelect: (value: string) => void;
  title: string;
  existingValues: string[];
  currentValue: string | null;
}

const inputClass =
  "w-full rounded-lg border border-surface-700 bg-surface-900 px-3 py-2 text-sm text-white placeholder-surface-500 focus:border-aurora-400 focus:outline-none";

export default function EntityPickerDialog({
  open,
  onClose,
  onSelect,
  title,
  existingValues,
  currentValue,
}: EntityPickerDialogProps) {
  const [query, setQuery] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setQuery("");
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open]);

  const fuse = useMemo(
    () =>
      new Fuse(existingValues, {
        threshold: 0.4,
        includeScore: false,
      }),
    [existingValues]
  );

  const results = useMemo(() => {
    if (!query.trim()) return existingValues;
    return fuse.search(query).map((r) => r.item);
  }, [query, existingValues, fuse]);

  const handleSelect = (value: string) => {
    onSelect(value);
    onClose();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && query.trim()) {
      e.preventDefault();
      if (results.length > 0) {
        handleSelect(results[0]);
      } else {
        handleSelect(query.trim());
      }
    }
    if (e.key === "Escape") {
      onClose();
    }
  };

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      onClick={onClose}
    >
      <div
        className="flex max-h-[60vh] w-full max-w-md flex-col rounded-xl border border-surface-700 bg-surface-950 p-4 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="mb-3 text-sm font-semibold text-white">{title}</h3>

        <input
          ref={inputRef}
          className={inputClass}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Search or create new..."
        />

        <div className="mt-3 flex-1 overflow-y-auto">
          {results.length === 0 && (
            <div className="px-3 py-2 text-sm text-surface-500">
              No matches found.
            </div>
          )}

          <ul className="space-y-1">
            {results.map((value) => (
              <li key={value}>
                <button
                  onClick={() => handleSelect(value)}
                  className={`w-full rounded-lg px-3 py-2 text-left text-sm transition-colors ${
                    value === currentValue
                      ? "bg-aurora-600/20 text-aurora-400"
                      : "text-white hover:bg-surface-800"
                  }`}
                >
                  {value}
                </button>
              </li>
            ))}
          </ul>

          {query.trim() && !results.includes(query.trim()) && (
            <button
              onClick={() => handleSelect(query.trim())}
              className="mt-2 w-full rounded-lg px-3 py-2 text-left text-sm text-aurora-400 hover:bg-surface-800 hover:text-aurora-300"
            >
              Create &quot;{query.trim()}&quot;
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// Human: Modal fuzzy picker over known string values — supports single pick or multi with Enter-to-create new tokens.
// Agent: Fuse.js search; RESET on first open; multiSelect toggles local selection then onMultiSelect on Done; Escape closes.
import { useState, useEffect, useRef, useMemo, useId } from "react";
import Fuse from "fuse.js";
import { useFocusTrap } from "../../hooks/useFocusTrap";

interface EntityPickerDialogProps {
  open: boolean;
  onClose: () => void;
  onSelect: (value: string) => void;
  onMultiSelect?: (values: string[]) => void;
  title: string;
  existingValues: string[];
  currentValue: string | null;
  selectedValues?: string[];
  multiSelect?: boolean;
}

const inputClass =
  "w-full rounded-lg border border-surface-700 bg-surface-900 px-3 py-2 text-sm text-white placeholder-surface-500 focus:border-aurora-400 focus:outline-none";

export default function EntityPickerDialog({
  open,
  onClose,
  onSelect,
  onMultiSelect,
  title,
  existingValues,
  currentValue,
  selectedValues = [],
  multiSelect = false,
}: EntityPickerDialogProps) {
  const [query, setQuery] = useState("");
  const [localSelected, setLocalSelected] = useState<string[]>(selectedValues);
  const inputRef = useRef<HTMLInputElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const searchId = useId();

  useFocusTrap(open, panelRef, { initialFocus: false });

  const wasOpenRef = useRef(false);
  // Human: When dialog opens, reset query/selection and focus the filter input for fast keyboard flows.
  // Agent: TRACKS wasOpenRef edge; syncs localSelected from props; TIMEOUT focus input.
  useEffect(() => {
    if (open && !wasOpenRef.current) {
      setQuery("");
      setLocalSelected(selectedValues);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
    wasOpenRef.current = open;
  }, [open, selectedValues]);

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

  const isSelected = (value: string) => localSelected.includes(value);

  const toggleSelection = (value: string) => {
    setLocalSelected((prev) =>
      prev.includes(value) ? prev.filter((v) => v !== value) : [...prev, value]
    );
  };

  const handleSelect = (value: string) => {
    onSelect(value);
    onClose();
  };

  const handleDone = () => {
    onMultiSelect?.(localSelected);
    onClose();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && query.trim()) {
      e.preventDefault();
      if (multiSelect) {
        const trimmed = query.trim();
        if (!localSelected.includes(trimmed)) {
          setLocalSelected((prev) => [...prev, trimmed]);
        }
        setQuery("");
      } else {
        if (results.length > 0) {
          handleSelect(results[0]);
        } else {
          handleSelect(query.trim());
        }
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
      role="presentation"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className="flex max-h-[60vh] w-full max-w-md flex-col rounded-xl border border-surface-700 bg-surface-950 p-4 shadow-2xl outline-none"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <h3 id={titleId} className="mb-3 text-sm font-semibold text-white">
          {title}
        </h3>

        <label htmlFor={searchId} className="sr-only">
          Search or create {title.toLowerCase()}
        </label>
        <input
          id={searchId}
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
            {results.map((value) => {
              const selected = isSelected(value);
              return (
                <li key={value}>
                  <button
                    onClick={() => {
                      if (multiSelect) {
                        toggleSelection(value);
                      } else {
                        handleSelect(value);
                      }
                    }}
                    className={`flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm transition-colors ${
                      !multiSelect && value === currentValue
                        ? "bg-aurora-600/20 text-aurora-400"
                        : selected
                        ? "bg-aurora-600/20 text-aurora-400"
                        : "text-white hover:bg-surface-800"
                    }`}
                  >
                    {multiSelect && (
                      <span
                        className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border ${
                          selected
                            ? "border-aurora-500 bg-aurora-500"
                            : "border-surface-600"
                        }`}
                      >
                        {selected && (
                          <svg className="h-3 w-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                          </svg>
                        )}
                      </span>
                    )}
                    {value}
                  </button>
                </li>
              );
            })}
          </ul>

          {query.trim() && !results.includes(query.trim()) && (
            <button
              onClick={() => {
                if (multiSelect) {
                  const trimmed = query.trim();
                  if (!localSelected.includes(trimmed)) {
                    setLocalSelected((prev) => [...prev, trimmed]);
                  }
                  setQuery("");
                } else {
                  handleSelect(query.trim());
                }
              }}
              className="mt-2 w-full rounded-lg px-3 py-2 text-left text-sm text-aurora-400 hover:bg-surface-800 hover:text-aurora-300"
            >
              Create &quot;{query.trim()}&quot;
            </button>
          )}
        </div>

        {multiSelect && (
          <div className="mt-3 flex justify-end gap-2 border-t border-surface-800 pt-3">
            <button
              onClick={onClose}
              className="rounded-md bg-surface-800 px-3 py-1.5 text-sm font-medium text-white hover:bg-surface-700"
            >
              Cancel
            </button>
            <button
              onClick={handleDone}
              className="rounded-md bg-aurora-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-aurora-500"
            >
              Done ({localSelected.length})
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

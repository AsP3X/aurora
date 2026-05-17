// Human: Searchable user picker — single-select (Enter picks top) vs multi-select with Done and max cap.
// Agent: Fuse on email/id/role; MODE DISCRIMINANT multi; ESC closes via document listener; MAX_MULTI=40 in multi.
import { useEffect, useId, useMemo, useRef, useState } from "react";
import Fuse from "fuse.js";
import { useFocusTrap } from "../../hooks/useFocusTrap";

export type UserPickerItem = { id: string; email: string; role: string; enabled: boolean };

const inputClass =
  "w-full rounded-lg border border-white/10 bg-surface-900 px-3 py-2.5 text-sm text-white placeholder-surface-500 focus:border-aurora-400 focus:outline-none focus:ring-1 focus:ring-aurora-500/40";

const MAX_MULTI = 40;

type BaseProps = {
  open: boolean;
  onClose: () => void;
  users: UserPickerItem[];
  title?: string;
};

type SingleProps = BaseProps & {
  mode?: "single";
  selectedUserId: string;
  onSelect: (userId: string) => void;
};

type MultiProps = BaseProps & {
  mode: "multi";
  selectedUserIds: string[];
  onConfirm: (userIds: string[]) => void;
};

export type UserPickerDialogProps = SingleProps | MultiProps;

function isMulti(props: UserPickerDialogProps): props is MultiProps {
  return props.mode === "multi";
}

export default function UserPickerDialog(props: UserPickerDialogProps) {
  const { open, onClose, users, title = "Select user" } = props;
  const multi = isMulti(props);

  const [query, setQuery] = useState("");
  const [draftIds, setDraftIds] = useState<string[]>(() => (multi ? [...props.selectedUserIds] : []));
  const inputRef = useRef<HTMLInputElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const searchId = useId();

  useFocusTrap(open, panelRef, { initialFocus: false });

  // Human: Focus filter input whenever dialog becomes visible.
  // Agent: EFFECT [open]; TIMEOUT 50ms focus; CLEANUP clears timeout.
  useEffect(() => {
    if (!open) return;
    const t = setTimeout(() => inputRef.current?.focus(), 50);
    return () => clearTimeout(t);
  }, [open]);

  // Human: Click overlay is Close — Escape should behave the same for accessibility.
  // Agent: EFFECT [open, onClose]; DOCUMENT keydown Escape listener.
  useEffect(() => {
    if (!open) return;
    const onEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onEsc);
    return () => document.removeEventListener("keydown", onEsc);
  }, [open, onClose]);

  const fuse = useMemo(
    () =>
      new Fuse(users, {
        keys: [
          { name: "email", weight: 0.7 },
          { name: "id", weight: 0.2 },
          { name: "role", weight: 0.1 },
        ],
        threshold: 0.35,
        ignoreLocation: true,
      }),
    [users]
  );

  const results = useMemo(() => {
    if (!query.trim()) return users;
    return fuse.search(query).map((r) => r.item);
  }, [query, users, fuse]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (multi) return;
    if (e.key === "Enter" && query.trim() && results.length > 0) {
      e.preventDefault();
      props.onSelect(results[0].id);
      onClose();
    }
  };

  function toggleDraft(id: string) {
    setDraftIds((prev) => {
      if (prev.includes(id)) return prev.filter((x) => x !== id);
      if (prev.length >= MAX_MULTI) return prev;
      return [...prev, id];
    });
  }

  if (!open) return null;

  const dialogTitle = multi && title === "Select user" ? "Select users" : title;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
      role="presentation"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={panelRef}
        className="flex max-h-[70vh] w-full max-w-lg flex-col rounded-2xl border border-white/10 bg-surface-900 p-5 shadow-2xl outline-none"
        onMouseDown={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="user-picker-title"
        tabIndex={-1}
      >
        <div className="mb-4 flex items-center justify-between gap-3">
          <h3 id="user-picker-title" className="text-lg font-semibold text-white">
            {dialogTitle}
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="text-surface-400 hover:text-white transition-colors p-1 rounded-lg hover:bg-white/5"
            aria-label="Close"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {multi && (
          <p className="text-xs text-surface-500 mb-2">
            Select up to {MAX_MULTI} users. Totals combine everyone selected.
          </p>
        )}

        <label htmlFor={searchId} className="sr-only">
          Search users by email, id, or role
        </label>
        <input
          id={searchId}
          ref={inputRef}
          className={inputClass}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Search by email, id, or role…"
          autoComplete="off"
        />

        <div className="mt-3 min-h-0 flex-1 overflow-y-auto rounded-xl border border-white/5">
          {results.length === 0 && (
            <div className="px-4 py-8 text-center text-sm text-surface-500">No matching users.</div>
          )}
          <ul className="divide-y divide-white/5 p-1">
            {results.map((u) => {
              const activeSingle = !multi && u.id === props.selectedUserId;
              const checkedMulti = multi && draftIds.includes(u.id);
              return (
                <li key={u.id}>
                  <button
                    type="button"
                    onClick={() => {
                      if (multi) {
                        toggleDraft(u.id);
                      } else {
                        props.onSelect(u.id);
                        onClose();
                      }
                    }}
                    className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm transition-colors ${
                      activeSingle || checkedMulti ? "bg-aurora-600/20 text-aurora-300" : "text-white hover:bg-white/5"
                    }`}
                  >
                    {multi && (
                      <span
                        className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border ${
                          checkedMulti ? "border-aurora-400 bg-aurora-500/30" : "border-white/20"
                        }`}
                        aria-hidden
                      >
                        {checkedMulti && (
                          <svg className="h-3 w-3 text-aurora-200" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                          </svg>
                        )}
                      </span>
                    )}
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-aurora-500 to-aurora-700 text-xs font-bold text-white">
                      {u.email[0]?.toUpperCase() ?? "?"}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium">{u.email}</p>
                      <p className="truncate text-xs text-surface-500">
                        {u.role}
                        {!u.enabled ? " · disabled" : ""}
                      </p>
                    </div>
                    {activeSingle && (
                      <span className="shrink-0 text-xs font-medium text-aurora-400">Current</span>
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
        </div>

        <div className="mt-4 flex justify-end gap-2 border-t border-white/10 pt-4">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg bg-surface-800 px-4 py-2 text-sm font-medium text-white hover:bg-surface-700 transition-colors"
          >
            Cancel
          </button>
          {multi && (
            <button
              type="button"
              onClick={() => {
                if (draftIds.length === 0) return;
                props.onConfirm(draftIds);
                onClose();
              }}
              disabled={draftIds.length === 0}
              className="rounded-lg bg-aurora-600 px-4 py-2 text-sm font-medium text-white hover:bg-aurora-500 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Done ({draftIds.length})
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

import { useEffect, useId, useRef } from "react";
import { useFocusTrap } from "../../hooks/useFocusTrap";

// Human: Blocking centered dialog for destructive confirmations — focus trapped; labels configurable.
// Agent: PROPS title/message/onConfirm/onCancel/loading; RENDERS fixed overlay; confirm button red; useFocusTrap.
export default function ConfirmModal({
  title,
  message,
  onConfirm,
  onCancel,
  loading,
  confirmLabel = "Delete",
}: {
  title: string;
  message: string;
  onConfirm: () => void;
  onCancel: () => void;
  loading?: boolean;
  confirmLabel?: string;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const messageId = useId();

  useFocusTrap(true, panelRef);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !loading) onCancel();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onCancel, loading]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
      role="presentation"
      onMouseDown={(e) => {
        if (!loading && e.target === e.currentTarget) onCancel();
      }}
    >
      <div
        ref={panelRef}
        className="admin-panel p-6 w-full max-w-sm shadow-2xl outline-none"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={messageId}
        tabIndex={-1}
      >
        <h3 id={titleId} className="text-lg font-semibold text-white mb-2">
          {title}
        </h3>
        <p id={messageId} className="text-sm text-surface-400 mb-6">
          {message}
        </p>
        <div className="flex gap-3 justify-end">
          <button
            type="button"
            onClick={onCancel}
            disabled={loading}
            className="px-4 py-2 bg-surface-800 hover:bg-surface-700 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-aurora-500/50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={loading}
            className="px-4 py-2 bg-red-600 hover:bg-red-500 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-red-500/50"
          >
            {loading ? "Deleting..." : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

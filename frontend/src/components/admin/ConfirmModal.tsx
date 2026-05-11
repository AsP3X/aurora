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
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-surface-900 border border-white/10 rounded-2xl p-6 w-full max-w-sm shadow-2xl">
        <h3 className="text-lg font-semibold text-white mb-2">{title}</h3>
        <p className="text-sm text-surface-400 mb-6">{message}</p>
        <div className="flex gap-3 justify-end">
          <button
            onClick={onCancel}
            disabled={loading}
            className="px-4 py-2 bg-surface-800 hover:bg-surface-700 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={loading}
            className="px-4 py-2 bg-red-600 hover:bg-red-500 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50"
          >
            {loading ? "Deleting..." : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

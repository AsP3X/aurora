// Human: Floating toast for transient success/error feedback — used after first-run setup on the library page.
// Agent: FIXED overlay; PROPS message variant onDismiss; AUTO dismiss 8s; role=status|alert by variant.
import { useEffect } from "react";

export type ToastVariant = "success" | "error";

interface ToastProps {
  message: string;
  variant: ToastVariant;
  onDismiss: () => void;
}

const AUTO_DISMISS_MS = 8_000;

// Human: Top-center toast with variant styling; dismiss via button or timeout.
// Agent: RENDERS fixed z-50 banner; CALLS onDismiss after AUTO_DISMISS_MS; ESC not handled (button only).
export default function Toast({ message, variant, onDismiss }: ToastProps) {
  // Human: Auto-hide long enough to read the message without requiring a click.
  // Agent: EFFECT mount; TIMER AUTO_DISMISS_MS; CLEANUP clearTimeout; CALLS onDismiss.
  useEffect(() => {
    const timer = window.setTimeout(onDismiss, AUTO_DISMISS_MS);
    return () => window.clearTimeout(timer);
  }, [onDismiss]);

  const isSuccess = variant === "success";

  return (
    <div
      className="pointer-events-none fixed inset-x-0 top-4 z-50 flex justify-center px-4"
      role={isSuccess ? "status" : "alert"}
      aria-live="polite"
    >
      <div
        className={`pointer-events-auto flex max-w-lg items-start gap-3 rounded-xl border px-4 py-3 text-sm shadow-2xl backdrop-blur-sm ${
          isSuccess
            ? "border-emerald-500/30 bg-emerald-500/15 text-emerald-100"
            : "border-red-500/30 bg-red-500/15 text-red-100"
        }`}
      >
        <svg
          className={`mt-0.5 h-5 w-5 shrink-0 ${isSuccess ? "text-emerald-400" : "text-red-400"}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
          aria-hidden
        >
          {isSuccess ? (
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
          ) : (
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
            />
          )}
        </svg>
        <p className="min-w-0 flex-1">{message}</p>
        <button
          type="button"
          onClick={onDismiss}
          className={`shrink-0 rounded-lg p-1 transition-colors focus:outline-none focus:ring-2 ${
            isSuccess
              ? "text-emerald-200 hover:text-white focus:ring-emerald-500/50"
              : "text-red-200 hover:text-white focus:ring-red-500/50"
          }`}
          aria-label="Dismiss notification"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
    </div>
  );
}

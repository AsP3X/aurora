import { useEffect, useId, useRef, type ReactNode } from "react";
import { useFocusTrap } from "../../hooks/useFocusTrap";

// Human: Modal overlay with flat dialog card — Escape and backdrop close; focus trapped inside the panel.
// Agent: PROPS open onClose title children className; ESCAPE closes; useFocusTrap on panelRef; admin-panel body.
export default function GlassDialog({
  open,
  onClose,
  title,
  children,
  className = "",
  size = "md",
  zIndexClass = "z-50",
}: {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
  className?: string;
  size?: "sm" | "md" | "lg";
  /** Human: Raise above another modal (e.g. permissions opened from edit). */
  /** Agent: OPTIONAL tailwind z-*; DEFAULT z-50 overlay stacking. */
  zIndexClass?: string;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const titleId = useId();

  useFocusTrap(open, panelRef);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  const maxW =
    size === "sm" ? "max-w-sm" : size === "lg" ? "max-w-2xl" : "max-w-md";

  return (
    <div
      className={`fixed inset-0 ${zIndexClass} flex items-center justify-center bg-black/60 backdrop-blur-sm p-4`}
      role="presentation"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? titleId : undefined}
        tabIndex={-1}
        className={`admin-panel p-6 w-full ${maxW} shadow-2xl outline-none ${className}`}
      >
        {title && (
          <h3 id={titleId} className="text-lg font-semibold text-white mb-4">
            {title}
          </h3>
        )}
        {children}
      </div>
    </div>
  );
}

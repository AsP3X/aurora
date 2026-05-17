// Human: Generic right-click style menu — fixed position, closes on outside click, Escape, or any scroll.
// Agent: PROPS items+x+y; EFFECT registers mousedown/keydown/capture scroll; CLAMPS to viewport using estimated size.
import { useEffect, useRef } from "react";

export interface ContextMenuItem {
  label: string;
  icon?: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  danger?: boolean;
}

interface ContextMenuProps {
  items: ContextMenuItem[];
  x: number;
  y: number;
  onClose: () => void;
}

export default function ContextMenu({ items, x, y, onClose }: ContextMenuProps) {
  const ref = useRef<HTMLDivElement>(null);

  // Human: Treat scroll as “cancel” so the menu does not float detached from the row that opened it.
  // Agent: DOCUMENT mousedown (outside) + key Escape + capture-phase window scroll all invoke onClose.
  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        onClose();
      }
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    function onScroll() {
      onClose();
    }

    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    window.addEventListener("scroll", onScroll, true);

    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("scroll", onScroll, true);
    };
  }, [onClose]);

  // Human: Rough size estimate avoids menus spawning clipped off-screen near viewport edges.
  // Agent: COMPUTES left/top via Math.min against innerWidth/innerHeight.
  const menuWidth = 180;
  const menuHeight = items.length * 36 + 8;
  const left = Math.min(x, window.innerWidth - menuWidth - 8);
  const top = Math.min(y, window.innerHeight - menuHeight - 8);

  return (
    <div
      ref={ref}
      style={{ left, top }}
      className="fixed z-[100] w-44 bg-surface-900 border border-white/10 rounded-xl shadow-xl py-1 overflow-hidden"
    >
      {items.map((item, i) => (
        <button
          key={i}
          onClick={() => {
            if (!item.disabled) {
              item.onClick();
              onClose();
            }
          }}
          disabled={item.disabled}
          className={`w-full text-left flex items-center gap-2 px-3 py-2 text-sm transition-colors ${
            item.danger
              ? "text-red-400 hover:text-red-300 hover:bg-red-500/10"
              : "text-surface-300 hover:text-white hover:bg-white/5"
          } ${item.disabled ? "opacity-50 cursor-not-allowed" : ""}`}
        >
          {item.icon && <span className="w-4 h-4 shrink-0">{item.icon}</span>}
          <span>{item.label}</span>
        </button>
      ))}
    </div>
  );
}

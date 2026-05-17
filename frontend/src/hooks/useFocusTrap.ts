import { useEffect, useRef, type RefObject } from "react";
import { focusFirstFocusable, getFocusableElements } from "../utils/focusable";

// Human: Keep Tab/Shift+Tab inside an open overlay and restore focus to the trigger when it closes.
// Agent: PROPS active+containerRef+initialFocus; TAB cycles first/last; CLEANUP restores document.activeElement snapshot.

export function useFocusTrap(
  active: boolean,
  containerRef: RefObject<HTMLElement | null>,
  options?: { initialFocus?: boolean },
) {
  const previousFocusRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!active) return;

    previousFocusRef.current = document.activeElement as HTMLElement | null;
    const container = containerRef.current;
    if (!container) return;

    if (options?.initialFocus !== false) {
      focusFirstFocusable(container);
    }

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "Tab") return;
      const focusable = getFocusableElements(container);
      if (focusable.length === 0) {
        e.preventDefault();
        container.focus();
        return;
      }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const activeEl = document.activeElement;
      if (e.shiftKey) {
        if (activeEl === first || !container.contains(activeEl)) {
          e.preventDefault();
          last.focus();
        }
      } else if (activeEl === last || !container.contains(activeEl)) {
        e.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      previousFocusRef.current?.focus?.();
    };
  }, [active, containerRef, options?.initialFocus]);
}

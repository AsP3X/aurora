// Human: Helpers to find tabbable elements inside a container for modal focus traps.
// Agent: EXPORTS FOCUSABLE_SELECTOR; getFocusableElements filters disabled/hidden; focusFirstFocusable prefers inputs.

export const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

/** Human: Return visible, enabled focusable descendants of `root`. */
/** Agent: QUERYSELECTOR FOCUSABLE_SELECTOR; FILTER tabIndex and layout visibility. */
export function getFocusableElements(root: HTMLElement): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(
    (el) =>
      !el.hasAttribute("disabled") &&
      el.tabIndex !== -1 &&
      (el.offsetParent !== null || el.getClientRects().length > 0),
  );
}

/** Human: Move focus to the first text field when opening a dialog, otherwise the first control. */
/** Agent: PREFERS INPUT/TEXTAREA; FALLBACK first focusable; ELSE root.focus. */
export function focusFirstFocusable(root: HTMLElement) {
  const focusable = getFocusableElements(root);
  const preferred =
    focusable.find((el) => el.tagName === "INPUT" || el.tagName === "TEXTAREA") ??
    focusable[0];
  (preferred ?? root).focus();
}

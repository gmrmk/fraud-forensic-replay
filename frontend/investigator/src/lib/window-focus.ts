/**
 * Keyboard focus for popouts: the control that opened a window gets focus back when the
 * window closes, and a newly opened window takes focus once. Module state, not store state:
 * DOM elements are not session data, and nothing else reads this.
 *
 * ponytail: entries are released only by the window's close control (returnFocus) or, for the
 * focus request, by mount or an occluded skip. A popout removed another way (unpinned, then
 * evicted by the next glance or trace) keeps one opener reference until reload; a note window
 * closed by its x while clean keeps its `noteOpeners` entry the same way. Upgrade path:
 * prune ids that leave usePivotStore's windows from a store subscription.
 */
const openers = new Map<string, HTMLElement>();
// A note window's opener, kept apart: the frame's x consumes `openers` (returnFocus) even when a
// dirty note keeps its window open to ask, and the window's own closes (a new draft's first Save,
// Discard, the question's Save, Delete) come after that.
const noteOpeners = new Map<string, HTMLElement>();
const pending = new Set<string>();

/** A popout opened from a control, or from none (a globe dot): with no opener its close falls back to
 *  the front-most other window or the Inspector, and it still takes its first focus. */
export function popoutOpened(id: string, opener: HTMLElement | null): void {
  if (opener) openers.set(id, opener);
  pending.add(id);
}

/** A note window's opener: stored for its x (as popoutOpened) and kept for the window's own closes.
 *  Files NO focus request: the editor keeps the caret. A null opener stores nothing. */
export function noteOpenedFrom(id: string, opener: HTMLElement | null): void {
  if (!opener) return;
  openers.set(id, opener);
  noteOpeners.set(id, opener);
}

/** After a note window's own close: focus the kept opener when it is still in the page, else the
 *  fallback; then forget it. A window with no kept opener (or one already returned) moves nothing. */
export function returnNoteFocus(id: string): void {
  const el = noteOpeners.get(id);
  if (!el) return;
  noteOpeners.delete(id);
  openers.delete(id);
  (el.isConnected ? el : fallback(id))?.focus();
}

/** True once per popoutOpened call, so a window that remounts (globe occlusion) or is
 *  raised by a click does not pull focus again. */
export function takeInitialFocus(id: string): boolean {
  return pending.delete(id);
}

/** Where focus goes when the opener has left the page (the inspector moved to another entity):
 *  the front-most other window, else the Inspector panel, never <body>. */
function fallback(leavingId: string): HTMLElement | null {
  let front: HTMLElement | null = null;
  for (const f of document.querySelectorAll<HTMLElement>("[data-window-frame]")) {
    if (f.dataset.windowFrame === leavingId) continue;
    if (!front || Number(f.style.zIndex) > Number(front.style.zIndex)) front = f;
  }
  return front ?? document.querySelector<HTMLElement>('aside[aria-label="Inspector"]');
}

function target(id: string): HTMLElement | null {
  const el = openers.get(id);
  return el?.isConnected ? el : fallback(id);
}

/** The window's close control: focus back to its opener (or the fallback), and forget it. */
export function returnFocus(id: string): void {
  const el = target(id);
  openers.delete(id);
  pending.delete(id);
  el?.focus();
}

/** A focused window left the page without its close control (its pin rotated behind the
 *  globe): hand focus on, and keep the opener, since the window comes back with its pin. */
export function focusAfterHidden(id: string): void {
  target(id)?.focus();
}

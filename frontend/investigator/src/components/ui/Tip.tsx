/**
 * One tooltip for the whole screen. Any element says what it is by carrying `data-tip` (lines
 * joined by a newline: the first line is what the thing is, the rest are its own values) and, for
 * a data mark, `data-tip-accent` (its colour, so the tooltip shows which colour means what). One
 * set of listeners on the document finds the element under the pointer or the focus, so no element
 * needs a handler of its own. The globe has no elements to carry attributes, so it calls
 * `showTipAt` with the pointer's place.
 *
 * A tooltip says what a thing is and its values. It never says what to conclude.
 *
 * The layer has one key handler, for Escape and for nothing else:
 * Escape dismisses an open tooltip with the pointer and the focus unmoved (WCAG 1.4.13,
 * dismissible). The tooltip then stays dismissed while the pointer or the focus is still on its
 * trigger, and comes back once both have left it and one returns. The handler takes no other key
 * and does not hold the key back, so a menu that is open keeps its own Escape and closes with the
 * tooltip, as it did before. A press, a wheel turn, or the pointer or focus leaving still takes a
 * tooltip away too.
 *
 * The hover and warm-up delays are timers started by a hover. They hold no playhead value and the
 * playhead reads none of them.
 */
import { useEffect, useLayoutEffect, useRef } from "react";
import { create } from "zustand";
import { Panel } from "./Panel";
import { chromeToWindowNow } from "../../store/text-size";

interface TipState {
  lines: readonly string[];
  accent: string | null;
  /** A pile names a record on each line and may be wider. */
  wide: boolean;
  /** True for a tip that came from an element: the layer then takes the pointer, so the pointer
   *  can move onto it and read it. A tip placed by `showTipAt` leaves the pointer to the map. */
  hoverable: boolean;
  /** The box the tooltip sits beside, in viewport px; null when nothing is shown. */
  box: { left: number; top: number; right: number; bottom: number } | null;
  /** Set for the tip of a control inside an element that carries `data-tip-beside` ("left" or "right", a
   *  menu's own): the host's left and right edges and the side. The tip then sits beside that host, level
   *  with the control, and its first line wraps. Null for every other tip. */
  beside: { left: number; right: number; side: "left" | "right" } | null;
}

const useTip = create<TipState>(() => ({ lines: [], accent: null, wide: false, hoverable: false, box: null, beside: null }));

/** The attributes that give an element its tooltip. Empty when there is nothing to say. */
// eslint-disable-next-line react-refresh/only-export-components -- the helper sits with the one layer that reads its attributes; item A2's write root holds no second file for it
export function tip(
  lines: readonly (string | null | undefined | false)[],
  accent?: string,
): Record<string, string> {
  const kept = lines.filter((l): l is string => typeof l === "string" && l.trim().length > 0);
  if (kept.length === 0) return {};
  return {
    "data-tip": kept.join("\n"),
    "aria-description": kept.join(". "),
    ...(accent ? { "data-tip-accent": accent } : {}),
  };
}

/** True from an Escape on a tooltip the map placed until the map hides it with null. The map calls
 *  `showTipAt` on every pointer move over a mark, so without this the next move would undo the
 *  dismissal. Limit: moving straight from one mark to the next, with no empty place between, stays
 *  dismissed until the map hides a tooltip once. */
let mapDismissed = false;

/** For a thing that is not an element (a mark on the map): show beside a point, or hide with null. */
// eslint-disable-next-line react-refresh/only-export-components -- writes the store the layer below reads; same reason as `tip`
export function showTipAt(
  point: { x: number; y: number } | null,
  lines: readonly string[] = [],
  accent: string | null = null,
): void {
  if (!point || lines.length === 0) {
    mapDismissed = false;
    if (useTip.getState().box) useTip.setState({ box: null });
    return;
  }
  if (mapDismissed) return;
  useTip.setState({
    lines,
    accent,
    wide: false,
    hoverable: false,
    box: { left: point.x - 6, right: point.x + 6, top: point.y - 6, bottom: point.y + 6 },
    beside: null,
  });
}

/** Set by the mounted layer: show the words of `el` now. Null while no layer is mounted. */
let showNow: ((el: Element) => void) | null = null;

/** Show an element's tooltip at once, reading its `data-tip` now. The layer reads a trigger's words only
 *  when it shows one and hides on a press, so words changed under a pressed control are not seen until
 *  this is called. Used by the tag menu after a refused press and nowhere else; does nothing while no layer
 *  is mounted. */
// eslint-disable-next-line react-refresh/only-export-components -- calls into the layer below; same reason as `tip`
export function showTipOn(el: Element): void {
  showNow?.(el);
}

/** Up to this many nodes in a pile are named one by one; more are counted by kind. */
const PILE_LIST_MAX = 4;
/** Two nodes whose centres are this close, both ways, lie on each other (a node is 12 px). */
const PILE_REACH_PX = 5;
/** The first line of a pile's tooltip. */
const pileTitle = (n: number): string => `${n} marks at this place`;

interface PileMember {
  kind: string;
  brief: string;
  accent: string | null;
  x: number;
}

/** The nodes that lie on this one, itself included, left to right. They are its siblings: a
 *  track or a row holds its nodes in one element. */
function pileOf(el: Element, r: DOMRect): PileMember[] {
  const cx = (r.left + r.right) / 2;
  const cy = (r.top + r.bottom) / 2;
  // The rects are window pixels and the reach is the chrome's (a node is 12 chrome px wide).
  const reach = chromeToWindowNow(PILE_REACH_PX);
  const out: PileMember[] = [];
  for (const other of el.parentElement?.children ?? []) {
    if (!other.hasAttribute("data-tip-node")) continue;
    const o = other.getBoundingClientRect();
    const x = (o.left + o.right) / 2;
    if (Math.abs(x - cx) > reach || Math.abs((o.top + o.bottom) / 2 - cy) > reach) continue;
    out.push({
      kind: (other.getAttribute("data-tip") ?? "").split("\n")[0],
      brief: other.getAttribute("data-tip-node") ?? "",
      accent: other.getAttribute("data-tip-accent"),
      x,
    });
  }
  return out.sort((a, b) => a.x - b.x);
}

const FIRST_DELAY_MS = 280;
const NEXT_DELAY_MS = 60;
/** How long after a tooltip goes that the next one is still the quick kind. */
const WARM_MS = 500;
/** How long a tooltip waits, after the pointer leaves its trigger for bare page, for the pointer
 *  to land on the tooltip. It covers the 8 px gap between the two. */
const HIDE_GRACE_MS = 150;

/** True when the keyboard is what moved focus here. A browser without the pseudo-class answers
 *  as if it were: a tooltip on every focus is the safer error than none. */
function focusIsVisible(target: Element): boolean {
  try {
    return target.matches(":focus-visible");
  } catch {
    return true;
  }
}

export function TipLayer() {
  const { lines, accent, wide, hoverable, box, beside } = useTip();
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    let current: Element | null = null;
    let showTimer: number | null = null;
    let hideTimer: number | null = null;
    let warmTimer: number | null = null;
    let warm = false;
    // The element whose tooltip is on screen, and the one that holds the focus that showed a
    // tooltip. When they are the same element the tooltip is the focus's: it stays while that
    // element keeps focus, whatever the pointer does over bare page or out of the window (WCAG
    // 1.4.13, persistent). It goes when focus leaves, on a press or a wheel turn, or when the
    // pointer shows another tooltip in its place. The hold is checked, not trusted: the focused
    // element must still be in the document and still hold the focus (or hold it through a child,
    // since `focused` is the nearest ancestor that carries a tooltip), so an element that went
    // without a focusout does not keep its tooltip. A tooltip the map placed with `showTipAt` is
    // not a focus's: the store's `hoverable` is false for it, and the pointer owns it.
    let shown: Element | null = null;
    let focused: Element | null = null;
    // Escape dismissed this trigger's tooltip. It stays dismissed while the pointer (`pointerOn`)
    // or the focus (`focusOn`) is still on the trigger, and is released once neither is: the
    // plain reading of "leaves and comes back", so with both on it both have to leave.
    let dismissed: Element | null = null;
    let pointerOn: Element | null = null;
    let focusOn: Element | null = null;
    const releaseDismissed = () => {
      if (dismissed && (!dismissed.isConnected || (pointerOn !== dismissed && focusOn !== dismissed))) {
        dismissed = null;
      }
    };
    const heldByFocus = () =>
      focused !== null &&
      shown === focused &&
      useTip.getState().box !== null &&
      useTip.getState().hoverable &&
      focused.isConnected &&
      focused.contains(document.activeElement);

    const clearShow = () => {
      if (showTimer !== null) window.clearTimeout(showTimer);
      showTimer = null;
    };
    const clearHide = () => {
      if (hideTimer !== null) window.clearTimeout(hideTimer);
      hideTimer = null;
    };
    const hide = () => {
      clearShow();
      clearHide();
      if (current) {
        // The next tooltip, soon after this one, comes quickly.
        warm = true;
        if (warmTimer !== null) window.clearTimeout(warmTimer);
        warmTimer = window.setTimeout(() => {
          warm = false;
          warmTimer = null;
        }, WARM_MS);
      }
      current = null;
      shown = null;
      focused = null;
      if (useTip.getState().box) useTip.setState({ box: null });
    };
    const show = (el: Element) => {
      const text = el.getAttribute("data-tip");
      if (!text) return;
      shown = el;
      const r = el.getBoundingClientRect();
      const box = { left: r.left, top: r.top, right: r.right, bottom: r.bottom };
      // A node that lies on other nodes: the tooltip says how many are there and names each, or
      // counts them by kind when there are many, so a node under another is not lost to hover.
      const pile = el.hasAttribute("data-tip-node") ? pileOf(el, r) : [];
      if (pile.length > 1) {
        const kinds = new Map<string, number>();
        for (const p of pile) kinds.set(p.kind, (kinds.get(p.kind) ?? 0) + 1);
        const named =
          pile.length <= PILE_LIST_MAX
            ? pile.map((p) => `${p.kind}: ${p.brief}`)
            : [...kinds].map(([kind, n]) => `${kind} ${n}`);
        const colours = new Set(pile.map((p) => p.accent));
        useTip.setState({
          lines: [pileTitle(pile.length), ...named],
          accent: colours.size === 1 ? pile[0].accent : null,
          wide: true,
          hoverable: true,
          box,
          beside: null,
        });
        return;
      }
      // A control in a menu: the tip sits beside the menu, not over its other rows.
      const host = el.closest("[data-tip-beside]");
      const side = host?.getAttribute("data-tip-beside");
      let beside: TipState["beside"] = null;
      if (host && (side === "left" || side === "right")) {
        const h = host.getBoundingClientRect();
        beside = { left: h.left, right: h.right, side };
      }
      useTip.setState({
        lines: text.split("\n"),
        accent: el.getAttribute("data-tip-accent"),
        wide: false,
        hoverable: true,
        box,
        beside,
      });
    };
    showNow = (el) => {
      clearShow();
      clearHide();
      current = el;
      show(el);
      if (el.contains(document.activeElement)) focused = el;
    };

    const over = (e: Event) => {
      // A touch has no hover: on a phone the words are reached by focus.
      if ((e as PointerEvent).pointerType === "touch") return;
      const target = e.target instanceof Element ? e.target : null;
      // The pointer reached the tooltip itself: it stays.
      if (target?.closest("[data-tip-layer]")) {
        clearHide();
        return;
      }
      const el = target?.closest("[data-tip]") ?? null;
      pointerOn = el;
      releaseDismissed();
      // Escape dismissed this one and the pointer has not left it: nothing comes.
      if (el && el === dismissed) {
        clearShow();
        clearHide();
        return;
      }
      if (el === current) {
        clearHide();
        return;
      }
      if (!el) {
        // Over bare page. A tooltip that came by focus stays with its focus: drop a pending
        // tooltip of the pointer's and go back to the focused element.
        if (heldByFocus()) {
          clearShow();
          clearHide();
          current = focused;
          return;
        }
        // A tooltip the map placed is the map's to hide; one of an element's
        // waits a moment for the pointer to cross onto it, and one not yet shown is dropped.
        if (current) {
          if (useTip.getState().box && hideTimer === null) hideTimer = window.setTimeout(hide, HIDE_GRACE_MS);
          else if (!useTip.getState().box) hide();
        }
        return;
      }
      clearShow();
      clearHide();
      current = el;
      const quick = warm || useTip.getState().box !== null;
      showTimer = window.setTimeout(() => {
        if (current === el) show(el);
      }, quick ? NEXT_DELAY_MS : FIRST_DELAY_MS);
    };
    const focus = (e: Event) => {
      const el = e.target instanceof Element ? e.target.closest("[data-tip]") : null;
      focusOn = el;
      releaseDismissed();
      if (!el || !(e.target instanceof Element) || !focusIsVisible(e.target)) return;
      if (el === dismissed) return;
      clearShow();
      clearHide();
      current = el;
      show(el);
      focused = el;
    };
    // The pointer left the window altogether. A tooltip that is the focus's stays.
    const out = (e: Event) => {
      if ((e as PointerEvent).relatedTarget) return;
      pointerOn = null;
      releaseDismissed();
      if (!heldByFocus()) hide();
    };
    // Focus left an element. Where it went (the event's related target) decides whether the
    // trigger Escape dismissed is still under the focus.
    const blur = (e: Event) => {
      const next = (e as FocusEvent).relatedTarget;
      focusOn = next instanceof Element ? next.closest("[data-tip]") : null;
      releaseDismissed();
      hide();
    };
    // Escape, and no other key: an open tooltip goes. The key is not held back, so a menu that is
    // open hears it too and closes by its own handler. A tooltip still waiting on its delay is not
    // open, so Escape leaves it to come.
    const key = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      const open = useTip.getState();
      if (!open.box) return;
      if (open.hoverable) dismissed = shown;
      else mapDismissed = true;
      hide();
    };

    document.addEventListener("pointerover", over);
    document.addEventListener("pointerout", out);
    document.addEventListener("focusin", focus);
    document.addEventListener("focusout", blur);
    document.addEventListener("pointerdown", hide);
    document.addEventListener("wheel", hide, { passive: true });
    document.addEventListener("keydown", key);
    return () => {
      clearShow();
      clearHide();
      if (warmTimer !== null) window.clearTimeout(warmTimer);
      mapDismissed = false;
      showNow = null;
      document.removeEventListener("pointerover", over);
      document.removeEventListener("pointerout", out);
      document.removeEventListener("focusin", focus);
      document.removeEventListener("focusout", blur);
      document.removeEventListener("keydown", key);
      document.removeEventListener("pointerdown", hide);
      document.removeEventListener("wheel", hide);
    };
  }, []);

  // Above the thing when there is room, else under it; never off the screen's sides. The box is
  // placed by hand before paint so that there is no frame at the wrong place.
  useLayoutEffect(() => {
    const el = ref.current;
    if (!box || !el) return;
    const w = el.offsetWidth;
    const h = el.offsetHeight;
    if (beside) {
      // Beside a menu: the host's edge plus 8 px on its side, else the other side; level with the control.
      const fits = (x: number) => x >= 8 && x + w <= window.innerWidth - 8;
      const first = beside.side === "left" ? beside.left - w - 8 : beside.right + 8;
      const other = beside.side === "left" ? beside.right + 8 : beside.left - w - 8;
      const x = fits(first) ? first : other;
      const middle = (box.top + box.bottom) / 2;
      el.style.left = `${Math.max(8, Math.min(window.innerWidth - w - 8, x))}px`;
      el.style.top = `${Math.max(8, Math.min(window.innerHeight - h - 8, middle - h / 2))}px`;
      el.style.visibility = "visible";
      return;
    }
    const centre = (box.left + box.right) / 2;
    const left = Math.max(8, Math.min(window.innerWidth - w - 8, centre - w / 2));
    const above = box.top - h - 8;
    el.style.left = `${left}px`;
    el.style.top = `${above >= 8 ? above : box.bottom + 8}px`;
    el.style.visibility = "visible";
  }, [box, lines, beside]);

  if (!box) return null;
  return (
    <div
      ref={ref}
      role="tooltip"
      data-tip-layer
      style={{
        position: "fixed",
        zIndex: 2000,
        pointerEvents: hoverable ? "auto" : "none",
        left: 0,
        top: 0,
        visibility: "hidden",
      }}
    >
      {/* The shell is placed by hand in window pixels (above), so it is not zoomed; the box is,
          and its width cap is in the chrome's own pixels. */}
      <div className="chrome-zoom" style={{ maxWidth: beside ? 300 : wide ? 470 : 340 }}>
      <Panel material="glass" radius="sm" elevation="raised">
        <div style={{ padding: "6px 9px" }}>
          <div
            data-tip-line
            className={`flex items-center gap-1.5 ${beside ? "whitespace-normal" : "whitespace-nowrap"} font-mono text-[8.5px] font-medium uppercase tracking-[0.22em] text-text`}
          >
            {accent ? (
              <span
                aria-hidden="true"
                className="inline-block shrink-0 rounded-full"
                style={{ width: 6, height: 6, background: accent }}
              />
            ) : null}
            <span>{lines[0]}</span>
          </div>
          {lines.slice(1).map((line, i) => (
            <div
              key={i}
              data-tip-line
              className={`font-mono text-[10px] ${i === 0 ? "text-text" : "text-muted"}`}
              style={{ marginTop: 2, lineHeight: "14px" }}
            >
              {line}
            </div>
          ))}
        </div>
      </Panel>
      </div>
    </div>
  );
}

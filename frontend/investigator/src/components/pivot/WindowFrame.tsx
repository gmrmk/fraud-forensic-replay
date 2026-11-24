import {
  useEffect,
  useLayoutEffect,
  useRef,
  useCallback,
  type ReactNode,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { usePivotStore } from "../../store/pivot";
import { useTextSize } from "../../store/text-size";
import { useTheme } from "../../store/theme";
import { PIN_CONTRAST, TITLE_CONTRAST, windowInk } from "../../lib/window-ink";
import { windowToChrome } from "../../lib/text-size";
import { COLLAPSED_BAR_HEIGHT } from "../../lib/window-dims";
import { focusAfterHidden, returnFocus, takeInitialFocus } from "../../lib/window-focus";

/** Body height floor and the gap left under a window's bottom edge (px). */
const BODY_MIN_HEIGHT = 96;
const BODY_BOTTOM_MARGIN = 12;

interface Props {
  id: string;
  title: string;
  /** Current on-screen position (screen anchor, or the projected node
   *  position + tether offset computed by PivotWindowsLayer). */
  anchorScreen: { x: number; y: number };
  z: number;
  /** Kind accent hex (entity-palette). Drives spine, title, underline,
   *  dog-ear. */
  accent: string;
  pinned: boolean;
  collapsed: boolean;
  flagged: boolean;
  /** Entity is ahead of the playhead: the window persists but reads as
   *  not-yet-happened. Applied HERE (the positioned, z-indexed element),
   *  never on an unpositioned wrapper - opacity<1 creates a stacking
   *  context, and on a wrapper that traps the window's z and defeats
   *  bringToFront for dimmed windows (Task 6 review I1). */
  dimmed?: boolean;
  /** False for geography-less entities - the flag control does not render. */
  canFlag: boolean;
  onToggleFlag?: () => void;
  /** Flagged-window drags adjust the tether offset (layer computes);
   *  screen drags go straight to the store. */
  onDragTo?: (x: number, y: number) => void;
  headerLeading?: ReactNode;
  /** Popouts: 300px max width (a section's longest field row needs it). */
  wide?: boolean;
  /** A fixed width in px, in place of the 260 / 300 maximum. A fixed width also reserves the body's
   *  scrollbar gutter, so the text width does not change when the body starts to scroll. The gutter
   *  measures 10px in Chromium (`scrollbar-width: thin` on every element wins over the 8px webkit
   *  rule), so the body's right padding is 1px: 13 + 296 + 1 + 10 = 320, which keeps the text 11px
   *  clear of the edge, as the 11px padding does for a frame without a width. */
  width?: number;
  /** Makes every rounded part of the frame square: the frame, the chrome, both clip insets and
   *  the dog-ear. The title bar's buttons keep their small hover squares. */
  square?: boolean;
  /** A cue at the body's lower edge while the body can scroll further down (the `.foot-cue` rule of
   *  index.css), and more room under the last row. Off by default: the frame is every window's. */
  footCue?: boolean;
  /** A record's window: the pin button is the RECORD's pin. When given, a press calls this in place of
   *  the window store's `togglePinned`, and the button is not disabled by `flagged`. Without it the
   *  frame is every other window's. */
  onTogglePin?: () => void;
  /** The pin button's name and tooltip, from the caller's own words (used with `onTogglePin`). */
  pinWords?: { name: string; tip: string };
  /** The colour of the title and of the lit pin, when the caller has its own. Without it the frame
   *  fits the accent to the header itself (`windowInk`: the title as a text, the lit pin and the lit
   *  flag as a control's mark), so a pale kind colour stays visible in the light theme. The spine,
   *  the line under the header and the dog-ear keep the raw accent. */
  titleColor?: string;
  pinColor?: string;
  children: ReactNode;
}

/** The one window chrome for the Evidence Workspace (ratified Variant D):
 *  terminal-tab header + kind-accent left spine + dog-ear when pinned +
 *  collapse-to-bar. Drag via pointer capture on the header. NO Esc-close
 *  (owner law): close is the explicit × only.
 *
 *  Fold motion: clip-path inset transition on the inner chrome div
 *  (compositor-eligible), shadow as drop-shadow filter on the outer
 *  wrapper so it hugs the clipped silhouette. Body content fades. */
export function WindowFrame({
  id, title, anchorScreen, z, accent, pinned, collapsed, flagged, dimmed = false,
  canFlag, onToggleFlag, onDragTo, headerLeading, wide = false, width, square = false, footCue = false,
  onTogglePin, pinWords, titleColor, pinColor, children,
}: Props) {
  const radius = square ? 0 : 14;
  const rounded = square ? "" : "rounded-[14px]";
  const updatePosition = usePivotStore((s) => s.updatePosition);
  const bringToFront = usePivotStore((s) => s.bringToFront);
  const closeWindow = usePivotStore((s) => s.closeWindow);
  const togglePinned = usePivotStore((s) => s.togglePinned);
  const toggleCollapsed = usePivotStore((s) => s.toggleCollapsed);

  const textSize = useTextSize((s) => s.size);
  const theme = useTheme((s) => s.theme);
  const color = useTheme((s) => s.color);
  // The ink of the title (a text) and of a lit pin or flag (a control's mark), fitted to the header in
  // this theme. A caller's own colour wins; a value that is not #rrggbb passes through unchanged.
  const titleInk = titleColor ?? windowInk(accent, theme, color, TITLE_CONTRAST);
  const markInk = windowInk(accent, theme, color, PIN_CONTRAST);
  const frameRef = useRef<HTMLDivElement>(null);
  // A popout's opener asked for focus: take it once. Keyed on z too, so re-pressing the
  // pop-out control for an open window (which raises z) moves focus to it.
  useEffect(() => {
    if (takeInitialFocus(id)) frameRef.current?.focus();
  }, [id, z]);

  // A focused window that leaves the page without its close control (its pin rotated behind the
  // globe) hands focus on instead of dropping it to <body>. The layout cleanup runs while the node
  // is still attached; the check waits for the commit to finish, so StrictMode's rehearsal
  // unmount (the node stays attached) moves nothing.
  useLayoutEffect(() => {
    const node = frameRef.current;
    return () => {
      if (!node?.contains(document.activeElement)) return;
      queueMicrotask(() => {
        const dropped = !document.activeElement || document.activeElement === document.body;
        if (!node.isConnected && dropped) focusAfterHidden(id);
      });
    };
  }, [id]);

  // Drag origin: cursor position at pointerdown + the window's position at
  // pointerdown (from props - no DOM rect read; happy-dom-safe).
  const dragRef = useRef<{ startX: number; startY: number; winX: number; winY: number } | null>(null);

  const onHeaderPointerDown = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      const tgt = e.target as HTMLElement;
      if (tgt.closest("[data-no-drag]")) return;
      dragRef.current = {
        startX: e.clientX, startY: e.clientY,
        winX: anchorScreen.x, winY: anchorScreen.y,
      };
      e.currentTarget.setPointerCapture(e.pointerId);
    },
    [anchorScreen.x, anchorScreen.y]
  );

  const onHeaderPointerMove = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      if (!dragRef.current) return;
      const x = dragRef.current.winX + (e.clientX - dragRef.current.startX);
      const y = dragRef.current.winY + (e.clientY - dragRef.current.startY);
      if (onDragTo) onDragTo(x, y);
      else updatePosition(id, x, y);
    },
    [id, onDragTo, updatePosition]
  );

  const onHeaderPointerUp = useCallback((e: ReactPointerEvent<HTMLDivElement>) => {
    dragRef.current = null;
    e.currentTarget.releasePointerCapture(e.pointerId);
  }, []);

  return (
    <div
      // Non-modal by design: no focus trap (multiple windows coexist). A popout takes focus
      // once on open and hands it back to its opener on close (window-focus.ts); Esc-close
      // is forbidden by owner law.
      ref={frameRef}
      role="dialog"
      aria-label={title}
      tabIndex={-1}
      data-window-frame={id}
      className={`absolute ${rounded} pointer-events-auto win-enter focus:outline-none focus-visible:outline focus-visible:outline-1 focus-visible:outline-offset-2`}
      style={{
        outlineColor: accent,
        left: anchorScreen.x,
        top: anchorScreen.y,
        zIndex: z,
        opacity: dimmed ? 0.45 : 1,
        // Can't consume the multi-layer --elev-focal box-shadow token here
        // (filter operates on the rasterized layer, not box-shadow) - these
        // two drop-shadow values track that token's look by hand.
        filter:
          "drop-shadow(0 3px 8px rgba(0,0,0,0.5)) drop-shadow(0 24px 48px rgba(0,0,0,0.45))",
        transition: "opacity var(--dur-normal) var(--ease-out-expo)",
      }}
      // Control buttons stopPropagation intentionally, so tapping a control
      // on a back window acts without raising it to the front first.
      onPointerDown={() => bringToFront(id)}
    >
      <div
        className={`chrome-zoom relative overflow-hidden ${rounded} min-w-[196px] ${width ? "" : wide ? "max-w-[300px]" : "max-w-[260px]"} bg-[rgb(var(--panel-base))]`}
        style={{
          width,
          boxShadow: "inset 0 0 0 1px rgb(var(--edge-light) / 0.10)",
          clipPath: collapsed
            ? `inset(0 0 calc(100% - ${COLLAPSED_BAR_HEIGHT}px) 0 round ${radius}px)`
            : `inset(0 0 0 0 round ${radius}px)`,
          transition: "clip-path var(--dur-normal) var(--ease-out-expo)",
        }}
      >
        {/* kind-accent left spine (Variant D / Cartographer) */}
        <span aria-hidden className="absolute left-0 top-0 bottom-0 w-[3px]" style={{ background: accent }} />
        {/* dog-ear pinned indicator (Variant D / Cartographer) */}
        {pinned && (
          <span
            aria-hidden
            className={`absolute top-0 right-0 w-4 h-4 ${square ? "" : "rounded-tr-[14px]"}`}
            style={{ background: `linear-gradient(225deg, ${accent} 50%, transparent 50%)` }}
          />
        )}
        {/* terminal-tab header (Variant D / Ledger) */}
        <div
          data-window-header
          className="flex items-center gap-1.5 h-[34px] pl-[13px] pr-2 cursor-grab active:cursor-grabbing select-none bg-[rgb(var(--panel-floor)/0.85)]"
          style={{ borderBottom: collapsed ? "none" : `1px solid ${accent}` }}
          onPointerDown={onHeaderPointerDown}
          onPointerMove={onHeaderPointerMove}
          onPointerUp={onHeaderPointerUp}
          onPointerCancel={onHeaderPointerUp}
        >
          {headerLeading}
          <span
            className="font-mono text-[9px] tracking-[0.16em] uppercase truncate flex-1"
            style={{ color: titleInk }}
          >
            {title}
          </span>
          {canFlag && (
            <button
              type="button" data-no-drag
              onClick={(e) => { e.stopPropagation(); onToggleFlag?.(); }}
              className="w-6 h-6 rounded flex items-center justify-center hover:bg-text/5"
              style={{ color: flagged ? markInk : "var(--text-faint)" }}
              aria-label={flagged ? "Unflag" : "Flag to node"}
              title={flagged ? "Unflag" : "Flag to node"}
            >
              <svg aria-hidden viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4">
                <path d="M5 3h2v18H5zM8 4h11l-3.2 4L19 12H8z" />
              </svg>
            </button>
          )}
          <button
            type="button" data-no-drag
            onClick={(e) => { e.stopPropagation(); toggleCollapsed(id); }}
            className="w-6 h-6 rounded flex items-center justify-center text-[color:var(--text-faint)] hover:bg-text/5 hover:text-[color:var(--text-muted)]"
            aria-label={collapsed ? "Open the window" : "Fold the window"}
            title={collapsed ? "Open the window" : "Fold the window"}
          >
            {collapsed ? (
              // Folded: a right-pointing triangle (7 by 10 in the 16 px box). A diagonal, so no crisp-edges rule.
              <svg aria-hidden data-glyph="fold-open" viewBox="0 0 16 16" fill="currentColor" className="w-4 h-4">
                <path d="M5 3L12 8L5 13Z" />
              </svg>
            ) : (
              // Open: a bar, on whole pixels.
              <svg aria-hidden data-glyph="fold-bar" viewBox="0 0 16 16" fill="currentColor" shapeRendering="crispEdges" className="w-4 h-4">
                <rect x="2" y="7" width="12" height="2" />
              </svg>
            )}
          </button>
          <button
            type="button" data-no-drag
            disabled={onTogglePin ? false : flagged}
            onClick={(e) => { e.stopPropagation(); if (onTogglePin) onTogglePin(); else togglePinned(id); }}
            className="w-6 h-6 rounded flex items-center justify-center hover:bg-text/5 disabled:hover:bg-transparent"
            style={{ color: pinned ? (pinColor ?? markInk) : "var(--text-faint)" }}
            aria-label={pinWords ? pinWords.name : flagged ? "Pinned (unflag to release)" : pinned ? "Unpin" : "Pin the window. It stays open when the playhead moves."}
            title={pinWords ? pinWords.tip : flagged ? "Pinned (unflag to release)" : pinned ? "Unpin" : "Pin the window. It stays open when the playhead moves."}
          >
            <svg aria-hidden viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4">
              <path d="M14 3l7 7-3 1-4 4-1 6-2-2-4 4-1-1 4-4-2-2 6-1 4-4z" />
            </svg>
          </button>
          <button
            type="button" data-no-drag
            onClick={(e) => { e.stopPropagation(); closeWindow(id); returnFocus(id); }}
            className="w-6 h-6 rounded flex items-center justify-center text-[color:var(--text-faint)] hover:opacity-70"
            aria-label="Close window"
          >
            {/* No hover square: the button's corner reaches a few px into the dog-ear's corner, where nothing is painted. */}
            <svg aria-hidden data-glyph="close" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="square" className="w-4 h-4">
              <path d="M3 3L13 13M13 3L3 13" />
            </svg>
          </button>
        </div>
        {/* Body is the only scroller: capped so the window ends inside the
            viewport (top edge + header + margin off 100vh, floored so a window
            dragged low stays usable). Header chrome sits outside it. */}
        <div
          data-window-body
          data-foot-cue={footCue ? "" : undefined}
          className={`pl-[13px] ${width ? "pr-[1px] [scrollbar-gutter:stable]" : "pr-[11px]"} ${footCue ? "foot-cue pb-[18px]" : "pb-[11px]"} pt-0.5 overflow-y-auto`}
          style={{
            // The window's top is a window length; the cap lives in the zoomed box, so the top is
            // converted in, and the window's height (--vh-c) is already the chrome's.
            maxHeight: `max(${BODY_MIN_HEIGHT}px, calc(var(--vh-c) - ${windowToChrome(Math.max(0, anchorScreen.y), textSize) + COLLAPSED_BAR_HEIGHT + BODY_BOTTOM_MARGIN}px))`,
            opacity: collapsed ? 0 : 1,
            pointerEvents: collapsed ? "none" : "auto",
            transition: "opacity var(--dur-normal) var(--ease-out-expo)",
          }}
        >
          {children}
        </div>
      </div>
    </div>
  );
}

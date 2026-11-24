/**
 * useZoomGestures - buttery scroll / trackpad-pinch zoom for the timeline track.
 *
 * The store's zoomAt is instant (a snap). For a DAW-smooth feel this hook eases
 * the visible window toward a TARGET each animation frame, so a scroll glides into
 * the new zoom instead of jumping. Rapid ticks compound on the target (fast
 * scrolling zooms further) while the window catches up smoothly behind them.
 *
 * Attaches a NON-PASSIVE wheel listener so it can preventDefault the page scroll;
 * ctrl+wheel (trackpad pinch) is treated identically - the accessibility path for
 * a desktop-only tool. All window math + clamping is the store's zoomedWindow, so
 * the eased path and the instant zoomAt compute the identical target.
 */
import { useEffect, useRef } from "react";
import { usePlayhead, zoomedWindow } from "../store/playhead";
import { chromeToWindowNow } from "../store/text-size";

// Per-frame lerp toward the target. ~0.28 lands in ~13 frames (~220ms at 60fps):
// responsive enough to feel direct, slow enough to read as a glide. Tune by feel.
const EASE = 0.28;
// Snap to the target (and stop the loop) once within this fraction of its span,
// so the ease lands cleanly instead of crawling asymptotically.
const SNAP_EPS = 0.002;
// Per-tick zoom factor - gentle, because ticks compound on the target.
const ZOOM_IN = 0.88;
const ZOOM_OUT = 1.14;

/**
 * `inset` is the width in px of the strip at the left of the element that the plot does not
 * use (the open bar's name column). The anchor is then the pointer's place over the plot alone,
 * so it sits on the instant under the pointer. The caller passes it; the hook reads nothing
 * about it from the DOM. With no inset the zoom is as it was.
 */
export function useZoomGestures(
  trackRef: React.RefObject<HTMLDivElement | null>,
  inset = 0,
): void {
  const targetRef = useRef<{ min: number; max: number } | null>(null);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    const el = trackRef.current;
    if (!el) return;

    const step = () => {
      const t = targetRef.current;
      if (!t) {
        rafRef.current = null;
        return;
      }
      const s = usePlayhead.getState();
      const tSpan = t.max - t.min || 1;
      let nMin = s.windowMin + (t.min - s.windowMin) * EASE;
      let nMax = s.windowMax + (t.max - s.windowMax) * EASE;
      if (
        Math.abs(t.min - nMin) < tSpan * SNAP_EPS &&
        Math.abs(t.max - nMax) < tSpan * SNAP_EPS
      ) {
        nMin = t.min;
        nMax = t.max;
        targetRef.current = null;
      }
      s.setWindow(nMin, nMax);
      rafRef.current = targetRef.current ? requestAnimationFrame(step) : null;
    };

    const onWheel = (e: WheelEvent) => {
      const s = usePlayhead.getState();
      if (s.maxTime - s.minTime <= 0) return;
      e.preventDefault();
      const r = el.getBoundingClientRect();
      // Edge pixels map to the window's edges: (x - left) / width never reached 1, which left a month-scale
      // track's final ~31 minutes out of reach of the wheel.
      // The pointer's place is measured from the plot's left edge (after the inset) over the plot's width.
      // The rect and the pointer are window pixels; the inset is the chrome's own pixels, so it
      // crosses out of the zoomed tree before it is subtracted (at the default step it is unchanged).
      const gutter = chromeToWindowNow(inset);
      const ratio = Math.max(0, Math.min(1, (e.clientX - r.left - gutter) / Math.max(1, r.width - gutter - 1)));
      // Compound on the current target (or the live window if idle), anchored at
      // the cursor, so a fast scroll keeps zooming toward where you point.
      const base = targetRef.current ?? { min: s.windowMin, max: s.windowMax };
      const centerMs = base.min + ratio * (base.max - base.min);
      const factor = e.deltaY < 0 ? ZOOM_IN : ZOOM_OUT;
      const z = zoomedWindow(
        { windowMin: base.min, windowMax: base.max, minTime: s.minTime, maxTime: s.maxTime },
        centerMs,
        factor,
      );
      targetRef.current = { min: z.windowMin, max: z.windowMax };
      if (rafRef.current == null) rafRef.current = requestAnimationFrame(step);
    };

    el.addEventListener("wheel", onWheel, { passive: false });
    return () => {
      el.removeEventListener("wheel", onWheel);
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
      targetRef.current = null;
    };
  }, [trackRef, inset]);
}

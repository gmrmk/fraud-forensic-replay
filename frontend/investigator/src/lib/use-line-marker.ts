import { useEffect, useLayoutEffect, useRef, type RefObject } from "react";
import type maplibregl from "maplibre-gl";

export interface LngLat {
  lng: number;
  lat: number;
}

/** Geographic bearing A→B, degrees clockwise from north (0..360). */
export function bearing(a: LngLat, b: LngLat): number {
  const f1 = (a.lat * Math.PI) / 180;
  const f2 = (b.lat * Math.PI) / 180;
  const dl = ((b.lng - a.lng) * Math.PI) / 180;
  const y = Math.sin(dl) * Math.cos(f2);
  const x = Math.cos(f1) * Math.sin(f2) - Math.sin(f1) * Math.cos(f2) * Math.cos(dl);
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}

/** Fold an angle (deg) into [-90, 90) so a label rotated by it never reads
 *  upside down. */
export function uprightAngle(deg: number): number {
  return ((((deg + 90) % 180) + 180) % 180) - 90;
}

/** Map-plane rotation that lays a label flat along the line A→B (bearing − 90),
 *  kept upright. (Retained for a future GL/flat renderer; the HTML overlay below
 *  rotates by on-screen chord angle instead, which tracks the globe live.) */
export function lineRotation(a: LngLat, b: LngLat): number {
  return uprightAngle(bearing(a, b) - 90);
}

/** Midpoint of A and B (lng/lat average - a label position, not a geodesic). */
export function midpoint(a: LngLat, b: LngLat): LngLat {
  return { lng: (a.lng + b.lng) / 2, lat: (a.lat + b.lat) / 2 };
}

/**
 * Pin an HTML tag to a point on the globe and rotate it ALONG the line toward a
 * second point - the reusable primitive behind any tag that rides a line/arc
 * (rule-badge today; any path annotation across all lines and arcs next).
 * Projects `anchor` every frame (`map` "render") and parks the tag there, rotated
 * by the on-screen chord angle `anchor → toward` (kept upright) so it reads as
 * part of the line and the rotation tracks live under globe rotate/zoom. HIDES
 * the tag (off-screen park + opacity 0 + pointer-events off) when `anchor` is null
 * (gated out) or the point is off-screen.
 *
 * NB: this is a screen-facing overlay (maplibre HTML Markers misplace on the globe
 * projection - only GL layers place correctly there, verified 2026-06-05). A
 * surface-conformed flat label would need a GL symbol layer (plain text, no HTML
 * chrome) - see lineRotation above. Owns left/top/transform/opacity/pointer-events
 * imperatively; keep them OUT of the JSX style prop so React re-renders during
 * playback don't clobber them.
 */
export function useLineMarker(
  map: maplibregl.Map | null,
  anchor: LngLat | null,
  toward: LngLat | null,
): RefObject<HTMLDivElement | null> {
  const ref = useRef<HTMLDivElement>(null);
  // Latest anchor/toward, readable by the paint callback without re-subscribing
  // the map "render" handler. Synced after commit (layout effects run before the
  // triggerRepaint effect below, so paint never reads a stale pair).
  const aRef = useRef<LngLat | null>(anchor);
  const tRef = useRef<LngLat | null>(toward);
  useLayoutEffect(() => {
    aRef.current = anchor;
    tRef.current = toward;
  });

  useLayoutEffect(() => {
    const el = ref.current;
    if (el) {
      el.style.opacity = "0";
      el.style.left = "-9999px";
      el.style.pointerEvents = "none";
    }
  }, []);

  useEffect(() => {
    if (!map) return;
    // Cache the container size: clientWidth/Height are layout reads. Reading them
    // per "render" (right before writing the tag's styles) forced a synchronous
    // layout every frame - layout thrash that janked the whole flyover. Read once
    // + on resize instead, so the per-render paint does math + DOM writes only.
    const container = map.getContainer();
    let W = container.clientWidth || Infinity;
    let H = container.clientHeight || Infinity;
    const onResize = () => {
      W = container.clientWidth || Infinity;
      H = container.clientHeight || Infinity;
    };
    map.on("resize", onResize);
    const hide = (el: HTMLElement) => {
      el.style.opacity = "0";
      el.style.left = "-9999px";
      el.style.pointerEvents = "none";
    };
    const paint = () => {
      const el = ref.current;
      if (!el) return;
      const a = aRef.current;
      if (!a) return hide(el);
      const p = map.project([a.lng, a.lat]);
      const pad = 18;
      if (p.x < pad || p.x > W - pad || p.y < pad || p.y > H - pad) return hide(el);
      let angle = 0;
      const t = tRef.current;
      if (t) {
        const q = map.project([t.lng, t.lat]);
        angle = uprightAngle((Math.atan2(q.y - p.y, q.x - p.x) * 180) / Math.PI);
      }
      el.style.left = `${p.x}px`;
      el.style.top = `${p.y}px`;
      el.style.transform = `translate(-50%, -50%) rotate(${angle}deg)`;
      el.style.opacity = "1";
      el.style.pointerEvents = "auto";
    };
    map.on("render", paint);
    paint();
    return () => {
      map.off("render", paint);
      map.off("resize", onResize);
    };
  }, [map]);

  useEffect(() => {
    map?.triggerRepaint();
  }, [map, anchor?.lng, anchor?.lat, toward?.lng, toward?.lat]);

  return ref;
}

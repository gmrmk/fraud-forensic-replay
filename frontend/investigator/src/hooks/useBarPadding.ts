/**
 * The camera's room above the open bar.
 *
 * With the bar open the camera zooms out to fit. While the
 * bar is open the map's bottom padding follows the measured `--bottom-stack-h` (App keeps the one
 * writer; this file only reads it). When the caller turns the fit on, the camera also zooms out
 * until the whole disk stands between the top of the screen and the top of the bottom stack,
 * centred (the padding centres it), with no margin. The rules:
 *  - the zoom acts only while the camera is at the zoom it opened on or the zoom this code set, so
 *    a person's own zoom or a flight to a record is never undone;
 *  - it never zooms in: the target is the lower of the opening zoom and the fitted zoom, so a
 *    shorter stack returns the camera up to where it opened and no further;
 *  - it fits again when the stack's height changes, when the map is resized and when the bar folds
 *    (a folded bar clears the padding and the camera returns to the zoom it opened on);
 *  - the app's jump to the scenario home (`jumpHome`) is an opening of the camera: the zoom it leaves
 *    is the zoom the camera opened on, in whatever order the map, the height and the jump arrive.
 *    An ordinary move fits nothing: the fitted zoom depends on the latitude, so a fit at every `moveend` would change the
 *    zoom after each pan and each follow move of the playback. At each opening the hook also reads
 *    again whether the disk fits the canvas, so a story that opens zoomed in is never zoomed out.
 * The fit is the caller's to turn on: the zoom acts only
 * for a story that opens on the whole globe, and the hook cannot know the story. No floor is built.
 *
 * The map is handled when it is handed in (the host
 * sets it after `style.load`) and again on `load`, both idempotent; a change of `--bottom-stack-h`
 * is seen by a MutationObserver on the root's style attribute, which is where App writes it; and
 * the map's own `resize` event covers the window. There is no timer, no frame callback and no
 * clock. Limit: `loaded()` is not read, because it measured false
 * after every load; `setPadding` and `setZoom` need no loaded style.
 */
import { useEffect, useRef } from "react";

export type BarPaddingOptions = {
  /** True while the bar is open; false folds it: the padding clears. */
  open: boolean;
  /** True to zoom out so that the disk fits above the stack, while the bar is open. */
  fit: boolean;
};

/** The calls the hook makes on the map (a MapLibre `Map` satisfies it; a test passes a fake). */
export type BarPaddingMap = {
  getZoom(): number;
  getCenter(): { lat: number };
  setZoom(zoom: number): unknown;
  setPadding(padding: { top: number; left: number; right: number; bottom: number }): unknown;
  getCanvas(): { clientHeight: number };
  /** MapLibre's transform: `worldSize` is the world's width in px at the camera's zoom and
   *  `cameraToCenterDistance` the camera's distance to the centre, in px. */
  transform: { readonly worldSize: number; readonly cameraToCenterDistance: number };
  on(type: "load" | "resize", listener: () => void): unknown;
  off(type: "load" | "resize", listener: () => void): unknown;
  /** A move's end; the listener reads the event's own properties (the home jump's mark). */
  on(type: "moveend", listener: (event: object) => void): unknown;
  off(type: "moveend", listener: (event: object) => void): unknown;
};

/** The globe as the camera sees it: the numbers the disk's size on screen depends on. */
export interface GlobeView {
  zoom: number;
  /** The world's width in px at `zoom`. */
  worldSize: number;
  /** The camera's distance to the centre of the view, in px. */
  cameraDistance: number;
  /** The centre's latitude in degrees. */
  latitude: number;
}

/**
 * The disk's diameter in px at `atZoom`, the camera straight above the middle (pitch 0, as at world
 * zoom). MapLibre's globe has radius R = worldSize / (2 pi) / cos(latitude) and is seen from the
 * distance c + R in a view whose focal length is c, so the rim lies at c R / sqrt((c + R)^2 - R^2)
 * (651.6 px at 1280 by 720 and 42 N, zoom 2).
 */
export function diskAcross(view: GlobeView, atZoom: number): number {
  const c = view.cameraDistance;
  const R = (view.worldSize * 2 ** (atZoom - view.zoom)) / (2 * Math.PI) / Math.cos((view.latitude * Math.PI) / 180);
  return (2 * c * R) / Math.sqrt((c + R) * (c + R) - R * R);
}

/** The zoom at which the disk is `freeHeight` px across: a bisection, since the disk grows with the zoom. */
export function fitZoom(view: GlobeView, freeHeight: number): number {
  let lo = -4;
  let hi = 12;
  for (let i = 0; i < 40; i++) {
    const mid = (lo + hi) / 2;
    if (diskAcross(view, mid) > freeHeight) hi = mid;
    else lo = mid;
  }
  return lo;
}

/** The event-data key of the app's jump to the scenario home. MapLibre copies a jump's `eventData`
 *  onto the events the jump fires (maplibre-gl 5.24.1: `jumpTo(options, eventData)` ends with
 *  `fire(new Event('moveend', eventData))`, and `Event` does `extend(this, data)`), so the hook can
 *  tell this move from a person's pan, a flight or a follow move. */
export const HOME_MOVE = "ffrHome";

/** The map's jump, and the scenario's home as the manifest gives it. */
export type HomeJumpMap = {
  jumpTo(options: { center: [number, number]; zoom: number }, eventData?: object): unknown;
};
export type HomeView = { lng: number; lat: number; zoom: number };

/**
 * Puts the camera on the scenario's home as an opening: the jump carries the mark that tells
 * `installBarPadding` the zoom it leaves is the zoom the camera opens on. A camera named by the link
 * or the capture harness (the `__ffrCameraLock` flag, read from the window, never written) wins:
 * nothing moves, and false is returned.
 */
export function jumpHome(map: HomeJumpMap, home: HomeView): boolean {
  if ((window as unknown as { __ffrCameraLock?: boolean }).__ffrCameraLock) return false;
  map.jumpTo({ center: [home.lng, home.lat], zoom: home.zoom }, { [HOME_MOVE]: true });
  return true;
}

/** The map's jump, with the axes the reset also names. A MapLibre `Map` satisfies it. */
export type ResetViewMap = {
  jumpTo(
    options: { center: [number, number]; zoom: number; bearing: number; pitch: number },
    eventData?: object,
  ): unknown;
};

/**
 * Puts the camera back on the opening view of the case: the scenario's home centre and zoom, bearing
 * and pitch zero. The jump carries the app's home mark (`HOME_MOVE`, the mark `jumpHome` carries), so
 * the bar-padding hook takes the zoom it leaves as the zoom the camera opens on. It fits the globe
 * above the bar after it when GlobeMap's fit is on, which GlobeMap reads again from the camera when a
 * move with the home mark ends (a `moveend` listener in GlobeMap.tsx), so a page built zoomed in is
 * fitted too, for a story whose home is the whole globe. The press moves the camera whether or not a
 * link named one: the camera lock (`__ffrCameraLock`) holds only the app's own opening jump, and
 * every reload opens on an address that names a camera.
 *
 * The reset is a jump, not an ease. The mark reaches the `moveend` of an eased move (maplibre-gl
 * 5.24.1, `_afterEase` fires it with the event data), but so does an ease that something stops: the
 * playback follow's own `easeTo` would end a 600 ms reset part way, and the hook would then take the
 * zoom it had reached as the opening zoom.
 */
export function resetView(map: ResetViewMap, home: HomeView): void {
  map.jumpTo({ center: [home.lng, home.lat], zoom: home.zoom, bearing: 0, pitch: 0 }, { [HOME_MOVE]: true });
}

/** Two zooms are the same camera when they differ by less than this. */
const SAME_ZOOM = 0.005;
/** A target this close to the zoom now is not worth a call. */
const NO_MOVE = 0.002;

const STACK_VAR = "--bottom-stack-h";

/** True when the disk at `zoom` is no taller than the canvas: the story opens on the whole globe.
 *  The same test the caller makes for `fit`, read again at each opening so a story that opens
 *  zoomed in (a home at zoom 4) is never zoomed out. */
function opensOnWholeGlobe(map: BarPaddingMap, zoom: number): boolean {
  const view: GlobeView = {
    zoom,
    worldSize: map.transform.worldSize,
    cameraDistance: map.transform.cameraToCenterDistance,
    latitude: map.getCenter().lat,
  };
  return diskAcross(view, zoom) <= map.getCanvas().clientHeight;
}

/** The stack's published height in px, rounded; 0 when none is published. */
function stackHeight(root: HTMLElement): number {
  const px = parseFloat(getComputedStyle(root).getPropertyValue(STACK_VAR));
  return Number.isFinite(px) && px > 0 ? Math.round(px) : 0;
}

export interface BarPaddingInstall {
  /** Reads the stack and the camera and acts; the same inputs give no second call. */
  apply(): void;
  update(options: BarPaddingOptions): void;
  dispose(): void;
}

/** Starts acting on the map now. `root` is the element that holds `--bottom-stack-h`. */
export function installBarPadding(
  map: BarPaddingMap,
  initial: BarPaddingOptions,
  root: HTMLElement = document.documentElement,
): BarPaddingInstall {
  let options = initial;
  let lastPadding = 0; // what the map holds: a map starts with none
  let openZoom = map.getZoom(); // the zoom the camera opened on
  let setZoom: number | null = null; // the zoom this code last set
  // Whether the story opened on the whole globe: read at each opening, ANDed with the caller's `fit`.
  let wholeGlobe = opensOnWholeGlobe(map, openZoom);

  const apply = (): void => {
    const h = options.open ? stackHeight(root) : 0;
    if (h !== lastPadding) {
      lastPadding = h;
      map.setPadding({ top: 0, left: 0, right: 0, bottom: h });
    }
    const z = map.getZoom();
    const mine = Math.abs(z - openZoom) < SAME_ZOOM || (setZoom !== null && Math.abs(z - setZoom) < SAME_ZOOM);
    if (!mine) return;
    let target = openZoom;
    if (options.open && options.fit && wholeGlobe) {
      const canvasHeight = map.getCanvas().clientHeight;
      const free = canvasHeight - h;
      if (free < 1) return; // no room to fit into: the camera stays where it is
      const view: GlobeView = {
        zoom: z,
        worldSize: map.transform.worldSize,
        cameraDistance: map.transform.cameraToCenterDistance,
        latitude: map.getCenter().lat,
      };
      target = Math.min(openZoom, fitZoom(view, free));
    }
    if (Math.abs(target - z) > NO_MOVE) {
      map.setZoom(target);
      setZoom = map.getZoom();
    }
  };

  // The app's jump to the scenario home is an opening of the camera: the zoom it leaves is the zoom
  // the camera opens on, and the zoom this code had set is forgotten. Only the marked move counts.
  // An ordinary move (a pan, a follow move, a flight, this code's own setZoom) does not fit again:
  // the fitted zoom depends on the latitude, so a fit at every `moveend` would change the zoom after
  // each pan and load tiles. The jump's `moveend` fires after the transform changed, and the zoom is
  // read back from the map, since a jump can snap it.
  const onMoveEnd = (event: object | undefined): void => {
    if ((event as Record<string, unknown> | undefined)?.[HOME_MOVE] !== true) return;
    openZoom = map.getZoom();
    setZoom = null;
    wholeGlobe = opensOnWholeGlobe(map, openZoom);
    apply();
  };
  map.on("load", apply);
  map.on("resize", apply);
  map.on("moveend", onMoveEnd);
  // The stack's height is published as a style property on the root; a change of it is an attribute
  // change. Nothing here polls.
  const watcher = typeof MutationObserver === "function" ? new MutationObserver(apply) : null;
  watcher?.observe(root, { attributes: true, attributeFilter: ["style"] });
  apply();

  return {
    apply,
    update(next) {
      options = next;
      apply();
    },
    dispose() {
      map.off("load", apply);
      map.off("resize", apply);
      map.off("moveend", onMoveEnd);
      watcher?.disconnect();
    },
  };
}

/** The hook: acts while it holds a map; stops on unmount and when the map changes. It leaves the
 *  map's padding and zoom as they are when it stops (the map is going or has gone). */
export function useBarPadding(map: BarPaddingMap | null, options: BarPaddingOptions): void {
  const latest = useRef(options);
  const install = useRef<BarPaddingInstall | null>(null);
  const { open, fit } = options;
  useEffect(() => {
    latest.current = { open, fit };
    install.current?.update({ open, fit });
  }, [open, fit]);
  useEffect(() => {
    if (!map) return;
    const bar = installBarPadding(map, latest.current);
    install.current = bar;
    return () => {
      bar.dispose();
      install.current = null;
    };
  }, [map]);
}

/**
 * Keeps the globe's labels on the globe.
 *
 * Below zoom 6 each capped label layer gets a `within` filter around the centre of the view; see
 * lib/globe/labelCap.ts. The cap is set round where a move is going when the app begins it
 * through `capMove`, and round where the camera stops at the end of any other move (`moveend`:
 * a drag, the wheel, the keyboard, a jump). It is set again when the style loads: a theme switch
 * replaces the style (setStyle with diff false), which restores the shipped filters.
 *
 * The shipped filters are read once, from the style document, never back from the live map: a
 * filter read from the map could already hold a cap and would nest a second one. Listeners are
 * `style.load` and `moveend` only, so nothing runs per frame, and no clock is read.
 */
import { useCallback, useEffect, useRef } from "react";
import type { StyleSpecification } from "maplibre-gl";
import { basemapStyle } from "../lib/globe/basemap";
import {
  CAP_SET_OPTIONS,
  capFilter,
  capStateChanged,
  labelCapLayers,
  moveCapZoom,
  type CapState,
} from "../lib/globe/labelCap";

/** The calls the hook makes on the map (a MapLibre `Map` satisfies it; a test passes a fake). */
export type LabelCapMap = {
  getCenter(): { lng: number; lat: number };
  getZoom(): number;
  isMoving(): boolean;
  getLayer(id: string): unknown;
  setFilter(id: string, filter: never, options?: { validate?: boolean }): unknown;
  on(type: "style.load" | "moveend", listener: () => void): unknown;
  off(type: "style.load" | "moveend", listener: () => void): unknown;
};

/** Where a move is going: its centre, and the zoom the call names when it names one. */
export type CapTarget = { lng: number; lat: number; zoom?: number };

/** Runs a camera call and sets the cap round its target. Returns what `run` returns. With no
 *  target (a call that names no centre) it only runs. */
export type CapMove = <T>(run: () => T, to?: CapTarget) => T;

export type LabelCapInstall = { dispose: () => void; capMove: CapMove };

type Pending = { lng: number; lat: number; namedZoom: number | undefined };

/** Sets the cap now, at every `style.load` and `moveend`, and through the returned `capMove`;
 *  `dispose` removes the listeners. `style` is the document the map's style was loaded from. */
export function installLabelCap(map: LabelCapMap, style: StyleSpecification): LabelCapInstall {
  const layers = labelCapLayers(style);
  let last: CapState | null = null; // what the layers hold now; null is unknown
  let pending: Pending | null = null; // the target of a move `capMove` began and that has not ended
  let depth = 0; // open `capMove` calls: a count, not a timer

  const fromCamera = (): CapState => {
    const c = map.getCenter();
    return { lng: c.lng, lat: c.lat, zoom: map.getZoom() };
  };

  const settle = (next: CapState): void => {
    if (!capStateChanged(last, next)) return;
    for (const { id, filter } of layers) {
      // A layer the live style does not hold (mid-swap) is skipped; its style.load sets it.
      if (!map.getLayer(id)) continue;
      map.setFilter(id, (capFilter(filter, next.lng, next.lat, next.zoom) ?? null) as never, CAP_SET_OPTIONS);
    }
    last = next;
  };

  const onMoveEnd = (): void => {
    // A moveend inside a camera call is the stop of the move it interrupted, camera part-way:
    // the call's own target is set after it returns.
    if (depth > 0) return;
    pending = null;
    settle(fromCamera());
  };

  const onStyleLoad = (): void => {
    last = null; // the new style holds the shipped filters
    if (pending) {
      settle({ lng: pending.lng, lat: pending.lat, zoom: moveCapZoom(map.getZoom(), pending.namedZoom) });
    } else {
      settle(fromCamera());
    }
  };

  const capMove: CapMove = (run, to) => {
    if (!to) return run();
    const next: CapState = { lng: to.lng, lat: to.lat, zoom: moveCapZoom(map.getZoom(), to.zoom) };
    depth++;
    let out: ReturnType<typeof run>;
    try {
      out = run();
    } finally {
      depth--;
    }
    if (map.isMoving()) {
      pending = { lng: to.lng, lat: to.lat, namedZoom: to.zoom };
      settle(next);
    } else {
      // The move was already over (a zero duration, a jump): the camera is at its destination.
      pending = null;
      settle(fromCamera());
    }
    return out;
  };

  map.on("style.load", onStyleLoad);
  map.on("moveend", onMoveEnd);
  settle(fromCamera());
  return {
    dispose: () => {
      map.off("style.load", onStyleLoad);
      map.off("moveend", onMoveEnd);
    },
    capMove,
  };
}

/** `map` is the loaded map (null until the first style has loaded). `getStyle` returns the
 *  style document; both themes load the same one and recolour paint only. The returned
 *  `capMove` is one function for the life of the component, so an effect that lists it as a
 *  dependency does not rerun; with no map installed it only runs the call. */
export function useLabelCap(map: LabelCapMap | null, getStyle: () => StyleSpecification = basemapStyle): CapMove {
  const installRef = useRef<LabelCapInstall | null>(null);
  useEffect(() => {
    if (!map) return;
    const install = installLabelCap(map, getStyle());
    installRef.current = install;
    return () => {
      install.dispose();
      if (installRef.current === install) installRef.current = null;
    };
  }, [map, getStyle]);
  return useCallback<CapMove>((run, to) => {
    const install = installRef.current;
    return install ? install.capMove(run, to) : run();
  }, []);
}

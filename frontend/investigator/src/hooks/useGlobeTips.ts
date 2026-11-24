/**
 * The globe's tooltip as a hook.
 *
 * The map's marks are not elements, so the pointer's place is asked of the map: the circle layers
 * of the sources the caller names are queried in a box of 3 px round the pointer, the ids found
 * are looked up in the index, and `globeTip` words them (lib/globe-tip.ts). The result goes to the
 * tooltip layer through `showTipAt`. The spike polled every 400 ms for a map that had loaded; this
 * binds when it is given a map. A style that holds no layer of those sources yet is simply not
 * asked about, and the layer ids are read from the live style at each move, so a theme swap that
 * replaces the style needs no rebind.
 *
 * Listeners: `mousemove`, `mouseout`, `movestart`. No timer, no frame callback, no clock. The index,
 * the colour function and the clock's form are read at each move through a ref, so a new index
 * does not bind again. The source ids and the colour function are arguments: no pack is named here.
 */
import { useEffect, useRef } from "react";
import { showTipAt } from "../components/ui/Tip";
import { globeTip, type GlobeTipEntry } from "../lib/globe-tip";
import type { TimeForm } from "../lib/time-words";
import { useClockForm } from "../store/clock-form";

/** The calls the hook makes on the map (a MapLibre `Map` satisfies it; a test passes a fake). */
export type GlobeTipMap = {
  getStyle(): { layers?: readonly { id: string; type: string; source?: string }[] } | undefined;
  queryRenderedFeatures(
    box: [[number, number], [number, number]],
    options: { layers: string[] },
  ): readonly { properties?: { [name: string]: unknown } | null; id?: string | number }[];
  getCanvas(): { getBoundingClientRect(): { left: number; top: number } };
  on(type: "mousemove", listener: (e: { point: { x: number; y: number } }) => void): unknown;
  on(type: "mouseout" | "movestart", listener: () => void): unknown;
  off(type: "mousemove", listener: (e: { point: { x: number; y: number } }) => void): unknown;
  off(type: "mouseout" | "movestart", listener: () => void): unknown;
};

/** What the move handler reads each time it runs. */
export interface GlobeTipRead {
  index: ReadonlyMap<string, GlobeTipEntry>;
  accentFor: (kind: string) => string;
  /** The map's sources whose circle layers hold the marks. */
  sources: readonly string[];
  form: TimeForm;
}

/** The pointer's reach: a mark is found within this many px of the pointer, each way. */
const REACH_PX = 3;

/** Binds the tooltip to the map now and returns the function that unbinds it and hides the tooltip. */
export function installGlobeTips(map: GlobeTipMap, read: () => GlobeTipRead): () => void {
  // `showTipAt(null)` clears the tooltip layer whoever set it, and a tooltip that keyboard focus
  // holds on a node must stay (Tip.tsx), so the map hides only a tooltip it showed itself.
  let shown = false;
  const hide = (): void => {
    if (!shown) return;
    shown = false;
    showTipAt(null);
  };
  const onMove = (e: { point: { x: number; y: number } }): void => {
    const { index, accentFor, sources, form } = read();
    const layerIds = (map.getStyle()?.layers ?? [])
      .filter((l) => l.type === "circle" && l.source !== undefined && sources.includes(l.source))
      .map((l) => l.id);
    if (layerIds.length === 0) return;
    const { x, y } = e.point;
    const hits = map.queryRenderedFeatures(
      [
        [x - REACH_PX, y - REACH_PX],
        [x + REACH_PX, y + REACH_PX],
      ],
      { layers: layerIds },
    );
    // A mark is drawn by more than one layer (a halo and a dot), so each record counts once.
    const seen = new Map<string, GlobeTipEntry>();
    for (const f of hits) {
      const id = String(f.properties?.id ?? f.id ?? "");
      const rec = index.get(id);
      if (rec && !seen.has(id)) seen.set(id, rec);
    }
    const tip = globeTip([...seen.values()], form, accentFor);
    if (!tip) return hide();
    const box = map.getCanvas().getBoundingClientRect();
    shown = true;
    showTipAt({ x: box.left + x, y: box.top + y }, tip.lines, tip.accent);
  };
  map.on("mousemove", onMove);
  map.on("mouseout", hide);
  map.on("movestart", hide);
  return () => {
    map.off("mousemove", onMove);
    map.off("mouseout", hide);
    map.off("movestart", hide);
    hide();
  };
}

export interface GlobeTipsInput {
  index: ReadonlyMap<string, GlobeTipEntry>;
  accentFor: (kind: string) => string;
  sources: readonly string[];
}

/** The hook: binds while it holds a map, unbinds on unmount and when the map changes. */
export function useGlobeTips(map: GlobeTipMap | null, input: GlobeTipsInput): void {
  const latest = useRef<GlobeTipsInput>(input);
  useEffect(() => {
    latest.current = input;
  }, [input]);
  useEffect(() => {
    if (!map) return;
    // The clock's form is read from its store at each move, so a switch of it shows at once.
    return installGlobeTips(map, () => ({ ...latest.current, form: useClockForm.getState().h24 ? "24h" : "12h" }));
  }, [map]);
}

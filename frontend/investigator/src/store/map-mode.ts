// frontend/investigator/src/store/map-mode.ts
// The chosen shape of the map: the globe or the flat map. This store is its one owner. It reads its
// opening value once, when the page loads: the address key `map`, then the browser's storage, then
// the globe. Reading never writes, so opening a link leaves the remembered choice as it was. The
// setter saves the choice. The store never touches the map: the map component applies the shape.
import { create } from "zustand";

export type MapMode = "globe" | "flat";

/** The storage key, written once here; the tests import it. */
export const MAP_KEY = "ffr.map";

export const isMapMode = (v: string | null): v is MapMode => v === "globe" || v === "flat";

/** The shape the page opens on, from the address, then the storage, then the globe. A word that
 *  is not a shape counts as none, and a storage that throws counts as none. */
export function initialMapMode(search: string, storage?: Pick<Storage, "getItem">): MapMode {
  const q = new URLSearchParams(search).get("map");
  if (isMapMode(q)) return q;
  try {
    const s = (storage ?? localStorage).getItem(MAP_KEY);
    if (isMapMode(s)) return s;
  } catch {
    /* private mode or storage disabled */
  }
  return "globe";
}

export interface MapModeState {
  shape: MapMode;
  setShape: (shape: MapMode) => void;
}

export const useMapMode = create<MapModeState>((set) => ({
  shape: initialMapMode(window.location.search),
  setShape: (shape) => {
    set({ shape });
    try {
      localStorage.setItem(MAP_KEY, shape);
    } catch {
      /* best-effort: the shape still holds for this page */
    }
  },
}));

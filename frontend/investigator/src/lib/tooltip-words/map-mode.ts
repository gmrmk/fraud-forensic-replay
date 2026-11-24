// frontend/investigator/src/lib/tooltip-words/map-mode.ts
// The words of the button that flips the map between the globe and the flat map. For each shape: a
// first line that names where a press goes, which is also the button's accessible name, and one
// instruction that says what a press does. It says what the thing does and never what to conclude.
import type { MapMode } from "../../store/map-mode";

export const mapModeWords = (shape: MapMode): string[] =>
  shape === "globe"
    ? ["Flat map", "Press to show the map flat."]
    : ["Globe", "Press to show the map as a globe."];

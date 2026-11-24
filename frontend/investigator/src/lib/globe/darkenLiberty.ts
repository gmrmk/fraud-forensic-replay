import type { Map as MapLibreMap, LayerSpecification } from "maplibre-gl";

// Re-base dark mode on the RICH liberty style. The OpenFreeMap "dark" style is minimal - it ships
// NO highway shields, no POI icons, and drops place labels at city zoom - so dark could never read
// like light on it. Instead we load liberty for BOTH themes and, for dark, recolor liberty's base
// at runtime: areas → near-black, water → dark blue, roads → tiered cool grey (the light style's
// #fff/#fea/#fc8 roads would glare on dark), buildings → toned + lit for depth, labels → bright +
// haloed. Liberty's icon sprites (highway shields, POI, oneway arrows) render unchanged on the dark
// ground - that's the whole point: dark gets light's richness. Re-runs on each setStyle swap.

const BG = "#0B0E13"; // app background / off-globe base (matches tokens bg)
const AREA = "#0e131c"; // land / landcover / landuse / park / generic fill
// Water / waterway. A step bluer and lighter than the land around it (contrast 1.17 against
// AREA): land has no polygons of its own here, so with water at the land's tone the coastlines
// vanished and the labels floated on black (FIX-2026-11-13-basemap-green-outlines-and-flat-dark-water).
const WATER = "#10233a";
const BOUNDARY = "#3b414d"; // admin borders (must stay readable)
const AERO = "#1b1f27"; // runways / taxiways
const BUILDING = "hsl(35, 7%, 30%)"; // toned warm grey, lit by the directional light below
const TEXT = "#dfe6f2";
const HALO = "rgba(6,8,14,0.92)";

// Road tier by class - low-saturation cool grey, brighter = more important. Casings are the darker
// edge UNDER the inner fill.
const ROAD_CASING = "hsl(220, 8%, 15%)";
function roadColor(id: string): string {
  if (/casing/.test(id)) return ROAD_CASING;
  if (/motorway/.test(id)) return "hsl(220, 8%, 44%)";
  if (/trunk/.test(id)) return "hsl(220, 7%, 38%)";
  if (/primary/.test(id)) return "hsl(220, 7%, 34%)";
  if (/secondary|tertiary/.test(id)) return "hsl(220, 6%, 30%)";
  if (/rail/.test(id)) return "hsl(220, 4%, 24%)";
  if (/service|track/.test(id)) return "hsl(220, 5%, 22%)";
  if (/path|pedestrian/.test(id)) return "hsl(220, 5%, 21%)";
  return "hsl(220, 6%, 26%)"; // street / minor / link / default
}

function isRoad(l: LayerSpecification): boolean {
  const sl = (l as { "source-layer"?: string })["source-layer"];
  return sl === "transportation" || /^(road|tunnel|bridge|highway)/.test(l.id);
}

const AREA_SOURCE_LAYERS = new Set(["park", "landcover", "landuse"]);

/** Light keeps liberty as shipped, with one correction, in place: an area fill's outline takes
 *  the fill's own colour. Liberty outlines every park polygon in a saturated green, which at
 *  continental zoom is thousands of small rings: a green wireframe over the land. Unsetting the
 *  outline returns it to the style spec's default (the fill colour). Idempotent; safe to re-run
 *  on swap. Dark does the same inside applyDarkLiberty. */
export function applyLightLiberty(map: MapLibreMap): void {
  for (const l of map.getStyle().layers ?? []) {
    if (l.type !== "fill" || l.id.startsWith("ml-")) continue;
    const sourceLayer = (l as { "source-layer"?: string })["source-layer"];
    if (!sourceLayer || !AREA_SOURCE_LAYERS.has(sourceLayer)) continue;
    if ((l.paint as Record<string, unknown> | undefined)?.["fill-outline-color"] === undefined) continue;
    map.setPaintProperty(l.id, "fill-outline-color", null);
  }
}

/** Recolor a freshly-loaded liberty style dark, in place. Idempotent; safe to re-run on swap. */
export function applyDarkLiberty(map: MapLibreMap): void {
  const set = (id: string, prop: string, val: unknown): void => {
    try {
      map.setPaintProperty(id, prop, val as never);
    } catch {
      // layer lacks that paint prop - skip
    }
  };

  for (const l of map.getStyle().layers ?? []) {
    const id = l.id;
    if (id.startsWith("ml-")) continue; // our own data layers (markers/heat/tz/ocean-base)

    if (l.type === "raster") {
      set(id, "raster-opacity", 0); // natural_earth low-zoom relief is light land - hide it
      continue;
    }
    if (l.type === "symbol") {
      const layout = l.layout as Record<string, unknown> | undefined;
      // SHIELDS (highway-shield-*, road_shield_*): leave liberty's sprite-calibrated styling
      // untouched. The route number rides ON the badge sprite, sized + coloured for it. Recolouring
      // it to the light ground colour (#dfe6f2) washed it out; the size/halo boost that "fixed" that
      // overshot into comically oversized numerals. Skipping shields IS the fix - the badge sprite
      // (already untouched) carries the contrast, exactly as in light mode. (2026-06-20)
      if (/shield/i.test(id)) continue;
      // Road/place labels: bright text + a strong halo on the dark ground.
      if (layout?.["text-field"] != null) {
        set(id, "text-color", TEXT);
        set(id, "text-halo-color", HALO);
        set(id, "text-halo-width", 1.4);
      }
      continue;
    }
    if (l.type === "fill-extrusion") {
      set(id, "fill-extrusion-color", BUILDING);
      set(id, "fill-extrusion-opacity", 0.85);
      continue;
    }
    if (l.type === "background") {
      set(id, "background-color", BG);
      continue;
    }
    if (isRoad(l)) {
      set(id, l.type === "line" ? "line-color" : "fill-color", roadColor(id));
      continue;
    }
    if (/boundary/.test(id)) {
      set(id, "line-color", BOUNDARY);
      continue;
    }
    if (/aeroway/.test(id)) {
      set(id, "line-color", AERO);
      continue;
    }
    const sl = (l as { "source-layer"?: string })["source-layer"];
    if (sl === "water" || /water/.test(id)) {
      if (l.type === "line") set(id, "line-color", WATER);
      else { set(id, "fill-color", WATER); set(id, "fill-outline-color", WATER); }
      continue;
    }
    // remaining: land / landcover / landuse / park / wetland. Liberty's fills carry GREEN
    // fill-outline-color, which on a dark fill renders as a bright-green WIREFRAME edge ("the green
    // stuff drowned out / strange"). Dark BOTH the fill and its outline; dark any stray non-road
    // line (landcover edges) too, so no bright strokes survive.
    if (l.type === "fill") {
      set(id, "fill-color", AREA);
      set(id, "fill-outline-color", AREA);
    } else if (l.type === "line") {
      set(id, "line-color", AREA);
    }
  }

  // Directional light so the toned building extrusions read as 3D (depth = the only cue maplibre 5
  // gives for fill-extrusion - no ambient occlusion).
  map.setLight({ anchor: "viewport", color: "#ffffff", intensity: 0.8, position: [1.4, 210, 24] });
}

/**
 * The globe's label cap: labels more than 62 degrees from the centre of the view
 * are hidden below zoom 6, so none runs off the sphere. The cap polygon is checked against the
 * great-circle distance it stands for; the layers are derived from the bundled style.
 */
import { describe, it, expect } from "vitest";
import type { FilterSpecification, StyleSpecification } from "maplibre-gl";
import {
  CAP_RESET_DEG,
  LABEL_CAP_DEG,
  LABEL_CAP_ZOOM,
  arcDeg,
  capFilter,
  capPolygon,
  capStateChanged,
  labelCapLayers,
  moveCapZoom,
} from "./labelCap";
import libertyText from "./basemap/liberty.json?raw";
// MapLibre's own rule for telling an expression filter from a legacy one, walked through all/any.
import { expression, validateStyleMin } from "@maplibre/maplibre-gl-style-spec";

const isExpressionFilter = (f: unknown): boolean => expression.isExpressionFilter(f);

const rad = (d: number): number => (d * Math.PI) / 180;

/** Great-circle distance in degrees (haversine), the reference the polygon is held to. */
function refArcDeg(lng1: number, lat1: number, lng2: number, lat2: number): number {
  const dLat = rad(lat2 - lat1);
  const dLng = rad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(dLng / 2) ** 2;
  return (2 * Math.asin(Math.min(1, Math.sqrt(a))) * 180) / Math.PI;
}

/** The point on the sphere `arc` degrees from (lng, lat) along `bearing` degrees. */
function destination(lng: number, lat: number, bearing: number, arc: number): [number, number] {
  const p = rad(lat);
  const r = rad(arc);
  const b = rad(bearing);
  const phi = Math.asin(Math.sin(p) * Math.cos(r) + Math.cos(p) * Math.sin(r) * Math.cos(b));
  const dl = Math.atan2(Math.sin(b) * Math.sin(r) * Math.cos(p), Math.cos(r) - Math.sin(p) * Math.sin(phi));
  let l = ((lng + (dl * 180) / Math.PI + 540) % 360) - 180;
  if (l === -180) l = 180;
  return [l, (phi * 180) / Math.PI];
}

/** Ray casting in the plane of longitude and latitude, as a `within` filter reads a polygon. */
function inRing(x: number, y: number, ring: number[][]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
function holds(mp: GeoJSON.MultiPolygon, lng: number, lat: number): boolean {
  return mp.coordinates.some((poly) => inRing(lng, lat, poly[0]));
}

// Centres on both sides of the pole threshold (|lat| 28 at 62 degrees), across the date line,
// on the equator and at each pole's side.
const CENTRES: [number, number][] = [
  [0, 0],
  [-70, 15],
  [100, 27],
  [10, 40],
  [175, 5],
  [-175, -20],
  [60, 80],
  [-120, -75],
  [179, 55],
];

describe("capPolygon", () => {
  it("is one exported constant of 62 degrees, in force below zoom 6", () => {
    expect(LABEL_CAP_DEG).toBe(62);
    expect(LABEL_CAP_ZOOM).toBe(6);
  });

  it.each(CENTRES)("holds a point 61 degrees from (%d, %d) and not one at 63, in every direction", (lng, lat) => {
    const cap = capPolygon(lng, lat, LABEL_CAP_DEG);
    for (let bearing = 0; bearing < 360; bearing += 10) {
      const [ilng, ilat] = destination(lng, lat, bearing, 61);
      const [olng, olat] = destination(lng, lat, bearing, 63);
      expect(Math.abs(refArcDeg(lng, lat, ilng, ilat) - 61)).toBeLessThan(1e-6);
      expect(holds(cap, ilng, ilat), `61 deg at bearing ${bearing} from ${lng},${lat}`).toBe(true);
      expect(holds(cap, olng, olat), `63 deg at bearing ${bearing} from ${lng},${lat}`).toBe(false);
    }
  });

  it("agrees with the great-circle distance on a grid of points, 3 degrees either side of the edge", () => {
    for (const [lng, lat] of CENTRES) {
      const cap = capPolygon(lng, lat, LABEL_CAP_DEG);
      for (let glat = -85; glat <= 85; glat += 5) {
        for (let glng = -180; glng < 180; glng += 5) {
          const d = refArcDeg(lng, lat, glng, glat);
          if (d <= LABEL_CAP_DEG - 3) expect(holds(cap, glng, glat), `${glng},${glat} d=${d}`).toBe(true);
          if (d >= LABEL_CAP_DEG + 3) expect(holds(cap, glng, glat), `${glng},${glat} d=${d}`).toBe(false);
        }
      }
    }
  });

  it("holds across the antimeridian: a centre at 175 east holds a point at 175 west", () => {
    const cap = capPolygon(175, 0, LABEL_CAP_DEG);
    expect(holds(cap, -175, 0)).toBe(true); // 10 degrees away
    expect(holds(cap, -175, 40)).toBe(true);
    expect(holds(cap, -60, 0)).toBe(false); // 125 degrees away
  });

  it("holds across a pole: a centre at 80 north holds a point beyond the pole", () => {
    const cap = capPolygon(0, 80, LABEL_CAP_DEG);
    expect(holds(cap, 180, 80)).toBe(true); // 20 degrees away, over the pole
    expect(holds(cap, 180, 40)).toBe(true); // 60 degrees away, over the pole
    expect(holds(cap, 180, 30)).toBe(false); // 70 degrees away, over the pole
    const south = capPolygon(0, -80, LABEL_CAP_DEG);
    expect(holds(south, 180, -80)).toBe(true);
    expect(holds(south, 180, -30)).toBe(false);
  });

  it("takes a centre longitude the camera has carried past 180", () => {
    const cap = capPolygon(535, 10, LABEL_CAP_DEG); // 535 is 175 east
    expect(holds(cap, 175, 10)).toBe(true);
    expect(holds(cap, -175, 10)).toBe(true);
    expect(holds(cap, 0, 10)).toBe(false);
  });
});

describe("capFilter", () => {
  const own: FilterSpecification = ["==", ["get", "class"], "city"];

  it("keeps the layer's own filter as one of its conditions below zoom 6", () => {
    const f = capFilter(own, 10, 20, 2) as unknown[];
    expect(f[0]).toBe("all");
    expect(f).toContainEqual(own);
    const within = f.find((c) => Array.isArray(c) && c[0] === "within") as [string, GeoJSON.MultiPolygon];
    expect(within).toBeDefined();
    expect(within[1]).toEqual(capPolygon(10, 20, LABEL_CAP_DEG));
    expect(f).toHaveLength(3);
  });

  it("gives a layer with no filter the cap alone", () => {
    const f = capFilter(undefined, 10, 20, 2) as unknown[];
    expect(f[0]).toBe("within");
    expect(f[1]).toEqual(capPolygon(10, 20, LABEL_CAP_DEG));
  });

  it("is the shipped filter, exactly, at zoom 6 and above", () => {
    expect(capFilter(own, 10, 20, LABEL_CAP_ZOOM)).toBe(own);
    expect(capFilter(own, 10, 20, 12.5)).toBe(own);
    expect(capFilter(undefined, 10, 20, LABEL_CAP_ZOOM)).toBeUndefined();
  });

  it("caps just below zoom 6", () => {
    expect(capFilter(own, 10, 20, LABEL_CAP_ZOOM - 0.01)).not.toBe(own);
  });

  it("never nests: the cap is built from the filter it is given, once", () => {
    const f = capFilter(own, 0, 0, 2) as unknown[];
    expect(JSON.stringify(f).match(/"within"/g)).toHaveLength(1);
  });
});

describe("labelCapLayers", () => {
  const sym = (id: string, sourceLayer: string, layout: Record<string, unknown>, filter?: unknown) => ({
    id,
    type: "symbol",
    source: "openmaptiles",
    "source-layer": sourceLayer,
    layout,
    ...(filter ? { filter } : {}),
  });
  const fixture = {
    version: 8,
    sources: {},
    layers: [
      { id: "background", type: "background" },
      sym("place_point", "place", { "text-field": "{name}" }, ["==", ["get", "class"], "city"]),
      sym("place_point_explicit", "place", { "symbol-placement": "point", "text-field": "{name}" }),
      sym("water_point", "water_name", { "text-field": "{name}" }),
      // decoys
      sym("poi_transit", "poi", { "text-field": "{name}" }),
      sym("place_line", "place", { "symbol-placement": "line", "text-field": "{name}" }),
      sym("water_line", "water_name", { "symbol-placement": "line-center", "text-field": "{name}" }),
      sym("place_icon_only", "place", { "icon-image": "dot" }),
      { id: "place_circle", type: "circle", source: "openmaptiles", "source-layer": "place" },
      { id: "no_layout_symbol", type: "symbol", source: "openmaptiles", "source-layer": "place" },
    ],
  } as unknown as StyleSpecification;

  it("takes the point text symbol layers of the place and water_name source layers, and no others", () => {
    expect(labelCapLayers(fixture).map((l) => l.id)).toEqual(["place_point", "place_point_explicit", "water_point"]);
  });

  it("carries each layer's own filter, undefined when it has none", () => {
    const [a, b] = labelCapLayers(fixture);
    expect(a.filter).toEqual(["==", ["get", "class"], "city"]);
    expect(b.filter).toBeUndefined();
  });

  it("finds exactly the ten layers the owner saw on the bundled style", () => {
    const style = JSON.parse(libertyText) as StyleSpecification;
    expect(
      labelCapLayers(style)
        .map((l) => l.id)
        .sort(),
    ).toEqual(
      [
        "label_city",
        "label_city_capital",
        "label_country_1",
        "label_country_2",
        "label_country_3",
        "label_other",
        "label_state",
        "label_town",
        "label_village",
        "water_name_point_label",
      ].sort(),
    );
  });

  it("carries the style's own filters, all in expression syntax, nested conditions included", () => {
    const style = JSON.parse(libertyText) as StyleSpecification;
    for (const l of labelCapLayers(style)) {
      const src = (style.layers as { id: string; filter?: unknown }[]).find((s) => s.id === l.id)!;
      expect(l.filter).toEqual(src.filter);
      // A legacy condition anywhere inside makes MapLibre read the whole filter as legacy, where
      // `within` does not exist. A layer with no filter gets the cap alone, so it is skipped.
      if (l.filter !== undefined) {
        expect(isExpressionFilter(l.filter), `${l.id} is in expression syntax throughout`).toBe(true);
        const capped = capFilter(l.filter, 10, 20, 2);
        expect(isExpressionFilter(capped), `${l.id} capped is in expression syntax throughout`).toBe(true);
      }
    }
  });

  it("the guard rejects a filter that nests a legacy condition inside all", () => {
    const nested = ["all", ["==", "class", "city"], ["==", ["get", "capital"], 2]];
    expect(isExpressionFilter(nested)).toBe(false);
    expect(isExpressionFilter(capFilter(nested as FilterSpecification, 10, 20, 2))).toBe(false);
    expect(isExpressionFilter(["all", ["==", ["get", "class"], "city"], ["==", ["get", "capital"], 2]])).toBe(true);
  });
});

describe("arcDeg", () => {
  it("is the great-circle distance in degrees: Houston to Lagos is about 94", () => {
    expect(Math.abs(arcDeg(-95.37, 29.76, 3.38, 6.52) - 94)).toBeLessThan(1);
  });

  it("goes the short way across the antimeridian, and from a pole to the equator", () => {
    expect(Math.abs(arcDeg(175, 0, -175, 0) - 10)).toBeLessThan(1e-9);
    expect(Math.abs(arcDeg(0, 90, 0, 0) - 90)).toBeLessThan(1e-9);
  });

  it("takes a longitude the camera has carried past 180: 535 east is 175 east", () => {
    expect(Math.abs(arcDeg(535, 10, 175, 10))).toBeLessThan(1e-9);
  });

  it("agrees with the independent reference on the grid of centres", () => {
    for (const [lng, lat] of CENTRES) {
      for (let glat = -80; glat <= 80; glat += 20) {
        for (let glng = -180; glng < 180; glng += 30) {
          expect(Math.abs(arcDeg(lng, lat, glng, glat) - refArcDeg(lng, lat, glng, glat))).toBeLessThan(1e-9);
        }
      }
    }
  });
});

describe("capStateChanged", () => {
  const at = (lng: number, lat: number, zoom = 2) => ({ lng, lat, zoom });

  it("is true with no previous state", () => {
    expect(CAP_RESET_DEG).toBe(1);
    expect(capStateChanged(null, at(0, 0))).toBe(true);
  });

  it("is false 0.9 degree from the last set on the same side of zoom 6, true at 1.1", () => {
    expect(capStateChanged(at(0, 0), at(0.9, 0))).toBe(false);
    expect(capStateChanged(at(0, 0), at(1.1, 0))).toBe(true);
  });

  it("is true across zoom 6 whatever the centres: 5.9 against 6", () => {
    expect(capStateChanged(at(0, 0, 5.9), at(0, 0, 6))).toBe(true);
    expect(capStateChanged(at(0, 0, 6), at(0, 0, 5.9))).toBe(true);
  });

  it("is never true for a centre move when both are at zoom 6 or above", () => {
    expect(capStateChanged(at(0, 0, 6), at(80, 40, 12))).toBe(false);
  });

  it("compares to the last set, so two 0.9 degree steps in a row add up and the second is a change", () => {
    const last = at(0, 0);
    expect(capStateChanged(last, at(0.9, 0))).toBe(false);
    expect(capStateChanged(last, at(1.8, 0))).toBe(true);
  });

  it("does not count a longitude carried past 180 as a move", () => {
    expect(capStateChanged(at(535, 10), at(175, 10))).toBe(false);
  });
});

describe("moveCapZoom", () => {
  it("is the lesser of the current zoom and the named zoom, the current one when none is named", () => {
    expect(moveCapZoom(2, 12)).toBe(2);
    expect(moveCapZoom(12, 2)).toBe(2);
    expect(moveCapZoom(12, 12)).toBe(12);
    expect(moveCapZoom(12, undefined)).toBe(12);
    expect(moveCapZoom(3, undefined)).toBe(3);
  });
});

describe("the filters the cap builds pass MapLibre's own validator (T1)", () => {
  // The label cap sets each filter with { validate: false } (useLabelCap.ts), which skips the check
  // MapLibre makes on every setFilter call. This is that check, run here instead, over the shapes
  // the cap can build: an ordinary centre, both poles, the antimeridian and zoom 6 and above.
  const style = JSON.parse(libertyText) as StyleSpecification;
  const errorsOf = (s: StyleSpecification): string[] => validateStyleMin(s).map((e) => e.message);
  const setFilterOf = (layer: object, filter: unknown): never => {
    const rest = { ...(layer as Record<string, unknown>) };
    delete rest.filter;
    return (filter ? { ...rest, filter } : rest) as never;
  };
  const withFilters = (lng: number, lat: number, zoom: number): StyleSpecification => {
    const caps = new Map(labelCapLayers(style).map((l) => [l.id, capFilter(l.filter, lng, lat, zoom)]));
    return { ...style, layers: style.layers.map((l) => (caps.has(l.id) ? setFilterOf(l, caps.get(l.id)) : l)) };
  };
  const baseline = errorsOf(style);
  const cameras: [string, number, number, number][] = [
    ["an ordinary centre", -95.37, 29.76, 2],
    ["the north pole", 20, 85, 2],
    ["the south pole", -30, -85, 3],
    ["the antimeridian", 179.5, 10, 2],
    ["a longitude carried past 180", 535, -20, 2],
    ["zoom 6, where the cap is off", 3.4, 6.5, 6],
    ["zoom 12", 3.4, 6.5, 12],
  ];

  it.each(cameras)("adds no validation error at %s", (_name, lng, lat, zoom) => {
    expect(errorsOf(withFilters(lng, lat, zoom))).toEqual(baseline);
  });

  it("sees a broken cap: the check can fail", () => {
    const first = labelCapLayers(style)[0].id;
    const broken = withFilters(0, 0, 2);
    broken.layers = broken.layers.map((l) => (l.id === first ? setFilterOf(l, ["within", "not a polygon"]) : l));
    expect(errorsOf(broken).length).toBeGreaterThan(baseline.length);
  });
});

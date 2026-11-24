import { describe, it, expect } from "vitest";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  BUNDLED_FONTS,
  BUNDLED_RANGES,
  basemapStyle,
  routeBasemapRequest,
  siteBase,
} from "./basemap";

const BASE = "http://host/site/";
const FONTS = "https://tiles.openfreemap.org/fonts";

describe("siteBase", () => {
  it("resolves the app base against the document address", () => {
    expect(siteBase("http://host/site/index.html", "./")).toBe("http://host/site/");
    expect(siteBase("http://localhost:5173/", "/")).toBe("http://localhost:5173/");
  });
});

describe("basemapStyle", () => {
  it("points sprite and glyphs at the site and declares the globe", () => {
    const style = basemapStyle(BASE);
    expect(style.sprite).toBe("http://host/site/basemap/sprites/ofm");
    expect(style.glyphs).toBe("http://host/site/basemap/fonts/{fontstack}/{range}.pbf");
    expect(style.projection).toEqual({ type: "globe" });
    const source = style.sources.openmaptiles;
    expect("url" in source && source.url).toBe("https://tiles.openfreemap.org/planet");
    const ids = style.layers.map((l) => l.id);
    for (const id of ["background", "water", "boundary_2", "label_country_1"]) {
      expect(ids).toContain(id);
    }
  });

  it("declares the flat projection for the flat map, and every other field as the globe's style has it", () => {
    const flat = basemapStyle(BASE, "flat");
    expect(flat.projection).toEqual({ type: "mercator" });
    const globe = basemapStyle(BASE, "globe");
    expect(globe.projection).toEqual({ type: "globe" });
    expect({ ...flat, projection: undefined }).toEqual({ ...globe, projection: undefined });
  });

  it("returns a fresh object each call", () => {
    const a = basemapStyle(BASE);
    const b = basemapStyle(BASE);
    expect(a).not.toBe(b);
    expect(a).toEqual(b);
    a.layers.length = 0;
    expect(basemapStyle(BASE).layers.length).toBeGreaterThan(0);
  });
});

describe("routeBasemapRequest", () => {
  it("leaves bundled glyph ranges alone, plain or percent-encoded", () => {
    expect(
      routeBasemapRequest(`${BASE}basemap/fonts/Noto Sans Regular/0-255.pbf`, "Glyphs", BASE),
    ).toBeUndefined();
    expect(
      routeBasemapRequest(`${BASE}basemap/fonts/Noto%20Sans%20Regular/0-255.pbf`, "Glyphs", BASE),
    ).toBeUndefined();
    // Fonts named here, not read from BUNDLED_FONTS: a font dropped from that list must fail.
    for (const font of ["Noto Sans Regular", "Noto Sans Bold", "Noto Sans Italic"]) {
      expect(
        routeBasemapRequest(`${BASE}basemap/fonts/${encodeURIComponent(font)}/8192-8447.pbf`, "Glyphs", BASE),
      ).toBeUndefined();
    }
  });

  it("sends unbundled ranges, fonts and font stacks to the tile host", () => {
    expect(
      routeBasemapRequest(`${BASE}basemap/fonts/Noto%20Sans%20Regular/1536-1791.pbf`, "Glyphs", BASE),
    ).toEqual({ url: `${FONTS}/Noto%20Sans%20Regular/1536-1791.pbf` });
    expect(
      routeBasemapRequest(`${BASE}basemap/fonts/Other%20Font/0-255.pbf`, "Glyphs", BASE),
    ).toEqual({ url: `${FONTS}/Other%20Font/0-255.pbf` });
    expect(
      routeBasemapRequest(
        `${BASE}basemap/fonts/Noto%20Sans%20Regular,Noto%20Sans%20Bold/0-255.pbf`,
        "Glyphs",
        BASE,
      ),
    ).toEqual({ url: `${FONTS}/Noto%20Sans%20Regular%2CNoto%20Sans%20Bold/0-255.pbf` });
  });

  it("passes other resource types and other addresses through", () => {
    expect(
      routeBasemapRequest(`${BASE}basemap/fonts/Other%20Font/0-255.pbf`, "Tile", BASE),
    ).toBeUndefined();
    expect(routeBasemapRequest(`${BASE}basemap/fonts/Other%20Font/0-255.pbf`, undefined, BASE)).toBeUndefined();
    expect(routeBasemapRequest("https://tiles.openfreemap.org/planet", "Glyphs", BASE)).toBeUndefined();
    expect(routeBasemapRequest(`${BASE}basemap/sprites/ofm.json`, "Glyphs", BASE)).toBeUndefined();
  });
});

describe("bundled glyph files", () => {
  it("exist for every bundled font and range", () => {
    // A non-literal path keeps Vite's asset transform off `new URL(..., import.meta.url)`.
    const rel = "../../../public/basemap/fonts";
    const dir = new URL(rel, import.meta.url);
    for (const font of BUNDLED_FONTS) {
      for (const range of BUNDLED_RANGES) {
        const file = fileURLToPath(new URL(`${dir.href}/${font}/${range}.pbf`));
        expect(existsSync(file), file).toBe(true);
      }
    }
  });
});

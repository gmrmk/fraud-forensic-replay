#!/usr/bin/env node
/**
 * fetch-basemap-assets.mjs - download the basemap files the investigator serves itself.
 *
 * Run by hand when the files should be refreshed. The committed files are what ships;
 * the app never runs this.
 *
 *   node scripts/fetch-basemap-assets.mjs               fetch and write everything
 *   node scripts/fetch-basemap-assets.mjs --self-check  test the pure helpers, no network
 *
 * Writes, under frontend/investigator/:
 *   src/lib/globe/basemap/liberty.json            the OpenFreeMap Liberty style, as served
 *   public/basemap/sprites/<name>{,@2x}.{json,png} its sprite sheet
 *   public/basemap/fonts/<font>/<range>.pbf        Latin glyph ranges of its three fonts
 *   public/basemap/licenses/*                      the upstream licence files, verbatim
 *   public/data/world/world.json                   Natural Earth 1:110m ocean, land borders
 *                                                  and country label points, reduced
 *
 * Every request carries a generic client name and nothing about this project.
 */
import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const APP = resolve(ROOT, "frontend", "investigator");

const STYLE_URL = "https://tiles.openfreemap.org/styles/liberty";
export const FONTS = ["Noto Sans Regular", "Noto Sans Bold", "Noto Sans Italic"];
// Basic Latin and Latin-1, Latin Extended-A and B, IPA and spacing marks, general punctuation.
export const RANGES = ["0-255", "256-511", "512-767", "8192-8447"];
const SPRITE_SUFFIXES = [".json", ".png", "@2x.json", "@2x.png"];
const NE_TAG = "v5.1.2";
const NE_BASE = `https://raw.githubusercontent.com/nvkelso/natural-earth-vector/${NE_TAG}/geojson/`;
const LICENCES = [
  ["https://raw.githubusercontent.com/hyperknot/openfreemap-styles/main/LICENSE.md", "openfreemap-styles-LICENSE.md"],
  ["https://raw.githubusercontent.com/notofonts/noto-fonts/main/LICENSE", "noto-fonts-OFL.txt"],
];

/** Two decimals of a degree: about 1.1 km, finer than 1:110m data. */
export const round2 = (n) => Math.round(n * 100) / 100;

/** A ring or line with rounded positions and no repeated neighbour. */
export function reduceLine(line) {
  const out = [];
  for (const [x, y] of line) {
    const p = [round2(x), round2(y)];
    const last = out[out.length - 1];
    if (!last || last[0] !== p[0] || last[1] !== p[1]) out.push(p);
  }
  return out;
}

/** The same geometry with rounded positions. Rings that collapse are dropped. */
export function reduceGeometry(g) {
  switch (g.type) {
    case "LineString":
      return { type: g.type, coordinates: reduceLine(g.coordinates) };
    case "MultiLineString":
      return { type: g.type, coordinates: g.coordinates.map(reduceLine).filter((l) => l.length >= 2) };
    case "Polygon":
      return { type: g.type, coordinates: g.coordinates.map(reduceLine).filter((r) => r.length >= 4) };
    case "MultiPolygon":
      return {
        type: g.type,
        coordinates: g.coordinates
          .map((poly) => poly.map(reduceLine).filter((r) => r.length >= 4))
          .filter((poly) => poly.length > 0),
      };
    default:
      throw new Error(`unexpected geometry type ${g.type}`);
  }
}

/** Geometry only: every property is dropped. */
export function shapes(fc) {
  return {
    type: "FeatureCollection",
    features: fc.features.map((f) => ({ type: "Feature", properties: {}, geometry: reduceGeometry(f.geometry) })),
  };
}

/** One named point per country that carries a label position. */
export function labelPoints(countries) {
  const features = [];
  for (const f of countries.features) {
    const { NAME, LABEL_X, LABEL_Y } = f.properties ?? {};
    if (typeof NAME !== "string" || !Number.isFinite(LABEL_X) || !Number.isFinite(LABEL_Y)) continue;
    features.push({
      type: "Feature",
      properties: { name: NAME },
      geometry: { type: "Point", coordinates: [round2(LABEL_X), round2(LABEL_Y)] },
    });
  }
  return { type: "FeatureCollection", features };
}

function selfCheck() {
  assert.equal(round2(-95.36984), -95.37);
  assert.deepEqual(reduceLine([[0, 0], [0.001, 0.001], [1, 1]]), [[0, 0], [1, 1]]);
  assert.deepEqual(reduceGeometry({ type: "LineString", coordinates: [[1.234, 5.678], [2, 3]] }), {
    type: "LineString",
    coordinates: [[1.23, 5.68], [2, 3]],
  });
  // A ring that collapses to fewer than four positions is dropped; a polygon with no ring left too.
  assert.deepEqual(
    reduceGeometry({ type: "MultiPolygon", coordinates: [[[[0, 0], [0.001, 0], [0, 0.001], [0, 0]]], [[[0, 0], [1, 0], [1, 1], [0, 0]]]] }),
    { type: "MultiPolygon", coordinates: [[[[0, 0], [1, 0], [1, 1], [0, 0]]]] },
  );
  assert.throws(() => reduceGeometry({ type: "Point", coordinates: [0, 0] }));
  const fc = shapes({ type: "FeatureCollection", features: [{ type: "Feature", properties: { a: 1 }, geometry: { type: "LineString", coordinates: [[0, 0], [1, 1]] } }] });
  assert.deepEqual(fc.features[0].properties, {});
  const labels = labelPoints({
    features: [
      { properties: { NAME: "Fiji", LABEL_X: 177.975427, LABEL_Y: -17.826099 } },
      { properties: { NAME: "Nowhere" } },
    ],
  });
  assert.deepEqual(labels.features, [
    { type: "Feature", properties: { name: "Fiji" }, geometry: { type: "Point", coordinates: [177.98, -17.83] } },
  ]);
  console.log("fetch-basemap-assets: self-check passed");
}

async function get(url) {
  const res = await fetch(url, { headers: { "User-Agent": "basemap-asset-fetch" } });
  if (!res.ok) throw new Error(`${url} answered ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}

const written = [];
function put(relPath, bytes) {
  const path = resolve(APP, relPath);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, bytes);
  written.push([relPath, bytes.length]);
}

async function main() {
  if (process.argv.includes("--self-check")) return selfCheck();

  const style = JSON.parse((await get(STYLE_URL)).toString("utf8"));
  assert.equal(typeof style.sprite, "string", "the style names no sprite");
  assert.equal(typeof style.glyphs, "string", "the style names no glyphs");
  put("src/lib/globe/basemap/liberty.json", Buffer.from(`${JSON.stringify(style, null, 2)}\n`));

  const spriteName = style.sprite.split("/").pop();
  for (const suffix of SPRITE_SUFFIXES) {
    put(`public/basemap/sprites/${spriteName}${suffix}`, await get(`${style.sprite}${suffix}`));
  }

  for (const font of FONTS) {
    for (const range of RANGES) {
      const url = style.glyphs.replace("{fontstack}", encodeURIComponent(font)).replace("{range}", range);
      put(`public/basemap/fonts/${font}/${range}.pbf`, await get(url));
    }
  }

  for (const [url, name] of LICENCES) put(`public/basemap/licenses/${name}`, await get(url));

  const ne = async (name) => JSON.parse((await get(`${NE_BASE}${name}.geojson`)).toString("utf8"));
  const world = {
    source: `Natural Earth 1:110m, natural-earth-vector ${NE_TAG}`,
    ocean: shapes(await ne("ne_110m_ocean")),
    borders: shapes(await ne("ne_110m_admin_0_boundary_lines_land")),
    labels: labelPoints(await ne("ne_110m_admin_0_countries")),
  };
  assert.ok(world.ocean.features.length > 0 && world.borders.features.length > 0 && world.labels.features.length > 100);
  put("public/data/world/world.json", Buffer.from(`${JSON.stringify(world)}\n`));

  let total = 0;
  for (const [path, bytes] of written) {
    total += bytes;
    console.log(`${String(bytes).padStart(8)}  ${path}`);
  }
  console.log(`${String(total).padStart(8)}  total, ${written.length} files`);
  console.log(`style sprite: ${style.sprite}`);
  console.log(`style glyphs: ${style.glyphs}`);
  console.log(`world: ${world.ocean.features.length} ocean shapes, ${world.borders.features.length} border lines, ${world.labels.features.length} country labels`);
}

main().catch((e) => {
  console.error(`fetch-basemap-assets: ${e.message}`);
  process.exit(1);
});

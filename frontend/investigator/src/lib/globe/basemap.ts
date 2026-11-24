/**
 * The basemap's style document, sprite sheet and Latin glyph ranges are served by the
 * site itself; only vector tiles and the relief raster still come from the tile host.
 * A glyph range that is not bundled is routed to the tile host by `routeBasemapRequest`.
 */
import type { StyleSpecification } from "maplibre-gl";
import type { MapMode } from "../../store/map-mode";
import { projectionFor } from "./projection";
import libertyText from "./basemap/liberty.json?raw";

export const BUNDLED_FONTS = ["Noto Sans Regular", "Noto Sans Bold", "Noto Sans Italic"];
export const BUNDLED_RANGES = ["0-255", "256-511", "512-767", "8192-8447"];
export const TILE_HOST_FONTS = "https://tiles.openfreemap.org/fonts";

/** Absolute address of the app's base folder, ending in a slash. */
export function siteBase(
  documentBase: string = document.baseURI,
  appBase: string = import.meta.env.BASE_URL,
): string {
  return new URL(appBase, documentBase).href;
}

/** The bundled style with sprite and glyphs under `base` and the projection of `shape`. A new
 *  object on every call. Glyphs are joined as strings: a URL constructor would escape the
 *  braces of the `{fontstack}` and `{range}` tokens. */
export function basemapStyle(base: string = siteBase(), shape: MapMode = "globe"): StyleSpecification {
  const style = JSON.parse(libertyText) as StyleSpecification;
  style.sprite = `${base}basemap/sprites/ofm`;
  style.glyphs = `${base}basemap/fonts/{fontstack}/{range}.pbf`;
  style.projection = projectionFor(shape);
  return style;
}

/** `transformRequest` router: a glyph request for the site whose font or range is not
 *  bundled goes to the tile host. Everything else passes unchanged. `resourceType` is a
 *  string because MapLibre's `ResourceType` const enum is not exported. */
export function routeBasemapRequest(
  url: string,
  resourceType?: string,
  base: string = siteBase(),
): { url: string } | undefined {
  const prefix = `${base}basemap/fonts/`;
  if (resourceType !== "Glyphs" || !url.startsWith(prefix)) return undefined;
  const [fontPart, range] = url.slice(prefix.length).split("/");
  const font = decodeURIComponent(fontPart);
  const rangeName = range.replace(/\.pbf$/, "");
  if (BUNDLED_FONTS.includes(font) && BUNDLED_RANGES.includes(rangeName)) return undefined;
  return { url: `${TILE_HOST_FONTS}/${encodeURIComponent(font)}/${rangeName}.pbf` };
}

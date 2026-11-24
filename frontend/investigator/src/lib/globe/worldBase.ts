/**
 * The world layer: oceans, land borders and country names from a bundled
 * Natural Earth 1:110m file. It is a placeholder the map draws while its vector
 * tiles load; it hides itself the first time a tile arrives, so borders and names
 * are never drawn twice.
 */
import type maplibregl from "maplibre-gl";

export const WORLD_URL = import.meta.env.BASE_URL + "data/world/world.json";
export const WORLD_MARK = "ffr:world-painted";
export const WORLD_LAYERS = ["ml-world-ocean", "ml-world-borders", "ml-world-labels"] as const;
/** The id of the style's vector tile source. */
export const VECTOR_SOURCE = "openmaptiles";
/** The world layer stops drawing here: 1:110m shapes are several pixels off from zoom 4. */
export const WORLD_MAX_ZOOM = 6;

export interface WorldData {
  ocean: GeoJSON.FeatureCollection;
  borders: GeoJSON.FeatureCollection;
  labels: GeoJSON.FeatureCollection;
}

const isCollection = (v: unknown): v is GeoJSON.FeatureCollection =>
  typeof v === "object" && v !== null && (v as { type?: unknown }).type === "FeatureCollection";

let cached: Promise<WorldData> | undefined;

/** Fetches the world file once per page; a failed fetch is not kept, so a later call retries. */
export function loadWorld(fetcher: typeof fetch = fetch): Promise<WorldData> {
  cached ??= fetcher(WORLD_URL)
    .then(async (res) => {
      if (!res.ok) throw new Error(`world file: HTTP ${res.status}`);
      const body = (await res.json()) as Record<string, unknown>;
      for (const key of ["ocean", "borders", "labels"]) {
        if (!isCollection(body[key])) throw new Error(`world file: ${key} is not a FeatureCollection`);
      }
      return body as unknown as WorldData;
    })
    .catch((err: unknown) => {
      cached = undefined;
      throw err;
    });
  return cached;
}

/**
 * Adds the world layer to a freshly loaded style and returns a function that
 * detaches it. A theme swap removes the layers with the rest of the style.
 */
export function attachWorldBase(
  map: maplibregl.Map,
  load: () => Promise<WorldData> = loadWorld,
): () => void {
  let detached = false;
  let tilesIn = false;
  let renderSub: { unsubscribe: () => void } | undefined;

  const tileSub = map.on("sourcedata", (e) => {
    if (e.sourceId !== VECTOR_SOURCE || !e.tile || !map.isSourceLoaded(VECTOR_SOURCE)) return;
    tilesIn = true;
    for (const id of WORLD_LAYERS) if (map.getLayer(id)) map.setLayoutProperty(id, "visibility", "none");
    tileSub.unsubscribe();
    renderSub?.unsubscribe(); // hidden before it drew: no mark
  });

  // A value copied from a style layer, or the fallback when the layer or value is missing.
  const paint = (from: string, prop: string, fallback: unknown) =>
    (map.getLayer(from) ? map.getPaintProperty(from, prop) : undefined) ?? fallback;
  const layout = (from: string, prop: string, fallback: unknown) =>
    (map.getLayer(from) ? map.getLayoutProperty(from, prop) : undefined) ?? fallback;

  const add = (data: WorldData) => {
    // No style: a theme swap replaced it before the data arrived (MapLibre returns none while
    // one loads). The swap's own setup attaches again.
    const style = detached || tilesIn ? undefined : map.getStyle();
    if (!style) return;
    const [ocean, borders, labels] = WORLD_LAYERS;
    for (const [id, fc] of [[ocean, data.ocean], [borders, data.borders], [labels, data.labels]] as const) {
      map.addSource(id, { type: "geojson", data: fc });
    }
    const firstContent = style.layers.find((l) => l.id !== "background" && l.id !== "ml-ocean-base")?.id;
    const layers: [maplibregl.LayerSpecification, string | undefined][] = [
      [
        {
          id: ocean,
          type: "fill",
          source: ocean,
          maxzoom: WORLD_MAX_ZOOM,
          paint: { "fill-color": paint("water", "fill-color", "#9ebdff") },
        } as maplibregl.LayerSpecification,
        firstContent,
      ],
      [
        {
          id: borders,
          type: "line",
          source: borders,
          maxzoom: WORLD_MAX_ZOOM,
          paint: {
            "line-color": paint("boundary_2", "line-color", "#6b6a6d"),
            "line-width": 1,
            "line-opacity": 0.6,
          },
        } as maplibregl.LayerSpecification,
        firstContent,
      ],
      [
        {
          id: labels,
          type: "symbol",
          source: labels,
          maxzoom: WORLD_MAX_ZOOM,
          layout: {
            "text-field": ["get", "name"],
            "text-font": layout("label_country_1", "text-font", ["Noto Sans Bold"]),
            "text-size": layout("label_country_1", "text-size", 11),
            "text-max-width": layout("label_country_1", "text-max-width", 6.25),
          },
          paint: {
            "text-color": paint("label_country_1", "text-color", "#000"),
            "text-halo-color": paint("label_country_1", "text-halo-color", "#fff"),
            "text-halo-width": paint("label_country_1", "text-halo-width", 1),
            "text-halo-blur": paint("label_country_1", "text-halo-blur", 1),
          },
        } as maplibregl.LayerSpecification,
        map.getLayer("label_country_3") ? "label_country_3" : undefined,
      ],
    ];
    for (const [spec, before] of layers) map.addLayer(spec, before);

    // The mark stands for "drawn": every world source loaded, at a zoom where the layer draws.
    // (A source no visible layer uses also counts as loaded, hence the zoom test.)
    renderSub = map.on("render", () => {
      if (map.getZoom() >= WORLD_MAX_ZOOM || !WORLD_LAYERS.every((id) => map.isSourceLoaded(id))) return;
      if (performance.getEntriesByName(WORLD_MARK).length === 0) performance.mark(WORLD_MARK);
      renderSub?.unsubscribe();
    });
  };

  // A rejected load is swallowed: the map simply has no world layer.
  load().then(add, () => {});

  return () => {
    detached = true;
    tileSub.unsubscribe();
    renderSub?.unsubscribe();
  };
}

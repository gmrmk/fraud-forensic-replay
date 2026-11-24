import { describe, it, expect, vi } from "vitest";
import type maplibregl from "maplibre-gl";
import { bindGenericMarkers, genericFC, recolourGenericFC, visibleGeneric } from "./generic-markers";
import type { Entity } from "../entity";
import type { ScenarioNode } from "../scenarios";
import { storyInk } from "../../theme/kind-ink";

const rawManifests = import.meta.glob<string>("../../../../../backend/scenarios/*.scenario.json", {
  query: "?raw",
  import: "default",
  eager: true,
});
const platformNodes = (): ScenarioNode[] => {
  const found = Object.values(rawManifests)
    .map((raw) => JSON.parse(raw) as { id: string; nodes: ScenarioNode[] })
    .find((m) => m.id === "platform-access");
  if (!found) throw new Error("no scenario file with id platform-access under backend/scenarios");
  return found.nodes;
};

const node = (kind: string, palette: string): ScenarioNode => ({
  kind, label: kind, palette, source: "sql",
});
const ent = (id: string, kind: string, timestamp: number, coords: Entity["coords"]): Entity => ({
  id, kind, timestamp, coords, fields: {},
  displayMetadata: { primaryLabel: id, secondaryLabel: "", paletteKind: kind, pivotableFields: [] },
});

const houston = { lat: 29.98, lng: -95.34 };
const london = { lat: 51.47, lng: -0.45 };
const entities = [
  ent("a", "hop", 100, houston),
  ent("b", "hop", 300, london),
  ent("refund", "refund", 200, null),
  ent("timeless", "account", 0, houston),
];

describe("visibleGeneric", () => {
  it("keeps only coordinate-bearing entities at or before the playhead", () => {
    const ids = visibleGeneric(entities, 200, true).map((e) => e.id);
    expect(ids).toEqual(["a", "timeless"]);
  });

  it("is a pure function of the playhead: scrubbing back un-shows an entity", () => {
    expect(visibleGeneric(entities, 300, true).map((e) => e.id)).toContain("b");
    expect(visibleGeneric(entities, 299, true).map((e) => e.id)).not.toContain("b");
  });

  it("shows every placeable entity before the playhead bounds have loaded", () => {
    expect(visibleGeneric(entities, 0, false).map((e) => e.id)).toEqual(["a", "b", "timeless"]);
  });
});

describe("genericFC", () => {
  it("builds one [lng, lat] point per entity, id promoted and coloured by the node palette", () => {
    const fc = genericFC([entities[0], entities[1]], [node("hop", "#00e5ff")]);
    expect(fc.features).toHaveLength(2);
    expect(fc.features[0].geometry).toEqual({ type: "Point", coordinates: [-95.34, 29.98] });
    expect(fc.features[0].properties).toEqual({ id: "a", kind: "hop", color: "#00e5ff" });
  });

  it("falls back to the muted grey for a kind the schema does not declare", () => {
    const fc = genericFC([entities[0]], []);
    expect(fc.features[0].properties?.color).toBe("#808080");
  });

  it("leaves overlay kinds (a decision mapping) to the badge layer", () => {
    const overlay: ScenarioNode = { ...node("verdict_export", "#ff0000"), decision: { status: "s", outcome: "o", note: "n", actor: "a", target: "t", key: "k", event: "e" } };
    const fc = genericFC([entities[0], ent("v1", "verdict_export", 100, houston)], [node("hop", "#00e5ff"), overlay]);
    expect(fc.features.map((f) => f.properties?.id)).toEqual(["a"]);
  });

  it("a kind that declares a magnitude carries a scale: its value against the pack's largest, by square root", () => {
    const sized: ScenarioNode = { ...node("hop", "#00e5ff"), magnitude: "weight" };
    const weigh = (e: Entity, weight: unknown): Entity => ({ ...e, fields: { ...e.fields, weight } });
    const fc = genericFC([weigh(entities[0], 25), weigh(entities[1], 100), weigh(entities[0], null)], [sized], { hop: 100 });
    expect(fc.features.map((f) => f.properties?.scale)).toEqual([0.5, 1, 0]);
  });

  it("a kind that declares none carries no scale, with or without maxima: its features are as before", () => {
    const fc = genericFC([entities[0]], [node("hop", "#00e5ff")], { hop: 100 });
    expect(fc.features[0].properties).toEqual({ id: "a", kind: "hop", color: "#00e5ff" });
  });

  it("skips an entity with no coordinates", () => {
    expect(genericFC([entities[2]], [node("refund", "#ff5c5c")]).features).toEqual([]);
  });
});

describe("genericFC takes a story kind's theme and mode colour", () => {
  const nodes = platformNodes();
  const signin = ent("s1", "console_signin", 100, houston);
  const usage = ent("u1", "usage", 200, london);
  const colours = (fc: GeoJSON.FeatureCollection) => fc.features.map((f) => f.properties?.color);

  it("paints each kind with the resolver's mark when ink is passed", () => {
    const light = genericFC([signin, usage], nodes, {}, storyInk(nodes, "light", "neon"));
    expect(colours(light)).toEqual(["#198522", "#a16707"]);
    const dark = genericFC([signin, usage], nodes, {}, storyInk(nodes, "dark", "neon"));
    expect(colours(dark)).toEqual(["#7ee787", "#f5a623"]);
  });

  // PIN: the old call with three arguments keeps the manifest hexes.
  it("keeps the manifest hex when no ink is passed", () => {
    expect(colours(genericFC([signin, usage], nodes))).toEqual(["#7ee787", "#f5a623"]);
  });

  it("keeps the manifest hex for a kind the ink has no entry for", () => {
    const ink = storyInk(nodes, "light", "neon");
    const plain = ent("h1", "hop", 100, houston);
    const fc = genericFC([plain, signin], [node("hop", "#00e5ff"), ...nodes], {}, ink);
    expect(colours(fc)).toEqual(["#00e5ff", "#198522"]);
  });
});

describe("recolourGenericFC", () => {
  const nodes = platformNodes();
  const signin = ent("s1", "console_signin", 100, houston);
  const hop = ent("h1", "hop", 100, london);
  const base = genericFC([signin, hop], [...nodes, node("hop", "#00e5ff")]);

  it("recolours by kind and leaves a kind without ink as it was", () => {
    const next = recolourGenericFC(base, storyInk(nodes, "light", "neon"));
    expect(next.features.map((f) => f.properties?.color)).toEqual(["#198522", "#00e5ff"]);
    expect(next.features[1]).toBe(base.features[1]);
  });

  it("returns a new collection and never changes the one it was given", () => {
    const next = recolourGenericFC(base, storyInk(nodes, "light", "neon"));
    expect(next).not.toBe(base);
    expect(base.features[0].properties?.color).toBe("#7ee787");
    expect(next.features[0].properties).toMatchObject({ id: "s1", kind: "console_signin" });
    expect(next.features[0].geometry).toEqual(base.features[0].geometry);
  });
});

describe("bindGenericMarkers", () => {
  // A map that records delegated listeners (map.on(type, layerId, fn)) like maplibre does.
  function mockMap() {
    const live: { type: string; layer: string; fn: (e: unknown) => void }[] = [];
    const style = { cursor: "" };
    const map = {
      on: (type: string, layer: string, fn: (e: unknown) => void) => {
        const entry = { type, layer, fn };
        live.push(entry);
        return { unsubscribe: () => live.splice(live.indexOf(entry), 1) };
      },
      getCanvas: () => ({ style }),
    } as unknown as maplibregl.Map;
    return { map, live, style };
  }
  const click = (live: { type: string; fn: (e: unknown) => void }[], id: string) =>
    live.find((l) => l.type === "click")!.fn({ features: [{ properties: { id } }] });

  it("a halo click navigates to the clicked generic entity", () => {
    const { map, live } = mockMap();
    const navigate = vi.fn();
    bindGenericMarkers(map, { current: { genericEntities: entities, navigate } });
    expect(live.map((l) => l.layer)).toEqual(["ml-generic-halo", "ml-generic-halo", "ml-generic-halo"]);
    click(live, "b");
    expect(navigate).toHaveBeenCalledWith({ kind: "entity", entity: entities[1] });
  });

  it("ignores a click on an id it no longer holds, and reads the entities live", () => {
    const { map, live } = mockMap();
    const navigate = vi.fn();
    const ref = { current: { genericEntities: [] as Entity[], navigate } };
    bindGenericMarkers(map, ref);
    click(live, "a");
    expect(navigate).not.toHaveBeenCalled();
    ref.current = { genericEntities: entities, navigate };
    click(live, "a");
    expect(navigate).toHaveBeenCalledTimes(1);
  });

  it("the teardown it returns unsubscribes every listener (no stacking across basemap swaps)", () => {
    const { map, live } = mockMap();
    const off = bindGenericMarkers(map, { current: { genericEntities: entities, navigate: vi.fn() } });
    off();
    expect(live).toEqual([]);
  });
});

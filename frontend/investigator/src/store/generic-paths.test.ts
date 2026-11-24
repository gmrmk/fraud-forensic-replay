/** B4: a manifest node flagged `path: true` (hop) gets a globe Path, in its node colour. */
import { describe, it, expect, beforeEach } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { useLayers } from "./layers";
import { usePaths } from "./paths";
import { useSchema } from "./schema";
import { useTheme } from "./theme";
import { buildPath } from "../lib/paths";
import { manifestRowToEntity } from "../lib/adapters/manifest-row";
import type { Entity } from "../lib/entity";
import type { ScenarioNode } from "../lib/scenarios";
import { COLOR_MODES, THEMES } from "../theme/axes";
import { resolveEntityColorRgb01 } from "../theme/resolve";
import { hexToRgb01 } from "../theme/to-rgb";

const rawManifests = import.meta.glob<string>("../../../../backend/scenarios/*.scenario.json", {
  query: "?raw",
  import: "default",
  eager: true,
});
const nodesOf = (id: string): ScenarioNode[] => {
  const found = Object.values(rawManifests)
    .map((raw) => JSON.parse(raw) as { id: string; nodes: ScenarioNode[] })
    .find((m) => m.id === id);
  if (!found) throw new Error(`no scenario file with id ${id} under backend/scenarios`);
  return found.nodes;
};

const hopNode: ScenarioNode = {
  kind: "hop", label: "Hop", palette: "#00e5ff", source: "sql", path: true,
  coords: { lat: "lat", lng: "lng" }, timestamp: "event_at", primary: "${flight_no} · ${status}",
};
const shipmentNode: ScenarioNode = { ...hopNode, kind: "shipment", path: undefined };

const HOUSTON = { lat: 29.9844, lng: -95.3414 };
const LONDON = { lat: 51.47, lng: -0.4543 };
const LAGOS = { lat: 6.5774, lng: 3.3212 };
// Two shipments on the same route: four events each, same places.
const leg = (id: string, at: string, p: { lat: number; lng: number }) =>
  manifestRowToEntity(hopNode, { id, lat: p.lat, lng: p.lng, event_at: at });
const hops = [
  leg("a1", "2026-05-25T18:06:00-05:00", HOUSTON), leg("b1", "2026-05-25T18:20:00-05:00", HOUSTON),
  leg("a2", "2026-05-26T09:45:00+01:00", LONDON), leg("b2", "2026-05-26T09:47:00+01:00", LONDON),
  leg("a3", "2026-05-26T13:06:00+01:00", LONDON), leg("b3", "2026-05-26T13:20:00+01:00", LONDON),
  leg("a4", "2026-05-26T19:45:00+01:00", LAGOS), leg("b4", "2026-05-26T19:48:00+01:00", LAGOS),
];

describe("seedPathKinds", () => {
  beforeEach(() => useLayers.setState({ pathKinds: { fraud: true, auth: false } }));

  it("adds a path-flagged node kind, on, and ignores unflagged kinds", () => {
    useLayers.getState().seedPathKinds([hopNode, shipmentNode]);
    expect(useLayers.getState().pathKinds).toEqual({ fraud: true, auth: false, hop: true });
  });

  it("never overrides a toggle the analyst already set", () => {
    useLayers.setState({ pathKinds: { hop: false } });
    useLayers.getState().seedPathKinds([hopNode]);
    expect(useLayers.getState().pathKinds.hop).toBe(false);
  });
});

describe("a hop Path", () => {
  it("runs Houston -> London -> Lagos, one node per hop event", () => {
    const p = buildPath(hops, "hop")!;
    expect(p.points[0]).toEqual([HOUSTON.lng, HOUSTON.lat]);
    expect(p.points[p.points.length - 1]).toEqual([LAGOS.lng, LAGOS.lat]);
    expect(p.points).toContainEqual([LONDON.lng, LONDON.lat]);
    expect(p.nodes).toHaveLength(hops.length);
    // The six-on-one-route case: coincident events collapse, the path
    // does not zig-zag. Longitude is monotonic eastward across the legs.
    const lngs = p.points.map(([lng]) => lng);
    expect(lngs).toEqual([...lngs].sort((a, b) => a - b));
  });

  it("takes the manifest hex when one is passed (an unmapped kind is not grey)", () => {
    const p = buildPath(hops, "hop", { hex: "#00e5ff" })!;
    expect(p.color).toEqual([0, 229 / 255, 1]);
  });
});

describe("usePaths for a path-flagged generic kind", () => {
  beforeEach(() => {
    useSchema.setState({ nodes: [hopNode] });
    useLayers.setState({ pathKinds: { hop: true } });
  });

  it("builds the hop Path in the node's colour", () => {
    const { result } = renderHook(() => usePaths({ hop: hops }));
    expect(result.current).toHaveLength(1);
    expect(result.current[0].kind).toBe("hop");
    expect(result.current[0].color).toEqual([0, 229 / 255, 1]);
  });

  it("draws nothing once the analyst toggles it off", () => {
    useLayers.setState({ pathKinds: { hop: false } });
    const { result } = renderHook(() => usePaths({ hop: hops }));
    expect(result.current).toEqual([]);
  });
});

/** Ruling T4: the data's own path takes the resolver's mark for its kind in the live theme and mode. */
describe("usePaths takes a story kind's theme and mode colour", () => {
  const signinNode = nodesOf("platform-access").find((n) => n.kind === "console_signin")!;
  const signin = (id: string, at: string, p: { lat: number; lng: number }): Entity =>
    manifestRowToEntity(signinNode, { id, seat_id: "seat-1", lat: p.lat, lng: p.lng, timestamp: at });
  const trail = [
    signin("c1", "2026-05-25T18:06:00-05:00", HOUSTON),
    signin("c2", "2026-05-26T09:45:00+01:00", LONDON),
  ];

  beforeEach(() => {
    useSchema.setState({ nodes: nodesOf("platform-access") });
    useLayers.setState({ pathKinds: { console_signin: true } });
    act(() => {
      useTheme.getState().setTheme("light");
      useTheme.getState().setColor("neon");
    });
  });

  it("is the mark of the live theme and mode, and follows a switch in one mount", () => {
    const { result } = renderHook(() => usePaths({ console_signin: trail }));
    expect(result.current).toHaveLength(1);
    expect(result.current[0].color).toEqual(hexToRgb01("#198522"));
    act(() => useTheme.getState().setColor("deuteranopia"));
    expect(result.current[0].color).toEqual(hexToRgb01("#29250a"));
    act(() => useTheme.getState().setTheme("dark"));
    expect(result.current[0].color).toEqual(hexToRgb01("#e8d978"));
  });

  it("keeps the manifest colour in dark neon", () => {
    act(() => useTheme.getState().setTheme("dark"));
    const { result } = renderHook(() => usePaths({ console_signin: trail }));
    expect(result.current[0].color).toEqual(hexToRgb01("#7ee787"));
  });
});

// PIN: a kind with a palette slot is not changed in any theme or mode.
describe("usePaths for a slot kind", () => {
  it("keeps the slot colour of a fraud path in every theme and mode", () => {
    useSchema.setState({ nodes: nodesOf("card-fraud") });
    useLayers.setState({ pathKinds: { fraud: true } });
    const at = (id: string, ts: number, p: { lat: number; lng: number }): Entity => ({
      id, kind: "fraud", timestamp: ts, coords: p, fields: {},
      displayMetadata: { primaryLabel: id, secondaryLabel: "", paletteKind: "fraud", pivotableFields: [] },
    });
    const events = [at("f1", 1_000, HOUSTON), at("f2", 2_000, LONDON)];
    const { result } = renderHook(() => usePaths({ fraud: events }));
    for (const theme of THEMES) {
      for (const color of COLOR_MODES) {
        act(() => {
          useTheme.getState().setTheme(theme);
          useTheme.getState().setColor(color);
        });
        expect(result.current[0].color, `${theme} ${color}`).toEqual(resolveEntityColorRgb01("fraud", theme, color));
      }
    }
  });
});

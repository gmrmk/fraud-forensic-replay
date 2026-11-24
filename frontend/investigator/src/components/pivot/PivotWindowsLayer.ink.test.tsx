// Test C6.3 (theme follow): the dashed tether of a flagged window takes the colour of a story's own kind
// in the live theme and colour mode, for a record window and for a detail window, so it is the colour
// the record window's own frame is drawn in. Dark neon keeps the manifest colour; a kind that has a
// palette slot keeps the colour it has today.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, render } from "@testing-library/react";
import type maplibregl from "maplibre-gl";
import { PivotWindowsLayer } from "./PivotWindowsLayer";
import { RECORD } from "../notes/test-support";
import { paletteForKind } from "../../lib/entity-palette";
import type { Entity } from "../../lib/entity";
import type { PivotContext } from "../../lib/matches";
import type { ScenarioNode } from "../../lib/scenarios";
import { useMarksStore } from "../../store/marks";
import { usePivotStore } from "../../store/pivot";
import { usePivotData } from "../../store/pivot-data";
import { usePlayhead } from "../../store/playhead";
import { useSchema } from "../../store/schema";
import { useTheme } from "../../store/theme";
import { storyInk } from "../../theme/kind-ink";

const stopNode = { kind: "stop", label: "Stop", palette: "#f5a623", source: "stops" } as ScenarioNode;
const NODES = [stopNode];
const context: PivotContext = { transactions: [], logins: [], places: [], entities: [RECORD] };
const here = { lng: -95.37, lat: 29.76 };
const map = {
  project: () => ({ x: 100, y: 100 }),
  getCenter: () => here,
  on: vi.fn(),
  off: vi.fn(),
} as unknown as maplibregl.Map;

const stopEntity: Entity = { ...RECORD, id: "d-1", fields: { id: "d-1" } };

const saved = { theme: useTheme.getState().theme, color: useTheme.getState().color };
beforeEach(() => {
  usePivotStore.setState({ windows: [], nextZ: 20 });
  usePivotData.setState({ transactions: [], logins: [], accountEvents: [], transfers: [] });
  usePlayhead.setState({
    playhead: Date.parse("2026-05-14T23:00:00Z"),
    minTime: Date.parse("2026-05-14T00:00:00Z"),
    maxTime: Date.parse("2026-05-15T00:00:00Z"),
  });
  useMarksStore.getState().clear();
  useSchema.setState({ nodes: NODES });
});
afterEach(() => {
  useTheme.setState(saved);
  useSchema.setState({ nodes: [] });
  vi.restoreAllMocks();
});

const strokes = (c: HTMLElement) => Array.from(c.querySelectorAll("line")).map((l) => l.getAttribute("stroke"));
const openRecord = () => usePivotStore.getState().openRecord({ kind: "stop", id: "rec-1" }, { lngLat: RECORD.coords, pinned: false });
// A popout is a detail window anchored to its point on the globe, so it draws a tether.
const SECTION = { type: "section", sectionId: "sign-in", label: "Sign-in" } as const;
const openDetail = (entity: Entity) => usePivotStore.getState().openPopout(entity, SECTION, here);

describe("PivotWindowsLayer: the tether follows the theme and the colour mode", () => {
  it("a record window's tether is the resolver's mark in light neon, and follows a live switch", () => {
    useTheme.setState({ theme: "light", color: "neon" });
    const mark = storyInk(NODES, "light", "neon").get("stop")?.mark as string;
    expect(mark).not.toBe("#f5a623"); // light steps the declared colour: the test cannot pass by accident
    openRecord();
    const { container } = render(<PivotWindowsLayer map={map} decisions={[]} context={context} />);
    expect(strokes(container)).toEqual([mark]);
    act(() => useTheme.setState({ theme: "light", color: "monochrome" }));
    expect(strokes(container)).toEqual([storyInk(NODES, "light", "monochrome").get("stop")?.mark]);
  });

  it("a record window's tether is the manifest colour in dark neon", () => {
    useTheme.setState({ theme: "dark", color: "neon" });
    openRecord();
    const { container } = render(<PivotWindowsLayer map={map} decisions={[]} context={context} />);
    expect(strokes(container)).toEqual(["#f5a623"]);
  });

  it("a detail window of a story's own kind takes the mark too", () => {
    useTheme.setState({ theme: "light", color: "neon" });
    openDetail(stopEntity);
    const { container } = render(<PivotWindowsLayer map={map} decisions={[]} context={context} />);
    expect(strokes(container)).toEqual([storyInk(NODES, "light", "neon").get("stop")?.mark]);
  });

  it("a kind that has a palette slot keeps its colour in every state", () => {
    openDetail({ ...stopEntity, id: "d-2", kind: "login" });
    for (const [theme, color] of [["light", "neon"], ["dark", "monochrome"], ["light", "deuteranopia"]] as const) {
      useTheme.setState({ theme, color });
      const { container, unmount } = render(<PivotWindowsLayer map={map} decisions={[]} context={context} />);
      expect(strokes(container), `${theme} ${color}`).toEqual([paletteForKind("login").hex]);
      unmount();
    }
  });
});

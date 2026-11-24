/**
 * The investigator's marks on the globe: one plate marker for each marked record the one function
 * draws, and in the ring form (the record's own dot is drawn) one ring marker round the dot, with the
 * plate at the handle's end. A record with no dot drawn (a decision capsule, a pinned record ahead of
 * the playhead, a place while Places is off) takes the plate alone, led by the lens. Maplibre is
 * mocked: a marker records its options, so anchors and offsets are read straight.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import type maplibregl from "maplibre-gl";
import { GlobeMarks } from "./GlobeMarks";
import { GlobeLens } from "./glyphs";
import { handleOffset, haloRadius, ringRadius } from "./geometry";
import { lensGeometry } from "./glyph-paths";
import { lookupFromContext } from "../notes/record-lookup";
import { CONTEXT, NOTE_TIME, RECORD, SCENARIO } from "../notes/test-support";
import { useLayers } from "../../store/layers";
import { useMarksStore } from "../../store/marks";
import { useNotesStore } from "../../store/notes";
import { usePivotData } from "../../store/pivot-data";
import { usePivotStore } from "../../store/pivot";
import { usePlayhead } from "../../store/playhead";
import { useSchema } from "../../store/schema";
import { useSelection } from "../../store/selection";
import { useSolo } from "../../store/solo";
import { makeNode, makeNote } from "../../lib/notes/test-fixtures";
import { markName, markTip, pileName, pileTip } from "../../lib/tooltip-words/marks";
import { when } from "../../lib/time-words";
import type { Entity } from "../../lib/entity";
import type { Note } from "../../lib/notes/types";
import type { RecordNode } from "../../lib/marks/types";

interface Live {
  el: HTMLElement;
  opts: { anchor?: string; offset?: [number, number]; opacityWhenCovered?: number };
  lngLat: [number, number] | null;
}
const live = vi.hoisted(() => ({ markers: [] as Live[] }));
vi.mock("maplibre-gl", () => {
  class Marker {
    el: HTMLElement;
    opts: Live["opts"];
    lngLat: [number, number] | null = null;
    constructor(opts: { element: HTMLElement } & Live["opts"]) {
      this.el = opts.element;
      this.opts = opts;
    }
    setLngLat(ll: [number, number]) {
      this.lngLat = ll;
      return this;
    }
    addTo(map: { getCanvasContainer(): HTMLElement }) {
      map.getCanvasContainer().appendChild(this.el);
      live.markers.push(this);
      return this;
    }
    remove() {
      this.el.remove();
      live.markers = live.markers.filter((m) => m !== this);
      return this;
    }
  }
  return { default: { Marker }, Marker };
});

function fakeMap() {
  const container = document.createElement("div");
  document.body.appendChild(container);
  return {
    getCanvasContainer: () => container,
    on: vi.fn(),
    off: vi.fn(),
    project: vi.fn(([lng, lat]: [number, number]) => ({ x: lng * 100, y: -lat * 100 })),
    getCenter: () => ({ lng: -95, lat: 30 }),
  } as unknown as maplibregl.Map;
}

const REC = { kind: "stop", id: "rec-1" };
const NAME = "Open your mark: stop: Corner Store";
const lookup = lookupFromContext(CONTEXT);
const linked = (link: { kind: string; id: string }, over: Partial<Note> = {}): Note =>
  makeNote({ id: `note-${link.id}`.padEnd(37, "c"), seq: 1, time: NOTE_TIME, link, ...over });

/** The state the one function reads, every switch on and nothing selected; then the story's nodes and notes. */
function state(over: { notes?: Note[]; nodes?: RecordNode[]; playhead?: number } = {}) {
  live.markers = [];
  usePivotStore.setState({ windows: [], nextZ: 20 });
  usePlayhead.setState({
    playhead: over.playhead ?? NOTE_TIME + 1000,
    minTime: NOTE_TIME - 100000,
    maxTime: NOTE_TIME + 100000,
    windowMin: NOTE_TIME - 100000,
    windowMax: NOTE_TIME + 100000,
    isPlaying: false,
  });
  useSelection.setState({ selected: null });
  useLayers.setState({ showAuths: true, showLogins: true, showPlaces: false, hiddenKinds: [], hiddenValues: {}, yoursOn: false });
  useSchema.setState({ nodes: [] });
  usePivotData.setState({ entities: [] });
  useSolo.setState({ solo: null });
  useNotesStore.setState({ scenario: SCENARIO, notes: over.notes ?? [], customCategories: [], skipped: 0, error: null });
  useMarksStore.setState({ scenario: SCENARIO, nodes: over.nodes ?? [], paths: [] });
}

const ring = () => live.markers.find((m) => m.el.hasAttribute("data-mark-ring"));
const plates = () => live.markers.filter((m) => m.el.hasAttribute("data-mark"));
const parts = (el: HTMLElement) => Array.from(el.querySelectorAll("[data-part]")).map((p) => p.getAttribute("data-part"));
const WAIT = makeNode({ disposition: "wait" });

describe("the lens geometry the layer relies on", () => {
  it("GlobeLens is a square centred on the ring, its handle ending up and left at the ring's radius plus the handle", () => {
    const { container } = render(<GlobeLens ring={20} handle={7} />);
    const svg = container.querySelector("svg") as SVGElement;
    expect(svg.getAttribute("width")).toBe(svg.getAttribute("height"));
    const box = Number(svg.getAttribute("width"));
    const circle = container.querySelector("circle") as SVGElement;
    expect(Number(circle.getAttribute("cx"))).toBeCloseTo(box / 2, 6);
    expect(Number(circle.getAttribute("cy"))).toBeCloseTo(box / 2, 6);
    const line = container.querySelector("line") as SVGElement;
    const end = box / 2 - (10 + 7) / Math.SQRT2;
    expect(Math.abs(Number(line.getAttribute("x2")) - end)).toBeLessThan(0.6);
    expect(Math.abs(Number(line.getAttribute("y2")) - end)).toBeLessThan(0.6);
  });
});

describe("GlobeMarks, the ring form", () => {
  beforeEach(() => state({ notes: [linked(REC)], nodes: [WAIT] }));

  it("draws a ring marker round the dot and a plate marker at the handle's end", () => {
    render(<GlobeMarks map={fakeMap()} lookup={lookup} />);
    expect(live.markers).toHaveLength(2);
    const r = ring()!;
    expect(r.lngLat).toEqual([RECORD.coords!.lng, RECORD.coords!.lat]);
    expect(r.opts.anchor).toBe("center");
    expect(r.opts.offset).toEqual([0, 0]);
    expect(r.el.getAttribute("aria-hidden")).toBe("true");
    expect(r.el.style.pointerEvents).toBe("none");
    // The lens: ring twice the radius (halo 9 + 1), handle 7.
    const svg = r.el.querySelector("svg") as SVGElement;
    expect(Number(svg.getAttribute("width"))).toBe(lensGeometry(2 * ringRadius(haloRadius(null)), 7).box);
    expect(r.el.querySelector("circle")?.getAttribute("r")).toBe(String(ringRadius(haloRadius(null))));
    // Its casing: a ground-coloured shadow on the lens's own wrapper, in the investigator's ink.
    const wrapper = svg.parentElement as HTMLElement;
    expect(wrapper.style.filter).toBe("drop-shadow(0 0 1px rgb(var(--bg-rgb)))");
    expect(wrapper.style.color).toBe("var(--text)");

    const p = plates()[0];
    expect(p.lngLat).toEqual([RECORD.coords!.lng, RECORD.coords!.lat]);
    expect(p.opts.anchor).toBe("bottom-right");
    const d = handleOffset(ringRadius(haloRadius(null)));
    expect(d).toBeCloseTo(12.02, 2);
    expect(p.opts.offset![0]).toBeCloseTo(-d, 6);
    expect(p.opts.offset![1]).toBeCloseTo(-d, 6);
    expect(p.el.tagName).toBe("BUTTON");
    expect(p.el.getAttribute("aria-label")).toBe(NAME);
    expect(p.el.getAttribute("data-tip")).toBe(
      ["Your mark on stop: Corner Store.", `Time: ${when(NOTE_TIME)}`, "Notes: 1", "You marked this WAITING."].join("\n"),
    );
  });

  it("the plate holds the count and the glyph, with no lens (the ring is the lens)", () => {
    render(<GlobeMarks map={fakeMap()} lookup={lookup} />);
    expect(parts(plates()[0].el)).toEqual(["count", "disposition"]);
  });

  it("both elements ride the verdict marker class, so the far side of the globe hides them, and no marker shows when covered", () => {
    render(<GlobeMarks map={fakeMap()} lookup={lookup} />);
    for (const m of live.markers) {
      expect(m.el.className).toContain("verdict-marker");
      expect(m.opts.opacityWhenCovered).toBe(0);
    }
  });

  it("a press on the plate opens the record's window and leaves the playhead and the selection where they were", () => {
    render(<GlobeMarks map={fakeMap()} lookup={lookup} />);
    const before = usePlayhead.getState().playhead;
    fireEvent.click(plates()[0].el);
    const w = usePivotStore.getState().windows;
    expect(w).toHaveLength(1);
    expect(w[0].kind === "record" && w[0].record).toEqual(REC);
    expect(w[0].kind === "record" && w[0].anchor.type).toBe("node");
    expect(usePlayhead.getState().playhead).toBe(before);
    expect(useSelection.getState().selected).toBeNull();
  });

  it("stops the pointer events the map listens for, so a press never pans the map", () => {
    render(<GlobeMarks map={fakeMap()} lookup={lookup} />);
    let reached = 0;
    document.body.addEventListener("mousedown", () => (reached += 1));
    fireEvent.mouseDown(plates()[0].el);
    expect(reached).toBe(0);
  });

  it("an open window inverts the plate", () => {
    usePivotStore.getState().openRecord(REC, { lngLat: null, pinned: false });
    render(<GlobeMarks map={fakeMap()} lookup={lookup} />);
    expect(plates()[0].el.querySelector("[data-mark-plate]")?.getAttribute("data-open")).toBe("true");
  });

  it("draws nothing without a map, or for a record with no place", () => {
    const { rerender } = render(<GlobeMarks map={null} lookup={lookup} />);
    expect(live.markers).toHaveLength(0);
    const flat: Entity = { ...RECORD, coords: null };
    rerender(<GlobeMarks map={fakeMap()} lookup={lookupFromContext({ ...CONTEXT, entities: [flat] })} />);
    expect(live.markers).toHaveLength(0);
  });
});

describe("GlobeMarks, the plate alone", () => {
  it("a pinned record ahead of the playhead: one plate at [-7, -7] led by the lens, contents dim, the pin bright", () => {
    state({ notes: [linked(REC)], nodes: [makeNode({ pinned: true, disposition: "wait" })], playhead: NOTE_TIME - 1000 });
    render(<GlobeMarks map={fakeMap()} lookup={lookup} />);
    expect(live.markers).toHaveLength(1);
    const p = plates()[0];
    expect(p.opts.anchor).toBe("bottom-right");
    expect(p.opts.offset).toEqual([-7, -7]);
    expect(parts(p.el)).toEqual(["lens", "count", "disposition", "pin"]);
    // Each content part dims to its own opacity (mark-ink.ts), not one group opacity of 0.45.
    for (const name of ["lens", "count", "disposition"]) {
      const o = Number((p.el.querySelector(`[data-part="${name}"]`) as HTMLElement).style.opacity);
      expect(o, name).toBeLessThan(1);
      expect(o, name).toBeGreaterThanOrEqual(0.2);
    }
    expect((p.el.querySelector('[data-part="pin"]') as HTMLElement).style.opacity).toBe("1");
  });

  it("an unpinned record ahead of the playhead draws no marker (row 6)", () => {
    state({ notes: [linked(REC)], nodes: [WAIT], playhead: NOTE_TIME - 1000 });
    render(<GlobeMarks map={fakeMap()} lookup={lookup} />);
    expect(live.markers).toHaveLength(0);
  });

  it("a mark changes form as the playhead passes its record: the plate alone, then the ring and the plate", () => {
    state({ nodes: [makeNode({ pinned: true })], playhead: NOTE_TIME - 1000 });
    render(<GlobeMarks map={fakeMap()} lookup={lookup} />);
    expect(live.markers.map((m) => m.opts.anchor)).toEqual(["bottom-right"]);
    expect(plates()[0].opts.offset).toEqual([-7, -7]);
    act(() => usePlayhead.setState({ playhead: NOTE_TIME + 1000 }));
    expect(live.markers).toHaveLength(2);
    expect(ring()).toBeDefined();
    expect(plates()[0].opts.offset![0]).toBeCloseTo(-12.02, 2);
    expect(parts(plates()[0].el)).toEqual(["pin"]);
  });

  it("a record of a decision kind, reached, draws no ring: the plate alone with the lens", () => {
    state({ nodes: [WAIT] });
    useSchema.setState({
      nodes: [
        {
          kind: "stop",
          label: "Stop",
          palette: "stop",
          source: "stops",
          decision: { status: "status", outcome: "outcome", note: "note", actor: "actor", target: "target", key: "key", event: "event" },
        },
      ],
    });
    render(<GlobeMarks map={fakeMap()} lookup={lookup} />);
    expect(live.markers).toHaveLength(1);
    expect(plates()[0].opts.offset).toEqual([-7, -7]);
    expect(parts(plates()[0].el)).toEqual(["lens", "disposition"]);
    expect(plates()[0].el.getAttribute("aria-label")).toBe("Open your mark: Stop: Corner Store");
  });

  it("a marked place with Places off draws the plate alone with the lens (row 19)", () => {
    const place = { id: "pl-1", name: "Depot", category: "depot", lat: 1, lng: 2 };
    state({ nodes: [makeNode({ record: { kind: "place", id: "pl-1" }, disposition: "pass" })] });
    render(<GlobeMarks map={fakeMap()} lookup={lookupFromContext({ ...CONTEXT, places: [place] })} />);
    expect(live.markers).toHaveLength(1);
    expect(plates()[0].lngLat).toEqual([2, 1]);
    expect(plates()[0].opts.offset).toEqual([-7, -7]);
    expect(parts(plates()[0].el)).toEqual(["lens", "disposition"]);
  });

  it("a marked place with Places on takes the ring form (row 20)", () => {
    const place = { id: "pl-1", name: "Depot", category: "depot", lat: 1, lng: 2 };
    state({ nodes: [makeNode({ record: { kind: "place", id: "pl-1" }, disposition: "pass" })] });
    useLayers.setState({ showPlaces: true });
    render(<GlobeMarks map={fakeMap()} lookup={lookupFromContext({ ...CONTEXT, places: [place] })} />);
    expect(live.markers).toHaveLength(2);
    expect(ring()).toBeDefined();
  });
});

describe("GlobeMarks, the ring of a magnitude kind", () => {
  it("is sized from the halo the data draws: 6 plus the dot of the record's value against the kind's largest", () => {
    state({ nodes: [WAIT] });
    const big: Entity = { ...RECORD, id: "rec-big", fields: { amount: 400 } };
    const mine: Entity = { ...RECORD, fields: { amount: 100 } };
    usePivotData.setState({ entities: [mine, big] });
    useSchema.setState({ nodes: [{ kind: "stop", label: "Stop", palette: "stop", source: "stops", magnitude: "amount" }] });
    render(<GlobeMarks map={fakeMap()} lookup={lookupFromContext({ ...CONTEXT, entities: [mine, big] })} />);
    const halo = haloRadius({ value: 100, max: 400 });
    expect(halo).toBeCloseTo(17, 6); // 6 + max(3, 22 x sqrt(100 / 400))
    const r = ring()!;
    expect(r.el.querySelector("circle")?.getAttribute("r")).toBe(String(ringRadius(halo)));
    expect(plates()[0].opts.offset![0]).toBeCloseTo(-handleOffset(ringRadius(halo)), 6);
  });

  it("a manifest kind with no magnitude takes the built-in halo", () => {
    state({ nodes: [WAIT] });
    useSchema.setState({ nodes: [{ kind: "stop", label: "Stop", palette: "stop", source: "stops" }] });
    render(<GlobeMarks map={fakeMap()} lookup={lookup} />);
    expect(ring()!.el.querySelector("circle")?.getAttribute("r")).toBe(String(ringRadius(haloRadius(null))));
  });
});

describe("GlobeMarks, the switches", () => {
  const AUTH: Entity = { ...RECORD, id: "tx-1", kind: "auth" };
  const authLookup = lookupFromContext({ ...CONTEXT, entities: [AUTH] });
  const authNode = (pinned: boolean) => makeNode({ record: { kind: "auth", id: "tx-1" }, pinned, disposition: "pass" });

  it("with Authorizations off a reached auth record draws no marker, pinned or not (rows 10 and 8 while the pin does not win)", () => {
    state({ nodes: [authNode(false)] });
    useLayers.setState({ showAuths: false });
    const a = render(<GlobeMarks map={fakeMap()} lookup={authLookup} />);
    expect(live.markers).toHaveLength(0);
    a.unmount();
    state({ nodes: [authNode(true)] });
    useLayers.setState({ showAuths: false });
    render(<GlobeMarks map={fakeMap()} lookup={authLookup} />);
    expect(live.markers).toHaveLength(0);
  });

  it("with Authorizations on the same record draws its marker", () => {
    state({ nodes: [authNode(false)] });
    render(<GlobeMarks map={fakeMap()} lookup={authLookup} />);
    expect(plates()[0].el.getAttribute("aria-label")).toBe("Open your mark: auth: Corner Store");
  });

  it("the selected record stays drawn against a switch (row 24)", () => {
    state({ nodes: [authNode(false)] });
    useLayers.setState({ showAuths: false });
    useSelection.setState({ selected: { kind: "entity", entity: AUTH } });
    render(<GlobeMarks map={fakeMap()} lookup={authLookup} />);
    expect(live.markers).toHaveLength(2);
  });

  it("an unmarked record draws nothing", () => {
    state({ nodes: [makeNode()] });
    render(<GlobeMarks map={fakeMap()} lookup={lookup} />);
    expect(screen.queryAllByRole("button")).toHaveLength(0);
    expect(live.markers).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------------------------
// Marks near one place: the map stub projects 100 px a degree, so a point's offset in px is
// written as an offset in hundredths of a degree from Houston, which lies on the near side.
// ---------------------------------------------------------------------------------------------

const TIMES = String.fromCharCode(0xd7);
const HOUSTON = { lng: -95.37, lat: 29.76 };
interface Spec {
  id: string;
  /** Px right and down of the first point, at the stub's 100 px a degree. */
  dx: number;
  dy: number;
  /** Seconds after NOTE_TIME. */
  at: number;
  node?: Partial<RecordNode>;
  at0?: { lng: number; lat: number };
}
const ENT = (s: Spec): Entity => {
  const base = s.at0 ?? HOUSTON;
  return {
    ...RECORD,
    id: s.id,
    timestamp: NOTE_TIME + s.at * 1000,
    coords: { lng: base.lng + s.dx / 100, lat: base.lat - s.dy / 100 },
    displayMetadata: { ...RECORD.displayMetadata, primaryLabel: `Place ${s.id}` },
  };
};
const REF = (id: string) => ({ kind: "stop", id });
const KEY = (id: string) => `stop:${id}`;

/** The state for a set of marked records, and the lookup that finds them. */
function setup(specs: Spec[], over: { playhead?: number } = {}) {
  const nodes = specs.map((s) => makeNode({ record: REF(s.id), ...s.node }));
  state({ nodes, playhead: over.playhead ?? NOTE_TIME + 100000 });
  return lookupFromContext({ ...CONTEXT, entities: specs.map(ENT) });
}
const rings = () => live.markers.filter((m) => m.el.hasAttribute("data-mark-ring"));
const piles = () => live.markers.filter((m) => m.el.hasAttribute("data-mark-pile-group"));
const pileBtn = () => document.querySelector("[data-mark-pile]") as HTMLElement;
const columnOf = () => Array.from(document.querySelectorAll("button[data-mark]")) as HTMLElement[];
const handleLength = (m: Live): number => {
  const line = m.el.querySelector("line") as SVGElement;
  return Math.hypot(Number(line.getAttribute("x2")) - Number(line.getAttribute("x1")), Number(line.getAttribute("y2")) - Number(line.getAttribute("y1")));
};
const RING_R = ringRadius(haloRadius(null));
const lensWith = (map: maplibregl.Map) => map as unknown as { on: ReturnType<typeof vi.fn>; off: ReturnType<typeof vi.fn>; project: ReturnType<typeof vi.fn> };
type MoveEnd = (e?: { originalEvent?: Event }) => void;
const moveend = (map: maplibregl.Map) => {
  const call = lensWith(map).on.mock.calls.find((c) => c[0] === "moveend");
  return call?.[1] as MoveEnd;
};
/** maplibre's moveend event data for a move the visitor makes (a drag, wheel, touch or key); an app move (easeTo, flyTo, jumpTo) carries none. */
const BY_VISITOR = { originalEvent: new Event("wheel") };

/** Five marks within 1 px of one another at Houston: PASS, FAIL, WAITING, a pin alone, and PASS again. */
const HOUSTON_FIVE: Spec[] = [
  { id: "hou-1", dx: 0, dy: 0, at: -50, node: { disposition: "pass" } },
  { id: "hou-2", dx: 0.4, dy: 0, at: -40, node: { disposition: "fail" } },
  { id: "hou-3", dx: 0, dy: 0.4, at: -30, node: { disposition: "wait" } },
  { id: "hou-4", dx: 0.8, dy: 0.2, at: -20, node: { pinned: true } },
  { id: "hou-5", dx: 0.2, dy: 0.8, at: -10, node: { disposition: "pass" } },
];

describe("marks on one place", () => {
  it("five marks within 1 px draw one ring with one handle and one pile with check, cross, hourglass and pin at the anchor's handle end", () => {
    const l = setup(HOUSTON_FIVE);
    render(<GlobeMarks map={fakeMap()} lookup={l} />);
    expect(rings()).toHaveLength(1);
    expect(handleLength(rings()[0])).toBeGreaterThan(0);
    expect(rings()[0].lngLat![0]).toBeCloseTo(HOUSTON.lng, 9);
    expect(plates()).toHaveLength(0);
    expect(piles()).toHaveLength(1);
    const pile = piles()[0];
    expect(pile.opts.anchor).toBe("bottom-right");
    expect(pile.opts.offset![0]).toBeCloseTo(-handleOffset(RING_R), 6);
    expect(pile.opts.offset![1]).toBeCloseTo(-handleOffset(RING_R), 6);
    expect(pile.lngLat![0]).toBeCloseTo(HOUSTON.lng, 9);
    expect(pile.lngLat![1]).toBeCloseTo(HOUSTON.lat, 9);
    const b = pileBtn();
    // No lens: the ring is the lens.
    expect(parts(b)).toEqual(["pile", "disposition", "disposition", "disposition", "pin"]);
    expect(b.querySelector('[data-part="pile"]')?.textContent).toBe(`${TIMES}5`);
    expect(Array.from(b.querySelectorAll("[data-disposition]")).map((g) => g.getAttribute("data-disposition"))).toEqual(["pass", "fail", "wait"]);
    expect(b.getAttribute("aria-label")).toBe(pileName(5, false));
    expect(b.getAttribute("aria-expanded")).toBe("false");
  });

  it("the pile's tip lines are exactly pileTip's for the set, and a member's are markTip's for its view", () => {
    const l = setup(HOUSTON_FIVE);
    render(<GlobeMarks map={fakeMap()} lookup={l} />);
    const lines = pileTip({
      records: 5,
      first: when(NOTE_TIME - 50000),
      last: when(NOTE_TIME - 10000),
      counts: { pass: 2, fail: 1, wait: 1 },
      pinned: 1,
      unfolded: false,
    });
    expect(pileBtn().getAttribute("data-tip")).toBe(lines.join("\n"));
    fireEvent.click(pileBtn());
    const hou4 = columnOf().find((b) => b.getAttribute("data-mark") === KEY("hou-4")) as HTMLElement;
    const own = markTip({ kindLabel: "stop", headline: "Place hou-4", time: when(NOTE_TIME - 20000), notes: 0, disposition: "none", category: null, pinned: true });
    expect(hou4.getAttribute("data-tip")).toBe(own.join("\n"));
    expect(hou4.getAttribute("aria-label")).toBe(markName("stop", "Place hou-4"));
    expect(pileBtn().getAttribute("data-tip")).toBe(pileTip({ records: 5, first: when(NOTE_TIME - 50000), last: when(NOTE_TIME - 10000), counts: { pass: 2, fail: 1, wait: 1 }, pinned: 1, unfolded: true }).join("\n"));
  });

  it("members 10 to 20 px apart join, the absorbed rings stay with no handle, and a member outside 44 by 16 stays single", () => {
    const l = setup([
      { id: "a", dx: 0, dy: 0, at: -50, node: { disposition: "pass" } },
      { id: "b", dx: 10, dy: 0, at: -40, node: { disposition: "fail" } },
      { id: "c", dx: 20, dy: 5, at: -30, node: { disposition: "wait" } },
      { id: "d", dx: 15, dy: 14, at: -20, node: { pinned: true } },
      { id: "e", dx: 60, dy: 0, at: -10, node: { disposition: "pass" } },
    ]);
    render(<GlobeMarks map={fakeMap()} lookup={l} />);
    expect(rings()).toHaveLength(5);
    // The pile's anchor and the single mark each have a plate hanging at their ring: two handles, three rings without.
    expect(rings().filter((r) => handleLength(r) > 0)).toHaveLength(2);
    expect(rings().filter((r) => handleLength(r) === 0)).toHaveLength(3);
    expect(piles()).toHaveLength(1);
    expect(pileBtn().querySelector('[data-part="pile"]')?.textContent).toBe(`${TIMES}4`);
    expect(plates()).toHaveLength(1);
    expect(plates()[0].el.getAttribute("aria-label")).toBe(markName("stop", "Place e"));
  });

  it("a mark 45 px or 17 px from the anchor stays single (the data's reach is 44 by 16)", () => {
    const l = setup([
      { id: "a", dx: 0, dy: 0, at: -50, node: { disposition: "pass" } },
      { id: "b", dx: 45, dy: 0, at: -40, node: { disposition: "pass" } },
      { id: "c", dx: 0, dy: 17, at: -30, node: { disposition: "pass" } },
    ]);
    render(<GlobeMarks map={fakeMap()} lookup={l} />);
    expect(piles()).toHaveLength(0);
    expect(plates()).toHaveLength(3);
  });

  it("three marks on one point draw one ring and one pile of three", () => {
    const ams = { lng: -93, lat: 31 };
    const l = setup([
      { id: "s1", dx: 0, dy: 0, at: -30, at0: ams, node: { disposition: "pass" } },
      { id: "s2", dx: 0, dy: 0, at: -20, at0: ams, node: { disposition: "fail" } },
      { id: "s3", dx: 0, dy: 0, at: -10, at0: ams, node: { disposition: "wait", pinned: true } },
    ]);
    render(<GlobeMarks map={fakeMap()} lookup={l} />);
    expect(rings()).toHaveLength(1);
    expect(piles()).toHaveLength(1);
    expect(pileBtn().querySelector('[data-part="pile"]')?.textContent).toBe(`${TIMES}3`);
  });

  it("a mark on the far side is left out of the pile and keeps its single form", () => {
    const far = { lng: 85, lat: 30 };
    const l = setup([
      { id: "n1", dx: 0, dy: 0, at: -30, node: { disposition: "pass" } },
      { id: "n2", dx: 0, dy: 0, at: -20, node: { disposition: "fail" } },
      { id: "f1", dx: 0, dy: 0, at: -10, at0: far, node: { disposition: "wait" } },
    ]);
    const map = fakeMap();
    // Every point projects onto one spot, so only the side of the globe keeps the far one out.
    lensWith(map).project.mockImplementation(() => ({ x: 10, y: 10 }));
    render(<GlobeMarks map={map} lookup={l} />);
    expect(piles()).toHaveLength(1);
    expect(pileBtn().querySelector('[data-part="pile"]')?.textContent).toBe(`${TIMES}2`);
    expect(plates()).toHaveLength(1);
    expect(plates()[0].lngLat).toEqual([far.lng, far.lat]);
    expect(rings()).toHaveLength(2);
  });

  it("a single mark draws today's ring with its handle and its plate", () => {
    const l = setup([{ id: "solo", dx: 0, dy: 0, at: -10, node: { disposition: "pass" } }]);
    render(<GlobeMarks map={fakeMap()} lookup={l} />);
    expect(piles()).toHaveLength(0);
    expect(live.markers).toHaveLength(2);
    expect(handleLength(rings()[0])).toBeCloseTo(7, 6);
    expect(plates()[0].opts.offset![0]).toBeCloseTo(-handleOffset(RING_R), 6);
    expect(parts(plates()[0].el)).toEqual(["disposition"]);
  });

  it("a press on the pile unfolds its column, a second press folds it, and a member press opens one window for that record and folds", () => {
    const l = setup(HOUSTON_FIVE);
    render(<GlobeMarks map={fakeMap()} lookup={l} />);
    fireEvent.click(pileBtn());
    expect(pileBtn().getAttribute("aria-expanded")).toBe("true");
    expect(pileBtn().getAttribute("aria-label")).toBe(pileName(5, true));
    // Pinned first, then time, then key.
    expect(columnOf().map((b) => b.getAttribute("data-mark"))).toEqual(["hou-4", "hou-1", "hou-2", "hou-3", "hou-5"].map(KEY));
    fireEvent.click(pileBtn());
    expect(pileBtn().getAttribute("aria-expanded")).toBe("false");
    expect(columnOf()).toHaveLength(0);
    fireEvent.click(pileBtn());
    const before = usePlayhead.getState().playhead;
    fireEvent.click(columnOf()[2]);
    const w = usePivotStore.getState().windows;
    expect(w).toHaveLength(1);
    expect(w[0].kind === "record" && w[0].record).toEqual(REF("hou-2"));
    expect(pileBtn().getAttribute("aria-expanded")).toBe("false");
    expect(columnOf()).toHaveLength(0);
    expect(usePlayhead.getState().playhead).toBe(before);
    expect(useSelection.getState().selected).toBeNull();
    expect(document.activeElement).toBe(pileBtn());
  });

  it("in the column a pinned member ahead of the playhead is its own dim plate; with one member's window open only that member is data-open", () => {
    const l = setup(
      [
        { id: "p1", dx: 0, dy: 0, at: -10, node: { pinned: true, disposition: "pass" } },
        { id: "p2", dx: 5, dy: 0, at: 50, node: { pinned: true, disposition: "wait" } },
      ],
      { playhead: NOTE_TIME },
    );
    usePivotStore.getState().openRecord(REF("p1"), { lngLat: null, pinned: true });
    render(<GlobeMarks map={fakeMap()} lookup={l} />);
    fireEvent.click(pileBtn());
    const [one, two] = columnOf();
    expect(one.getAttribute("data-mark")).toBe(KEY("p1"));
    const lensOpacity = (b: HTMLElement) => Number((b.querySelector('[data-part="lens"]') as HTMLElement).style.opacity || "1");
    expect(lensOpacity(two)).toBeLessThan(1);
    expect(one.hasAttribute("data-open")).toBe(true);
    expect(two.hasAttribute("data-open")).toBe(false);
    expect(pileBtn().hasAttribute("data-open")).toBe(true);
  });

  it("the pile's contents dim only when every member's globe level is dim, and the pin stays bright", () => {
    const specs: Spec[] = [
      { id: "q1", dx: 0, dy: 0, at: 40, node: { pinned: true, disposition: "pass" } },
      { id: "q2", dx: 5, dy: 0, at: 50, node: { pinned: true, disposition: "pass" } },
    ];
    const l = setup(specs, { playhead: NOTE_TIME });
    const a = render(<GlobeMarks map={fakeMap()} lookup={l} />);
    // Neither has a dot yet: no ring, so the pile leads with the lens and hangs at the anchor's own point, 7 px off.
    expect(rings()).toHaveLength(0);
    expect(piles()[0].opts.offset).toEqual([-7, -7]);
    expect(parts(pileBtn())).toEqual(["lens", "pile", "disposition", "pin"]);
    const o = (part: string) => Number((pileBtn().querySelector(`[data-part="${part}"]`) as HTMLElement).style.opacity || "1");
    expect(o("lens")).toBeLessThan(1);
    expect(o("pile")).toBeLessThan(1);
    expect(o("disposition")).toBeLessThan(1);
    expect(o("pin")).toBe(1);
    a.unmount();
    const l2 = setup([specs[0], { ...specs[1], at: -10 }], { playhead: NOTE_TIME });
    render(<GlobeMarks map={fakeMap()} lookup={l2} />);
    expect(o("pile")).toBe(1);
    expect(o("disposition")).toBe(1);
  });

  it("a press on the map or the page leaves the column open", () => {
    const l = setup(HOUSTON_FIVE);
    const map = fakeMap();
    render(<GlobeMarks map={map} lookup={l} />);
    fireEvent.click(pileBtn());
    fireEvent.mouseDown(map.getCanvasContainer());
    fireEvent.click(map.getCanvasContainer());
    fireEvent.click(document.body);
    expect(pileBtn().getAttribute("aria-expanded")).toBe("true");
    expect(columnOf()).toHaveLength(5);
  });

  it("Escape in the column folds it and focus returns to the pile", () => {
    const l = setup(HOUSTON_FIVE);
    render(<GlobeMarks map={fakeMap()} lookup={l} />);
    fireEvent.click(pileBtn());
    const member = columnOf()[1];
    member.focus();
    fireEvent.keyDown(member, { key: "Escape" });
    expect(pileBtn().getAttribute("aria-expanded")).toBe("false");
    expect(document.activeElement).toBe(pileBtn());
  });

  it("a moveend the visitor makes recomputes the piles and folds an unfolded one, focus on a member goes to the pile, and the handler is removed on unmount", () => {
    const l = setup(HOUSTON_FIVE);
    const map = fakeMap();
    const { unmount } = render(<GlobeMarks map={map} lookup={l} />);
    const handler = moveend(map);
    expect(handler).toBeTypeOf("function");
    fireEvent.click(pileBtn());
    columnOf()[0].focus();
    expect(document.activeElement).toBe(columnOf()[0]);
    act(() => handler(BY_VISITOR));
    expect(pileBtn().getAttribute("aria-expanded")).toBe("false");
    expect(document.activeElement).toBe(pileBtn());
    // The camera moved (zoomed in): the marks now project thousands of px apart, so no pile forms.
    lensWith(map).project.mockImplementation(([lng, lat]: [number, number]) => ({ x: lng * 1000000, y: -lat * 1000000 }));
    act(() => handler());
    expect(piles()).toHaveLength(0);
    expect(plates()).toHaveLength(5);
    unmount();
    expect(lensWith(map).off).toHaveBeenCalledWith("moveend", handler);
  });

  it("a moveend the app makes (no originalEvent) leaves an unfolded column open, focus where it was, and still updates the placing", () => {
    // Two marks one px apart on the far side of the globe from the camera: single marks, no second pile yet.
    const away = { lng: 20, lat: 30 };
    const l = setup([
      ...HOUSTON_FIVE,
      { id: "g1", dx: 0, dy: 0, at: -30, at0: away, node: { disposition: "pass" } },
      { id: "g2", dx: 1, dy: 0, at: -20, at0: away, node: { disposition: "fail" } },
    ]);
    const map = fakeMap();
    render(<GlobeMarks map={map} lookup={l} />);
    const handler = moveend(map);
    const pileButtons = () => Array.from(document.querySelectorAll("[data-mark-pile]")) as HTMLElement[];
    // The Houston pile's own button and the members of its column (the far side marks' plates are buttons of their own).
    const houston = () => document.querySelector(`[data-mark-pile="pile:${KEY("hou-1")}"]`) as HTMLElement;
    const members = () => Array.from(houston().parentElement!.querySelectorAll("button[data-mark]")) as HTMLElement[];
    expect(pileButtons()).toHaveLength(1);
    fireEvent.click(houston());
    expect(members()).toHaveLength(5);
    members()[0].focus();
    // The camera flies to a place where the two marks are on the near side: the centre must be read again.
    (map as unknown as { getCenter: () => { lng: number; lat: number } }).getCenter = () => ({ lng: -70, lat: 30 });
    act(() => handler());
    expect(pileButtons()).toHaveLength(2);
    expect(houston().getAttribute("aria-expanded")).toBe("true");
    expect(members()).toHaveLength(5);
    expect(document.activeElement).toBe(members()[0]);
    // A move the visitor makes folds it, with the placing already current.
    act(() => handler(BY_VISITOR));
    expect(pileButtons()).toHaveLength(2);
    expect(houston().getAttribute("aria-expanded")).toBe("false");
    expect(document.activeElement).toBe(houston());
  });

  it("a moveend with no event data, or with an empty data object, leaves an open column open", () => {
    const l = setup(HOUSTON_FIVE);
    const map = fakeMap();
    render(<GlobeMarks map={map} lookup={l} />);
    const handler = moveend(map);
    fireEvent.click(pileBtn());
    act(() => handler({}));
    expect(pileBtn().getAttribute("aria-expanded")).toBe("true");
    act(() => handler(undefined));
    expect(pileBtn().getAttribute("aria-expanded")).toBe("true");
    expect(columnOf()).toHaveLength(5);
  });

  it("the column is gone when the pile leaves, and the pile that forms again comes folded", () => {
    const l = setup(HOUSTON_FIVE);
    render(<GlobeMarks map={fakeMap()} lookup={l} />);
    fireEvent.click(pileBtn());
    expect(pileBtn().getAttribute("aria-expanded")).toBe("true");
    const all = useMarksStore.getState().nodes;
    act(() => useMarksStore.setState({ nodes: all.slice(0, 1) }));
    expect(piles()).toHaveLength(0);
    act(() => useMarksStore.setState({ nodes: all }));
    expect(piles()).toHaveLength(1);
    expect(pileBtn().getAttribute("aria-expanded")).toBe("false");
  });

  it("a second press on the pile while focus sits on a member folds it and leaves focus on the pile", () => {
    const l = setup(HOUSTON_FIVE);
    render(<GlobeMarks map={fakeMap()} lookup={l} />);
    fireEvent.click(pileBtn());
    columnOf()[2].focus();
    expect(document.activeElement).toBe(columnOf()[2]);
    fireEvent.click(pileBtn());
    expect(pileBtn().getAttribute("aria-expanded")).toBe("false");
    expect(document.activeElement).toBe(pileBtn());
  });

  describe("a pile that holds a record with no time (a place)", () => {
    const at = { lat: HOUSTON.lat, lng: HOUSTON.lng };
    const place = (id: string, dx: number) => ({ id, name: `Depot ${id}`, category: "depot", lat: at.lat, lng: at.lng + dx / 100 });
    const placeNode = (id: string, over: Partial<RecordNode> = {}) => makeNode({ record: { kind: "place", id }, ...over });

    it("shows the time of the timed member only, once, and counts the place as a record", () => {
      const rec = ENT({ id: "tm", dx: 0, dy: 0, at: -20 });
      state({ nodes: [makeNode({ record: REF("tm"), disposition: "pass" }), placeNode("pl-1", { disposition: "fail" })], playhead: NOTE_TIME + 100000 });
      const l = lookupFromContext({ ...CONTEXT, entities: [rec], places: [place("pl-1", 0.5)] });
      render(<GlobeMarks map={fakeMap()} lookup={l} />);
      expect(piles()).toHaveLength(1);
      expect(pileBtn().querySelector('[data-part="pile"]')?.textContent).toBe(`${TIMES}2`);
      const t = when(NOTE_TIME - 20000);
      const lines = pileTip({ records: 2, first: t, last: t, counts: { pass: 1, fail: 1, wait: 0 }, pinned: 0, unfolded: false });
      expect(lines).toContain(`Time: ${t}`);
      expect(pileBtn().getAttribute("data-tip")).toBe(lines.join("\n"));
    });

    it("leaves the Time line out when no member has a time", () => {
      state({ nodes: [placeNode("pl-1", { disposition: "pass" }), placeNode("pl-2", { disposition: "wait" })], playhead: NOTE_TIME + 100000 });
      const l = lookupFromContext({ ...CONTEXT, entities: [], places: [place("pl-1", 0), place("pl-2", 0.5)] });
      render(<GlobeMarks map={fakeMap()} lookup={l} />);
      expect(piles()).toHaveLength(1);
      const lines = pileTip({ records: 2, first: null, last: null, counts: { pass: 1, fail: 0, wait: 1 }, pinned: 0, unfolded: false });
      expect(lines.some((x) => x.startsWith("Time:"))).toBe(false);
      expect(pileBtn().getAttribute("data-tip")).toBe(lines.join("\n"));
      // Places is off: the places draw no dot, so the pile hangs 7 px off the first one's point, led by the lens.
      expect(parts(pileBtn())[0]).toBe("lens");
      expect(piles()[0].opts.offset).toEqual([-7, -7]);
    });
  });

  it("the pile is data-open while one member's window is open", () => {
    const l = setup(HOUSTON_FIVE);
    render(<GlobeMarks map={fakeMap()} lookup={l} />);
    expect(pileBtn().hasAttribute("data-open")).toBe(false);
    act(() => {
      usePivotStore.getState().openRecord(REF("hou-3"), { lngLat: null, pinned: false });
    });
    expect(pileBtn().hasAttribute("data-open")).toBe(true);
  });
});

// ---------------------------------------------------------------------------------------------
// A solo narrows the globe's own dots (App.tsx), so a marked record outside it has no dot to ring:
// it takes the plate alone with the lens. A place passes through a solo by reference and keeps its ring.
// ---------------------------------------------------------------------------------------------

describe("GlobeMarks, under a solo", () => {
  const withAcct = (id: string, acct: string): Entity => ({
    ...RECORD,
    id,
    fields: { acct },
    displayMetadata: { ...RECORD.displayMetadata, pivotableFields: ["acct"] },
  });
  const MINE = withAcct("rec-1", "a1");
  const OTHER = withAcct("rec-2", "a2");
  const soloLookup = lookupFromContext({ ...CONTEXT, entities: [MINE, OTHER] });
  const soloOn = (value: string) => useSolo.setState({ solo: { field: "acct", value } });
  const farMap = () => {
    const map = fakeMap();
    (map as unknown as { getCenter: () => { lng: number; lat: number } }).getCenter = () => ({ lng: 85, lat: 30 });
    return map;
  };
  beforeEach(() => {
    state({ notes: [linked(REC)], nodes: [WAIT] });
    usePivotData.setState({ entities: [MINE, OTHER] });
  });

  it("with no solo the marked record keeps its ring and its handle", () => {
    render(<GlobeMarks map={fakeMap()} lookup={soloLookup} />);
    expect(rings()).toHaveLength(1);
    expect(parts(plates()[0].el)).toEqual(["count", "disposition"]);
  });

  it("a solo that holds the marked record keeps its ring and its handle", () => {
    soloOn("a1");
    render(<GlobeMarks map={fakeMap()} lookup={soloLookup} />);
    expect(rings()).toHaveLength(1);
    expect(plates()[0].opts.offset![0]).toBeCloseTo(-handleOffset(RING_R), 6);
    expect(parts(plates()[0].el)).toEqual(["count", "disposition"]);
  });

  it("a solo that leaves the marked record out draws no ring: the plate alone, led by the lens", () => {
    soloOn("a2");
    render(<GlobeMarks map={fakeMap()} lookup={soloLookup} />);
    expect(rings()).toHaveLength(0);
    expect(live.markers).toHaveLength(1);
    expect(plates()[0].opts.offset).toEqual([-7, -7]);
    expect(parts(plates()[0].el)).toEqual(["lens", "count", "disposition"]);
  });

  it("the ring comes back when the solo ends", () => {
    soloOn("a2");
    render(<GlobeMarks map={fakeMap()} lookup={soloLookup} />);
    expect(rings()).toHaveLength(0);
    act(() => useSolo.setState({ solo: null }));
    expect(rings()).toHaveLength(1);
  });

  it("a marked place keeps its ring under any solo", () => {
    const place = { id: "pl-1", name: "Depot", category: "depot", lat: 1, lng: 2 };
    state({ nodes: [makeNode({ record: { kind: "place", id: "pl-1" }, disposition: "pass" })] });
    usePivotData.setState({ entities: [MINE, OTHER] });
    useLayers.setState({ showPlaces: true });
    soloOn("a2");
    render(<GlobeMarks map={fakeMap()} lookup={lookupFromContext({ ...CONTEXT, entities: [MINE, OTHER], places: [place] })} />);
    expect(rings()).toHaveLength(1);
    expect(parts(plates()[0].el)).toEqual(["disposition"]);
  });

  it("on the far side of the globe a record outside the solo draws no ring and takes the plate alone", () => {
    soloOn("a2");
    render(<GlobeMarks map={farMap()} lookup={soloLookup} />);
    expect(rings()).toHaveLength(0);
    expect(live.markers).toHaveLength(1);
    expect(plates()[0].opts.offset).toEqual([-7, -7]);
    expect(parts(plates()[0].el)).toEqual(["lens", "count", "disposition"]);
  });

  it("on the far side a record inside the solo keeps its ring, and with no solo too", () => {
    soloOn("a1");
    const a = render(<GlobeMarks map={farMap()} lookup={soloLookup} />);
    expect(rings()).toHaveLength(1);
    expect(parts(plates()[0].el)).toEqual(["count", "disposition"]);
    a.unmount();
    state({ notes: [linked(REC)], nodes: [WAIT] });
    usePivotData.setState({ entities: [MINE, OTHER] });
    render(<GlobeMarks map={farMap()} lookup={soloLookup} />);
    expect(rings()).toHaveLength(1);
  });
});

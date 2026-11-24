/** B5: generic lanes + dots on the case timeline; the annotation diamond still renders. */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, fireEvent, act } from "@testing-library/react";
import { Timeline } from "../Timeline";
import { usePlayhead } from "../../store/playhead";
import { useSchema } from "../../store/schema";
import { useSelection } from "../../store/selection";
import { useNavigation } from "../../store/navigation";
import { useTheme } from "../../store/theme";
import { manifestRowToEntity } from "../../lib/adapters/manifest-row";
import type { ScenarioNode } from "../../lib/scenarios";
import { verdictNode } from "../../lib/verdict-fixtures";
import { when, when24 } from "../../lib/time-words";
import { useClockForm } from "../../store/clock-form";
import { contrastRatio } from "../../theme/legibility";
import { resolvePalette } from "../../theme/resolve";
import { COLOR_MODES, THEMES, type ColorMode } from "../../theme/axes";

// The words a node carries are built by these two functions of lib/time-words; the spies count how
// often the layer builds them (the real functions still run).
const words = vi.hoisted(() => ({ recordLines: null as unknown, nodeBrief: null as unknown }));
vi.mock("../../lib/time-words", async (importOriginal) => {
  const real = await importOriginal<typeof import("../../lib/time-words")>();
  words.recordLines = vi.fn(real.recordLines);
  words.nodeBrief = vi.fn(real.nodeBrief);
  return { ...real, recordLines: words.recordLines, nodeBrief: words.nodeBrief };
});
const recordLinesSpy = () => words.recordLines as ReturnType<typeof vi.fn>;
const nodeBriefSpy = () => words.nodeBrief as ReturnType<typeof vi.fn>;

const node = (kind: string, palette: string, timestamp: string): ScenarioNode => ({
  kind, label: kind, palette, source: "sql", coords: null, timestamp, primary: "${id}",
});
const shipmentNode = node("shipment", "#ffb347", "at");
const refundNode = node("refund", "#ff5c5c", "at");
const MS0 = Date.parse("2026-05-12T00:00:00-05:00");
const MS1 = Date.parse("2026-06-01T00:00:00-05:00");
const entities = [
  manifestRowToEntity(shipmentNode, { id: "sh-0100", at: "2026-05-12T10:14:00-05:00" }),
  manifestRowToEntity(refundNode, { id: "rfnd-1", at: "2026-05-29T10:05:00-05:00" }),
];
const annotations = [{ timestamp: "2026-05-27T07:42:00-05:00", label: "Issuer-reported ATM cash-out", note: "Reported context." }];

describe("Timeline with generic entities", () => {
  beforeEach(() => {
    usePlayhead.setState({ playhead: MS1, minTime: MS0, maxTime: MS1, windowMin: MS0, windowMax: MS1, isPlaying: false });
    useSchema.setState({ nodes: [shipmentNode, refundNode] });
    useSelection.setState({ selected: null });
    useNavigation.setState({ panTarget: null, zoomTarget: null, pulseEntityId: null, pulseToken: 0 });
  });

  it("draws one dot per generic entity, in its node colour", () => {
    const { container } = render(<Timeline transactions={[]} genericEntities={entities} />);
    const dots = container.querySelectorAll('button[aria-label^="Jump to"]');
    expect(dots).toHaveLength(2);
    // happy-dom's CSSOM drops a space-syntax rgb() `background` but keeps the
    // box-shadow glow, which is painted from the same node colour.
    const glow = [...dots].map((d) => d.querySelector("span.rounded-full")!.getAttribute("style") ?? "");
    expect(glow[0]).toContain("box-shadow: 0 0 3px rgb(255 179 71 / ");
    expect(glow[1]).toContain("box-shadow: 0 0 3px rgb(255 92 92 / ");
  });

  it("puts each generic kind on its own lane", () => {
    const { container } = render(<Timeline transactions={[]} genericEntities={entities} />);
    const tops = [...container.querySelectorAll('button[aria-label^="Jump to"]')].map((d) => (d as HTMLElement).style.top);
    expect(tops).toEqual(["18%", "82%"]);
  });

  it("a dot click navigates to the entity: playhead seek, selection, pause", () => {
    const { container } = render(<Timeline transactions={[]} genericEntities={entities} />);
    fireEvent.click(container.querySelectorAll('button[aria-label^="Jump to"]')[1]);
    expect(useSelection.getState().selected).toMatchObject({ kind: "entity", entity: { id: "rfnd-1" } });
    expect(usePlayhead.getState().playhead).toBe(entities[1].timestamp);
    expect(useNavigation.getState().pulseEntityId).toBe("rfnd-1");
  });

  it("an overlay kind draws no lane dot (its capsules live on the rail)", () => {
    useSchema.setState({ nodes: [shipmentNode, verdictNode] });
    const verdict = manifestRowToEntity(verdictNode, { id: "d1", state: "FAIL", finding: "ATO", when: "2026-05-20T10:00:00-05:00", y: 1, x: 2 });
    const { container } = render(<Timeline transactions={[]} genericEntities={[entities[0], verdict]} />);
    expect(container.querySelectorAll('button[aria-label^="Jump to"]')).toHaveLength(1);
  });

  // A kind that declares a magnitude (the fixture calls its field "weight") is drawn as a lane by
  // Timeline.tsx (Timeline.lanes.test.tsx); the track holds no dots for it.
  describe("a magnitude kind", () => {
    const parcelNode: ScenarioNode = { ...node("parcel", "#ffd166", "at"), magnitude: "weight" };
    const parcels = [
      manifestRowToEntity(parcelNode, { id: "p1", at: "2026-05-13T10:00:00-05:00", weight: 10 }),
      manifestRowToEntity(parcelNode, { id: "p2", at: "2026-05-13T11:00:00-05:00", weight: 30 }),
    ];

    it("a magnitude kind draws no dots", () => {
      useSchema.setState({ nodes: [shipmentNode, parcelNode] });
      const { container } = render(<Timeline transactions={[]} genericEntities={[entities[0], ...parcels]} />);
      expect(container.querySelectorAll('button[aria-label^="Jump to"]')).toHaveLength(1); // the shipment only
    });
  });

  it("still renders the manifest annotation diamond", () => {
    const { container } = render(<Timeline transactions={[]} genericEntities={entities} annotations={annotations} />);
    expect(container.querySelector('[title^="Issuer-reported ATM cash-out"]')).not.toBeNull();
  });
});

// B4: a track node carries its words (a tooltip's lines and a full accessible name), and its solid
// mark goes through the per-theme on-panel clamp. No TipLayer is mounted in any of these: the name
// must stand without the tooltip system, and the tooltip's lines are read from the attributes the
// layer hands to it.
describe("Timeline track nodes: words", () => {
  const signIn: ScenarioNode = { ...node("console_signin", "#7ee787", "at"), label: "Console sign-in", primary: "${who}", secondary: "${how}" };
  const signInEntity = manifestRowToEntity(signIn, { id: "s1", at: "2026-05-12T10:14:00-05:00", who: "seat-7", how: "password" });
  const dotOf = (container: HTMLElement) => container.querySelector('button[aria-label^="Jump to"]') as HTMLElement;

  beforeEach(() => {
    usePlayhead.setState({ playhead: MS1, minTime: MS0, maxTime: MS1, windowMin: MS0, windowMax: MS1, isPlaying: false });
    useSchema.setState({ nodes: [signIn] });
    useSelection.setState({ selected: null });
    useNavigation.setState({ panTarget: null, zoomTarget: null, pulseEntityId: null, pulseToken: 0 });
  });

  it("names a node by the manifest's label for its kind, its headline and its time, with no parenthesis", () => {
    const { container } = render(<Timeline transactions={[]} genericEntities={[signInEntity]} />);
    const name = dotOf(container).getAttribute("aria-label") ?? "";
    expect(name).toContain("Console sign-in");
    expect(name).not.toContain("console_signin");
    expect(name).toContain("seat-7");
    expect(name).toContain(when(signInEntity.timestamp));
    expect(name).not.toMatch(/[()]/);
    expect(name.startsWith("Jump to")).toBe(true);
  });

  it("carries its tooltip's lines: the kind's label, the record's two lines, then when", () => {
    const { container } = render(<Timeline transactions={[]} genericEntities={[signInEntity]} />);
    const dot = dotOf(container);
    expect(dot.getAttribute("data-tip")).toBe(
      ["Console sign-in", "seat-7", "password", when(signInEntity.timestamp)].join("\n"),
    );
    // The tooltip layer names a node among those lying on it by this brief.
    expect(dot.getAttribute("data-tip-node")).toBe(`seat-7 · ${when(signInEntity.timestamp)}`);
    expect(dot.getAttribute("data-tip-accent")).toBeTruthy();
  });

  it("draws no label of its own on hover: the tooltip layer words it", () => {
    const { container } = render(<Timeline transactions={[]} genericEntities={[signInEntity]} />);
    fireEvent.mouseEnter(dotOf(container));
    expect(container.textContent).not.toMatch(/CONSOLE_SIGNIN|CONSOLE SIGN-IN/);
  });

  it("builds the words once for a window: a playhead move builds none, a window change builds them again", () => {
    render(<Timeline transactions={[]} genericEntities={[signInEntity]} />);
    expect(recordLinesSpy()).toHaveBeenCalled();
    recordLinesSpy().mockClear();
    nodeBriefSpy().mockClear();
    act(() => usePlayhead.setState({ playhead: MS0 + 3_600_000 }));
    act(() => usePlayhead.setState({ playhead: MS0 + 7_200_000 }));
    expect(recordLinesSpy()).not.toHaveBeenCalled();
    expect(nodeBriefSpy()).not.toHaveBeenCalled();
    act(() => usePlayhead.setState({ windowMin: MS0 + 1000 }));
    expect(recordLinesSpy()).toHaveBeenCalled();
  });

  it("names the kind by its own id when the manifest gives it no label", () => {
    useSchema.setState({ nodes: [{ ...signIn, label: "" }] });
    const { container } = render(<Timeline transactions={[]} genericEntities={[signInEntity]} />);
    expect(dotOf(container).getAttribute("data-tip")?.split("\n")[0]).toBe("console_signin");
  });

  // The times inside a tooltip follow the clock's 12 or 24 hour switch. The accessible
  // name carries a time too and follows the same switch.
  describe("the clock's form (item 43)", () => {
    afterEach(() => useClockForm.setState({ h24: false }));

    it("in 24 hour form the tooltip's time line and its brief read in 24 hour form", () => {
      useClockForm.setState({ h24: true });
      const { container } = render(<Timeline transactions={[]} genericEntities={[signInEntity]} />);
      const dot = dotOf(container);
      expect(dot.getAttribute("data-tip")).toBe(
        ["Console sign-in", "seat-7", "password", when24(signInEntity.timestamp)].join("\n"),
      );
      expect(dot.getAttribute("data-tip-node")).toBe(`seat-7 · ${when24(signInEntity.timestamp)}`);
    });

    it("a change of form builds the lines again, and the tooltip changes with it", () => {
      const { container } = render(<Timeline transactions={[]} genericEntities={[signInEntity]} />);
      const before = dotOf(container).getAttribute("data-tip");
      expect(before?.split("\n")[3]).toBe(when(signInEntity.timestamp));
      recordLinesSpy().mockClear();
      act(() => useClockForm.setState({ h24: true }));
      expect(recordLinesSpy()).toHaveBeenCalled();
      expect(dotOf(container).getAttribute("data-tip")?.split("\n")[3]).toBe(when24(signInEntity.timestamp));
      act(() => useClockForm.setState({ h24: false }));
      expect(dotOf(container).getAttribute("data-tip")).toBe(before);
    });

    it("a playhead move builds no lines in either form", () => {
      useClockForm.setState({ h24: true });
      render(<Timeline transactions={[]} genericEntities={[signInEntity]} />);
      recordLinesSpy().mockClear();
      nodeBriefSpy().mockClear();
      act(() => usePlayhead.setState({ playhead: MS0 + 3_600_000 }));
      expect(recordLinesSpy()).not.toHaveBeenCalled();
      expect(nodeBriefSpy()).not.toHaveBeenCalled();
    });

    // The accessible name follows the switch as the tooltip does:
    // one imperative, "Jump to", then the kind's label, the headline and the time.
    it("the accessible name reads its time in the clock's form, and changes with the switch", () => {
      const { container } = render(<Timeline transactions={[]} genericEntities={[signInEntity]} />);
      const name12 = `Jump to Console sign-in: seat-7 · ${when(signInEntity.timestamp)}`;
      const name24 = `Jump to Console sign-in: seat-7 · ${when24(signInEntity.timestamp)}`;
      expect(dotOf(container).getAttribute("aria-label")).toBe(name12);
      act(() => useClockForm.setState({ h24: true }));
      expect(dotOf(container).getAttribute("aria-label")).toBe(name24);
      act(() => useClockForm.setState({ h24: false }));
      expect(dotOf(container).getAttribute("aria-label")).toBe(name12);
    });

    it("in 24 hour form the name and the tooltip print the same time", () => {
      useClockForm.setState({ h24: true });
      const { container } = render(<Timeline transactions={[]} genericEntities={[signInEntity]} />);
      const dot = dotOf(container);
      expect(dot.getAttribute("aria-label")).toBe(`Jump to Console sign-in: ${dot.getAttribute("data-tip-node")}`);
    });
  });
});

describe("Timeline track nodes: the solid mark clears 3:1 on the panel", () => {
  // Hues that fall below 3:1 on a theme or on a mode, so the clamp has work to do.
  const HEXES = ["#7ee787", "#c4a1ff", "#ffb347"];
  const nodes = HEXES.map((hex, i) => node(`kind${i}`, hex, "at"));
  const ents = nodes.map((n, i) => manifestRowToEntity(n, { id: `k${i}`, at: `2026-05-12T1${i}:00:00-05:00` }));
  const saved = { theme: useTheme.getState().theme, color: useTheme.getState().color };

  beforeEach(() => {
    usePlayhead.setState({ playhead: MS1, minTime: MS0, maxTime: MS1, windowMin: MS0, windowMax: MS1, isPlaying: false });
    useSchema.setState({ nodes });
  });
  afterEach(() => useTheme.setState(saved));

  const surfaceOf = (theme: "dark" | "light", color: ColorMode): [number, number, number] =>
    resolvePalette(theme, color).material.panelBase.split(/\s+/).map((n) => Number(n) / 255) as [number, number, number];
  // The DOM reflects the mark's colour as the #rrggbb the clamp returned, or as rgb(r, g, b).
  const rgbOf = (css: string): [number, number, number] => {
    const hex = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(css);
    const m = hex ?? /rgba?\((\d+),\s*(\d+),\s*(\d+)/.exec(css);
    if (!m) throw new Error(`unparsed colour "${css}"`);
    return [1, 2, 3].map((i) => (hex ? parseInt(m[i], 16) : Number(m[i])) / 255) as [number, number, number];
  };

  for (const theme of THEMES) {
    for (const color of COLOR_MODES) {
      it(`one node of each declared kind is 3:1 or more in ${theme} ${color}`, () => {
        useTheme.setState({ theme, color });
        const { container } = render(<Timeline transactions={[]} genericEntities={ents} />);
        const marks = [...container.querySelectorAll('button[aria-label^="Jump to"] span.rounded-full')] as HTMLElement[];
        expect(marks).toHaveLength(HEXES.length);
        for (const mark of marks) {
          expect(contrastRatio(rgbOf(mark.style.backgroundColor), surfaceOf(theme, color))).toBeGreaterThanOrEqual(3);
        }
      });
    }
  }
});

// C0: where no node of the manifest declares coords, a decision cannot be placed on the globe, so
// its rows are track nodes like any other timed kind. Each node carries its kind, so a reader of
// the page can tell a decision's node from another.
describe("Timeline track nodes: a decision with no place", () => {
  const bareVerdict: ScenarioNode = { ...verdictNode, coords: null };
  const decided = manifestRowToEntity(bareVerdict, { id: "d1", state: "FAIL", finding: "ATO", when: "2026-05-20T10:00:00-05:00" });
  const nodesIn = (container: HTMLElement) => [...container.querySelectorAll("button[data-node-kind]")] as HTMLElement[];
  const trackKeys = (container: HTMLElement) => container.querySelector('[role="slider"][aria-label="Playhead position"]') as HTMLElement;

  beforeEach(() => {
    usePlayhead.setState({ playhead: MS0, minTime: MS0, maxTime: MS1, windowMin: MS0, windowMax: MS1, isPlaying: false });
    useSelection.setState({ selected: null });
    useNavigation.setState({ panTarget: null, zoomTarget: null, pulseEntityId: null, pulseToken: 0 });
  });

  it("draws a node for it that carries its kind, beside the other kinds' nodes", () => {
    useSchema.setState({ nodes: [shipmentNode, bareVerdict] });
    const { container } = render(<Timeline transactions={[]} genericEntities={[entities[0], decided]} />);
    expect(nodesIn(container).map((b) => b.getAttribute("data-node-kind")).sort()).toEqual(["shipment", "verdict_export"]);
    const node = nodesIn(container).find((b) => b.getAttribute("data-node-kind") === "verdict_export")!;
    expect(node.getAttribute("aria-label")).toMatch(/^Jump to Verdict: /);
  });

  it("is reached by the step key and shown as a record: selected as an entity, the playhead on it", () => {
    useSchema.setState({ nodes: [shipmentNode, bareVerdict] });
    const { container } = render(<Timeline transactions={[]} genericEntities={[entities[0], decided]} />);
    fireEvent.keyDown(trackKeys(container), { key: "." });
    fireEvent.keyDown(trackKeys(container), { key: "." });
    expect(useSelection.getState().selected).toMatchObject({ kind: "entity", entity: { id: "d1" } });
    expect(usePlayhead.getState().playhead).toBe(decided.timestamp);
  });

  it("a click on its node navigates to it", () => {
    useSchema.setState({ nodes: [shipmentNode, bareVerdict] });
    const { container } = render(<Timeline transactions={[]} genericEntities={[entities[0], decided]} />);
    fireEvent.click(nodesIn(container).find((b) => b.getAttribute("data-node-kind") === "verdict_export")!);
    expect(useSelection.getState().selected).toMatchObject({ kind: "entity", entity: { id: "d1" } });
  });

  it("draws no node for it, and no step key reaches it, when another node of the manifest declares coords", () => {
    const placedShipment: ScenarioNode = { ...shipmentNode, coords: { lat: "y", lng: "x" } };
    useSchema.setState({ nodes: [placedShipment, bareVerdict] });
    const { container } = render(<Timeline transactions={[]} genericEntities={[entities[0], decided]} />);
    expect(nodesIn(container).map((b) => b.getAttribute("data-node-kind"))).toEqual(["shipment"]);
    for (let i = 0; i < 3; i++) fireEvent.keyDown(trackKeys(container), { key: "." });
    expect(useSelection.getState().selected).toMatchObject({ kind: "entity", entity: { id: "sh-0100" } });
  });
});

// Test 3.1 (theme follow, C3.T1): a story's own kinds take the resolver's colour for the live theme and
// colour mode on the Timeline's dots, their glow and the lane lines; a kind that has a palette slot is
// not changed. The manifests are the real ones.
describe("Timeline: a story's own kinds follow the theme and the colour mode", () => {
  const manifests = Object.values(
    import.meta.glob<string>("../../../../../backend/scenarios/*.scenario.json", { query: "?raw", import: "default", eager: true }),
  ).map((raw) => JSON.parse(raw) as { id: string; nodes: ScenarioNode[] });
  const nodesOf = (id: string): ScenarioNode[] => {
    const found = manifests.find((m) => m.id === id);
    if (!found) throw new Error(`no scenario file with id ${id}`);
    return found.nodes;
  };
  const platform = nodesOf("platform-access");
  const signIn = platform.find((n) => n.kind === "console_signin")!;
  const keyEvent = platform.find((n) => n.kind === "key_event")!;
  const T0 = Date.parse("2026-06-08T10:00:00Z");
  const T1 = Date.parse("2026-06-08T14:00:00Z");
  const own = [
    manifestRowToEntity(signIn, { id: "s1", timestamp: "2026-06-08T10:30:00Z" }),
    manifestRowToEntity(keyEvent, { id: "k1", timestamp: "2026-06-08T12:30:00Z" }),
  ];
  const saved = { theme: useTheme.getState().theme, color: useTheme.getState().color };
  const put = (theme: "dark" | "light", color: ColorMode) => act(() => useTheme.setState({ theme, color }));

  beforeEach(() => {
    usePlayhead.setState({ playhead: T1, minTime: T0, maxTime: T1, windowMin: T0, windowMax: T1, isPlaying: false });
    useSchema.setState({ nodes: platform });
    useSelection.setState({ selected: null });
    useNavigation.setState({ panTarget: null, zoomTarget: null, pulseEntityId: null, pulseToken: 0 });
    useTheme.setState({ theme: "dark", color: "neon" });
  });
  afterEach(() => useTheme.setState(saved));

  const markOf = (container: HTMLElement, kind: string) =>
    container.querySelector(`button[data-node-kind="${kind}"] span.rounded-full`) as HTMLElement;
  // The solid mark, as the [r, g, b] it paints, whether the DOM reflects it as #rrggbb or as rgb().
  const rgb255 = (css: string): number[] => {
    const hex = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(css);
    const m = hex ?? /rgba?\((\d+),\s*(\d+),\s*(\d+)/.exec(css);
    if (!m) throw new Error(`unparsed colour "${css}"`);
    return [1, 2, 3].map((i) => (hex ? parseInt(m[i], 16) : Number(m[i])));
  };
  const rgbOfHex = (hex: string): number[] => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
  // The glow is painted by the layer's `paint`, the one function that also paints the lane lines' gradient
  // and the day band; happy-dom drops a `background` gradient written in space-syntax rgb() (and the
  // existing tests above say so), so the glow is where the paint of a kind can be read in a unit test. The
  // gradient itself is read from the static build's computed style (the plan's Part 8).
  const snapshot = (container: HTMLElement) => ({
    signin: rgb255(markOf(container, "console_signin").style.backgroundColor),
    key: rgb255(markOf(container, "key_event").style.backgroundColor),
    glowSignin: markOf(container, "console_signin").style.boxShadow,
    glowKey: markOf(container, "key_event").style.boxShadow,
  });

  it("in dark neon the dots and their glow keep the manifest's colours (ruling T1)", () => {
    const { container } = render(<Timeline transactions={[]} genericEntities={own} />);
    expect(rgb255(markOf(container, "console_signin").style.backgroundColor)).toEqual(rgbOfHex("#7ee787"));
    expect(rgb255(markOf(container, "key_event").style.backgroundColor)).toEqual(rgbOfHex("#c4a1ff"));
    expect(markOf(container, "console_signin").style.boxShadow).toContain("rgb(126 231 135 / ");
    expect(markOf(container, "key_event").style.boxShadow).toContain("rgb(196 161 255 / ");
  });

  it("a live switch of the theme and the mode in one mount equals a fresh mount, and the colours are the resolver's marks", () => {
    const live = render(<Timeline transactions={[]} genericEntities={own} />);
    const steps: ["dark" | "light", ColorMode, string, string][] = [
      ["light", "neon", "#198522", "rgb(25 133 34 / "],
      ["light", "deuteranopia", "#29250a", "rgb(41 37 10 / "],
      ["dark", "deuteranopia", "#e8d978", "rgb(232 217 120 / "],
      ["dark", "neon", "#7ee787", "rgb(126 231 135 / "],
    ];
    for (const [theme, color, hex, gradient] of steps) {
      put(theme, color);
      const now = snapshot(live.container);
      expect(now.signin).toEqual(rgbOfHex(hex));
      expect(now.glowSignin).toContain(gradient);
      const fresh = render(<Timeline transactions={[]} genericEntities={own} />);
      expect(snapshot(fresh.container)).toEqual(now);
      fresh.unmount();
    }
  });

  it("PIN (ruling T3): a kind that has a palette slot keeps its slot variables in every theme and mode", () => {
    useSchema.setState({ nodes: nodesOf("card-fraud") });
    const tx = { id: "a1", timestamp: "2026-06-08T11:00:00Z", is_fraud: 0, amount: 1, merchant_name: "M", mcc: "5999", merchant_country: "US", merchant_lat: 1, merchant_lng: 1 } as never;
    for (const theme of THEMES) {
      for (const color of COLOR_MODES) {
        put(theme, color);
        const { container, unmount } = render(<Timeline transactions={[tx]} />);
        const dot = container.querySelector('button[aria-label^="Jump to"] span.rounded-full') as HTMLElement;
        // happy-dom drops a background that holds var(), so a slot kind's mark reads empty (a literal colour
        // would show); the glow keeps its var() and so names the slot's variable.
        expect(dot.style.backgroundColor).toBe("");
        expect(dot.style.boxShadow).toContain("rgb(var(--r1-rgb) / ");
        unmount();
      }
    }
  });
});

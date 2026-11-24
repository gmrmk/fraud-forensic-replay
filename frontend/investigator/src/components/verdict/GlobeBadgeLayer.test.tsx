import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import type maplibregl from "maplibre-gl";
import { GlobeBadgeLayer } from "./GlobeBadgeLayer";
import { manifestRowToEntity } from "../../lib/adapters/manifest-row";
import { recordNode, verdictNode } from "../../lib/verdict-fixtures";
import { useLayers } from "../../store/layers";
import { useSchema } from "../../store/schema";
import { usePivotData } from "../../store/pivot-data";
import { usePivotStore } from "../../store/pivot";
import { usePlayhead } from "../../store/playhead";
import { useSelection } from "../../store/selection";
import { useDecisionData } from "../../store/decision-data";
import { useMatches } from "../../store/matches";
import { useSolo } from "../../store/solo";
import type { Decision } from "../../lib/decisions";

const live = vi.hoisted(() => ({ markers: [] as { el: HTMLElement; opts: Record<string, unknown>; lngLat: [number, number] | null }[] }));

vi.mock("maplibre-gl", () => {
  class Marker {
    el: HTMLElement; opts: Record<string, unknown>; lngLat: [number, number] | null = null;
    constructor(opts: { element: HTMLElement }) { this.el = opts.element; this.opts = opts; }
    setLngLat(ll: [number, number]) { this.lngLat = ll; return this; }
    addTo(map: { getCanvasContainer(): HTMLElement }) { map.getCanvasContainer().appendChild(this.el); live.markers.push(this); return this; }
    remove() { this.el.remove(); live.markers = live.markers.filter((m) => m !== this); return this; }
  }
  return { default: { Marker }, Marker };
});

/** A stand-in map centred on 60 W, 30 N. `projection` is what it reports as its shape; a case may change it. */
function fakeMap(projection: { type: string } = { type: "globe" }) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const map = {
    getCanvasContainer: () => container,
    project: ([lng, lat]: [number, number]) => ({ x: lng * 10, y: -lat * 10 }),
    getCenter: () => ({ lng: -60, lat: 30 }),
    getProjection: () => projection,
    on: vi.fn(), off: vi.fn(),
  } as unknown as maplibregl.Map;
  return { container, map };
}

const T = (hm: string) => `2026-06-09T${hm}:00-05:00`;
const AMS = { y: 52.37, x: 4.9 };
const dec = (id: string, state: string, finding: string, acct: string, when: string, y: number, x: number, worked: string | string[] = "") =>
  manifestRowToEntity(verdictNode, { id, state, finding, memo: `note ${id}`, who: "investigator", subject: `Host ${acct}`, acct, worked, when, y, x });
const rec = (id: string, acct: string, gadget: string) =>
  manifestRowToEntity(recordNode, { id, acct, gadget, when: T("07:00"), ...AMS });
/** A rule decision that queued `event` (its landing trigger). */
const queued = (event: string): Decision => ({
  id: `q-${event}`, rule: { id: "rule-x", label: "rule-x", kind: "k" }, subjectPathKind: "login_like",
  triggerEntityIds: ["s0", event], inputs: [], thresholds: [], verdict: "V", decision: "FLAG", evidence: [], severity: 0.9,
});

const d1 = dec("d1", "FAIL", "ATO", "a1", T("09:40"), 36.6, -93.2, "r1");
const d2 = dec("d2", "FAIL", "ATO", "a2", T("09:43"), 30, -87);
const d3 = dec("d3", "PASS", "PASSED", "a3", T("10:30"), 38.9, -120);
const r1 = rec("r1", "a1", "G1");
const r2 = rec("r2", "a2", "G1");
const r3 = rec("r3", "a3", "G2");
const entities = [d1, d2, d3, r1, r2, r3];
const at = (hm: string) => act(() => usePlayhead.setState({ playhead: Date.parse(T(hm)) }));

const capsules = (c: HTMLElement) => [...c.querySelectorAll("[data-verdict-capsule]")] as HTMLElement[];

let fm: ReturnType<typeof fakeMap>;
beforeEach(() => {
  document.body.innerHTML = "";
  live.markers = [];
  fm = fakeMap();
  useSchema.setState({ nodes: [recordNode, verdictNode] });
  usePivotData.setState({ entities });
  useDecisionData.setState({ reached: [queued("r1"), queued("r2")] });
  useMatches.setState({ active: null });
  usePlayhead.setState({ playhead: Date.parse(T("11:00")), minTime: Date.parse(T("07:00")), maxTime: Date.parse(T("11:00")) });
  useSelection.setState({ selected: null });
  usePivotStore.setState({ windows: [], nextZ: 20 });
  useSolo.setState({ solo: null });
});

describe("GlobeBadgeLayer", () => {
  it("draws one capsule per reached decision, in its word and tone", () => {
    render(<GlobeBadgeLayer map={fm.map} />);
    const words = capsules(fm.container).map((c) => [...c.querySelectorAll("[data-tone]")].map((s) => `${s.getAttribute("data-tone")}:${s.firstChild?.textContent}`).join("|"));
    expect(words.sort()).toEqual(["fail:ATO", "fail:ATO", "pass:PASSED"]);
  });

  it("rewinding the playhead removes capsules not yet decided", () => {
    render(<GlobeBadgeLayer map={fm.map} />);
    at("09:41");
    expect(capsules(fm.container)).toHaveLength(1);
    expect(live.markers).toHaveLength(2); // d1's capsule and r2's flag
  });

  it("each event a rule queued flies a flag in the rule's label, and two at one spot pile as ×2", () => {
    render(<GlobeBadgeLayer map={fm.map} />);
    at("09:00");
    expect(screen.getByText("rule-x ×2")).toBeInTheDocument();
  });

  it("a reached decision that works the event clears its flag", () => {
    render(<GlobeBadgeLayer map={fm.map} />);
    expect(screen.queryByText("rule-x ×2")).toBeNull();
    expect(screen.getByText("rule-x")).toBeInTheDocument(); // r2 is still queued: no decision works it
  });

  it("one decision that works two events clears both flags", () => {
    usePivotData.setState({ entities: [dec("d1", "FAIL", "ATO", "a1", T("09:40"), 36.6, -93.2, ["r1", "r2"]), r1, r2] });
    render(<GlobeBadgeLayer map={fm.map} />);
    expect(fm.container.querySelector("[data-queue-flag]")).toBeNull();
    at("09:00"); // before the decision, both events are still queued
    expect(screen.getByText("rule-x ×2")).toBeInTheDocument();
  });

  it("a flag waits for its event's time", () => {
    render(<GlobeBadgeLayer map={fm.map} />);
    act(() => usePlayhead.setState({ playhead: Date.parse(T("06:59")), minTime: Date.parse(T("06:00")) }));
    expect(fm.container.querySelector("[data-queue-flag]")).toBeNull();
  });

  it("a single flag click opens the rule that queued its event", () => {
    render(<GlobeBadgeLayer map={fm.map} />);
    fireEvent.click(screen.getByRole("button", { name: /rule-x queued r2/ }));
    expect(useMatches.getState().active).toEqual({ mode: "rule", decisionId: "q-r2" });
  });

  it("decision capsules hang below their point and flags rise above it", () => {
    render(<GlobeBadgeLayer map={fm.map} />);
    const anchors = live.markers.map((m) => `${m.el.querySelector("[data-queue-flag]") ? "flag" : "capsule"}:${m.opts.anchor}`);
    expect(new Set(anchors)).toEqual(new Set(["capsule:top", "flag:bottom-left"]));
    for (const m of live.markers) expect(m.el.className).not.toContain("rounded-full");
  });

  it("a capsule click opens its notes popout at its spot and never reaches the map", () => {
    render(<GlobeBadgeLayer map={fm.map} />);
    const mapClick = vi.fn();
    fm.container.addEventListener("click", mapClick);
    fireEvent.click(screen.getByRole("button", { name: /ATO decision for Host a1/ }));
    expect(usePivotStore.getState().windows[0]).toMatchObject({ kind: "detail", view: { type: "notes" }, anchor: { lngLat: { lng: -93.2, lat: 36.6 } } });
    expect(mapClick).not.toHaveBeenCalled();
  });

  it("a pile click opens the pile popout listing its members", () => {
    render(<GlobeBadgeLayer map={fm.map} />);
    at("09:00");
    fireEvent.click(screen.getByRole("button", { name: /2 rule-x at this place/ }));
    expect(usePivotStore.getState().windows[0]).toMatchObject({ view: { type: "pile", label: "2 queued events here", memberIds: ["r1", "r2"] } });
  });

  it("selecting a record lights the decisions linked through its values and dims the rest", () => {
    useSelection.setState({ selected: { kind: "entity", entity: r1 } });
    render(<GlobeBadgeLayer map={fm.map} />);
    const linked = screen.getByRole("button", { name: /2 ATO at this place/ }).querySelector("[data-verdict-capsule]") as HTMLElement;
    expect(linked.dataset.lit).toBe("true");
    const own = screen.getByRole("button", { name: /ATO decision for Host a1/ }).querySelector("[data-verdict-capsule]") as HTMLElement;
    expect(own.dataset.lit).toBe("true");
    const other = screen.getByRole("button", { name: /PASSED decision for Host a3/ }).querySelector("[data-verdict-capsule]") as HTMLElement;
    expect(other.style.opacity).toBe("0.45");
  });

});

// On the flat map nothing lies on a far side, so the test for one is skipped. From the stand-in's
// centre at 60 W, 30 N, a place at 120 E, 30 N lies over the pole, 120 degrees away.
describe("GlobeBadgeLayer on the flat map", () => {
  const far = dec("d4", "FAIL", "ATO", "a4", T("09:50"), 30, 120);
  const handlerFor = (map: maplibregl.Map, type: string) =>
    (map.on as unknown as ReturnType<typeof vi.fn>).mock.calls.find((c) => c[0] === type)?.[1] as (() => void) | undefined;

  it("draws a capsule 120 degrees from the centre on the flat map and not on the globe", () => {
    usePivotData.setState({ entities: [far] });
    const globe = render(<GlobeBadgeLayer map={fm.map} />);
    expect(capsules(fm.container)).toHaveLength(0);
    globe.unmount();
    const flat = fakeMap({ type: "mercator" });
    render(<GlobeBadgeLayer map={flat.map} />);
    expect(capsules(flat.container)).toHaveLength(1);
  });

  it("rebuilds the capsules on the library's projectiontransition alone, with no move", () => {
    usePivotData.setState({ entities: [far] });
    const projection = { type: "globe" };
    const m = fakeMap(projection);
    render(<GlobeBadgeLayer map={m.map} />);
    expect(capsules(m.container)).toHaveLength(0);
    const onFlip = handlerFor(m.map, "projectiontransition");
    expect(onFlip).toBeTypeOf("function");
    projection.type = "mercator";
    act(() => onFlip?.());
    expect(capsules(m.container)).toHaveLength(1);
  });

  it("removes its projectiontransition listener on unmount", () => {
    const m = fakeMap();
    const { unmount } = render(<GlobeBadgeLayer map={m.map} />);
    const onFlip = handlerFor(m.map, "projectiontransition");
    unmount();
    expect(m.map.off).toHaveBeenCalledWith("projectiontransition", onFlip);
  });
});

// The Layers switches (C3 c, C5 b): the data's capsules and flags follow the one function. A switched-off
// kind or status value draws no capsule; a switched-off event kind flies no flag. Nothing here asserts a
// pin's win (PIN_WINS is false before item 1).
describe("GlobeBadgeLayer: the Layers switches", () => {
  const filteredVerdict = { ...verdictNode, filter: { field: "state", label: "Status" } };
  const words = (c: HTMLElement) => capsules(c).map((el) => [...el.querySelectorAll("[data-tone]")].map((s) => `${s.getAttribute("data-tone")}:${s.firstChild?.textContent}`).join("|")).sort();

  beforeEach(() => {
    useSchema.setState({ nodes: [filteredVerdict, recordNode] });
    useLayers.setState({ hiddenKinds: [], hiddenValues: {} });
  });
  afterEach(() => {
    useLayers.setState({ hiddenKinds: [], hiddenValues: {} });
  });

  it("draws every capsule with nothing switched off", () => {
    render(<GlobeBadgeLayer map={fm.map} />);
    expect(words(fm.container)).toEqual(["fail:ATO", "fail:ATO", "pass:PASSED"]);
  });

  it("a switched-off decision kind draws no capsule", () => {
    useLayers.setState({ hiddenKinds: ["verdict_export"] });
    render(<GlobeBadgeLayer map={fm.map} />);
    expect(capsules(fm.container)).toHaveLength(0);
  });

  it("a switched-off status value draws the other statuses' capsules and not its own", () => {
    useLayers.setState({ hiddenValues: { verdict_export: ["FAIL"] } });
    render(<GlobeBadgeLayer map={fm.map} />);
    expect(words(fm.container)).toEqual(["pass:PASSED"]);
  });

  it("a switched-off event kind flies no flag, and a decision still draws", () => {
    useLayers.setState({ hiddenKinds: ["login_like"] });
    render(<GlobeBadgeLayer map={fm.map} />);
    expect(fm.container.querySelector("[data-queue-flag]")).toBeNull();
    expect(capsules(fm.container)).toHaveLength(3);
  });

  it("a linked badge does not light at a record the switches hide", () => {
    useSelection.setState({ selected: { kind: "entity", entity: r1 } });
    const { unmount } = render(<GlobeBadgeLayer map={fm.map} />);
    expect(screen.getByRole("button", { name: /2 ATO at this place/ })).toBeInTheDocument();
    unmount();
    // r2 holds the second decision's link; with its kind switched off the selected r1 is the only record
    // of that kind left (the selected record stays drawn), so the pile of two is gone.
    useLayers.setState({ hiddenKinds: ["login_like"] });
    render(<GlobeBadgeLayer map={fm.map} />);
    expect(screen.queryByRole("button", { name: /2 ATO at this place/ })).toBeNull();
  });
});

// A solo narrows the globe's own dots (App.tsx); a decision is in the solo when `decisionInSolo` says so,
// over the ids the solo keeps in the whole case. d1 works r1, so the solo of a1 holds d1 and r1 only.
describe("GlobeBadgeLayer: a solo", () => {
  const soloOn = (value: string) => useSolo.setState({ solo: { field: "acct", value } });
  const names = (c: HTMLElement) => capsules(c).map((el) => el.closest("button")?.getAttribute("aria-label")).sort();

  beforeEach(() => {
    useSchema.setState({ nodes: [verdictNode, recordNode] });
  });
  afterEach(() => {
    useSolo.setState({ solo: null });
  });

  it("with no solo every decision draws", () => {
    render(<GlobeBadgeLayer map={fm.map} />);
    expect(capsules(fm.container)).toHaveLength(3);
  });

  it("a decision the solo accepts draws, and the decisions it refuses do not", () => {
    soloOn("a1");
    render(<GlobeBadgeLayer map={fm.map} />);
    expect(names(fm.container)).toEqual([expect.stringMatching(/ATO decision for Host a1/)]);
  });

  it("a solo that holds no decision's event draws no capsule", () => {
    soloOn("a3");
    render(<GlobeBadgeLayer map={fm.map} />);
    expect(capsules(fm.container)).toHaveLength(0);
  });

  it("the capsules come back when the solo ends", () => {
    soloOn("a1");
    render(<GlobeBadgeLayer map={fm.map} />);
    expect(capsules(fm.container)).toHaveLength(1);
    act(() => useSolo.setState({ solo: null }));
    expect(capsules(fm.container)).toHaveLength(3);
  });
});

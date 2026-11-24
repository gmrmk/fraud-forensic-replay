/**
 * The investigator's paths on the Timeline's track: one svg holding the dashed line (a gap round every
 * data dot the line passes that is not one of its stops) and a numbered plate for each stop in the
 * visible window. Rendered with the props the Timeline layer gives it, over the real stores. happy-dom
 * keeps attributes, so the assertions read attributes; where the line really clears a dot is checked
 * in a real browser.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render } from "@testing-library/react";
import { CustomPathTimeline } from "./CustomPathTimeline";
import { AHEAD_OPACITY, DRAFT_OPACITY, LINE, UNCHOSEN_OPACITY } from "./path-geometry";
import { usePathSession } from "./path-session";
import { manifestRowToEntity } from "../../lib/adapters/manifest-row";
import { recordNode } from "../../lib/verdict-fixtures";
import { makePath } from "../../lib/notes/test-fixtures";
import type { ScenarioNode } from "../../lib/scenarios";
import { useClockForm } from "../../store/clock-form";
import { useLayers } from "../../store/layers";
import { useMarksStore } from "../../store/marks";
import { useNavigation } from "../../store/navigation";
import { usePivotData } from "../../store/pivot-data";
import { usePlayhead } from "../../store/playhead";
import { useSchema } from "../../store/schema";

const live = vi.hoisted(() => ({ words: 0 }));
// Counts the words built for the plates, so a render of the layer can be counted; the words stay real.
vi.mock("./plate-words", async (orig) => {
  const real = await orig<typeof import("./plate-words")>();
  return {
    ...real,
    plateWords: (...a: Parameters<typeof real.plateWords>) => {
      live.words += 1;
      return real.plateWords(...a);
    },
  };
});

const T0 = Date.parse("2026-05-21T14:00:00Z");
const HOUR = 3_600_000;
const SPAN = 10 * HOUR;
const meterNode: ScenarioNode = { kind: "meter", label: "Meter", palette: "#00aaff", source: "json", coords: { lat: "y", lng: "x" }, timestamp: "when", primary: "${id}", magnitude: "size" };
const row = (n: number, hours = n - 1) => ({ id: `e${n}`, acct: `a${n}`, gadget: "g", when: new Date(T0 + hours * HOUR).toISOString(), y: 29.7 + n * 0.05, x: -95.4 + n * 0.1 });
const ENTITIES = [1, 2, 3, 4].map((n) => manifestRowToEntity(recordNode, row(n)));
const METER = manifestRowToEntity(meterNode, { ...row(7, 3.5), id: "m7", size: 4 });
const ref = (id: string | number) => ({ kind: "login_like", id: typeof id === "number" ? `e${id}` : id });
const PATH_ID = (c: string) => `path-${c.repeat(32)}`;
const path = (c: string, stops: ReturnType<typeof ref>[], seq = 1) => makePath({ id: PATH_ID(c), seq, name: `Path ${seq}`, stops });
const FOUR = [ref(1), ref(2), ref(3), ref(4)];

const LANES = { login_like: 25, auth: 75 };
const kindFor = (k: string) => (k === "login_like" ? "login_like" : k === "nolane" ? "nolane" : "auth");
const pct = (hours: number) => (hours / 10) * 100;
/** The Timeline layer's ticks for the four records, and three more dots that are not stops. */
const TICKS = [
  ...[0, 1, 2, 3].map((h, i) => ({ id: `e${i + 1}`, kind: "login_like", pct: pct(h) })),
  { id: "x1", kind: "auth", pct: pct(0.5) },
  { id: "x2", kind: "login_like", pct: pct(1.5) },
  { id: "x3", kind: "auth", pct: pct(6) },
];

const props = (over: Partial<Parameters<typeof CustomPathTimeline>[0]> = {}) => ({
  windowMin: T0,
  span: SPAN,
  lanes: LANES,
  kindFor,
  ticks: TICKS,
  ...over,
});

function resetStores() {
  useSchema.setState({ nodes: [recordNode, meterNode] });
  usePivotData.setState({ entities: [...ENTITIES, METER], transactions: [], logins: [], accountEvents: [], transfers: [] });
  useMarksStore.setState({ scenario: "card-fraud", paths: [], nodes: [] });
  usePathSession.setState({ draft: null, hidden: [], chosen: null });
  usePlayhead.setState({ playhead: T0 + 10 * HOUR, minTime: T0, maxTime: T0 + SPAN, windowMin: T0, windowMax: T0 + SPAN });
  useLayers.setState({ hiddenKinds: [], hiddenValues: {} });
  useClockForm.setState({ h24: false });
  useNavigation.setState({ navigate: vi.fn() });
}

beforeEach(() => {
  live.words = 0;
  resetStores();
});
afterEach(() => {
  document.body.innerHTML = "";
});

const svgOf = (c: HTMLElement) => c.querySelector("[data-custom-path-timeline] > svg") as SVGSVGElement;
const lines = (c: HTMLElement) => [...c.querySelectorAll("svg line[data-path-line]")] as SVGLineElement[];
const casings = (c: HTMLElement) => [...c.querySelectorAll("svg line[data-path-casing]")] as SVGLineElement[];
const plates = (c: HTMLElement) => [...c.querySelectorAll("button[data-path-plate]")] as HTMLButtonElement[];
const maskOf = (c: HTMLElement, line: Element) => {
  const id = /url\(#(.+)\)/.exec(line.getAttribute("mask") ?? "")?.[1];
  return c.querySelector(`mask[id="${id}"]`) as SVGMaskElement;
};
const navigateMock = () => useNavigation.getState().navigate as unknown as ReturnType<typeof vi.fn>;

describe("CustomPathTimeline: the line", () => {
  it("renders nothing with no saved path and no draft", () => {
    const { container } = render(<CustomPathTimeline {...props()} />);
    expect(container.innerHTML).toBe("");
  });

  it("renders nothing while the window has no span", () => {
    useMarksStore.setState({ paths: [path("a", FOUR)] });
    const { container } = render(<CustomPathTimeline {...props({ span: 0 })} />);
    expect(container.innerHTML).toBe("");
  });

  it("holds one svg, hidden from readers, that takes no pointer, over the dots' lines and under the dots", () => {
    useMarksStore.setState({ paths: [path("a", FOUR)] });
    const { container } = render(<CustomPathTimeline {...props()} />);
    // One svg for the line; the lens inside a plate is another svg, so only the wrapper's own are counted.
    expect(container.querySelectorAll("[data-custom-path-timeline] > svg")).toHaveLength(1);
    const svg = svgOf(container);
    expect(svg.getAttribute("aria-hidden")).toBe("true");
    expect(svg.style.pointerEvents).toBe("none");
    expect(svg.style.zIndex).toBe("2");
    expect(svg.style.overflow).toBe("hidden");
  });

  it("draws the line through the four stops: width 1.5, dashes 6 and 2, the theme's ink at 0.85, in the stops' order", () => {
    useMarksStore.setState({ paths: [path("a", FOUR)] });
    const { container } = render(<CustomPathTimeline {...props()} />);
    const ls = lines(container);
    expect(ls).toHaveLength(3);
    for (const l of ls) {
      expect(l.getAttribute("stroke-width")).toBe(String(LINE.timeline.width));
      expect(l.getAttribute("stroke-dasharray")).toBe(LINE.timeline.dash);
      expect(l.getAttribute("stroke")).toBe("rgb(var(--text-rgb) / 0.85)");
      expect(l.getAttribute("stroke-linecap")).toBe("butt");
    }
    expect(LINE.timeline.width).toBe(1.5);
    expect(LINE.timeline.dash).toBe("6 2");
    // Each stretch joins one stop to the next, x in percent of the window, y the stop's lane.
    expect(ls.map((l) => [l.getAttribute("x1"), l.getAttribute("y1"), l.getAttribute("x2"), l.getAttribute("y2")])).toEqual([
      ["0%", "25%", "10%", "25%"],
      ["10%", "25%", "20%", "25%"],
      ["20%", "25%", "30%", "25%"],
    ]);
  });

  it("masks the line with a user-space mask: a white rectangle over the whole box and a black circle of radius 4 at each dot that is not a stop and lies between the first and last stop", () => {
    useMarksStore.setState({ paths: [path("a", FOUR)] });
    const { container } = render(<CustomPathTimeline {...props()} />);
    const mask = maskOf(container, lines(container)[0]);
    expect(mask).not.toBeNull();
    expect(mask.getAttribute("maskUnits")).toBe("userSpaceOnUse");
    expect([mask.getAttribute("x"), mask.getAttribute("y"), mask.getAttribute("width"), mask.getAttribute("height")]).toEqual(["0", "0", "100%", "100%"]);
    const rect = mask.querySelector("rect")!;
    expect(rect.getAttribute("fill")).toBe("white");
    expect([rect.getAttribute("x"), rect.getAttribute("y"), rect.getAttribute("width"), rect.getAttribute("height")]).toEqual(["0", "0", "100%", "100%"]);
    const circles = [...mask.querySelectorAll("circle")];
    // x1 and x2 lie between stop 1 (0%) and stop 4 (30%); x3 (60%) lies beyond the last stop; the stops' own dots are left whole.
    expect(circles.map((c) => [c.getAttribute("cx"), c.getAttribute("cy"), c.getAttribute("r"), c.getAttribute("fill")])).toEqual([
      ["5%", "75%", "4", "black"],
      ["15%", "25%", "4", "black"],
    ]);
  });

  it("still gives a line element, with the mask, for two stops on one lane", () => {
    useMarksStore.setState({ paths: [path("a", [ref(1), ref(2)])] });
    const { container } = render(<CustomPathTimeline {...props()} />);
    const ls = lines(container);
    expect(ls).toHaveLength(1);
    expect(maskOf(container, ls[0])).not.toBeNull();
    expect(ls[0].getAttribute("y1")).toBe(ls[0].getAttribute("y2"));
  });

  it("clips at the track's edges: a stop outside the window gives no plate but its line runs to the edge", () => {
    // Stop 4 lies at 30 percent of a window that is only 2.5 hours wide: past the right edge.
    useMarksStore.setState({ paths: [path("a", FOUR)] });
    const { container } = render(<CustomPathTimeline {...props({ span: 2.5 * HOUR })} />);
    expect(plates(container)).toHaveLength(3);
    const last = lines(container)[2];
    expect(last.getAttribute("x2")).toBe("120%");
    expect(svgOf(container).style.overflow).toBe("hidden");
  });

  it("draws the draft at 0.6 and a path another is chosen over at 0.35", () => {
    useMarksStore.setState({ paths: [path("a", [ref(1), ref(2)], 1), path("b", [ref(3), ref(4)], 2)] });
    const { container } = render(<CustomPathTimeline {...props()} />);
    expect(lines(container).map((l) => l.getAttribute("opacity"))).toEqual(["1", "1"]);
    act(() => usePathSession.getState().choose(PATH_ID("b")));
    expect(lines(container).map((l) => l.getAttribute("opacity"))).toEqual([String(UNCHOSEN_OPACITY), "1"]);
    act(() => {
      usePathSession.getState().start("Path 3");
      usePathSession.getState().addStop(ref(1));
      usePathSession.getState().addStop(ref(3));
    });
    expect(lines(container).map((l) => l.getAttribute("opacity"))).toEqual([String(UNCHOSEN_OPACITY), "1", String(DRAFT_OPACITY)]);
  });

  it("draws nothing for a path switched off", () => {
    useMarksStore.setState({ paths: [path("a", FOUR)] });
    usePathSession.setState({ hidden: [PATH_ID("a")] });
    const { container } = render(<CustomPathTimeline {...props()} />);
    expect(container.innerHTML).toBe("");
  });

  it("leaves out a stop whose kind the Layers switches turn off, so the line runs past it", () => {
    useMarksStore.setState({ paths: [path("a", [ref(1), { kind: "meter", id: "m7" }, ref(3)])] });
    useLayers.setState({ hiddenKinds: ["meter"] });
    const { container } = render(<CustomPathTimeline {...props()} />);
    expect(plates(container).map((p) => p.textContent)).toEqual(["1", "3"]);
    expect(lines(container)).toHaveLength(1);
  });
});

describe("CustomPathTimeline: the casing under the line", () => {
  it("draws one casing line for each stretch, with the dash line's ends, mask and strength, in the panel's glass tint, 3.5 px wide and unbroken", () => {
    useMarksStore.setState({ paths: [path("a", FOUR)] });
    const { container } = render(<CustomPathTimeline {...props()} />);
    const cs = casings(container);
    const ls = lines(container);
    expect(cs).toHaveLength(3);
    expect(ls).toHaveLength(3);
    cs.forEach((c, i) => {
      expect(c.getAttribute("stroke")).toBe("rgb(var(--glass-tint))");
      expect(c.getAttribute("stroke-width")).toBe("3.5");
      expect(c.getAttribute("stroke-width")).toBe(String(LINE.timeline.casingWidth));
      expect(c.hasAttribute("stroke-dasharray")).toBe(false);
      expect(c.getAttribute("stroke-linecap")).toBe("butt");
      expect(c.getAttribute("data-path-casing")).toBe(PATH_ID("a"));
      for (const attr of ["x1", "y1", "x2", "y2", "mask", "opacity"]) expect(c.getAttribute(attr), `${attr} of casing ${i}`).toBe(ls[i].getAttribute(attr));
      expect(maskOf(container, c)).not.toBeNull();
    });
  });

  it("draws every casing before any dash line, so one path's casing never covers another path's dashes", () => {
    useMarksStore.setState({ paths: [path("a", [ref(1), ref(2)], 1), path("b", [ref(3), ref(4)], 2)] });
    const { container } = render(<CustomPathTimeline {...props()} />);
    const all = [...container.querySelectorAll("svg line")].map((l) => (l.hasAttribute("data-path-casing") ? "casing" : "dash"));
    expect(all).toEqual(["casing", "casing", "dash", "dash"]);
  });

  it("gives the casing the strength of its path, the draft at 0.6 and an unchosen path at 0.35", () => {
    useMarksStore.setState({ paths: [path("a", [ref(1), ref(2)], 1), path("b", [ref(3), ref(4)], 2)] });
    const { container } = render(<CustomPathTimeline {...props()} />);
    act(() => usePathSession.getState().choose(PATH_ID("b")));
    expect(casings(container).map((l) => l.getAttribute("opacity"))).toEqual([String(UNCHOSEN_OPACITY), "1"]);
    act(() => {
      usePathSession.getState().start("Path 3");
      usePathSession.getState().addStop(ref(1));
      usePathSession.getState().addStop(ref(3));
    });
    expect(casings(container).map((l) => l.getAttribute("opacity"))).toEqual([String(UNCHOSEN_OPACITY), "1", String(DRAFT_OPACITY)]);
  });

  it("leaves the dash line's own paint as it was: width 1.5, dashes 6 and 2, the theme's ink at 0.85", () => {
    useMarksStore.setState({ paths: [path("a", FOUR)] });
    const { container } = render(<CustomPathTimeline {...props()} />);
    for (const l of lines(container)) {
      expect(l.getAttribute("stroke")).toBe("rgb(var(--text-rgb) / 0.85)");
      expect(l.getAttribute("stroke-width")).toBe("1.5");
      expect(l.getAttribute("stroke-dasharray")).toBe("6 2");
    }
  });
});

describe("CustomPathTimeline: plates that touch join", () => {
  const MIDDLE_DOT = String.fromCodePoint(0xb7);
  const T100 = { width: 100, height: 32 };
  const T300 = { width: 300, height: 32 };
  const faceOpacity = (b: HTMLElement) => (b.querySelector("[data-stop-plate]") as HTMLElement).style.opacity;

  it("draws four plates that would touch as one, led by the lens, reading 1, 2, 3 and 4 with the middle dot between", () => {
    useMarksStore.setState({ paths: [path("a", FOUR)] });
    const { container } = render(<CustomPathTimeline {...props({ trackPx: T100 })} />);
    const ps = plates(container);
    expect(ps).toHaveLength(1);
    const p = ps[0];
    expect(p.textContent).toBe(["1", "2", "3", "4"].join(MIDDLE_DOT));
    expect(p.querySelectorAll('[data-glyph="lens"]')).toHaveLength(1);
    expect(p.getAttribute("data-path-plate")).toBe(`${PATH_ID("a")}|1+2+3+4`);
    // It stands where plate 1 stands and grows to the right: the lens plate is 20.5 wide and the four-stop plate 53.5.
    expect(p.style.left).toBe("calc(0% + 30px)");
    expect(p.style.top).toBe("calc(25% - 3px)");
    expect(p.style.transform).toBe("translate(-100%, -100%)");
    expect(p.style.zIndex).toBe("4");
    expect(p.getAttribute("data-tip")!.split("\n").slice(0, 5)).toEqual([
      "Stops 1, 2, 3 and 4 of 4, Path 1",
      "1 Login-like: e1",
      "2 Login-like: e2",
      "3 Login-like: e3",
      "4 Login-like: e4",
    ]);
    expect(p.getAttribute("aria-label")).toBe("Stops 1, 2, 3 and 4 of 4, Path 1. 1 Login-like: e1");
  });

  it("draws them apart on a wider track, with today's styles, and joins them again when the window widens", () => {
    useMarksStore.setState({ paths: [path("a", FOUR)] });
    const { container, rerender } = render(<CustomPathTimeline {...props({ trackPx: T100 })} />);
    expect(plates(container)).toHaveLength(1);
    rerender(<CustomPathTimeline {...props({ trackPx: T300 })} />);
    const apart = plates(container);
    expect(apart.map((p) => p.textContent)).toEqual(["1", "2", "3", "4"]);
    expect(apart.map((p) => p.style.left)).toEqual(["0%", "10%", "20%", "30%"].map((x) => `calc(${x} - 3px)`));
    // A window forty hours wide puts the stops 2.5 percent apart: 7.5 px on this track, so they touch.
    rerender(<CustomPathTimeline {...props({ trackPx: T300, span: 40 * HOUR })} />);
    expect(plates(container)).toHaveLength(1);
    expect(plates(container)[0].textContent).toBe(["1", "2", "3", "4"].join(MIDDLE_DOT));
  });

  it("dims a joined plate only when every stop in it is after the playhead, and never the line", () => {
    useMarksStore.setState({ paths: [path("a", FOUR)] });
    act(() => usePlayhead.setState({ playhead: T0 + 1.5 * HOUR }));
    const { container } = render(<CustomPathTimeline {...props({ trackPx: T100 })} />);
    expect(plates(container)).toHaveLength(1);
    expect(faceOpacity(plates(container)[0])).toBe("");
    expect(lines(container).map((l) => l.getAttribute("opacity"))).toEqual(["1", "1", "1"]);
    act(() => usePlayhead.setState({ playhead: T0 - HOUR }));
    expect(faceOpacity(plates(container)[0])).toBe(String(AHEAD_OPACITY));
    expect(lines(container).map((l) => l.getAttribute("opacity"))).toEqual(["1", "1", "1"]);
  });

  it("goes to the lowest-numbered stop's record on a click, once", () => {
    useMarksStore.setState({ paths: [path("a", FOUR)] });
    const { container } = render(<CustomPathTimeline {...props({ trackPx: T100 })} />);
    expect(plates(container)).toHaveLength(1);
    fireEvent.click(plates(container)[0]);
    expect(navigateMock()).toHaveBeenCalledTimes(1);
    expect(navigateMock().mock.calls[0][0]).toMatchObject({ kind: "entity", entity: { id: "e1" } });
  });

  it("does not let a press on a joined plate reach the track", () => {
    useMarksStore.setState({ paths: [path("a", FOUR)] });
    const outside = vi.fn();
    const { container } = render(
      <div onMouseDown={outside} onClick={outside}>
        <CustomPathTimeline {...props({ trackPx: T100 })} />
      </div>,
    );
    expect(plates(container)).toHaveLength(1);
    fireEvent.mouseDown(plates(container)[0]);
    fireEvent.click(plates(container)[0]);
    expect(outside).not.toHaveBeenCalled();
  });

  it("joins within one path only: two paths at the same places give one joined plate each", () => {
    useMarksStore.setState({ paths: [path("a", FOUR, 1), path("b", FOUR, 2)] });
    const { container } = render(<CustomPathTimeline {...props({ trackPx: T100 })} />);
    const ps = plates(container);
    expect(ps.map((p) => p.getAttribute("data-path-plate"))).toEqual([`${PATH_ID("a")}|1+2+3+4`, `${PATH_ID("b")}|1+2+3+4`]);
    // The second path's plate stands 13 px above the first, as a second path's plate always does.
    expect(ps.map((p) => p.style.top)).toEqual(["calc(25% - 3px)", "calc(25% - 16px)"]);
  });

  it("does not render again for a playhead move between two stop times, on a track where the plates stand apart", () => {
    useMarksStore.setState({ paths: [path("a", FOUR)] });
    act(() => usePlayhead.setState({ playhead: T0 + 1.2 * HOUR }));
    render(<CustomPathTimeline {...props({ trackPx: T300 })} />);
    const built = live.words;
    expect(built).toBeGreaterThanOrEqual(4);
    for (const step of [1.3, 1.5, 1.8, 1.99]) act(() => usePlayhead.setState({ playhead: T0 + step * HOUR }));
    expect(live.words).toBe(built);
    act(() => usePlayhead.setState({ playhead: T0 + 2.5 * HOUR }));
    expect(live.words).toBeGreaterThan(built);
  });

  it("joins nothing while the track has no measured size: four plates, as before", () => {
    useMarksStore.setState({ paths: [path("a", FOUR)] });
    const { container } = render(<CustomPathTimeline {...props()} />);
    expect(plates(container).map((p) => p.textContent)).toEqual(["1", "2", "3", "4"]);
  });

  it("measures the track from its own client size, never a rect, and follows a resize", () => {
    useMarksStore.setState({ paths: [path("a", FOUR)] });
    const size = { width: 300, height: 32 };
    const callbacks: (() => void)[] = [];
    const disconnected = vi.fn();
    class FakeObserver {
      constructor(cb: () => void) {
        callbacks.push(cb);
      }
      observe() {}
      disconnect() {
        disconnected();
      }
    }
    vi.stubGlobal("ResizeObserver", FakeObserver);
    // happy-dom has no client size of its own (the layout tests of the notes layer stub it the same way).
    // What the prototype held before is put back afterwards, so a later test sees the same getters.
    const proto = HTMLElement.prototype as unknown as Record<string, unknown>;
    const before = { clientWidth: Object.getOwnPropertyDescriptor(proto, "clientWidth"), clientHeight: Object.getOwnPropertyDescriptor(proto, "clientHeight") };
    Object.defineProperty(HTMLElement.prototype, "clientWidth", {
      configurable: true,
      get(this: HTMLElement) {
        return this.hasAttribute("data-custom-path-timeline") ? size.width : 0;
      },
    });
    Object.defineProperty(HTMLElement.prototype, "clientHeight", {
      configurable: true,
      get(this: HTMLElement) {
        return this.hasAttribute("data-custom-path-timeline") ? size.height : 0;
      },
    });
    try {
      const { container, unmount } = render(<CustomPathTimeline {...props()} />);
      expect(plates(container)).toHaveLength(4);
      size.width = 100;
      act(() => callbacks.forEach((cb) => cb()));
      expect(plates(container)).toHaveLength(1);
      size.width = 300;
      act(() => callbacks.forEach((cb) => cb()));
      expect(plates(container)).toHaveLength(4);
      unmount();
      expect(disconnected).toHaveBeenCalled();
    } finally {
      for (const name of ["clientWidth", "clientHeight"] as const) {
        if (before[name] !== undefined) Object.defineProperty(HTMLElement.prototype, name, before[name]);
        else delete proto[name];
      }
      vi.unstubAllGlobals();
    }
  });
});

describe("CustomPathTimeline: the plates", () => {
  it("places a plate for each stop with its bottom-right corner 3 px up and left of the dot's centre, above the dots", () => {
    useMarksStore.setState({ paths: [path("a", FOUR)] });
    const { container } = render(<CustomPathTimeline {...props()} />);
    const ps = plates(container);
    expect(ps.map((p) => p.textContent)).toEqual(["1", "2", "3", "4"]);
    expect(ps.map((p) => p.style.left)).toEqual(["0%", "10%", "20%", "30%"].map((x) => `calc(${x} - 3px)`));
    expect(ps.map((p) => p.style.top)).toEqual(Array(4).fill("calc(25% - 3px)"));
    for (const p of ps) {
      expect(p.style.zIndex).toBe("4");
      expect(p.style.transform).toBe("translate(-100%, -100%)");
    }
  });

  it("is mono 8 px, square, with the lens at 7 px on plate 1 only", () => {
    useMarksStore.setState({ paths: [path("a", FOUR)] });
    const { container } = render(<CustomPathTimeline {...props()} />);
    const faces = plates(container).map((p) => p.querySelector("[data-stop-plate]") as HTMLElement);
    for (const f of faces) {
      expect(f.className).toContain("text-[8px]");
      expect(f.className).toContain("font-mono");
      expect(f.className).not.toMatch(/rounded/);
    }
    expect(faces.map((f) => f.querySelectorAll('[data-glyph="lens"]').length)).toEqual([1, 0, 0, 0]);
    expect(faces[0].querySelector('[data-glyph="lens"]')?.getAttribute("width")).toBe("7");
  });

  it("sits a magnitude kind's stop and a stop whose kind has no lane at the track's middle", () => {
    useMarksStore.setState({ paths: [path("a", [ref(1), { kind: "meter", id: "m7" }, ref(3)])] });
    const { container } = render(<CustomPathTimeline {...props()} />);
    expect(plates(container).map((p) => p.style.top)).toEqual(["calc(25% - 3px)", "calc(50% - 3px)", "calc(25% - 3px)"]);
  });

  it("gives the plate of the same record in a second path a place 13 px above the first", () => {
    useMarksStore.setState({ paths: [path("a", [ref(1), ref(2)], 1), path("b", [ref(2), ref(3)], 2)] });
    const { container } = render(<CustomPathTimeline {...props()} />);
    const tops = plates(container).map((p) => p.style.top);
    expect(tops).toEqual(["calc(25% - 3px)", "calc(25% - 3px)", "calc(25% - 16px)", "calc(25% - 3px)"]);
  });

  it("words each plate on its button: the name, and the tooltip with the record and its time", () => {
    useMarksStore.setState({ paths: [path("a", FOUR)] });
    const { container } = render(<CustomPathTimeline {...props()} />);
    const p = plates(container)[1];
    expect(p.getAttribute("aria-label")).toBe("Stop 2 of 4, Path 1. Login-like: e2");
    const lines3 = p.getAttribute("data-tip")!.split("\n");
    expect(lines3.slice(0, 2)).toEqual(["Stop 2 of 4, Path 1", "Login-like: e2"]);
    expect(lines3[2]).toMatch(/^Time: /);
  });

  it("does not let a press on a plate reach the track: no seek, no scrub", () => {
    useMarksStore.setState({ paths: [path("a", FOUR)] });
    const outside = vi.fn();
    const { container } = render(
      <div onMouseDown={outside} onClick={outside}>
        <CustomPathTimeline {...props()} />
      </div>,
    );
    fireEvent.mouseDown(plates(container)[0]);
    fireEvent.click(plates(container)[0]);
    expect(outside).not.toHaveBeenCalled();
  });

  it("navigates to the stop's record on a click", () => {
    useMarksStore.setState({ paths: [path("a", FOUR)] });
    const { container } = render(<CustomPathTimeline {...props()} />);
    fireEvent.click(plates(container)[2]);
    expect(navigateMock()).toHaveBeenCalledTimes(1);
    expect(navigateMock().mock.calls[0][0]).toMatchObject({ kind: "entity", entity: { id: "e3" } });
  });

  it("dims the plates of the stops after the playhead to 0.45 and leaves the line whole", () => {
    useMarksStore.setState({ paths: [path("a", FOUR)] });
    act(() => usePlayhead.setState({ playhead: T0 + 1.5 * HOUR }));
    const { container } = render(<CustomPathTimeline {...props()} />);
    const faces = plates(container).map((p) => (p.querySelector("[data-stop-plate]") as HTMLElement).style.opacity);
    expect(faces).toEqual(["", "", String(AHEAD_OPACITY), String(AHEAD_OPACITY)]);
    expect(lines(container).map((l) => l.getAttribute("opacity"))).toEqual(["1", "1", "1"]);
  });

  it("reads the playhead afresh when the paths are replaced, even if the string of what is ahead is the same", () => {
    // Path A: stop 2 is after the playhead (0.5 h) and stop 1 is not: "01". The playhead moves to 0.9 h
    // (still "01"), and then path B replaces A with a first stop at 0.7 h: at 0.9 h that stop is behind
    // the playhead and the second is ahead, "01" again, though against the old 0.5 h the first would be ahead.
    const e5 = manifestRowToEntity(recordNode, row(5, 0.7));
    usePivotData.setState({ entities: [...ENTITIES, METER, e5] });
    useMarksStore.setState({ paths: [path("a", [ref(1), ref(2)])] });
    act(() => usePlayhead.setState({ playhead: T0 + 0.5 * HOUR }));
    const { container } = render(<CustomPathTimeline {...props()} />);
    const dims = () => plates(container).map((p) => (p.querySelector("[data-stop-plate]") as HTMLElement).style.opacity);
    expect(dims()).toEqual(["", String(AHEAD_OPACITY)]);
    act(() => usePlayhead.setState({ playhead: T0 + 0.9 * HOUR }));
    act(() => useMarksStore.setState({ paths: [path("b", [ref(5), ref(3)], 2)] }));
    expect(dims()).toEqual(["", String(AHEAD_OPACITY)]);
  });

  it("does not render again for a playhead move between two stop times, and does when it crosses one", () => {
    useMarksStore.setState({ paths: [path("a", FOUR)] });
    act(() => usePlayhead.setState({ playhead: T0 + 1.2 * HOUR }));
    render(<CustomPathTimeline {...props()} />);
    const built = live.words;
    expect(built).toBeGreaterThanOrEqual(4);
    for (const step of [1.3, 1.5, 1.8, 1.99]) act(() => usePlayhead.setState({ playhead: T0 + step * HOUR }));
    expect(live.words).toBe(built);
    act(() => usePlayhead.setState({ playhead: T0 + 2.5 * HOUR }));
    expect(live.words).toBeGreaterThan(built);
  });
});

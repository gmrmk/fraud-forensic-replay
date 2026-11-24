/**
 * The pile on the globe, the component alone, with props built by hand: its marker element (a div, not a
 * button), the one button that holds the face, the column of members it opens out of flow above it, the
 * press and how focus moves (a member press and Escape both end on the pile). Maplibre is mocked: a
 * marker records its options. A real Tab walk is a frame's job: this DOM does not move focus on Tab.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { fireEvent, render } from "@testing-library/react";
import type maplibregl from "maplibre-gl";
import { GlobePile, type GlobePileProps } from "./GlobePile";
import { pileFace, type PileMember } from "./mark-piles";
import { lookupFromContext } from "../notes/record-lookup";
import { CONTEXT, SCENARIO } from "../notes/test-support";
import { tip } from "../ui/Tip";
import { pileName } from "../../lib/tooltip-words/marks";
import { returnFocus, takeInitialFocus } from "../../lib/window-focus";
import { useMarksStore } from "../../store/marks";
import { useNotesStore } from "../../store/notes";
import { usePivotStore } from "../../store/pivot";

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
  return { getCanvasContainer: () => container, on: vi.fn(), off: vi.fn() } as unknown as maplibregl.Map;
}

const lookup = lookupFromContext(CONTEXT);
const PILE_KEY = "pile:stop:rec-1";
const PILE_LINES = ["Your marks on 3 records.", "Time: A to B", "You marked PASS: 1", "Press to show each one."];
const REC1 = { kind: "stop", id: "rec-1" };
type Member = GlobePileProps["members"][number];
const MEMBERS: Member[] = [
  { key: "stop:rec-1", record: REC1, name: "Open your mark: stop: One", lines: ["Your mark on stop: One.", "Pinned."], notes: 1, disposition: "pass", pinned: true, dim: false, open: false },
  { key: "stop:rec-2", record: { kind: "stop", id: "rec-2" }, name: "Open your mark: stop: Two", lines: ["Your mark on stop: Two."], notes: 2, disposition: "wait", pinned: false, dim: true, open: false },
  { key: "stop:rec-3", record: { kind: "stop", id: "rec-3" }, name: "Open your mark: stop: Three", lines: ["Your mark on stop: Three.", "Notes: 3"], notes: 3, disposition: "none", pinned: false, dim: false, open: false },
];
const pm = (m: Member): PileMember => ({ key: m.key, time: 1, pinned: m.pinned, disposition: m.disposition, dim: m.dim, open: m.open });

function props(over: Partial<GlobePileProps> = {}): GlobePileProps {
  const members = over.members ?? MEMBERS;
  return {
    map: fakeMap(),
    pileKey: PILE_KEY,
    lngLat: { lng: -95.37, lat: 29.76 },
    corner: 12,
    lens: false,
    face: pileFace(members.map(pm)),
    name: pileName(members.length, false),
    lines: PILE_LINES,
    members,
    unfolded: false,
    onToggle: () => {},
    onFold: () => {},
    lookup,
    ...over,
  };
}

const marker = () => live.markers[0];
const pileButton = () => marker().el.querySelector("[data-mark-pile]") as HTMLElement;
const memberButtons = () => Array.from(marker().el.querySelectorAll("button[data-mark]")) as HTMLElement[];
const parts = (b: HTMLElement) => Array.from(b.querySelectorAll("[data-part]")).map((p) => p.getAttribute("data-part"));
/** A `bottom` as written: the DOM may keep a calc() in `style.bottom` or only in the style attribute. */
const bottomOf = (b: HTMLElement): string => b.style.bottom || /bottom:\s*([^;]+);/.exec(b.getAttribute("style") ?? "")?.[1].trim() || "";

beforeEach(() => {
  live.markers = [];
  usePivotStore.setState({ windows: [], nextZ: 20 });
  // The story the page holds: a window opens only with one.
  useMarksStore.setState({ scenario: SCENARIO, nodes: [], paths: [] });
});

describe("GlobePile, the marker and the button", () => {
  it("a click on the pile reaches its handler and not a listener on the wrapper's parent", () => {
    const onToggle = vi.fn();
    let reactParent = 0;
    let nativeParent = 0;
    const onNative = () => (nativeParent += 1);
    document.body.addEventListener("click", onNative);
    render(
      <div onClick={() => (reactParent += 1)}>
        <GlobePile {...props({ onToggle })} />
      </div>,
    );
    fireEvent.click(pileButton());
    document.body.removeEventListener("click", onNative);
    expect(onToggle).toHaveBeenCalledTimes(1);
    expect(onToggle).toHaveBeenCalledWith(PILE_KEY);
    expect(reactParent).toBe(0);
    expect(nativeParent).toBe(0);
  });

  it("the marker element is a div, not a button, carries verdict-marker, and sits bottom right at [-corner, -corner]", () => {
    render(<GlobePile {...props({ corner: 12.02 })} />);
    expect(live.markers).toHaveLength(1);
    const m = marker();
    expect(m.el.tagName).toBe("DIV");
    expect(m.el.className.split(/\s+/)).toContain("verdict-marker");
    expect(m.el.getAttribute("data-mark-pile-group")).toBe(PILE_KEY);
    expect(m.opts.anchor).toBe("bottom-right");
    expect(m.opts.offset).toEqual([-12.02, -12.02]);
    expect(m.opts.opacityWhenCovered).toBe(0);
    expect(m.lngLat).toEqual([-95.37, 29.76]);
  });

  it("stops the pointer events the map listens for, so a press on the pile never pans the map", () => {
    render(<GlobePile {...props()} />);
    let reached = 0;
    const onDown = () => (reached += 1);
    document.body.addEventListener("mousedown", onDown);
    fireEvent.mouseDown(pileButton());
    document.body.removeEventListener("mousedown", onDown);
    expect(reached).toBe(0);
  });

  it("the pile button is named by pileName with aria-expanded, carries tip(lines), and holds the face with no lens", () => {
    render(<GlobePile {...props()} />);
    const b = pileButton();
    expect(b.tagName).toBe("BUTTON");
    expect(b.getAttribute("aria-label")).toBe("Your marks on 3 records. Show each one.");
    expect(b.getAttribute("aria-expanded")).toBe("false");
    for (const [k, v] of Object.entries(tip(PILE_LINES))) expect(b.getAttribute(k), k).toBe(v);
    expect(parts(b)).toEqual(["pile", "disposition", "disposition", "pin"]);
    expect(memberButtons()).toHaveLength(0);
  });

  it("a pile led by the lens when its anchor draws no ring", () => {
    render(<GlobePile {...props({ lens: true, corner: 7 })} />);
    expect(parts(pileButton())).toEqual(["lens", "pile", "disposition", "disposition", "pin"]);
    expect(marker().opts.offset).toEqual([-7, -7]);
  });

  it("carries data-open only while a member's window is open, and aria-expanded follows unfolded", () => {
    const open = MEMBERS.map((m, i) => ({ ...m, open: i === 1 }));
    const { rerender } = render(<GlobePile {...props()} />);
    expect(pileButton().hasAttribute("data-open")).toBe(false);
    rerender(<GlobePile {...props({ members: open, unfolded: true })} />);
    expect(pileButton().hasAttribute("data-open")).toBe(true);
    expect(pileButton().getAttribute("aria-expanded")).toBe("true");
  });
});

describe("GlobePile, unfolded", () => {
  it("member buttons follow the pile in the DOM, each placed out of flow at bottom calc(100% + 2px), 17px, 32px, led by the lens, named, with its own tip", () => {
    render(<GlobePile {...props({ unfolded: true })} />);
    const buttons = memberButtons();
    expect(buttons.map((b) => b.getAttribute("aria-label"))).toEqual(MEMBERS.map((m) => m.name));
    expect(buttons.map(bottomOf)).toEqual(["calc(100% + 2px)", "calc(100% + 17px)", "calc(100% + 32px)"]);
    buttons.forEach((b, i) => {
      expect(b.style.position).toBe("absolute");
      expect(b.style.left).toMatch(/^0(px)?$/);
      expect(b.getAttribute("data-mark")).toBe(MEMBERS[i].key);
      expect(parts(b)[0]).toBe("lens");
      for (const [k, v] of Object.entries(tip(MEMBERS[i].lines))) expect(b.getAttribute(k), k).toBe(v);
    });
    const all = Array.from(marker().el.querySelectorAll("button"));
    expect(all[0]).toBe(pileButton());
    expect(all.slice(1)).toEqual(buttons);
  });

  it("the marker's own size does not change when the column opens (the members are out of flow)", () => {
    render(<GlobePile {...props({ unfolded: true })} />);
    for (const b of memberButtons()) expect(b.style.position).toBe("absolute");
    expect(Array.from(marker().el.children).filter((c) => (c as HTMLElement).style.position !== "absolute")).toHaveLength(1);
  });

  it("a dim member draws its own dim plate and an open member alone is data-open", () => {
    const members = MEMBERS.map((m, i) => ({ ...m, open: i === 2 }));
    render(<GlobePile {...props({ members, unfolded: true })} />);
    const [one, two, three] = memberButtons();
    // No opacity written means full ink.
    const dimmed = (b: HTMLElement) => Number((b.querySelector('[data-part="count"]') as HTMLElement).style.opacity || "1");
    expect(dimmed(two)).toBeLessThan(1);
    expect(dimmed(one)).not.toBeLessThan(1);
    const openOf = (b: HTMLElement) => b.querySelector("[data-mark-plate]")?.getAttribute("data-open");
    expect([openOf(one), openOf(two), openOf(three)]).toEqual(["false", "false", "true"]);
    expect(three.hasAttribute("data-open")).toBe(true);
    expect(one.hasAttribute("data-open")).toBe(false);
  });
});

describe("GlobePile, presses and focus", () => {
  it("a member press opens that record's window with no spot (tethered), folds, leaves focus on the pile and records the pile as the opener", () => {
    const onFold = vi.fn();
    render(<GlobePile {...props({ unfolded: true, onFold })} />);
    const button = memberButtons()[0];
    button.focus();
    expect(document.activeElement).toBe(button);
    fireEvent.click(button);
    const w = usePivotStore.getState().windows;
    expect(w).toHaveLength(1);
    expect(w[0].kind === "record" && w[0].record).toEqual(REC1);
    expect(w[0].kind === "record" && w[0].anchor.type).toBe("node");
    expect(onFold).toHaveBeenCalledTimes(1);
    expect(onFold).toHaveBeenCalledWith(PILE_KEY);
    expect(document.activeElement).toBe(pileButton());
    // The pile is the window's opener: closing the window returns focus to it.
    (document.querySelector("body") as HTMLElement).focus();
    pileButton().blur();
    returnFocus(w[0].id);
    expect(document.activeElement).toBe(pileButton());
  });

  it("a press on a member already open files no opener", () => {
    const members = MEMBERS.map((m, i) => ({ ...m, open: i === 0 }));
    usePivotStore.getState().openRecord(REC1, { lngLat: { lng: -95.37, lat: 29.76 }, pinned: false });
    const id = usePivotStore.getState().windows[0].id;
    expect(takeInitialFocus(id)).toBe(false);
    render(<GlobePile {...props({ members, unfolded: true })} />);
    fireEvent.click(memberButtons()[0]);
    // No focus request was filed for the window that was only raised.
    expect(takeInitialFocus(id)).toBe(false);
    returnFocus(id);
  });

  it("a press on a member when no story is held opens no window, still folds, and files no opener", () => {
    useMarksStore.setState({ scenario: null });
    useNotesStore.setState({ scenario: null });
    const onFold = vi.fn();
    render(<GlobePile {...props({ unfolded: true, onFold })} />);
    fireEvent.click(memberButtons()[1]);
    expect(usePivotStore.getState().windows).toHaveLength(0);
    expect(onFold).toHaveBeenCalledTimes(1);
  });

  it("a member press is no press on anything under it", () => {
    let reached = 0;
    render(
      <div onClick={() => (reached += 1)}>
        <GlobePile {...props({ unfolded: true })} />
      </div>,
    );
    fireEvent.click(memberButtons()[0]);
    expect(reached).toBe(0);
    returnFocus(usePivotStore.getState().windows[0].id);
  });

  it("Escape on a member folds the pile and focuses the pile button, and the key still reaches a parent listener", () => {
    const onFold = vi.fn();
    render(<GlobePile {...props({ unfolded: true, onFold })} />);
    let heard = 0;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") heard += 1;
    };
    document.body.addEventListener("keydown", onKey);
    const member = memberButtons()[1];
    member.focus();
    fireEvent.keyDown(member, { key: "Escape" });
    document.body.removeEventListener("keydown", onKey);
    expect(onFold).toHaveBeenCalledTimes(1);
    expect(onFold).toHaveBeenCalledWith(PILE_KEY);
    expect(document.activeElement).toBe(pileButton());
    expect(heard).toBe(1);
  });

  it("Escape on the pile folds it; another key does nothing; Escape on a folded pile does nothing", () => {
    const onFold = vi.fn();
    const { rerender } = render(<GlobePile {...props({ unfolded: true, onFold })} />);
    fireEvent.keyDown(pileButton(), { key: "Enter" });
    expect(onFold).not.toHaveBeenCalled();
    fireEvent.keyDown(pileButton(), { key: "Escape" });
    expect(onFold).toHaveBeenCalledTimes(1);
    rerender(<GlobePile {...props({ unfolded: false, onFold })} />);
    fireEvent.keyDown(pileButton(), { key: "Escape" });
    expect(onFold).toHaveBeenCalledTimes(1);
  });
});

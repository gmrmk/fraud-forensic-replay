import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { act, fireEvent, render } from "@testing-library/react";
import { Timeline } from "./Timeline";
import { usePlayhead } from "../store/playhead";
import { useSessionFilter } from "../store/session-filter";
import { useSchema } from "../store/schema";
import { useLayers } from "../store/layers";
import { useSolo } from "../store/solo";
import { useTrackBy } from "../store/track-by";
import { when } from "../lib/time-words";
import { kindOnPanelVar } from "../lib/entity-palette";
import { contrastRatio } from "../theme/legibility";
import { resolvePalette } from "../theme/resolve";
import { COLOR_MODES, THEMES } from "../theme/axes";
import type { LoginEvent, Transaction, Transfer } from "../types";

// Timeline's event dots, lane gradients, and kind tooltip used to paint from a
// static KIND_RGB comma-triplet map frozen at the NEON palette - so they stayed
// neon in every CVD/color mode while the rest of the app recolored. They now
// emit mode-aware CSS vars (`rgb(var(--x-rgb) / α)` raw, `var(--x-on-panel)`
// legible, a hex colour read directly). This suite pins the wiring: an event dot's inline background must
// route through a CSS var and carry NO frozen comma-triplet literal. The
// resolved per-mode pixel is an eyes concern; this guards the regression class.

// Two auths and one fraud across a ~2h Houston window so dots + lanes render.
const T0 = "2026-05-26T08:00:00-05:00";
const T1 = "2026-05-26T09:00:00-05:00";
const T2 = "2026-05-26T10:00:00-05:00";
const MS0 = Date.parse(T0);
const MS2 = Date.parse(T2);

function tx(
  id: string,
  timestamp: string,
  isFraud: number,
): Transaction {
  // The Timeline only consumes the adapter-read subset (id, is_fraud,
  // timestamp, coords, amount, merchant_name, mcc, merchant_country); the
  // rest of the Transaction shape is irrelevant to the render path under test.
  return {
    id,
    timestamp,
    is_fraud: isFraud,
    amount: 12.5,
    merchant_name: "Test Merchant",
    mcc: "5999",
    merchant_country: "US",
    merchant_lat: 29.76,
    merchant_lng: -95.37,
  } as unknown as Transaction;
}

const TXNS = [tx("a1", T0, 0), tx("a2", T1, 0), tx("f1", T2, 1)];

// Any comma-triplet rgb()/rgba() literal - the frozen-palette tell. Matches
// rgb(0,229,255), rgba(255,61,46,0.9), etc. (digits, comma, digits).
//
// happy-dom note: its CSS parser DROPS any value containing var() (it reflects
// `style.background` as "") but KEEPS a plain comma-rgb literal. So a mode-blind
// frozen triplet survives into `style.background` (and fails this guard) while a
// mode-aware `rgb(var(--x) / α)` reflects empty (and passes). The assertion is
// therefore the regression DIRECTION: the rendered dot must carry NO frozen
// comma triplet. The resolved per-mode pixel is an eyes concern. The source-text
// guard below additionally pins that the var syntax actually shipped.
const COMMA_TRIPLET = /rgba?\(\s*\d+\s*,\s*\d+\s*,\s*\d+/;

describe("Timeline - mode-aware kind colors", () => {
  beforeEach(() => {
    usePlayhead.setState({
      playhead: MS0,
      minTime: MS0,
      maxTime: MS2,
      // The track renders against the visible window; the App seeds it = bounds
      // via setBounds at load, so the test must too or the window is zero-span.
      windowMin: MS0,
      windowMax: MS2,
      isPlaying: false,
    });
    useSessionFilter.setState({ selectedSessionId: null });
  });
  afterEach(() => {
    useSchema.setState({ rows: undefined, fields: undefined, lanes: undefined });
  });

  it("shows the auths-today readout for a card case and omits it for a pack without authorizations", () => {
    expect(render(<Timeline transactions={TXNS} />).container.textContent).toMatch(/auths? today/);
    const { container } = render(<Timeline transactions={[]} />);
    expect(container.textContent).not.toMatch(/auths? today/);
    expect(container.textContent).not.toContain("$0.00");
  });

  it("renders an event dot per transaction", () => {
    const { container } = render(<Timeline transactions={TXNS} />);
    // Event dots are buttons with aria-label "Jump to ...". A row's copy of a dot is aria-hidden and
    // is not counted: the track keeps exactly one button for each event.
    const dots = [...container.querySelectorAll('button[aria-label^="Jump to"]')].filter((b) => b.getAttribute("aria-hidden") !== "true");
    expect(dots.length).toBe(TXNS.length);
  });

  it("keeps one focusable button on the track for each transaction, and a row's copy of it out of the Tab order", () => {
    useSchema.setState({ rows: { by: "merchant_name" }, fields: { merchant_name: { label: "Merchant" } } });
    const { container } = render(<Timeline transactions={TXNS} />);
    const track = container.querySelector('[role="slider"]') as HTMLElement;
    // The track's own buttons: every button that is not aria-hidden, wherever it stands.
    const buttons = [...container.querySelectorAll<HTMLElement>("button")].filter(
      (b) => b.getAttribute("aria-hidden") !== "true" && (b.getAttribute("aria-label") ?? "").startsWith("Jump to"),
    );
    expect(buttons).toHaveLength(TXNS.length);
    for (const b of buttons) expect(track.contains(b)).toBe(true);
    // The row's copies are drawn too, and each is out of the Tab order and out of the reader's list.
    const copies = [...container.querySelectorAll<HTMLElement>("[data-row-dot]")];
    expect(copies).toHaveLength(TXNS.length);
    for (const c of copies) {
      expect(c.getAttribute("tabindex")).toBe("-1");
      expect(c.getAttribute("aria-hidden")).toBe("true");
      expect(track.contains(c)).toBe(false);
    }
  });

  it("an event dot's visible mark carries no frozen comma-triplet literal", () => {
    const { container } = render(<Timeline transactions={TXNS} />);
    const dot = container.querySelector(
      'button[aria-label^="Jump to"] span.rounded-full',
    ) as HTMLElement;
    expect(dot).not.toBeNull();
    // Mode-blind frozen triplets (rgb(0,229,255)) survive happy-dom and fail
    // here; the mode-aware rgb(var(--…)) form reflects empty and passes.
    expect(dot.style.background).not.toMatch(COMMA_TRIPLET);
    expect(dot.style.boxShadow).not.toMatch(COMMA_TRIPLET);
  });
});

describe("Timeline - TML-04: aria slider uses zoom-window bounds, not global bounds", () => {
  it("aria-valuemin/aria-valuemax track the visible window, not the full data span", () => {
    // TML-04: screen readers announced the wrong progress when the track was
    // zoomed in - the aria attrs used minTime/maxTime (global) while keyboard
    // scrubbing moves within windowMin/windowMax (zoom). They must match the
    // window so SR announces "42% of visible range", not "3% of all time".
    const windowMin = MS0 + 1000;
    const windowMax = MS2 - 1000;
    usePlayhead.setState({
      playhead: MS0 + 2000,
      minTime: MS0,
      maxTime: MS2,
      windowMin,
      windowMax,
      isPlaying: false,
    });
    useSessionFilter.setState({ selectedSessionId: null });
    const { container } = render(<Timeline transactions={TXNS} />);
    const track = container.querySelector('[role="slider"]') as HTMLElement;
    expect(track).not.toBeNull();
    expect(Number(track.getAttribute("aria-valuemin"))).toBe(windowMin);
    expect(Number(track.getAttribute("aria-valuemax"))).toBe(windowMax);
  });
});

describe("Timeline - TML-19: off-window playhead edge indicators", () => {
  function setup(playhead: number, windowMin: number, windowMax: number) {
    usePlayhead.setState({
      playhead,
      minTime: MS0,
      maxTime: MS2,
      windowMin,
      windowMax,
      isPlaying: false,
    });
    useSessionFilter.setState({ selectedSessionId: null });
  }

  it("shows left chevron when playhead is before windowMin", () => {
    // Playhead is behind the visible window - the narrow zoom window causes
    // the track to look frozen while the playhead is advancing off-left.
    setup(MS0, MS0 + 5000, MS2);
    const { container } = render(<Timeline transactions={TXNS} />);
    // The chevron uses the single-guillemet ‹ character
    const spans = container.querySelectorAll('[aria-hidden="true"]');
    const leftChevron = Array.from(spans).find(
      (el) => el.textContent?.trim() === "‹",
    );
    expect(leftChevron).not.toBeNull();
  });

  it("shows right chevron when playhead is after windowMax", () => {
    // Playhead has advanced beyond the visible window right edge.
    setup(MS2, MS0, MS2 - 5000);
    const { container } = render(<Timeline transactions={TXNS} />);
    const spans = container.querySelectorAll('[aria-hidden="true"]');
    const rightChevron = Array.from(spans).find(
      (el) => el.textContent?.trim() === "›",
    );
    expect(rightChevron).not.toBeNull();
  });

  it("shows no off-window chevron when playhead is inside the window", () => {
    setup(MS0 + 5000, MS0, MS2);
    const { container } = render(<Timeline transactions={TXNS} />);
    const spans = container.querySelectorAll('[aria-hidden="true"]');
    const leftChevron = Array.from(spans).find((el) => el.textContent?.trim() === "‹");
    const rightChevron = Array.from(spans).find((el) => el.textContent?.trim() === "›");
    // .find() returns undefined when not found
    expect(leftChevron).toBeUndefined();
    expect(rightChevron).toBeUndefined();
  });
});

// Source-text guard: happy-dom drops var() from reflected styles, so the
// rendered-DOM test above can only prove the ABSENCE of a frozen triplet. This
// pins the PRESENCE of the mode-aware var syntax in the source, and that no
// `rgb(${...})`/`rgba(${...})` template-literal triplet interpolation (the old
// KIND_RGB call form) survives. Mirrors TickerBar.test.tsx reading index.css.
describe("CaseTimelineLayer source - no frozen comma-triplet color interpolation", () => {
  // Phase-1 timeline split moved the event-dot / lane color emission out of Timeline.tsx
  // (now a thin TimelineShell composer) into CaseTimelineLayer.tsx - the regression class lives here.
  const src = readFileSync(
    resolve(dirname(fileURLToPath(import.meta.url)), "./timeline/CaseTimelineLayer.tsx"),
    "utf8",
  );

  it("does not import the retired static KIND_RGB map", () => {
    expect(src).not.toMatch(/\bKIND_RGB\b/);
  });

  it("emits mode-aware rgb(var(--…)) kind colors", () => {
    expect(src).toMatch(/rgb\(var\(/);
  });

  it("has no rgb(`${…}`) / rgba(`${…}`) comma-triplet template interpolation", () => {
    // The old form was `rgb(${rgb})` / `rgba(${KIND_RGB[k]},${a})`. A triplet
    // var/expr dropped straight into rgb(...) without `var(` is the tell.
    expect(src).not.toMatch(/rgba?\(\$\{/);
  });
});

// B4: the six kinds the app has code for, as nodes. A node's accessible name holds its kind, its
// headline and its time and stands without the tooltip system (no TipLayer is mounted here); a ring
// word ("new device", "blocked", "challenge") is not in the name, and the field lines that explain
// a ring are in the tooltip's lines instead.
describe("Timeline track nodes of the coded kinds", () => {
  const at = (hhmm: string) => `2026-05-26T${hhmm}:00-05:00`;
  const login = (id: string, hhmm: string, outcome: string, trust: string): LoginEvent =>
    ({
      id, timestamp: at(hhmm), device_fp: `fp-${id}`, outcome, device_trust: trust, ip_type: "residential",
      ip_lat: 29.7, ip_lng: -95.3, session_id: `s-${id}`,
    }) as unknown as LoginEvent;
  const LOGINS = [
    login("n1", "08:10", "success", "new"),
    login("c1", "08:20", "challenge_passed", "known"),
    login("c2", "08:30", "challenge_failed", "known"),
  ];
  const TRANSFERS = [
    {
      id: "w1", timestamp: at("08:40"), amount: 5000, rail: "wire", status: "blocked", decline_reason: "limit",
      session_id: "s-w1", is_fraud: 1,
    } as unknown as Transfer,
  ];
  const LABELS: Record<string, string> = { auth: "Authorization", fraud: "Fraud", login: "Sign-in", transfer: "Transfer" };
  const RING_WORDS = /new device|blocked|challenge|[()]/i;

  beforeEach(() => {
    usePlayhead.setState({ playhead: MS0, minTime: MS0, maxTime: MS2, windowMin: MS0, windowMax: MS2, isPlaying: false });
    useSessionFilter.setState({ selectedSessionId: null });
    useSchema.setState({
      nodes: Object.entries(LABELS).map(([kind, label]) => ({
        kind, label, palette: "#ffffff", source: "sql", coords: null, timestamp: "timestamp", primary: "${id}",
      })),
    });
  });

  const nodes = (container: HTMLElement) =>
    [...container.querySelectorAll('button[aria-label^="Jump to"]')] as HTMLElement[];
  const renderAll = () => render(<Timeline transactions={TXNS} logins={LOGINS} transfers={TRANSFERS} />);

  it("names each node by its kind's label, its headline and its time, with no ring word and no parenthesis", () => {
    const { container } = renderAll();
    const found = nodes(container);
    expect(found).toHaveLength(TXNS.length + LOGINS.length + TRANSFERS.length);
    // The three authorizations share a headline, so a node is found by its time as well.
    const byHeadline = (head: string, ms: number) =>
      found.find((n) => (n.getAttribute("aria-label") ?? "").includes(head) && (n.getAttribute("aria-label") ?? "").includes(when(ms)))!;
    const cases: [string, string, number][] = [
      ["fp-n1", "Sign-in", Date.parse(LOGINS[0].timestamp)],
      ["fp-c1", "Sign-in", Date.parse(LOGINS[1].timestamp)],
      ["fp-c2", "Sign-in", Date.parse(LOGINS[2].timestamp)],
      ["$5000.00 · wire", "Transfer", Date.parse(TRANSFERS[0].timestamp)],
      ["$12.50 · Test Merchant", "Fraud", Date.parse(T2)],
      ["$12.50 · Test Merchant", "Authorization", Date.parse(T0)],
    ];
    for (const [head, kindLabel, ms] of cases) {
      const name = byHeadline(head, ms).getAttribute("aria-label") ?? "";
      expect(name.startsWith("Jump to")).toBe(true);
      expect(name).toContain(kindLabel);
      expect(name).toContain(head);
      expect(name).toContain(when(ms));
      expect(name).not.toMatch(RING_WORDS);
    }
    for (const n of found) expect(n.getAttribute("aria-label") ?? "").not.toMatch(RING_WORDS);
  });

  it("carries the field lines that explain a ring in its tooltip's lines, not in its name", () => {
    const { container } = renderAll();
    const tipOf = (head: string) =>
      nodes(container).find((n) => (n.getAttribute("aria-label") ?? "").includes(head))!.getAttribute("data-tip") ?? "";
    expect(tipOf("fp-n1").split("\n")).toEqual([
      "Sign-in", "fp-n1", "success · residential", when(Date.parse(LOGINS[0].timestamp)), "Device trust: new",
    ]);
    expect(tipOf("fp-c1")).toContain("Outcome: challenge passed");
    expect(tipOf("fp-c2")).toContain("Outcome: challenge failed");
    expect(tipOf("$5000.00 · wire")).toContain("Status: blocked");
    // A plain authorization has no ring, so its lines end at its time.
    expect(tipOf("$12.50 · Test Merchant").split("\n")).toHaveLength(4);
  });

  it("each node's colour is its kind's on-panel colour, which is 3:1 or more on the panel in every theme and mode", () => {
    const { container } = renderAll();
    const kinds = new Set<string>();
    for (const n of nodes(container)) {
      const accent = n.getAttribute("data-tip-accent") ?? "";
      // The on-panel variables are hex colours, so the accent reads the variable directly:
      // rgb(var(--x-on-panel)) is invalid CSS and a browser drops it.
      const m = /^var\((--[a-z0-9-]+-on-panel)\)$/.exec(accent);
      expect(m, `accent "${accent}"`).not.toBeNull();
      kinds.add(m![1]);
    }
    // Each coded kind of the fixture draws with the on-panel var its kind maps to.
    for (const kind of ["auth", "fraud", "login", "transfer"]) expect(kinds).toContain(kindOnPanelVar(kind));
    for (const theme of THEMES) {
      for (const color of COLOR_MODES) {
        const p = resolvePalette(theme, color);
        const surface = p.material.panelBase.split(/\s+/).map((v) => Number(v) / 255) as [number, number, number];
        for (const v of kinds) {
          const slot = v.replace(/^--/, "").replace(/-on-panel$/, "");
          const hex = (p.onPanel as unknown as Record<string, string>)[slot === "text-faint" ? "textFaint" : slot];
          const rgb = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255) as [number, number, number];
          expect(contrastRatio(rgb, surface), `${theme} ${color} ${v}`).toBeGreaterThanOrEqual(3);
        }
      }
    }
  });
});

// INT-1: the bar draws the size the layers store holds. One line is the fold; the middle size is the
// open bar with its rows folded and its lanes open; the open size has the rows open too.
describe("Timeline - the bar's three sizes", () => {
  const fold = (c: HTMLElement) => c.querySelector("[data-bar-fold]") as HTMLElement;
  const list = (c: HTMLElement) => c.querySelector('[role="tree"]')?.parentElement as HTMLElement | null | undefined;
  const rowsButton = (c: HTMLElement) => c.querySelector("[data-track-header] button") as HTMLElement;

  beforeEach(() => {
    localStorage.clear();
    usePlayhead.setState({ playhead: MS0, minTime: MS0, maxTime: MS2, windowMin: MS0, windowMax: MS2, isPlaying: false });
    useSessionFilter.setState({ selectedSessionId: null });
    useSchema.setState({ rows: { by: "merchant_name" }, fields: { merchant_name: { label: "Merchant" } }, lanes: undefined });
    useSolo.setState({ solo: null });
    useTrackBy.setState({ by: null });
    useLayers.setState({ barSize: "middle" });
  });
  afterEach(() => {
    useSchema.setState({ rows: undefined, fields: undefined, lanes: undefined });
    useLayers.setState({ barSize: "middle" });
    useSolo.setState({ solo: null });
    localStorage.clear();
  });

  it("the middle size draws the open bar with the rows' list folded", () => {
    const { container } = render(<Timeline transactions={TXNS} />);
    expect(container.querySelector("[data-timeline-gestures]")).not.toBeNull();
    expect(fold(container).getAttribute("aria-expanded")).toBe("true");
    expect(list(container)?.hidden).toBe(true);
    expect(rowsButton(container).getAttribute("aria-expanded")).toBe("false");
  });

  it("the open size draws the rows' list", () => {
    useLayers.setState({ barSize: "open" });
    const { container } = render(<Timeline transactions={TXNS} />);
    expect(list(container)?.hidden).toBe(false);
    expect(rowsButton(container).getAttribute("aria-expanded")).toBe("true");
    expect(container.querySelectorAll("[data-track-row]")).toHaveLength(1);
  });

  it("the line size draws one line: the fold, the clock, the strip as the slider and no body", () => {
    useLayers.setState({ barSize: "line" });
    const { container } = render(<Timeline transactions={TXNS} />);
    expect(fold(container).getAttribute("aria-expanded")).toBe("false");
    expect(container.querySelector("[data-timeline-gestures]")).toBeNull();
    expect(container.querySelector('[role="tree"]')).toBeNull();
    expect(container.querySelector("[data-head-clock]")).not.toBeNull();
    const slider = container.querySelector('[role="slider"]') as HTMLElement;
    expect(slider.querySelector("[data-case-strip]")).not.toBeNull();
  });

  it("draws the size useLayers holds when it changes, and openBar() opens the bar without saving a size", () => {
    const { container } = render(<Timeline transactions={TXNS} />);
    expect(list(container)?.hidden).toBe(true);
    act(() => useLayers.getState().openBar());
    expect(list(container)?.hidden).toBe(false);
    expect(localStorage.getItem("ffr.barsize")).toBeNull();
    act(() => useLayers.getState().setBarSize("line"));
    expect(container.querySelector("[data-timeline-gestures]")).toBeNull();
  });

  it("a pack that declares no rows draws today's bar at every size", () => {
    useSchema.setState({ rows: undefined, fields: undefined });
    for (const size of ["middle", "open"] as const) {
      useLayers.setState({ barSize: size });
      const { container, unmount } = render(<Timeline transactions={TXNS} />);
      expect(container.querySelector('[role="tree"]')).toBeNull();
      expect(container.querySelector("[data-track-rows]")).toBeNull();
      expect(container.querySelectorAll('button[aria-label^="Jump to"]')).toHaveLength(TXNS.length);
      unmount();
    }
  });

  it("the rows' button moves the bar between the middle and the open size, and saves the size", () => {
    const { container } = render(<Timeline transactions={TXNS} />);
    fireEvent.click(rowsButton(container));
    expect(useLayers.getState().barSize).toBe("open");
    expect(localStorage.getItem("ffr.barsize")).toBe("open");
    fireEvent.click(rowsButton(container));
    expect(useLayers.getState().barSize).toBe("middle");
  });

  // INT-5b: on a pack with sections the fold is two steps (a line for each section, then one line),
  // and a third press opens the size the bar had. The store holds "line" for both folded states, so
  // the stack is read from the page (`data-bar-stack`) and the one line from its strip.
  it("the Timeline's button folds to a line for each section, then to one line, then opens to the size the bar had, and keeps the focus", () => {
    useLayers.setState({ barSize: "open" });
    const { container } = render(<Timeline transactions={TXNS} />);
    const button = fold(container);
    button.focus();
    expect(container.querySelector("[data-bar-stack]")).toBeNull();
    fireEvent.click(button);
    expect(useLayers.getState().barSize).toBe("line");
    expect(container.querySelector("[data-bar-stack]")).not.toBeNull();
    expect(document.activeElement).toBe(fold(container));
    expect(fold(container)).toBe(button);
    fireEvent.click(fold(container));
    expect(useLayers.getState().barSize).toBe("line");
    expect(container.querySelector("[data-bar-stack]")).toBeNull();
    expect(container.querySelector("[data-case-strip]")).not.toBeNull();
    expect(document.activeElement).toBe(fold(container));
    fireEvent.click(fold(container));
    expect(useLayers.getState().barSize).toBe("open");
    expect(container.querySelector("[data-bar-stack]")).toBeNull();
    expect(container.querySelector("[data-case-strip]")).toBeNull();
    expect(document.activeElement).toBe(fold(container));
  });

  it("a pack with no section folds straight to one line, and a second press opens the size the bar had", () => {
    useSchema.setState({ rows: undefined, fields: undefined, lanes: undefined });
    useLayers.setState({ barSize: "open" });
    const { container } = render(<Timeline transactions={TXNS} />);
    expect(container.querySelector("[data-track-rows]")).toBeNull();
    expect(container.querySelector("[data-magnitude-lane]")).toBeNull();
    const button = fold(container);
    button.focus();
    fireEvent.click(button);
    expect(useLayers.getState().barSize).toBe("line");
    expect(container.querySelector("[data-bar-stack]")).toBeNull();
    expect(container.querySelector("[data-case-strip]")).not.toBeNull();
    fireEvent.click(fold(container));
    expect(useLayers.getState().barSize).toBe("open");
    expect(container.querySelector("[data-case-strip]")).toBeNull();
    expect(document.activeElement).toBe(fold(container));
  });

  it("a row alone narrows the track to its events and a second press brings the others back", () => {
    useLayers.setState({ barSize: "open" });
    const two = [tx("a1", T0, 0), { ...tx("a2", T1, 0), merchant_name: "Other Merchant" } as Transaction, { ...tx("a3", T2, 0), merchant_name: "Other Merchant" } as Transaction];
    const { container } = render(<Timeline transactions={two} />);
    const track = container.querySelector('[role="slider"]') as HTMLElement;
    const buttons = () => [...track.querySelectorAll('button[aria-label^="Jump to"]')];
    expect(buttons()).toHaveLength(3);
    const names = [...container.querySelectorAll<HTMLElement>("[data-track-name]")];
    expect(names).toHaveLength(2);
    const other = names.find((n) => n.getAttribute("aria-label") === "Other Merchant") as HTMLElement;
    fireEvent.click(other);
    expect(buttons()).toHaveLength(2);
    expect(other.getAttribute("aria-selected")).toBe("true");
    expect(container.querySelectorAll("[data-track-name]")).toHaveLength(1);
    fireEvent.click(container.querySelector("[data-track-name]") as HTMLElement);
    expect(buttons()).toHaveLength(3);
  });

  it("one line with a row alone carries the row's name and a control that clears the solo", () => {
    useLayers.setState({ barSize: "open" });
    const { container } = render(<Timeline transactions={TXNS} />);
    fireEvent.click(container.querySelector("[data-track-name]") as HTMLElement);
    expect(useSolo.getState().solo).toEqual({ field: "merchant_name", value: "Test Merchant" });
    fireEvent.click(fold(container));
    const clear = container.querySelector("[data-solo-clear]") as HTMLElement;
    expect(clear.textContent).toContain("Test Merchant");
    fireEvent.click(clear);
    expect(useSolo.getState().solo).toBeNull();
    expect(container.querySelector("[data-solo-clear]")).toBeNull();
  });
});

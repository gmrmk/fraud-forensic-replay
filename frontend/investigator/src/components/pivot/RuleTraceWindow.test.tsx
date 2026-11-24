import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, waitFor, fireEvent, cleanup } from "@testing-library/react";
import { RuleTraceWindow } from "./RuleTraceWindow";
import { usePivotStore } from "../../store/pivot";
import { useNavigation } from "../../store/navigation";
import { TRACE_WINDOW_DIMS } from "../../lib/window-dims";
import { useMatches } from "../../store/matches";
import { useTerminalRows } from "../match/terminal-rows";
import type { Decision, DecisionInput } from "../../lib/decisions";
import type { PivotContext } from "../../lib/matches";
import type { Transaction } from "../../types";

function decision(overrides: Partial<Decision> = {}): Decision {
  return {
    id: "decision:account-takeover:l-1",
    rule: { id: "account-takeover", label: "account-takeover", kind: "login-anomaly" },
    subjectPathKind: "login",
    triggerEntityIds: ["l-1"],
    inputs: [],
    thresholds: [],
    verdict: "ACCOUNT TAKEOVER",
    decision: "STEP-UP",
    evidence: [],
    severity: 0.9,
    ...overrides,
  };
}

const emptyContext: PivotContext = { transactions: [], logins: [], places: [] };
const NBSP_ALL = new RegExp(String.fromCharCode(0xa0), "g");
const TRIANGLE = String.fromCharCode(0x25b8);

// Ship list entry 30 does not reach the rule trace window: its rows pass no field id, so none draws a
// library icon.
describe("RuleTraceWindow draws no library icon", () => {
  beforeEach(() => {
    usePivotStore.setState({ windows: [], nextZ: 20 });
  });

  it("a trace with thresholds, inputs and evidence holds rows and no svg.lucide", () => {
    const d = decision({
      thresholds: [{ label: "Velocity", actual: "950", bound: "900", breached: true }],
      inputs: [{ label: "Card", value: "c-1" }],
      evidence: [{ label: "Seen", value: "x" }],
    });
    usePivotStore.getState().openTrace(d.id, { x: 10, y: 10 });
    const w = usePivotStore.getState().windows[0];
    if (w.kind !== "trace") throw new Error("expected trace window");
    const { container } = render(<RuleTraceWindow window={w} decisions={[d]} context={emptyContext} />);
    expect(container.querySelectorAll("span.float-left").length).toBeGreaterThan(0);
    expect(container.querySelector("svg.lucide")).toBeNull();
  });
});

describe("RuleTraceWindow - threshold row operator (ERR-058)", () => {
  beforeEach(() => {
    usePivotStore.setState({ windows: [], nextZ: 20 });
  });

  it("renders a plain numeric bound with the breach-derived operator, once", () => {
    const d = decision({
      thresholds: [{ label: "Velocity", actual: "950", bound: "900", breached: true }],
    });
    usePivotStore.getState().openTrace(d.id, { x: 10, y: 10 });
    const w = usePivotStore.getState().windows[0];
    if (w.kind !== "trace") throw new Error("expected trace window");
    render(<RuleTraceWindow window={w} decisions={[d]} context={emptyContext} />);
    // Exactly one ">" glyph in the row, not a doubled/spurious operator.
    const row = screen.getByText("Velocity").closest("[data-trace-threshold]")!;
    expect(row.textContent).toMatch(/950\s*>\s*900/);
    expect((row.textContent!.match(/>/g) ?? []).length).toBe(1);
  });

  it("does not prepend a duplicate operator when the bound already carries one", () => {
    const d = decision({
      thresholds: [{ label: "Speed", actual: "950 mph", bound: ">= 900 mph", breached: true }],
    });
    usePivotStore.getState().openTrace(d.id, { x: 10, y: 10 });
    const w = usePivotStore.getState().windows[0];
    if (w.kind !== "trace") throw new Error("expected trace window");
    render(<RuleTraceWindow window={w} decisions={[d]} context={emptyContext} />);
    const row = screen.getByText("Speed").closest("[data-trace-threshold]")!;
    // The bound's own operator renders; no extra ">"/"≥" glyph is prepended
    // in front of it (was ">= >= 900 mph" before the fix).
    expect(row.textContent).not.toMatch(/[>≥]\s*>=/);
    // the space after a leading operator is a no-break space, so an operator never parts from its number
    expect(row.textContent!.replace(NBSP_ALL, " ")).toContain(">= 900 mph");
  });

  it("does not prepend an operator when the bound is non-numeric prose", () => {
    const d = decision({
      thresholds: [
        { label: "Device trust", actual: "new device", bound: "known device required", breached: true },
      ],
    });
    usePivotStore.getState().openTrace(d.id, { x: 10, y: 10 });
    const w = usePivotStore.getState().windows[0];
    if (w.kind !== "trace") throw new Error("expected trace window");
    render(<RuleTraceWindow window={w} decisions={[d]} context={emptyContext} />);
    const row = screen.getByText("Device trust").closest("[data-trace-threshold]")!;
    expect(row.textContent).not.toMatch(/[>≥]\s*known device required/);
    expect(row.textContent).toContain("known device required");
  });

  it("within-bounds numeric row still renders the ≥ operator", () => {
    const d = decision({
      thresholds: [{ label: "Velocity", actual: "500", bound: "900", breached: false }],
    });
    usePivotStore.getState().openTrace(d.id, { x: 10, y: 10 });
    const w = usePivotStore.getState().windows[0];
    if (w.kind !== "trace") throw new Error("expected trace window");
    render(<RuleTraceWindow window={w} decisions={[d]} context={emptyContext} />);
    const row = screen.getByText("Velocity").closest("[data-trace-threshold]")!;
    expect(row.textContent).toMatch(/500\s*≤\s*900|500\s*≥\s*900/);
  });
});

/** The rule trace window's layout: the outcome line,
 *  Thresholds, Inputs, Evidence, then the rule's standing text in a fold that is open when the window opens. */
describe("RuleTraceWindow - variant C layout", () => {
  const SOP = { what: "Flags one card used in two places.", why: "The detector reads signals only." };
  const full = (over: Partial<Decision> = {}) =>
    decision({
      rule: { id: "impossible-travel", label: "impossible-travel", kind: "geo", sop: SOP },
      decision: "DECLINE",
      verdict: "IMPOSSIBLE TRAVEL",
      thresholds: [
        { label: "Implied travel speed", actual: "674 mph", bound: "600 mph jet-cruise", breached: true },
        { label: "Card-present both ends", actual: "true", bound: "no air-gap possible", breached: false },
      ],
      inputs: [{ label: "Elapsed", value: "9h 41m" }],
      evidence: [
        { label: "Auth routing", value: "STIP stand-in approved", entityRef: "t-1" },
        { label: "Currency", value: "USD" },
      ],
      ...over,
    });
  const ctxWithTx = { transactions: [{ id: "t-1", is_fraud: 1 } as Transaction], logins: [], places: [] } as PivotContext;
  const mount = (d: Decision, context: PivotContext = emptyContext) => {
    usePivotStore.setState({ windows: [], nextZ: 20 });
    usePivotStore.getState().openTrace(d.id, { x: 10, y: 10 });
    const w = usePivotStore.getState().windows[0];
    if (w.kind !== "trace") throw new Error("expected trace window");
    return render(<RuleTraceWindow window={w} decisions={[d]} context={context} />);
  };
  const foldButton = () => screen.queryByRole("button", { name: /What this rule is/ });

  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn(() => new Promise(() => {})));
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("is titled with the rule's label alone, with no 'Trace' in the title or the dialog's name", () => {
    mount(full());
    const dialog = screen.getByRole("dialog");
    expect(dialog.getAttribute("aria-label")).toBe("impossible-travel");
    expect(dialog.textContent).not.toMatch(/Trace/);
  });

  it("draws the outcome line, Thresholds, Inputs, Evidence, then the fold, in that order", () => {
    mount(full());
    const text = document.querySelector("[data-window-body]")!.textContent!;
    const at = ["DECLINE", "Thresholds", "Inputs", "Evidence", "What this rule is"].map((s) => text.indexOf(s));
    expect(at.every((i) => i >= 0)).toBe(true);
    expect([...at].sort((a, b) => a - b)).toEqual(at);
    expect(text).not.toMatch(/\(observed\)/);
  });

  it("prints the action word, the verdict and the severity on one outcome line, with no box", () => {
    mount(full());
    const line = document.querySelector("[data-trace-outcome]")!;
    expect(line.textContent).toMatch(/DECLINE\s*IMPOSSIBLE TRAVEL\s*severity\s*0\.90/);
    expect(line.className).not.toMatch(/rounded|border|bg-/);
  });

  it("draws a section only when it has rows", () => {
    mount(full({ thresholds: [], inputs: [], evidence: [] }));
    for (const h of ["Thresholds", "Inputs", "Evidence"]) expect(screen.queryByText(h)).toBeNull();
    expect(foldButton()).not.toBeNull();
  });

  it("fold: a button with aria-expanded and aria-controls, open when the window opens, shut by a press, open by the next", () => {
    mount(full());
    const btn = foldButton()!;
    expect(btn.tagName).toBe("BUTTON");
    expect(btn.getAttribute("type")).toBe("button");
    expect(btn.getAttribute("aria-expanded")).toBe("true");
    const region = document.getElementById(btn.getAttribute("aria-controls")!)!;
    expect(region.textContent).toContain(SOP.what);
    expect(screen.getByText(SOP.what)).toBeInTheDocument();
    expect(btn.querySelector("[aria-hidden]")!.textContent).toBe(TRIANGLE);

    fireEvent.click(btn);
    expect(btn.getAttribute("aria-expanded")).toBe("false");
    expect(screen.queryByText(SOP.what)).toBeNull(); // nothing under the heading is rendered
    expect(document.getElementById(btn.getAttribute("aria-controls")!)).toBeNull();

    fireEvent.click(btn);
    expect(btn.getAttribute("aria-expanded")).toBe("true");
    expect(screen.getByText(SOP.what)).toBeInTheDocument();
  });

  it("fold: prints what, then 'Why it fires' and the why exactly as the payload gives them", () => {
    mount(full());
    expect(screen.getByText("Why it fires")).toBeInTheDocument();
    expect(screen.getByText(SOP.why)).toBeInTheDocument();
    const text = document.querySelector("[data-window-body]")!.textContent!;
    expect(text.indexOf(SOP.what)).toBeLessThan(text.indexOf("Why it fires"));
    expect(text.indexOf("Why it fires")).toBeLessThan(text.indexOf(SOP.why));
  });

  it.each([["an empty string", ""], ["whitespace", "  \n "], ["an absent field", undefined]])(
    "fold: no 'Why it fires' heading when the why is %s",
    (_name, why) => {
      mount(full({ rule: { id: "r", label: "r", kind: "k", sop: { what: SOP.what, why } as never } }));
      expect(screen.getByText(SOP.what)).toBeInTheDocument();
      expect(screen.queryByText("Why it fires")).toBeNull();
    },
  );

  it("fold: draws no fold when the payload has no standing text, or only blanks", () => {
    mount(full({ rule: { id: "r", label: "r", kind: "k" } }));
    expect(foldButton()).toBeNull();
    expect(screen.queryByText("What this rule is")).toBeNull();
    cleanup();
    mount(full({ rule: { id: "r", label: "r", kind: "k", sop: { what: " ", why: "" } } }));
    expect(foldButton()).toBeNull();
  });

  it("fold: a window folded to its bar keeps the fold's state; a new window opens it again", () => {
    const d = full();
    const view = mount(d);
    fireEvent.click(foldButton()!);
    usePivotStore.getState().toggleCollapsed(usePivotStore.getState().windows[0].id);
    const w = usePivotStore.getState().windows[0];
    if (w.kind !== "trace") throw new Error("expected trace window");
    view.rerender(<RuleTraceWindow window={w} decisions={[d]} context={emptyContext} />);
    expect(foldButton()!.getAttribute("aria-expanded")).toBe("false");
    view.unmount();
    mount(d);
    expect(foldButton()!.getAttribute("aria-expanded")).toBe("true");
  });

  it("fold: the heading reads in the section heading style and the press never reaches the store or storage", () => {
    mount(full());
    const btn = foldButton()!;
    expect(btn.className).toMatch(/uppercase/);
    expect(btn.className).toMatch(/text-\[10px\]/);
    expect(JSON.stringify(usePivotStore.getState().windows)).not.toMatch(/fold|expanded/i);
  });

  it("a threshold that is not crossed has no tick and no cross; a crossed one has the cross, named 'breach', with its tooltip", () => {
    mount(full());
    const crossed = screen.getByText("Implied travel speed").closest("[data-trace-threshold]")!;
    const clear = screen.getByText("Card-present both ends").closest("[data-trace-threshold]")!;
    const cross = crossed.querySelector('svg[role="img"]')!;
    expect(cross.getAttribute("aria-label")).toBe("breach");
    expect(cross.getAttribute("data-tip")).toBe("breach");
    expect(clear.querySelector("svg")).toBeNull();
    expect(screen.getAllByRole("img", { name: "breach" })).toHaveLength(1);
    const body = document.querySelector("[data-window-body]")!.textContent!;
    expect(body).not.toContain(String.fromCharCode(0x2713));
    expect(body).not.toContain(String.fromCharCode(0x2717));
    expect(body).not.toMatch(/breach/); // the word is the cross's name and tip, not a visible word
  });

  it("a crossed actual never wraps, so the cross cannot land over its text", () => {
    mount(full());
    const crossed = screen.getByText("674 mph");
    expect(crossed.className).toMatch(/whitespace-nowrap/);
    const clear = screen.getByText("true");
    expect(clear.className).not.toMatch(/whitespace-nowrap/);
  });

  it("prints the bound in the row's own small line, as given, with no operator added to prose", () => {
    mount(full());
    // the bound's hyphenated word is held whole in its own span, so the line's own text is found by its content
    const bound = screen.getByText("jet-cruise").parentElement!;
    expect(bound.textContent).toBe("600 mph jet-cruise");
    expect(bound.className).toMatch(/text-\[9px\]/);
    expect(bound.className).toMatch(/font-mono/);
    expect(screen.getByText("air-gap").parentElement!.textContent).toBe("no air-gap possible");
  });

  it("a pressable evidence value is underlined and presses through to the record; an unresolved one is plain text", () => {
    const navigate = vi.fn();
    useNavigation.setState({ navigate } as never);
    mount(full(), ctxWithTx);
    const pressable = screen.getByRole("button", { name: "STIP stand-in approved" });
    expect(pressable.className).toMatch(/\bunderline\b/);
    fireEvent.click(pressable);
    expect(navigate).toHaveBeenCalledTimes(1);
    const inert = screen.getByText("USD");
    expect(inert.closest("button")).toBeNull();
    expect(inert.className).not.toMatch(/\bunderline\b/);
    expect(screen.getAllByRole("button").filter((b) => b.className.includes("underline"))).toHaveLength(1);
  });

  it("a value that is wider than its row wraps at spaces and breaks only a single token that is wider than the row", () => {
    mount(full());
    // "stand-in" is held whole in its own span; the value is the span that holds it
    const value = screen.getByText("stand-in").parentElement!;
    expect(value.textContent).toBe("STIP stand-in approved");
    expect(value.className).not.toMatch(/anywhere/);
    expect(value.className).toMatch(/\bbreak-words\b/); // overflow-wrap: break-word
  });

  it("sets no text larger than 11 px (the label, value and actual were 16 and 12 px before), and sets the size once at the body's root", () => {
    mount(full());
    const root = document.querySelector("[data-window-body] > div")!;
    expect(root.className).toMatch(/text-\[11px\]/);
    const sizes = new Set<number>();
    for (const el of document.querySelectorAll("[data-window-frame] *")) {
      const cls = typeof el.className === "string" ? el.className : "";
      for (const m of cls.matchAll(/text-\[(\d+(?:\.\d+)?)px\]/g)) sizes.add(Number(m[1]));
      expect(cls).not.toMatch(/\btext-(xs|sm|base|lg|xl|2xl)\b/);
      expect(el.getAttribute("style") ?? "").not.toMatch(/font-size/);
    }
    expect(Math.max(...sizes)).toBeLessThanOrEqual(11);
  });

  it("the window is 320 px wide with square corners; the estimate that places it says the same", () => {
    mount(full());
    expect(TRACE_WINDOW_DIMS.width).toBe(320);
    const frame = document.querySelector<HTMLElement>("[data-window-frame]")!;
    const chrome = frame.firstElementChild as HTMLElement;
    expect(chrome.style.width).toBe("320px");
    for (const el of [frame, chrome]) expect(el.className).not.toMatch(/rounded-\[14px\]/);
  });
});

/** How the window sets its text (the one text pass after variant C): a value breaks only at its spaces,
 *  a list breaks between its items, no line ends in a lone word, a label keeps 8 px from its value, and
 *  the body shows when more lies below. No word changes: every row's text is label, colon, value. */
describe("RuleTraceWindow - how the text is set", () => {
  const MID = String.fromCharCode(0xb7);
  const SKIMMER = `4x chip-fallback-swipe - Tidewater Trust Bank ATM ${MID} Lekki / Tidewater Trust Bank ATM ${MID} Lekki / Garrmere Shopping Mall ${MID} Lekki / Heskford Lekki`;
  const FACTOR = "large geographic jump from the prior swipe (geo_displacement_km=10501.92) -> +25.23 log-odds";
  const SCORES = "940 / 942 / 967 / 981 (of 1000)";
  const CARDS = [1, 2, 3].map((n) => ({ label: `Card ${n}`, value: `card-00${n}0 visited 2026-05-04, 2 chip-fallback swipes 2026-05-27` }));
  const INPUTS = [{ label: "Exposure window", value: "2026-05-04 to 2026-05-13" }];
  const EVIDENCE = [...CARDS, { label: "Skimmer signature", value: SKIMMER }, { label: "Risk scores", value: SCORES }, { label: "Top model factor", value: FACTOR }];
  const THRESHOLDS = [
    { label: "Share of window visitors compromised", actual: "30/30 (100%)", bound: ">= 50%", breached: true },
    { label: "Visit to compromise", actual: "17 d", bound: "<= 30 d", breached: false },
  ];
  const d = decision({
    rule: { id: "r", label: "r", kind: "k", sop: { what: "w", why: "" } },
    thresholds: THRESHOLDS,
    inputs: INPUTS,
    evidence: EVIDENCE,
  });
  const mount = () => {
    usePivotStore.setState({ windows: [], nextZ: 20 });
    usePivotStore.getState().openTrace(d.id, { x: 10, y: 10 });
    const w = usePivotStore.getState().windows[0];
    if (w.kind !== "trace") throw new Error("expected trace window");
    return render(<RuleTraceWindow window={w} decisions={[d]} context={emptyContext} />);
  };
  const rowOf = (label: string) => screen.getByText(label).closest("[data-trace-row]") as HTMLElement;
  /** The text nodes of a row that are NOT inside a no-break span: the places a line may end inside. */
  const breakableText = (row: HTMLElement) => {
    const out: string[] = [];
    const walker = document.createTreeWalker(row, NodeFilter.SHOW_TEXT);
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      if (!n.parentElement!.closest(".whitespace-nowrap") && !n.parentElement!.closest("span.float-left")) out.push(n.textContent ?? "");
    }
    return out.join("");
  };

  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn(() => new Promise(() => {})));
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("changes no word: every row's text is its label, a colon and its value, exactly", () => {
    mount();
    // (the Inspector's label ends in a no-break space, the copy's gap)
    for (const r of [...INPUTS, ...EVIDENCE]) expect(rowOf(r.label).textContent!.replace(NBSP_ALL, " ")).toBe(`${r.label}: ${r.value}`);
    // a threshold: label, colon, actual, then its bound (operator, no-break space, number) in the line under it
    const threshold = rowOf("Share of window visitors compromised").textContent!;
    expect(threshold.replace(NBSP_ALL, " ")).toBe("Share of window visitors compromised: 30/30 (100%)>= 50%");
  });

  it("no hyphenated word and no arrow can break: each is held whole, so no breakable text holds a hyphen or '->'", () => {
    mount();
    for (const label of ["Card 1", "Card 2", "Card 3", "Skimmer signature", "Top model factor", "Exposure window"]) {
      const text = breakableText(rowOf(label));
      expect(text).not.toMatch(/-/);
      expect(text).not.toMatch(/>/);
    }
    const nowrap = Array.from(rowOf("Card 1").querySelectorAll(".whitespace-nowrap")).map((e) => e.textContent);
    expect(nowrap).toEqual(["card-0010", "2026-05-04,", "chip-fallback", "2026-05-27"]);
    expect(Array.from(rowOf("Top model factor").querySelectorAll(".whitespace-nowrap")).map((e) => e.textContent)).toContain("->");
  });

  it("a list breaks between its items: each item and its ' /' is one piece, and the only breakable text between them is a space", () => {
    mount();
    const scores = rowOf("Risk scores");
    expect(Array.from(scores.querySelectorAll(".whitespace-nowrap")).map((e) => e.textContent)).toEqual(["940 /", "942 /", "967 /", "981 (of 1000)"]);
    expect(breakableText(scores).trim()).toBe("");
    const skim = Array.from(rowOf("Skimmer signature").querySelectorAll(".whitespace-nowrap")).map((e) => e.textContent);
    expect(skim).toContain(`Tidewater Trust Bank ATM ${MID} Lekki /`);
    expect(skim).toContain(`Garrmere Shopping Mall ${MID} Lekki /`);
    expect(skim).toContain("Heskford Lekki");
  });

  it("sets the rows so a wrapping value does not end in a lone word (text-wrap: pretty), on the sections that hold rows", () => {
    mount();
    for (const h of ["Thresholds", "Inputs", "Evidence"]) {
      expect(screen.getByText(h).closest("section")!.className).toMatch(/\[text-wrap:pretty\]/);
    }
  });

  it("keeps 8 px between a label and its value: the value holds 8 px of its own before its first piece", () => {
    mount();
    const actual = screen.getByText("30/30 (100%)");
    expect(actual.className).toMatch(/\bpl-2\b/); // 8 px at the root's 16 px
    expect(actual.className).toMatch(/whitespace-nowrap/);
    for (const label of ["Card 1", "Skimmer signature", "Exposure window"]) {
      const value = rowOf(label).querySelector("span.font-mono > span")!;
      expect(value.className).toMatch(/\bpl-2\b/);
    }
  });

  it("wraps the label, not the value, when both do not fit: the label's width is capped by the room its value's first piece needs", () => {
    mount();
    const row = rowOf("Share of window visitors compromised");
    expect(row.className).toMatch(/\[&_\.float-left\]:max-w-\[calc\(100%_-_var\(--lbl-room\)\)\]/);
    // "30/30 (100%)" is 12 characters of the mono face, kept whole, with 8 px of gap and 12 px for the cross
    expect(row.getAttribute("style")).toMatch(/--lbl-room:\s*calc\(7\.68em \+ 20px\)/);
    // a data row reserves its first piece: "card-0010" is 9 characters, with the 8 px gap
    expect(rowOf("Card 1").getAttribute("style")).toMatch(/--lbl-room:\s*calc\(5\.76em \+ 8px\)/);
  });

  it("the body carries the hook of the foot cue, and a window of this kind draws it", () => {
    mount();
    expect(document.querySelector("[data-window-body]")!.hasAttribute("data-foot-cue")).toBe(true);
  });
});

describe("RuleTraceWindow - stranded-decision lifecycle", () => {
  it("self-closes via effect when its decision no longer resolves", async () => {
    usePivotStore.setState({ windows: [], nextZ: 20 });
    usePivotStore.getState().openTrace("decision:gone", { x: 10, y: 10 });
    const w = usePivotStore.getState().windows[0];
    if (w.kind !== "trace") throw new Error("expected trace window");
    const { container } = render(
      <RuleTraceWindow window={w} decisions={[]} context={emptyContext} />
    );
    expect(container.querySelector('[role="dialog"]')).toBeNull();
    await waitFor(() => expect(usePivotStore.getState().windows).toHaveLength(0));
  });
});

describe("RuleTraceWindow - matchable decision inputs", () => {
  const CPP = "ZEL-7731042";
  const visit = (id: string, card: string) =>
    ({ id, card_id: card, terminal_id: CPP, timestamp: "2026-05-02T10:00:00-05:00", is_fraud: 0 }) as Transaction;
  // The backend tags an input with the pivot column it came from; DecisionInput does not declare it yet.
  const input = (label: string, value: string, field?: string) =>
    ({ label, value, ...(field ? { field } : {}) }) as DecisionInput;

  const open = (d: Decision, context: PivotContext = emptyContext) => {
    usePivotStore.setState({ windows: [], nextZ: 20 });
    usePivotStore.getState().openTrace(d.id, { x: 10, y: 10 });
    const w = usePivotStore.getState().windows[0];
    if (w.kind !== "trace") throw new Error("expected trace window");
    return render(<RuleTraceWindow window={w} decisions={[d]} context={context} />);
  };

  beforeEach(() => {
    useMatches.setState({ active: null });
    useTerminalRows.setState({ rows: {}, status: {} });
    vi.stubGlobal("fetch", vi.fn(() => new Promise(() => {}))); // never settles: no network in unit tests
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("gives an input whose field is matchable the same match affordance as the Inspector", () => {
    const d = decision({ inputs: [input("Terminal", CPP, "terminal_id"), input("Merchant", "Alderlowe Fuel & Go")] });
    open(d, { transactions: [visit("v1", "card-1")], logins: [], places: [] });
    const badge = screen.getByRole("button", { name: `Open matches for terminal_id=${CPP} (1 matches)` });
    expect(screen.getByText(CPP)).toBeInTheDocument(); // the value itself is still plain text
    fireEvent.click(badge);
    const active = useMatches.getState().active;
    expect(active?.mode === "field" && [active.field, active.value]).toEqual(["terminal_id", CPP]);
  });

  it("leaves an input with no field, or an unregistered one, as plain text", () => {
    const d = decision({ inputs: [input("Merchant", "Alderlowe Fuel & Go"), input("Odd", "x", "not_a_field")] });
    open(d, { transactions: [visit("v1", "card-1")], logins: [], places: [] });
    expect(screen.getByText("Alderlowe Fuel & Go")).toBeInTheDocument();
    expect(screen.getByText("x")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Open matches for/ })).toBeNull();
  });

  it("loads the terminal's cross-card rows so the badge counts every card, with or without a focal visit", async () => {
    const ring = Array.from({ length: 30 }, (_, i) => visit(`v${i}`, `card-${i}`));
    vi.stubGlobal("fetch", vi.fn(() => Promise.resolve({ ok: true, json: () => Promise.resolve(ring) } as Response)));
    const d = decision({ inputs: [input("Terminal", CPP, "terminal_id")] });
    open(d); // empty context: the focal case holds none of this terminal's rows
    expect(screen.queryByRole("button", { name: /Open matches for/ })).toBeNull();
    expect(
      await screen.findByRole("button", { name: `Open matches for terminal_id=${CPP} (30 matches)` })
    ).toBeInTheDocument();
  });
});

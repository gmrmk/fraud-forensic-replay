import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { NarrativeLog } from "./NarrativeLog";
import { useLayers } from "../store/layers";
import { usePlayhead } from "../store/playhead";
import { usePivotData } from "../store/pivot-data";
import { usePivotStore } from "../store/pivot";
import { useSelection } from "../store/selection";
import { relatedEntities } from "../lib/matches";
import type { Transaction } from "../types";

vi.mock("../lib/matches", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../lib/matches")>();
  return { ...actual, relatedEntities: vi.fn(actual.relatedEntities) };
});

function tx(id: string, iso: string, fraud = 0): Transaction {
  return {
    id, timestamp: iso, is_fraud: fraud, amount: 50, merchant_name: `M-${id}`,
    merchant_country: "US", mcc: "5411", merchant_lat: 29.7, merchant_lng: -95.4,
    card_id: "c1", account_id: "a1", category: "grocery", is_card_present: 1,
    balance_after: 0, auth_response_code: "00", pos_entry_mode: "05",
    network_ref_number: "n", terminal_id: "t", acquirer: "acq",
    auth_source: "card_present", risk_score: 100, is_3ds: 0, currency: "USD",
  };
}

const T0 = Date.parse("2026-05-14T20:00:00Z");

beforeEach(() => {
  usePivotStore.setState({ windows: [], nextZ: 20 });
  useSelection.setState({ selected: null });
  const txs = Array.from({ length: 10 }, (_, i) =>
    tx(`t${i}`, new Date(T0 + i * 60_000).toISOString(), i === 9 ? 1 : 0)
  );
  usePivotData.getState().setPivotData({
    transactions: txs, logins: [], accountEvents: [], transfers: [], entities: [],
  });
  usePlayhead.setState({
    playhead: T0 + 8 * 60_000, minTime: T0, maxTime: T0 + 9 * 60_000, isPlaying: true,
  });
});

describe("NarrativeLog rail", () => {
  it("shows at most the last 8 events at or before the playhead", () => {
    render(<NarrativeLog />);
    // events t0..t8 are <= playhead (9 events) → only the latest 8 render;
    // t9 (after playhead) and t0 (9th-newest) do not.
    expect(screen.queryByText(/M-t9/)).toBeNull();
    expect(screen.queryByText(/M-t0/)).toBeNull();
    expect(screen.getByText(/M-t8/)).toBeInTheDocument();
  });

  it("keeps the visible rows and count work stable until the playhead crosses an event", () => {
    render(<NarrativeLog />);
    const initialLabels = screen.getAllByText(/M-t\d/).map((node) => node.textContent);
    const relatedEntitiesMock = vi.mocked(relatedEntities);
    relatedEntitiesMock.mockClear();

    act(() => {
      usePlayhead.setState({ playhead: T0 + 8 * 60_000 + 30_000 });
    });

    expect(screen.getAllByText(/M-t\d/).map((node) => node.textContent)).toEqual(initialLabels);
    expect(relatedEntitiesMock).not.toHaveBeenCalled();

    act(() => {
      usePlayhead.setState({ playhead: T0 + 9 * 60_000 });
    });

    expect(screen.getByText(/M-t9/)).toBeInTheDocument();
    expect(screen.queryByText(/M-t1/)).toBeNull();
    expect(relatedEntitiesMock).toHaveBeenCalled();
  });

  it("row click pauses playback and selects the entity", () => {
    render(<NarrativeLog />);
    fireEvent.click(screen.getByText(/M-t8/));
    expect(usePlayhead.getState().isPlaying).toBe(false);
    expect(useSelection.getState().selected?.kind).toBe("auth");
  });

  it("collapse control folds the rail", () => {
    render(<NarrativeLog />);
    fireEvent.click(screen.getByLabelText("Fold the narrative"));
    expect(screen.queryByText(/M-t8/)).toBeNull();
    fireEvent.click(screen.getByLabelText("Open the narrative"));
    expect(screen.getByText(/M-t8/)).toBeInTheDocument();
  });

  it("hover reveals the quick-look badges (rail badge wiring)", () => {
    render(<NarrativeLog />);
    const row = screen.getByText(/M-t8/).closest('[role="button"]');
    if (!row) throw new Error("expected a rail row");
    fireEvent.mouseEnter(row);
    // All 10 fixture txs share mcc 5411 → count 10, baseline 0 → badge renders.
    expect(screen.getByLabelText(/Preview matches for mcc=5411/)).toBeInTheDocument();
  });
});

// The Layers switches (C3 c, C5 b): the rows follow the one function, so a switched-off kind leaves the
// rail. Nothing here asserts a pin's win (PIN_WINS is false before item 1).
describe("NarrativeLog: the Layers switches", () => {
  const SIGN_INS = [{ id: "l1", timestamp: new Date(T0 + 2 * 60_000).toISOString(), device_fp: "dev-visible", session_id: "S1", account_id: "a1", ip_lat: 1, ip_lng: 2, outcome: "success" }];

  beforeEach(() => {
    useLayers.setState({ showAuths: true, showLogins: true, hiddenKinds: [], hiddenValues: {} });
    useSelection.setState({ selected: null });
  });
  afterEach(() => {
    useLayers.setState({ showAuths: true, showLogins: true, hiddenKinds: [], hiddenValues: {} });
  });

  it("draws the rail with every switch on", () => {
    render(<NarrativeLog />);
    expect(screen.getByText(/M-t8/)).toBeInTheDocument();
  });

  it("draws nothing while Authorizations is off and every row is a transaction", () => {
    useLayers.setState({ showAuths: false });
    const { container } = render(<NarrativeLog />);
    expect(container.firstChild).toBeNull();
    expect(screen.queryByText(/M-t8/)).toBeNull();
  });

  it("leaves the sign-in rows out while Logins is off, and keeps the transaction rows", () => {
    usePivotData.getState().setPivotData({
      transactions: Array.from({ length: 10 }, (_, i) => tx(`t${i}`, new Date(T0 + i * 60_000).toISOString(), i === 9 ? 1 : 0)),
      logins: SIGN_INS as never, accountEvents: [], transfers: [], entities: [],
    });
    const { unmount } = render(<NarrativeLog />);
    expect(screen.getByText("dev-visible")).toBeInTheDocument();
    unmount();
    useLayers.setState({ showLogins: false });
    render(<NarrativeLog />);
    expect(screen.queryByText("dev-visible")).toBeNull();
    expect(screen.getByText(/M-t8/)).toBeInTheDocument();
  });

  it("gives the rows back when the switch is turned on again", () => {
    useLayers.setState({ showAuths: false });
    const { container, rerender } = render(<NarrativeLog />);
    expect(container.firstChild).toBeNull();
    act(() => useLayers.setState({ showAuths: true }));
    rerender(<NarrativeLog />);
    expect(screen.getByText(/M-t8/)).toBeInTheDocument();
  });
});

describe("NarrativeLog time words", () => {
  // Five instants in Houston time: just after midnight, morning, noon, afternoon, late evening.
  const INSTANTS = [
    "2026-05-15T05:05:00Z", // 12:05 AM
    "2026-05-15T14:07:00Z", // 9:07 AM
    "2026-05-15T17:00:00Z", // 12:00 PM
    "2026-05-15T20:30:00Z", // 3:30 PM
    "2026-05-16T04:59:00Z", // 11:59 PM
  ];

  function setUpFive() {
    const txs = INSTANTS.map((iso, i) => tx(`w${i}`, iso));
    usePivotData.getState().setPivotData({
      transactions: txs, logins: [], accountEvents: [], transfers: [], entities: [],
    });
    usePlayhead.setState({
      playhead: Date.parse(INSTANTS[4]) + 1000,
      minTime: Date.parse(INSTANTS[0]),
      maxTime: Date.parse(INSTANTS[4]) + 60_000,
      isPlaying: false,
    });
  }

  // The words the log printed before the formatter was built once: `toLocaleTimeString` called
  // at every row. Computed here, before the render, with the old call.
  function oldWords(iso: string): string {
    return new Date(iso).toLocaleTimeString("en-US", {
      timeZone: "America/Chicago", hour: "numeric", minute: "2-digit", hour12: true,
    });
  }

  it("prints the same words as the per-row toLocaleTimeString call for five instants", () => {
    setUpFive();
    const want = INSTANTS.map(oldWords);
    const { container } = render(<NarrativeLog />);
    const printed = Array.from(container.querySelectorAll("span.font-mono.text-\\[9px\\]"))
      .map((el) => el.textContent)
      .filter((t) => t !== "Narrative");
    // Newest first: the log lists the last events at or before the playhead, latest on top.
    expect(printed).toEqual([...want].reverse());
  });

  it("calls no toLocaleTimeString while it renders its rows", () => {
    setUpFive();
    const spy = vi.spyOn(Date.prototype, "toLocaleTimeString");
    render(<NarrativeLog />);
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });
});

describe("NarrativeLog height", () => {
  // The log's cap follows the bar: it keeps today's 60vh and subtracts the bottom stack the way
  // the Inspector does (Inspector.tsx:47-49). 87 px is the log's 12 px top offset, its 68 px
  // margin and a 7 px gap, where the Inspector's 19 px is 12 and 7. The window's height and the
  // stack go through the text-size scale: 0.6 of --vh-c is 60vh and --vh-c less --bottom-stack-c
  // is the window less the stack, both at 100 percent.
  it("caps its height at 60vh and at the window less the bottom stack", () => {
    const { container } = render(<NarrativeLog />);
    const aside = container.querySelector("aside");
    expect(aside).not.toBeNull();
    expect(aside!.className).toContain(
      "max-h-[min(calc(var(--vh-c)_*_0.6),calc(var(--vh-c)_-_var(--bottom-stack-c)_-_87px))]",
    );
    // Neither cap may stand alone: a bare 60vh or 0.6 of the window ignores the stack.
    expect(aside!.className).not.toContain("max-h-[60vh]");
    expect(aside!.className).not.toContain("max-h-[calc(var(--vh-c)_*_0.6)]");
  });
});

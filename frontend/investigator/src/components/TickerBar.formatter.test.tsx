/**
 * The ticker's time formatter (T1, BACKLOG item 20). The ticker renders at every playhead tick of
 * the played swing. The profile of the first 400 ms put 4.1 ms a run in its `toLocaleTimeString`
 * call with an options object, which can build an `Intl.DateTimeFormat` on each call (inferred from
 * the cost). The formatter is built once, at module load, with the same locale and options.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { act, render } from "@testing-library/react";
import { TickerBar } from "./TickerBar";
import { usePlayhead } from "../store/playhead";
import { buildTickerStream } from "../lib/ticker-stream";
import type { ScenarioNode } from "../lib/scenarios";

const node: ScenarioNode = {
  kind: "auth",
  label: "Authorization",
  palette: "#00e5ff",
  source: "sql",
  coords: null,
  timestamp: "timestamp",
  primary: "${merchant_name}",
  secondary: "${id}",
} as ScenarioNode;

const row = (id: string, timestamp: string) => ({ id, timestamp, merchant_name: `Shop ${id}` });
const ROWS = [
  row("a", "2026-05-26T08:00:00-05:00"),
  row("b", "2026-05-26T10:05:00-05:00"),
  row("c", "2026-05-26T12:30:00-05:00"),
  row("d", "2026-05-26T15:45:00-05:00"),
];
const ITEMS = buildTickerStream({ auth: ROWS }, [node]);
const MS = ROWS.map((r) => Date.parse(r.timestamp));

describe("TickerBar's time formatter", () => {
  beforeEach(() => {
    usePlayhead.setState({ playhead: MS[0], minTime: MS[0], maxTime: MS[3], isPlaying: true });
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("calls toLocaleTimeString on no render and builds no Intl.DateTimeFormat after import, over four events and twenty ticks", () => {
    const toLocale = vi.spyOn(Date.prototype, "toLocaleTimeString");
    const built = vi.spyOn(Intl, "DateTimeFormat");
    const { container } = render(<TickerBar items={ITEMS} />);
    for (let i = 0; i < 20; i++) {
      act(() => usePlayhead.setState({ playhead: MS[0] + ((MS[3] - MS[0]) * i) / 19 }));
    }
    expect(container.querySelector('[data-testid="ticker-event"]')).not.toBeNull();
    expect(toLocale).not.toHaveBeenCalled();
    expect(built).not.toHaveBeenCalled();
  });

  it("prints the same words as before: the event's time in Houston, 12 hour, no leading zero", () => {
    const { getByTestId } = render(<TickerBar items={ITEMS} />);
    const timeOf = () => getByTestId("ticker-event").textContent ?? "";
    expect(timeOf()).toContain("8:00 AM");
    act(() => usePlayhead.setState({ playhead: MS[1] }));
    expect(timeOf()).toContain("10:05 AM");
    act(() => usePlayhead.setState({ playhead: MS[2] + 1000 }));
    expect(timeOf()).toContain("12:30 PM");
    act(() => usePlayhead.setState({ playhead: MS[3] }));
    expect(timeOf()).toContain("3:45 PM");
  });
});

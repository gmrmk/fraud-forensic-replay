/**
 * The Layers switches on the Timeline (C3 c, C5 b): the kinds control reads `Total Events: shown / all`
 * while a switched-off kind or value hides events of the track, stays offered when everything is hidden,
 * and the card case's today bucket counts only the transactions the switches show. The fixture pack is
 * written here, with words no pack uses; nothing here asserts a pin's win (PIN_WINS is false before item 1).
 */
import { act, fireEvent, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { manifestRowToEntity } from "../lib/adapters/manifest-row";
import type { Entity } from "../lib/entity";
import type { ScenarioLane, ScenarioNode } from "../lib/scenarios";
import { useClockForm } from "../store/clock-form";
import { useLayers } from "../store/layers";
import { usePlayhead } from "../store/playhead";
import { useSchema } from "../store/schema";
import { useSelection } from "../store/selection";
import { useSolo } from "../store/solo";
import { useTrackBy } from "../store/track-by";
import { rowsCountName } from "../lib/row-ticks";
import type { LoginEvent, Transaction } from "../types";
import { Timeline } from "./Timeline";

const HOUR = 3_600_000;
const MS0 = Date.parse("2026-05-12T00:00:00-05:00");
const MS1 = Date.parse("2026-06-01T00:00:00-05:00");
const at = (h: number): string => new Date(MS0 + h * HOUR).toISOString();

const stopNode: ScenarioNode = { kind: "stop", label: "Stop", palette: "#ffb347", source: "sql", coords: null, timestamp: "at", primary: "${id}", pivotable: ["team_id"] };
const scanNode: ScenarioNode = { ...stopNode, kind: "scan", label: "Scan", palette: "#66ccff" };
const loadNode: ScenarioNode = { ...stopNode, kind: "load", label: "Load", palette: "#f5a623", magnitude: "weight", magnitudeLabel: "Weight", magnitudeUnit: "kg" };
const NODES = [stopNode, scanNode, loadNode];

/** Twelve teams; each has a stop, a scan and a load. The track holds 24 events (the loads are bars). */
const makeEntities = (): Entity[] =>
  Array.from({ length: 12 }, (_, i) => {
    const team = { team_id: `t${i}`, team_name: `Team ${String(i).padStart(2, "0")}` };
    return [
      manifestRowToEntity(stopNode, { id: `s${i}`, at: at(24 + i), ...team }),
      manifestRowToEntity(scanNode, { id: `c${i}`, at: at(24 + i), ...team }),
      manifestRowToEntity(loadNode, { id: `l${i}`, at: at(24 + (i % 3)), ...team, weight: 10 + i }),
    ];
  }).flat();
const ENTITIES = makeEntities();
const NO_TRANSACTIONS: never[] = [];

const q = <T extends Element = HTMLElement>(c: ParentNode, sel: string): T => c.querySelector(sel) as T;
const qa = (c: ParentNode, sel: string): HTMLElement[] => [...c.querySelectorAll<HTMLElement>(sel)];
const draw = (list: Entity[] = ENTITIES) => render(<Timeline transactions={NO_TRANSACTIONS} genericEntities={list} />);

const reset = () => useLayers.setState({ showAuths: true, showLogins: true, hiddenKinds: [], hiddenValues: {}, collapsedLanes: [], barSize: "middle" });

beforeEach(() => {
  reset();
  useClockForm.setState({ h24: false });
  usePlayhead.setState({ playhead: MS0 + 24.2 * HOUR, minTime: MS0, maxTime: MS1, windowMin: MS0, windowMax: MS1, isPlaying: false, isScrubbing: false, playbackRate: 1 });
  useSchema.setState({ nodes: NODES, rows: { by: "team_id", name: "team_name" }, fields: { team_id: { label: "Squad" } }, lanes: [] });
  useSelection.setState({ selected: null });
  useSolo.setState({ solo: null });
  useTrackBy.setState({ by: null });
});
afterEach(() => {
  useSchema.setState({ rows: undefined, fields: undefined, lanes: undefined });
  reset();
});

describe("the kinds control under the Layers switches", () => {
  it("reads shown over all while a kind is switched off", () => {
    useLayers.setState({ hiddenKinds: ["scan"] });
    const { container } = draw();
    const control = q(container, "[data-kinds-fold]");
    expect(control.textContent).toContain("Events: 12 / 24");
    expect(control.textContent).not.toContain("Total");
    // The control's name and its tooltip keep the full words.
    expect(control.getAttribute("aria-label")).toMatch(/^Total Events: 12 \/ 24\. /);
    expect(control.getAttribute("data-tip")?.split("\n")[0]).toBe("Total Events: 12 / 24");
  });

  it("reads today's text, with no slash, while nothing is switched off", () => {
    const { container } = draw();
    const text = q(container, "[data-kinds-fold]").textContent ?? "";
    expect(text).toContain("Total Events: 24");
    expect(text).not.toContain("/");
  });

  it("stays on the rail with every kind switched off, and reads nothing shown out of all", () => {
    useLayers.setState({ hiddenKinds: ["stop", "scan", "load"] });
    const { container } = draw();
    const control = q(container, "[data-kinds-fold]");
    expect(control).not.toBeNull();
    expect(control.textContent).toContain("Events: 0 / 24");
    expect(control.getAttribute("aria-label")).toMatch(/^Total Events: 0 \/ 24\. /);
    // The track keeps its frame: no event dot, and the name column is still drawn.
    expect(qa(container, 'button[aria-label^="Jump to"]')).toHaveLength(0);
  });

  it("gives a kind line the hidden words once a value of its kind is switched off", () => {
    useSchema.setState({ nodes: [{ ...stopNode, filter: { field: "team_id", label: "Squad" } }, scanNode, loadNode] });
    useLayers.setState({ hiddenValues: { stop: ["t0"] } });
    const { container } = draw();
    const control = q(container, "[data-kinds-fold]");
    expect(control.textContent).toContain("Events: 23 / 24");
    expect(control.getAttribute("aria-label")).toMatch(/^Total Events: 23 \/ 24\. /);
    fireEvent.click(control);
    const names = qa(container, "[data-kind-name]");
    expect(names).toHaveLength(2);
    for (const cell of names) expect(cell.getAttribute("data-tip")).toContain("The track draws");
    const stop = names.find((n) => n.textContent?.includes("Stop"));
    expect(stop?.getAttribute("data-tip")).toContain("The track draws 11 events of this kind.");
  });

  it("holds the dots of a switched-off kind off the track", () => {
    useLayers.setState({ hiddenKinds: ["scan"] });
    const { container } = draw();
    const track = q(container, '[role="slider"]');
    expect(qa(track, 'button[aria-label^="Jump to"]')).toHaveLength(12);
  });
});

describe("the today bucket under the Layers switches", () => {
  const tx = (id: string, h: number): Transaction =>
    ({ id, timestamp: at(h), is_fraud: 0, amount: 10, merchant_name: "M", mcc: "5999", merchant_country: "US", merchant_lat: 29.7, merchant_lng: -95.3 }) as unknown as Transaction;
  const TXNS = [tx("a1", 24), tx("a2", 25), tx("a3", 26)];
  const card = () => render(<Timeline transactions={TXNS} />);

  it("counts the transactions of the day while Authorizations is on", () => {
    useSchema.setState({ nodes: [], rows: undefined, fields: undefined, lanes: [] });
    usePlayhead.setState({ playhead: MS0 + 27 * HOUR });
    expect(card().container.textContent).toMatch(/3 auths today/);
  });

  it("reads 0 auths today, and keeps the readout, while Authorizations is off", () => {
    useSchema.setState({ nodes: [], rows: undefined, fields: undefined, lanes: [] });
    usePlayhead.setState({ playhead: MS0 + 27 * HOUR });
    useLayers.setState({ showAuths: false });
    const text = card().container.textContent ?? "";
    expect(text).toMatch(/0 auths today/);
    expect(text).toContain("$0.00");
  });
});

// The rows' header (the fold button with the grouping's heading and the count of named rows, and the
// Group by control) is drawn only while the rows have something to head. The card case grouped by
// merchant: the sign-ins carry no merchant, so they sit in an unnamed row and never in a named one.
// With Authorizations off and nothing selected no named row is left, and the section is not drawn,
// as the folded rows' small version is not drawn for a case with no named row (RowsSmall). The rows are
// sums over a kind, so a selected record of a switched-off kind holds no row either: the section goes whether or not a record of that kind is selected.
describe("the rows' header under the Layers switches", () => {
  const card = (id: string, h: number, merchant: string): Transaction =>
    ({ id, timestamp: at(h), is_fraud: 0, amount: 10, merchant_name: merchant, mcc: "5999", merchant_country: "US", merchant_lat: 29.7, merchant_lng: -95.3 }) as unknown as Transaction;
  const signIn = (id: string, h: number): LoginEvent =>
    ({ id, timestamp: at(h), account_id: "acct-1", ip_lat: 29.7, ip_lng: -95.3, device_fp: `dev-${id}`, session_id: "S1", outcome: "success" }) as unknown as LoginEvent;
  const TXNS = [card("a1", 24, "Cobstead Grocers Bunker Hill"), card("a2", 25, "Cobstead Grocers Bunker Hill"), card("a3", 26, "Lekki ATM")];
  const LOGINS = [signIn("l1", 24.5), signIn("l2", 25.5)];
  const cardCase = (logins: LoginEvent[] = LOGINS) => render(<Timeline transactions={TXNS} logins={logins} />);
  const header = (c: ParentNode) => q(c, "[data-track-header]");
  const rowsButton = (c: ParentNode) => q(c, "[data-track-header] button");

  beforeEach(() => {
    useSchema.setState({ nodes: [], rows: { by: "merchant_name" }, fields: { merchant_name: { label: "Merchant" } }, lanes: [] });
    usePlayhead.setState({ playhead: MS0 + 27 * HOUR });
  });

  it("a case with rows and every switch on draws today's header with its count", () => {
    const { container } = cardCase();
    expect(header(container)).not.toBeNull();
    expect(rowsButton(container).getAttribute("aria-label")).toBe(rowsCountName("Merchant", 2));
    expect(q(container, "[data-track-rows]")).not.toBeNull();
    expect(header(container).textContent).toContain("Merchant");
  });

  it("with Authorizations off and nothing selected draws no header, no rows section and no count of 0", () => {
    useLayers.setState({ showAuths: false });
    const { container } = cardCase();
    expect(header(container)).toBeNull();
    expect(q(container, "[data-track-rows]")).toBeNull();
    expect(container.querySelectorAll('[aria-label="Merchant: 0 rows"]')).toHaveLength(0);
    expect(container.textContent).not.toMatch(/Merchant\W+0\b/);
    // The rest of the bar stays: the kinds control reads the sign-ins over the case, and the readout stays.
    expect(q(container, "[data-kinds-fold]").textContent).toContain("Events: 2 / 5");
    expect(container.textContent).toMatch(/0 auths today/);
    // The track keeps the two sign-ins as dots; with no rows section there are no copies of them.
    expect(qa(container, 'button[aria-label^="Jump to"]')).toHaveLength(2);
  });

  it("switched on again, the header is back with its count", () => {
    useLayers.setState({ showAuths: false });
    const { container } = cardCase();
    expect(header(container)).toBeNull();
    act(() => useLayers.setState({ showAuths: true }));
    expect(rowsButton(container).getAttribute("aria-label")).toBe(rowsCountName("Merchant", 2));
    expect(header(container).textContent).toContain("2");
  });

  it("a selected transaction of the switched-off kind holds no row: no header, no rows, and its dot stays on the track", () => {
    useLayers.setState({ showAuths: false });
    act(() => useSelection.setState({ selected: { kind: "auth", tx: TXNS[2] } }));
    const { container } = cardCase();
    expect(header(container)).toBeNull();
    expect(q(container, "[data-track-rows]")).toBeNull();
    expect(container.querySelectorAll('[aria-label="Merchant: 1 row"]')).toHaveLength(0);
    // The selected record keeps its dot (with the two sign-ins) and its place in the control's count.
    expect(qa(container, 'button[aria-label^="Jump to"]')).toHaveLength(3);
    expect(q(container, "[data-kinds-fold]").textContent).toContain("Events: 3 / 5");
  });

  it("the only transaction of the case, selected, with Authorizations off: no header, no rows, and no count of 0", () => {
    // The switch hides nothing the selection does not keep, so only the rows' own list shows it hid the record.
    useLayers.setState({ showAuths: false });
    act(() => useSelection.setState({ selected: { kind: "auth", tx: TXNS[0] } }));
    const { container } = render(<Timeline transactions={[TXNS[0]]} logins={LOGINS} />);
    expect(header(container)).toBeNull();
    expect(q(container, "[data-track-rows]")).toBeNull();
    expect(container.querySelectorAll('[aria-label="Merchant: 0 rows"]')).toHaveLength(0);
    expect(container.textContent).not.toMatch(/Merchant\W+0\b/);
    // The selected record keeps its dot with the two sign-ins, and its place in the control's count: the
    // track hides nothing, so the control reads today's text with no slash.
    expect(qa(container, 'button[aria-label^="Jump to"]')).toHaveLength(3);
    expect(q(container, "[data-kinds-fold]").textContent).toContain("Total Events: 3");
  });

  it("a case whose events all sit in unnamed rows keeps its header while every switch is on", () => {
    const { container } = render(<Timeline transactions={NO_TRANSACTIONS} logins={LOGINS} />);
    expect(header(container)).not.toBeNull();
    expect(rowsButton(container).getAttribute("aria-label")).toBe(rowsCountName("Merchant", 0));
  });

  it("a case with no event left in it draws no header while Authorizations is off", () => {
    useLayers.setState({ showAuths: false });
    const { container } = render(<Timeline transactions={TXNS} />);
    expect(header(container)).toBeNull();
    expect(q(container, "[data-track-rows]")).toBeNull();
  });
});

// The rows and the measure lanes are sums over a kind: while the kind is off they leave, selected
// record or not. The selected record
// keeps its dot on the track, its row in the lists and its place in the control's count. The card case
// here declares a spend lane over authorizations (the concrete kinds as nodes, as lane-feed.test does).
describe("the rows and the lanes under the track while the selected record's kind is off", () => {
  const concrete = (kind: string, label: string): ScenarioNode => ({ kind, label, palette: "#33aaff", source: "sql", coords: null, timestamp: "timestamp", primary: "${id}" });
  const spend: ScenarioLane = { id: "case-spend", name: "Authorizations", label: "Spend", unit: "USD", kinds: ["auth", "fraud"], field: "amount", bucket: "hour", aggregate: "sum" };
  const card = (id: string, h: number, merchant: string): Transaction =>
    ({ id, timestamp: at(h), is_fraud: 0, amount: 10, merchant_name: merchant, mcc: "5999", merchant_country: "US", merchant_lat: 29.7, merchant_lng: -95.3 }) as unknown as Transaction;
  const signIn = (id: string, h: number): LoginEvent =>
    ({ id, timestamp: at(h), account_id: "acct-1", ip_lat: 29.7, ip_lng: -95.3, device_fp: `dev-${id}`, session_id: "S1", outcome: "success" }) as unknown as LoginEvent;
  const TXNS = [card("a1", 24, "Cobstead Grocers Bunker Hill"), card("a2", 25, "Cobstead Grocers Bunker Hill"), card("a3", 26, "Lekki ATM")];
  const LOGINS = [signIn("l1", 24.5), signIn("l2", 25.5)];
  const cardCase = () => render(<Timeline transactions={TXNS} logins={LOGINS} />);
  const lanes = (c: ParentNode) => qa(c, "[data-magnitude-lane]");
  const header = (c: ParentNode) => q(c, "[data-track-header]");

  beforeEach(() => {
    useSchema.setState({
      nodes: [concrete("auth", "Authorization"), concrete("fraud", "Fraud")],
      rows: { by: "merchant_name" },
      fields: { merchant_name: { label: "Merchant" } },
      lanes: [spend],
    });
    usePlayhead.setState({ playhead: MS0 + 27 * HOUR });
  });

  it("with every switch on the rows and the spend lane are drawn", () => {
    const { container } = cardCase();
    expect(header(container)).not.toBeNull();
    expect(lanes(container)).toHaveLength(1);
  });

  it("Authorizations off with a transaction selected: no rows section and no measure lane, while the track keeps the dot and the count includes it", () => {
    useLayers.setState({ showAuths: false });
    act(() => useSelection.setState({ selected: { kind: "auth", tx: TXNS[0] } }));
    const { container } = cardCase();
    expect(header(container)).toBeNull();
    expect(q(container, "[data-track-rows]")).toBeNull();
    expect(lanes(container)).toHaveLength(0);
    // The selected transaction's dot and the two sign-ins are on the track; the count reads 3 of 5.
    const track = q(container, '[role="slider"]');
    expect(qa(track, 'button[aria-label^="Jump to"]')).toHaveLength(3);
    expect(q(container, "[data-kinds-fold]").textContent).toContain("Events: 3 / 5");
  });

  it("Authorizations off with nothing selected leaves the same: no rows section, no lane", () => {
    useLayers.setState({ showAuths: false });
    const { container } = cardCase();
    expect(header(container)).toBeNull();
    expect(lanes(container)).toHaveLength(0);
  });

  it("Logins off leaves the transactions' rows and the spend lane whole, with or without a sign-in selected", () => {
    useLayers.setState({ showLogins: false });
    const { container } = cardCase();
    expect(q(container, "[data-track-header] button").getAttribute("aria-label")).toBe(rowsCountName("Merchant", 2));
    expect(lanes(container)).toHaveLength(1);
    act(() => useSelection.setState({ selected: { kind: "login", login: LOGINS[0] } }));
    expect(q(container, "[data-track-header] button").getAttribute("aria-label")).toBe(rowsCountName("Merchant", 2));
    expect(lanes(container)).toHaveLength(1);
    // The selected sign-in keeps its dot: three transactions and one sign-in.
    expect(q(container, "[data-kinds-fold]").textContent).toContain("Events: 4 / 5");
  });
});

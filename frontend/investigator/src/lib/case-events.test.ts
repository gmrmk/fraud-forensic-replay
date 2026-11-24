/**
 * The case's steppable events: every record the timeline draws as a dot, in time order, each
 * with what navigate() needs. A kind that draws as bars (a magnitude) and a kind that draws as
 * capsules (a decision mapping) are not steps.
 */
import { describe, it, expect } from "vitest";
import { caseStepEvents, selectionId } from "./case-events";
import { manifestRowToEntity } from "./adapters/manifest-row";
import { verdictNode } from "./verdict-fixtures";
import type { ScenarioNode } from "./scenarios";
import type { LoginEvent, Transaction } from "../types";

const node = (kind: string, extra: Partial<ScenarioNode> = {}): ScenarioNode => ({
  kind, label: kind, palette: "#fff", source: "json", coords: null, timestamp: "at", primary: "${id}", ...extra,
});
const stopNode = node("stop");
const loadNode = node("load", { magnitude: "weight" });
const at = (hm: string) => `2026-06-08T${hm}:00-05:00`;
const tx = (id: string, hm: string, fraud = 0) => ({ id, timestamp: at(hm), is_fraud: fraud }) as unknown as Transaction;
const login = (id: string, hm: string) => ({ id, timestamp: at(hm) }) as unknown as LoginEvent;

describe("caseStepEvents", () => {
  it("merges every dot kind into one list in time order, ties by id, each with its navigate target", () => {
    const stop = manifestRowToEntity(stopNode, { id: "s1", at: at("09:30") });
    const events = caseStepEvents(
      { transactions: [tx("t2", "10:00", 1), tx("t1", "09:00")], logins: [login("l1", "09:30")], accountEvents: [], transfers: [], entities: [stop] },
      [stopNode],
    );
    expect(events.map((e) => e.id)).toEqual(["t1", "l1", "s1", "t2"]);
    expect(events.map((e) => e.match.kind)).toEqual(["auth", "login", "entity", "fraud"]);
    expect(events[0].t).toBe(Date.parse(at("09:00")));
  });

  // A placed manifest: the decision node itself declares coords (verdictNode does), so its rows draw
  // as capsules on the globe and stay out of the steps.
  it("leaves out a kind that draws as bars, and a kind that draws as capsules when the manifest places it", () => {
    const load = manifestRowToEntity(loadNode, { id: "w1", at: at("09:10"), weight: 5 });
    const verdict = manifestRowToEntity(verdictNode, { id: "d1", state: "FAIL", finding: "X", when: at("09:20"), y: 1, x: 2 });
    const stop = manifestRowToEntity(stopNode, { id: "s1", at: at("09:30") });
    const events = caseStepEvents(
      { transactions: [], logins: [], accountEvents: [], transfers: [], entities: [load, verdict, stop] },
      [stopNode, loadNode, verdictNode],
    );
    expect(events.map((e) => e.id)).toEqual(["s1"]);
  });

  // C0: a manifest in which no node declares coords cannot place a decision, so its rows are steps.
  it("takes a decision's rows as steps when no node of the manifest declares coords", () => {
    const bare = { ...verdictNode, coords: null };
    const verdict = manifestRowToEntity(bare, { id: "d1", state: "FAIL", finding: "X", when: at("09:20") });
    const stop = manifestRowToEntity(stopNode, { id: "s1", at: at("09:30") });
    const load = manifestRowToEntity(loadNode, { id: "w1", at: at("09:10"), weight: 5 });
    const events = caseStepEvents(
      { transactions: [], logins: [], accountEvents: [], transfers: [], entities: [load, verdict, stop] },
      [stopNode, loadNode, bare],
    );
    expect(events.map((e) => e.id)).toEqual(["d1", "s1"]);
    expect(events[0].match.kind).toBe("entity");
  });

  it("keeps a decision out of the steps when another node of the manifest declares coords", () => {
    const bare = { ...verdictNode, coords: undefined };
    const placedStop = node("stop", { coords: { lat: "y", lng: "x" } });
    const verdict = manifestRowToEntity(bare, { id: "d1", state: "FAIL", finding: "X", when: at("09:20") });
    const stop = manifestRowToEntity(placedStop, { id: "s1", at: at("09:30"), y: 1, x: 2 });
    const events = caseStepEvents(
      { transactions: [], logins: [], accountEvents: [], transfers: [], entities: [verdict, stop] },
      [placedStop, bare],
    );
    expect(events.map((e) => e.id)).toEqual(["s1"]);
  });

  it("still leaves out a decision kind that declares a magnitude, placed or not", () => {
    const sized = { ...verdictNode, coords: null, magnitude: "size" };
    const verdict = manifestRowToEntity(sized, { id: "d1", state: "FAIL", finding: "X", when: at("09:20"), size: 3 });
    expect(caseStepEvents({ transactions: [], logins: [], accountEvents: [], transfers: [], entities: [verdict] }, [sized])).toEqual([]);
  });

  // The three landed stories (a card pack, an account-takeover pack, a platform-access pack) each
  // place their decision, on its own node or on a sibling's, so their step counts do not change:
  // each fixture below has one sign-in and one decision, and only the sign-in is a step.
  it("gives the same step count for manifests shaped like the three landed stories", () => {
    const coords = { lat: "y", lng: "x" };
    const decide = (extra: Partial<ScenarioNode>): ScenarioNode => ({ ...verdictNode, ...extra });
    const stories: ScenarioNode[][] = [
      [node("sign_in", { coords }), decide({ coords })],
      [node("sign_in", { coords }), decide({ coords: null })],
      [node("sign_in", { coords: null }), node("key_event", { coords }), decide({ coords })],
    ];
    for (const nodes of stories) {
      const entities = nodes.map((n, i) => manifestRowToEntity(n, { id: `e${i}`, at: at(`09:0${i}`), when: at(`09:0${i}`), y: 1, x: 2, state: "PASS" }));
      const events = caseStepEvents({ transactions: [], logins: [], accountEvents: [], transfers: [], entities }, nodes);
      expect(events, nodes.map((n) => n.kind).join()).toHaveLength(nodes.length - 1);
    }
  });

  it("leaves out a record with no time", () => {
    const timeless = manifestRowToEntity(node("place_like", { timestamp: undefined }), { id: "p1" });
    expect(caseStepEvents({ transactions: [], logins: [], accountEvents: [], transfers: [], entities: [timeless] }, [node("place_like", { timestamp: undefined })])).toEqual([]);
  });
});

describe("selectionId", () => {
  it("is the selected record's id for every kind, and null for none", () => {
    expect(selectionId(null)).toBeNull();
    expect(selectionId({ kind: "auth", tx: tx("t1", "09:00") })).toBe("t1");
    expect(selectionId({ kind: "login", login: login("l1", "09:30") })).toBe("l1");
    const stop = manifestRowToEntity(stopNode, { id: "s1", at: at("09:30") });
    expect(selectionId({ kind: "entity", entity: stop })).toBe("s1");
  });
});

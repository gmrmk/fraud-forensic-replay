import { describe, it, expect } from "vitest";
import { activeDecision, reachedDecisions } from "./active-decision";
import type { Decision } from "./decisions";
import type { Entity } from "./entity";

// ── Fixtures ─────────────────────────────────────────────────────────────────

function makeEntity(overrides: Partial<Entity> & Pick<Entity, "id" | "timestamp">): Entity {
  return {
    kind: "auth",
    coords: { lat: 29.7604, lng: -95.3698 },
    fields: {},
    displayMetadata: {
      primaryLabel: "Test Entity",
      secondaryLabel: "auth",
      paletteKind: "auth",
      pivotableFields: [],
    },
    ...overrides,
  };
}

function makeDecision(overrides: Partial<Decision> & Pick<Decision, "id" | "triggerEntityIds">): Decision {
  return {
    rule: { id: "impossible-travel", label: "Impossible Travel", kind: "geo-velocity" },
    subjectPathKind: "fraud",
    inputs: [],
    thresholds: [],
    verdict: "IMPOSSIBLE TRAVEL",
    decision: "DECLINE",
    evidence: [],
    severity: 0.98,
    ...overrides,
  };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("activeDecision", () => {
  it("(a) returns null when decisions is empty", () => {
    const result = activeDecision([], 1000, {});
    expect(result).toBeNull();
  });

  it("(b) returns null when trigger entity timestamp is AFTER the playhead", () => {
    const entity = makeEntity({ id: "e1", timestamp: 2000 });
    const decision = makeDecision({ id: "d1", triggerEntityIds: ["e1"] });
    const result = activeDecision([decision], 1000, { auth: [entity] });
    expect(result).toBeNull();
  });

  it("(c) returns { decision, triggerLngLat } when trigger entity timestamp <= playhead", () => {
    const entity = makeEntity({ id: "e1", timestamp: 1000, coords: { lat: 6.5244, lng: 3.3792 } });
    const decision = makeDecision({ id: "d1", triggerEntityIds: ["e1"] });
    const result = activeDecision([decision], 1000, { auth: [entity] });
    expect(result).not.toBeNull();
    expect(result!.decision).toBe(decision);
    expect(result!.triggerLngLat).toEqual({ lat: 6.5244, lng: 3.3792 });
  });

  it("(c) also returns when playhead is strictly greater than trigger entity timestamp", () => {
    const entity = makeEntity({ id: "e1", timestamp: 500, coords: { lat: 10.0, lng: 20.0 } });
    const decision = makeDecision({ id: "d1", triggerEntityIds: ["e1"] });
    const result = activeDecision([decision], 1000, { auth: [entity] });
    expect(result).not.toBeNull();
    expect(result!.triggerLngLat).toEqual({ lat: 10.0, lng: 20.0 });
  });

  it("(d) skips a decision whose trigger id is not in entitiesByKind → returns null", () => {
    const decision = makeDecision({ id: "d1", triggerEntityIds: ["missing-id"] });
    const result = activeDecision([decision], 9999, { auth: [] });
    expect(result).toBeNull();
  });

  it("picks the LAST trigger entity id from triggerEntityIds for evaluation", () => {
    // d.triggerEntityIds[-1] is the landing event. e1 is before playhead, e2 is after.
    // The last id is "e2", so the decision should NOT trigger (e2.timestamp > playhead).
    const e1 = makeEntity({ id: "e1", timestamp: 100, coords: { lat: 1, lng: 1 } });
    const e2 = makeEntity({ id: "e2", timestamp: 2000, coords: { lat: 2, lng: 2 } });
    const decision = makeDecision({ id: "d1", triggerEntityIds: ["e1", "e2"] });
    const result = activeDecision([decision], 1000, { auth: [e1, e2] });
    expect(result).toBeNull();
  });
});

describe("reachedDecisions", () => {
  it("returns every reached decision, highest-severity first", () => {
    const e = makeEntity({ id: "x", timestamp: 100, coords: { lat: 6, lng: 3 } });
    const rule = makeDecision({ id: "rule", triggerEntityIds: ["x"], severity: 0.98 });
    const ml = makeDecision({
      id: "ml",
      triggerEntityIds: ["x"],
      verdict: "MODEL ANOMALY",
      decision: "REVIEW",
      severity: 1.0,
    });
    const out = reachedDecisions([rule, ml], 500, { fraud: [e] });
    expect(out.map((d) => d.id)).toEqual(["ml", "rule"]); // severity desc
  });

  it("excludes decisions whose trigger the playhead has not reached", () => {
    const e = makeEntity({ id: "x", timestamp: 2000, coords: { lat: 6, lng: 3 } });
    const d = makeDecision({ id: "d", triggerEntityIds: ["x"] });
    expect(reachedDecisions([d], 1000, { fraud: [e] })).toEqual([]);
  });

  it("includes a behavioral (coordless) trigger that has been reached", () => {
    const e = makeEntity({ id: "ev", timestamp: 100, coords: null });
    const d = makeDecision({ id: "ato", triggerEntityIds: ["ev"], verdict: "ACCOUNT TAKEOVER" });
    expect(reachedDecisions([d], 500, { account_event: [e] }).map((x) => x.id)).toEqual(["ato"]);
  });
});

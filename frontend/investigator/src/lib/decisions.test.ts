import { describe, it, expect } from "vitest";
import {
  actionColor,
  actionRampVar,
  actionAlpha,
  actionRuleWidth,
  actionTextColor,
  actionRuleColor,
  mapDecision,
  type DecisionAction,
  type RawDecision,
} from "./decisions";

const RAW: RawDecision = {
  id: "decision:impossible-travel:lag1",
  rule: { id: "impossible-travel", label: "impossible-travel", kind: "geo-velocity" },
  subject_path_kind: "fraud",
  trigger_entity_ids: ["grocery", "lag1"],
  inputs: [{ label: "Elapsed", value: "9h 46m" }],
  thresholds: [{ label: "Implied travel speed", actual: "674 mph", bound: "600 mph jet-cruise", breached: true }],
  verdict: "IMPOSSIBLE TRAVEL",
  decision: "DECLINE",
  evidence: [
    { label: "Auth routing", value: "STIP", entity_ref: "lag1" },
    { label: "Currency", value: "NGN" },
  ],
  severity: 0.98,
};

describe("mapDecision", () => {
  it("maps snake_case API shape to camelCase Decision", () => {
    const d = mapDecision(RAW);
    expect(d.subjectPathKind).toBe("fraud");
    expect(d.triggerEntityIds).toEqual(["grocery", "lag1"]);
    expect(d.verdict).toBe("IMPOSSIBLE TRAVEL");
    expect(d.decision).toBe("DECLINE");
    expect(d.severity).toBeCloseTo(0.98);
  });

  it("maps evidence entity_ref -> entityRef (and leaves it undefined when absent)", () => {
    const d = mapDecision(RAW);
    expect(d.evidence[0].entityRef).toBe("lag1");
    expect(d.evidence[1].entityRef).toBeUndefined();
  });

  it("passes inputs and thresholds through unchanged", () => {
    const d = mapDecision(RAW);
    expect(d.inputs[0]).toEqual({ label: "Elapsed", value: "9h 46m" });
    expect(d.thresholds[0].breached).toBe(true);
  });

  it("passes sop.brief through verbatim (authored boilerplate, never generated)", () => {
    const brief =
      "One card used in person in two places too far apart for the time between. A physical card cannot be in both. Confirm location with the cardholder. Review surrounding card activity.";
    const withBrief: RawDecision = {
      ...RAW,
      rule: { ...RAW.rule, sop: { what: "w", why: "y", brief } },
    };
    expect(mapDecision(withBrief).rule.sop?.brief).toBe(brief);
  });

  it("tolerates a rule sop without brief (optional field)", () => {
    const noBrief: RawDecision = {
      ...RAW,
      rule: { ...RAW.rule, sop: { what: "w", why: "y" } },
    };
    expect(mapDecision(noBrief).rule.sop?.brief).toBeUndefined();
  });
});

describe("actionColor (mode-aware: verdict colors ride the risk ramp)", () => {
  it("DECLINE -> the alarm channel var", () => {
    expect(actionColor("DECLINE")).toBe("var(--alarm)");
  });
  it("the review/flag/step-up family -> the elevated (r3) var", () => {
    expect(actionColor("REVIEW")).toBe("var(--r3)");
    expect(actionColor("STEP-UP")).toBe("var(--r3)");
    expect(actionColor("STEP_UP")).toBe("var(--r3)");
    expect(actionColor("FLAG")).toBe("var(--r3)");
  });
  it("ALLOW -> the low-risk (r1) var, not an off-system success green", () => {
    expect(actionColor("ALLOW")).toBe("var(--r1)");
  });
});

describe("actionRampVar (bare CSS var name, for alpha builders)", () => {
  it("returns the ramp/alarm var without var() wrapping", () => {
    expect(actionRampVar("DECLINE")).toBe("--alarm");
    expect(actionRampVar("REVIEW")).toBe("--r3");
    expect(actionRampVar("ALLOW")).toBe("--r1");
  });
});

describe("actionAlpha (mode-aware translucent fill via the rgb-triplet idiom)", () => {
  it("builds rgb(var(--slot-rgb) / a) so the fill recolors per mode", () => {
    expect(actionAlpha("DECLINE", 0.4)).toBe("rgb(var(--alarm-rgb) / 0.4)");
    expect(actionAlpha("ALLOW", 0.08)).toBe("rgb(var(--r1-rgb) / 0.08)");
    expect(actionAlpha("REVIEW", 0.2)).toBe("rgb(var(--r3-rgb) / 0.2)");
  });
});

const ACTIONS: DecisionAction[] = ["DECLINE", "FLAG", "STEP-UP", "STEP_UP", "REVIEW", "ALLOW"];

describe("actionRuleWidth (the rule's width follows the colour slot)", () => {
  it("DECLINE (alarm) 3, the r3 family 2, ALLOW (r1) 1", () => {
    expect(actionRuleWidth("DECLINE")).toBe(3);
    for (const a of ["FLAG", "STEP-UP", "STEP_UP", "REVIEW"] as const) {
      expect(actionRuleWidth(a), a).toBe(2);
    }
    expect(actionRuleWidth("ALLOW")).toBe(1);
  });
});

describe("actionTextColor (the on-panel word colour of the slot)", () => {
  it("returns the alarm, r3 and r1 on-panel vars", () => {
    expect(actionTextColor("DECLINE")).toBe("var(--alarm-on-panel)");
    for (const a of ["FLAG", "STEP-UP", "STEP_UP", "REVIEW"] as const) {
      expect(actionTextColor(a), a).toBe("var(--r3-on-panel)");
    }
    expect(actionTextColor("ALLOW")).toBe("var(--r1-on-panel)");
  });
});

describe("actionRuleColor (full strength lit, 40 percent alpha dimmed)", () => {
  it("is the on-panel colour when emphasized and actionAlpha 0.4 when not", () => {
    for (const a of ACTIONS) {
      expect(actionRuleColor(a, true), a).toBe(actionTextColor(a));
      expect(actionRuleColor(a, false), a).toBe(actionAlpha(a, 0.4));
    }
    expect(actionRuleColor("DECLINE", false)).toBe("rgb(var(--alarm-rgb) / 0.4)");
  });
});

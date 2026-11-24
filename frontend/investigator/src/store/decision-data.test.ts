import { describe, it, expect, beforeEach } from "vitest";
import { useDecisionData } from "./decision-data";
import type { Decision } from "../lib/decisions";

function decision(id: string): Decision {
  return {
    id,
    rule: { id: "account-takeover", label: "account-takeover", kind: "login-anomaly" },
    subjectPathKind: "login",
    triggerEntityIds: ["gen-login-40927"],
    inputs: [],
    thresholds: [],
    verdict: "ACCOUNT TAKEOVER",
    decision: "STEP-UP",
    evidence: [],
    severity: 0.9,
  };
}

describe("useDecisionData store", () => {
  beforeEach(() => {
    useDecisionData.setState({ reached: [] });
  });

  it("starts empty", () => {
    expect(useDecisionData.getState().reached).toEqual([]);
  });

  it("setReached replaces the reached list", () => {
    useDecisionData.getState().setReached([decision("d-1")]);
    expect(useDecisionData.getState().reached.map((d) => d.id)).toEqual(["d-1"]);
  });

  it("keeps array identity when the id signature is unchanged (playhead churn guard)", () => {
    useDecisionData.getState().setReached([decision("d-1")]);
    const first = useDecisionData.getState().reached;
    useDecisionData.getState().setReached([decision("d-1")]);
    expect(useDecisionData.getState().reached).toBe(first);
  });

  it("replaces when membership changes", () => {
    useDecisionData.getState().setReached([decision("d-1")]);
    useDecisionData.getState().setReached([decision("d-1"), decision("d-2")]);
    expect(useDecisionData.getState().reached).toHaveLength(2);
  });
});

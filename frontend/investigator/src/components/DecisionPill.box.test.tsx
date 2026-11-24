import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { DecisionPill } from "./DecisionPill";
import type { Decision, DecisionAction } from "../lib/decisions";

// happy-dom drops a border colour holding rgb(var(...) / a), which is the form the real
// actionRuleColor returns for a dimmed chip. So the rule's wiring is read through a stand-in that
// returns a plain, distinct colour per (action, emphasized) pair. The real function keeps its own
// unit tests in lib/decisions.test.ts. A separate file, because vi.mock is file-wide.
vi.mock("../lib/decisions", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../lib/decisions")>();
  const lit: Record<string, string> = { DECLINE: "#aa0000", "STEP-UP": "#00aa00", ALLOW: "#0000aa" };
  const dim: Record<string, string> = { DECLINE: "#550000", "STEP-UP": "#005500", ALLOW: "#000055" };
  return {
    ...actual,
    actionRuleColor: (action: string, emphasized: boolean) => (emphasized ? lit : dim)[action] ?? "#777777",
  };
});

function decision(action: DecisionAction): Decision {
  return {
    id: "decision:account-takeover:gen-login-40927",
    rule: { id: "account-takeover", label: "account-takeover", kind: "login-anomaly" },
    subjectPathKind: "login",
    triggerEntityIds: ["gen-login-40927"],
    inputs: [],
    thresholds: [],
    verdict: "ACCOUNT TAKEOVER",
    decision: action,
    evidence: [],
    severity: 0.9,
  };
}

/** What this DOM reads back for a plain colour assigned as a border colour. */
function reads(colour: string): string {
  const probe = document.createElement("span");
  probe.style.borderLeftColor = colour;
  return probe.style.borderLeftColor;
}

describe("DecisionPill rule colour wiring", () => {
  it("the probe tells the stand-in colours apart", () => {
    expect(reads("#00aa00")).not.toBe("");
    expect(new Set(["#aa0000", "#00aa00", "#0000aa", "#550000", "#005500", "#000055"].map(reads)).size).toBe(6);
  });

  // kills Z6 (a dimmed chip's rule takes the ALLOW slot instead of its own action's).
  it("the rule takes its own action's colour, lit and dimmed", () => {
    for (const action of ["DECLINE", "STEP-UP", "ALLOW"] as const) {
      const lit = render(<DecisionPill decision={decision(action)} onClick={() => {}} />);
      const litRule = screen.getByRole("button").style.borderLeftColor;
      lit.unmount();
      const dim = render(<DecisionPill decision={decision(action)} onClick={() => {}} emphasized={false} />);
      const dimRule = screen.getByRole("button").style.borderLeftColor;
      dim.unmount();
      const [litWant, dimWant] = { DECLINE: ["#aa0000", "#550000"], "STEP-UP": ["#00aa00", "#005500"], ALLOW: ["#0000aa", "#000055"] }[action];
      expect(litRule, `${action} lit`).toBe(reads(litWant));
      expect(dimRule, `${action} dimmed`).toBe(reads(dimWant));
    }
  });
});

describe("DecisionPill box", () => {
  // kills Z5 (vertical padding 1px to 0); closes G4.
  // The chip is 15.75 px tall with 1 px above and below its 13.75 px of text, and the list's
  // gap-2.5 (pinned in DecisionsSection.test.tsx) then gives a 25.75 px pitch, against the
  // 24 px target of WCAG 2.5.8. With no vertical padding the pitch is 23.75 px.
  it("keeps 1 px above and below the words, 6 px before the rule's text, and a 7 px gap", () => {
    render(<DecisionPill decision={decision("STEP-UP")} onClick={() => {}} />);
    const btn = screen.getByRole("button");
    expect(btn.style.padding).toBe("1px 0px 1px 6px");
    expect(btn.style.gap).toBe("7px");
  });
});

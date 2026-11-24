import { describe, it, expect, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { DecisionsSection } from "./DecisionsSection";
import { useDecisionData } from "../../store/decision-data";
import { useSelection } from "../../store/selection";
import { useMatches } from "../../store/matches";
import { usePivotData } from "../../store/pivot-data";
import type { Decision } from "../../lib/decisions";
import type { LoginEvent } from "../../types";

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

const login: LoginEvent = {
  id: "l-1", account_id: "a", timestamp: "2026-05-25T10:07:00-05:00",
  ip: "192.0.2.1", ip_country: "US", ip_lat: 0, ip_lng: 0,
  ip_type: "datacenter", ip_asn: "AS64499", ip_reputation: 29,
  device_fp: "dev", user_agent: "ua", outcome: "challenge_passed",
  session_id: "sess-takeover", two_fa_used: 1,
  device_first_seen_at: "2026-05-25T10:07:00-05:00",
  device_trust: "new", auth_method: "password", challenge_reason: null,
};

describe("DecisionsSection", () => {
  beforeEach(() => {
    useDecisionData.setState({ reached: [] });
    useSelection.setState({ selected: null });
    useMatches.setState({ active: null });
    usePivotData.setState({ logins: [], accountEvents: [], transfers: [] });
  });

  it("renders nothing when no decision has been reached", () => {
    const { container } = render(<DecisionsSection />);
    expect(container.firstChild).toBeNull();
  });

  it("renders a pill per reached decision and opens rule mode on click", () => {
    useDecisionData.setState({ reached: [decision()] });
    render(<DecisionsSection />);
    fireEvent.click(
      screen.getByRole("button", { name: "STEP-UP ACCOUNT TAKEOVER. Open the rule trace." }),
    );
    const active = useMatches.getState().active;
    expect(active?.mode).toBe("rule");
    expect(active?.mode === "rule" && active.decisionId).toBe("decision:account-takeover:l-1");
  });

  it("hides the section on an entity unrelated to every reached decision", () => {
    useSelection.getState().selectLogin({ ...login, id: "l-baseline", session_id: "s-quiet" });
    useDecisionData.setState({ reached: [decision()] });
    const { container } = render(<DecisionsSection />);
    expect(container.firstChild).toBeNull();
  });

  it("shows the section on a session-linked entity (kill-chain, not a trigger)", () => {
    usePivotData.setState({
      logins: [login],
      accountEvents: [],
      transfers: [],
    });
    useSelection.getState().selectAccountEvent({
      id: "ae-1", account_id: "a", timestamp: "2026-05-25T10:14:00-05:00",
      kind: "profile_change", field: "email", old_value: "a", new_value: "b",
      payee_id: null, session_id: "sess-takeover", is_fraud: 1,
    });
    useDecisionData.setState({ reached: [decision()] });
    render(<DecisionsSection />);
    expect(
      screen.getByRole("button", { name: /STEP-UP ACCOUNT TAKEOVER/ }),
    ).toBeTruthy();
  });

  it("orders decisions triggered by the inspected entity first", () => {
    useSelection.getState().selectLogin(login);
    useDecisionData.setState({
      reached: [
        decision({
          id: "decision:ml:tx-9",
          rule: { id: "ml-card-anomaly", label: "model anomaly", kind: "ml-anomaly" },
          triggerEntityIds: ["tx-9"],
          verdict: "MODEL ANOMALY",
          decision: "REVIEW",
          severity: 0.99,
        }),
        decision(),
      ],
    });
    render(<DecisionsSection />);
    const pills = screen.getAllByRole("button");
    expect(pills[0].getAttribute("aria-label")).toContain("ACCOUNT TAKEOVER");
    expect(pills[1].getAttribute("aria-label")).toContain("MODEL ANOMALY");
  });

  it("condenses repeat triggers of one rule into one pill with a count chip", () => {
    useDecisionData.setState({
      reached: Array.from({ length: 12 }, (_, i) =>
        decision({ id: `decision:account-takeover:l-${i}`, triggerEntityIds: [`l-${i}`] }),
      ),
    });
    render(<DecisionsSection />);
    expect(screen.getAllByRole("button")).toHaveLength(1);
    expect(screen.getByText("×12")).toBeTruthy();
  });

  it("stacks the chips one per line, 10 px apart (more than a 24 px pitch for 15.75 px chips)", () => {
    useDecisionData.setState({
      reached: [
        decision(),
        decision({
          id: "decision:ml:tx-9",
          rule: { id: "ml-card-anomaly", label: "model anomaly", kind: "ml-anomaly" },
          triggerEntityIds: ["tx-9"],
          verdict: "MODEL ANOMALY",
          decision: "REVIEW",
        }),
      ],
    });
    render(<DecisionsSection />);
    const row = screen.getAllByRole("button")[0].closest("span");
    const list = row?.parentElement;
    expect(list).toBeTruthy();
    const cls = (list as HTMLElement).className.split(/\s+/);
    expect(cls).toContain("flex-col");
    // Measured on the built site: chips 15.75 px tall; 8 px apart gave a 23.75 px pitch.
    expect(cls).toContain("gap-2.5");
    expect(cls).not.toContain("flex-wrap");
  });

  it("prints the count beside a dimmed chip at full strength", () => {
    // The ATO rule is triggered by the selected login; the model rule's two
    // decisions are not, so its chip is dimmed and its count reads ×2.
    useSelection.getState().selectLogin(login);
    useDecisionData.setState({
      reached: [
        decision(),
        ...["tx-9", "tx-10"].map((t) =>
          decision({
            id: `decision:ml:${t}`,
            rule: { id: "ml-card-anomaly", label: "model anomaly", kind: "ml-anomaly" },
            triggerEntityIds: [t],
            verdict: "MODEL ANOMALY",
            decision: "REVIEW",
            severity: 0.5,
          }),
        ),
      ],
    });
    render(<DecisionsSection />);
    const count = screen.getByText("×2");
    expect(count.className).not.toMatch(/opacity-/);
    expect(count.style.opacity).toBe("");
    expect(count.style.color).toBe("var(--text-muted)");
  });
});

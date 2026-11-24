/**
 * B7: a Decision whose trigger/evidence ids are manifest-declared entities
 * (shipment / refund) resolves, reaches, boot-focuses and navigates like any other.
 */
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { resolveEntityRef } from "./decision-entities";
import { bootFocusEntity } from "./boot-focus";
import { reachedDecisions } from "./active-decision";
import { manifestRowToEntity } from "./adapters/manifest-row";
import { DecisionsSection } from "../components/inspector/DecisionsSection";
import { useDecisionData } from "../store/decision-data";
import { useSelection } from "../store/selection";
import type { Decision } from "./decisions";
import type { PivotContext } from "./matches";
import type { ScenarioNode } from "./scenarios";

const node = (kind: string, timestamp: string): ScenarioNode => ({
  kind, label: kind, palette: "#fff", source: "sql", coords: null, timestamp, primary: "${id}",
});
const t1 = manifestRowToEntity(node("shipment", "at"), { id: "sh-0100", at: "2026-05-12T10:14:00-05:00" });
const refund = manifestRowToEntity(node("refund", "at"), { id: "rfnd-1", at: "2026-05-29T10:05:00-05:00" });

const decision: Decision = {
  id: "decision:handoff-chain:sh-0100:rfnd-1",
  rule: { id: "handoff-chain", label: "handoff-chain", kind: "sequence" },
  subjectPathKind: "shipment",
  triggerEntityIds: [t1.id, refund.id],
  inputs: [], thresholds: [], verdict: "HANDOFF CHAIN", decision: "REVIEW",
  evidence: [{ label: "Refund", value: "$592.00", entityRef: refund.id }],
  severity: 0.95,
};

const ctx: PivotContext = { transactions: [], logins: [], places: [], entities: [t1, refund] };

describe("resolveEntityRef over generic entities", () => {
  it("resolves a shipment id and a refund id to the generic variant", () => {
    expect(resolveEntityRef(t1.id, ctx)).toEqual({ kind: "entity", entity: t1 });
    expect(resolveEntityRef(refund.id, ctx)).toEqual({ kind: "entity", entity: refund });
  });

  it("leaves an unknown id inert, and a context with no entities unchanged", () => {
    expect(resolveEntityRef("ghost", ctx)).toBeNull();
    expect(resolveEntityRef(t1.id, { transactions: [], logins: [], places: [] })).toBeNull();
  });
});

describe("reachedDecisions with a coordless generic landing trigger", () => {
  const byKind = { shipment: [t1], refund: [refund] };
  it("is reached once the playhead passes the refund, not before", () => {
    expect(reachedDecisions([decision], refund.timestamp - 1, byKind)).toEqual([]);
    expect(reachedDecisions([decision], refund.timestamp, byKind)).toEqual([decision]);
  });
});

describe("bootFocusEntity with generic entities", () => {
  it("opens the case on the landing refund", () => {
    const rows = { transactions: [], logins: [], accountEvents: [], transfers: [], entities: [t1, refund] };
    const focus = bootFocusEntity([decision], rows, { shipment: [t1], refund: [refund] }, refund.timestamp);
    expect(focus).toEqual({ kind: "entity", entity: refund });
  });
});

describe("DecisionsSection for a selected generic entity", () => {
  it("shows the pill when the selected shipment is one of the decision's triggers", () => {
    useDecisionData.setState({ reached: [decision] });
    useSelection.getState().selectEntity(t1);
    render(<DecisionsSection />);
    expect(screen.getByRole("button", { name: /HANDOFF CHAIN/ })).toBeTruthy();
  });

  it("stays hidden when the selected entity is not a trigger", () => {
    useDecisionData.setState({ reached: [decision] });
    useSelection.getState().selectEntity({ ...t1, id: "other" });
    const { container } = render(<DecisionsSection />);
    expect(container.firstChild).toBeNull();
  });
});

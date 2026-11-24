/**
 * B6: Matches over manifest-declared entities. The cross-domain link is the
 * card token: shipment<->shipment on card_token, refund<->refund on
 * refund_card_token (the ring's shared cash-out card).
 */
import { describe, it, expect, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { isMatchableField, matchBaseline, relatedEntities, type PivotContext } from "./matches";
import { manifestRowToEntity } from "./adapters/manifest-row";
import { MatchesTable } from "../components/match/MatchesTable";
import { useMatches } from "../store/matches";
import { useNavigation } from "../store/navigation";
import { useSelection } from "../store/selection";
import type { ScenarioNode } from "./scenarios";

const shipmentNode: ScenarioNode = {
  kind: "shipment", label: "Shipment", palette: "#ffb347", source: "sql", coords: null, timestamp: "issued_at",
  primary: "${id} · ${reason}", secondary: "${holder_name} · ${card_token}",
  pivotable: ["card_token", "holder_name"],
};
const orderNode: ScenarioNode = {
  kind: "order", label: "Order", palette: "#4da3ff", source: "sql", coords: null, timestamp: "created_at",
  primary: "${id}", secondary: "${holder_name}", pivotable: ["holder_name"],
};
const refundNode: ScenarioNode = {
  kind: "refund", label: "Refund", palette: "#ff5c5c", source: "sql", coords: null, timestamp: "processed_at",
  primary: "$${amount} refund", secondary: "${refund_card_token}", pivotable: ["refund_card_token"],
};

const RING_A = "tok-414720******4729";
const RING_B = "tok-414720******1590";
const CLEAN = "tok-522311******0187";

const shipment = (id: string, at: string, token: string, name: string) =>
  manifestRowToEntity(shipmentNode, { id, issued_at: at, card_token: token, holder_name: name, reason: "RETURN", original_shipment_no: "x" });
const entities = [
  manifestRowToEntity(orderNode, { id: "ORD-7K2D", created_at: "2026-05-12T10:09:00-05:00", holder_name: "Griff Hallam" }),
  shipment("t-a3", "2026-05-21T10:22:00-05:00", RING_A, "Mara Ellison"),
  shipment("t-a1", "2026-05-12T10:14:00-05:00", RING_A, "Griff Hallam"),
  shipment("t-a2", "2026-05-17T11:08:00-05:00", RING_A, "Griff Hallam"),
  shipment("t-b1", "2026-05-12T15:41:00-05:00", RING_B, "Noor Castellan"),
  shipment("t-b2", "2026-05-18T10:00:00-05:00", RING_B, "Noor Castellan"),
  manifestRowToEntity(refundNode, { id: "r-a", processed_at: "2026-05-29T10:05:00-05:00", amount: 592, refund_card_token: CLEAN, original_card_token: RING_A }),
  manifestRowToEntity(refundNode, { id: "r-b", processed_at: "2026-05-29T14:30:00-05:00", amount: 613, refund_card_token: CLEAN, original_card_token: RING_B }),
];
const ctx: PivotContext = { transactions: [], logins: [], places: [], entities };
const ids = (field: string, value: string, c = ctx) =>
  relatedEntities(field, value, c).map((m) => (m.kind === "entity" ? m.entity.id : m.kind));

describe("relatedEntities over generic entities", () => {
  it("lists every shipment paid with a token, oldest first", () => {
    expect(ids("card_token", RING_A)).toEqual(["t-a1", "t-a2", "t-a3"]);
  });

  it("lists every refund to the shared cash-out card", () => {
    expect(ids("refund_card_token", CLEAN)).toEqual(["r-a", "r-b"]);
  });

  it("matches across kinds that both declare the field pivotable", () => {
    expect(ids("holder_name", "Griff Hallam")).toEqual(["ORD-7K2D", "t-a1", "t-a2"]);
  });

  it("matches only fields the entity's node declares pivotable", () => {
    // original_card_token is a column on the refund but not a declared pivot.
    expect(ids("original_card_token", RING_A)).toEqual([]);
  });

  it("is strict equality: a different token or an empty value matches nothing", () => {
    expect(ids("card_token", "tok-414720******0000")).toEqual([]);
    expect(ids("card_token", "")).toEqual([]);
  });

  it("returns nothing for an unregistered field when the context carries no entities", () => {
    expect(ids("card_token", RING_A, { transactions: [], logins: [], places: [] })).toEqual([]);
  });
});

describe("matchBaseline over generic entities", () => {
  it("is the median size of the other token groups", () => {
    // RING_B has 2 shipments; its only peer group (RING_A) has 3.
    expect(matchBaseline("card_token", RING_B, ctx)).toBe(3);
  });

  it("is 0 when the value is the only group (the shared cash-out card)", () => {
    expect(matchBaseline("refund_card_token", CLEAN, ctx)).toBe(0);
  });
});

describe("isMatchableField", () => {
  it("accepts a field some loaded entity declares pivotable, and nothing else", () => {
    expect(isMatchableField("card_token", ctx)).toBe(true);
    expect(isMatchableField("card_token")).toBe(false);
    expect(isMatchableField("original_card_token", ctx)).toBe(false);
    expect(isMatchableField("card_id")).toBe(true);
    expect(isMatchableField(42, ctx)).toBe(false);
  });
});

describe("MatchesTable over generic entities", () => {
  beforeEach(() => {
    useMatches.setState({ active: null });
    useNavigation.setState({ panTarget: null, zoomTarget: null, pulseEntityId: null, pulseToken: 0 });
    useSelection.setState({ selected: null });
  });

  it("renders a row per entity from its display labels, and a click navigates to it", () => {
    useMatches.setState({ active: { mode: "field", field: "card_token", value: RING_A, parentKind: "shipment" } });
    render(<MatchesTable context={ctx} />);
    expect(screen.getAllByText("SHIPMENT")).toHaveLength(3);
    expect(screen.getByText("t-a2 · RETURN")).toBeInTheDocument();
    fireEvent.click(screen.getByText("t-a2 · RETURN").closest('[role="button"]')!);
    expect(useNavigation.getState().pulseEntityId).toBe("t-a2");
    expect(useSelection.getState().selected).toMatchObject({ kind: "entity" });
  });
});

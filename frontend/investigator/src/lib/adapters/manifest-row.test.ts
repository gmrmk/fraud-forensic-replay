import { describe, it, expect } from "vitest";
import { entityBounds, isGenericNode, manifestRowToEntity, unionBounds } from "./manifest-row";
import type { ScenarioNode } from "../scenarios";

const shipmentNode: ScenarioNode = {
  kind: "shipment", label: "Shipment", palette: "#ffb347", source: "sql",
  coords: { lat: "lat", lng: "lng" }, timestamp: "issued_at",
  primary: "${id} · ${reason}", secondary: "${holder_name} · ${card_token}",
  pivotable: ["card_token", "order_ref"],
};
const refundNode: ScenarioNode = {
  kind: "refund", label: "Refund", palette: "#ff5c5c", source: "sql",
  coords: null, timestamp: "processed_at",
  primary: "$${amount} refund", secondary: "${refund_card_token}",
  pivotable: ["refund_card_token"],
};
const row = {
  id: "sh-0106", reason: "RETURN", holder_name: "Mara Ellison",
  card_token: "tok-414720******4729", order_ref: "ORD-7K2D",
  lat: 29.7371, lng: -95.5262, issued_at: "2026-05-17T11:08:00-05:00",
};

describe("manifestRowToEntity", () => {
  it("maps id, kind, fields and the declared pivotable fields", () => {
    const e = manifestRowToEntity(shipmentNode, row);
    expect(e.id).toBe("sh-0106");
    expect(e.kind).toBe("shipment");
    expect(e.fields).toBe(row);
    expect(e.displayMetadata.pivotableFields).toEqual(["card_token", "order_ref"]);
    expect(e.displayMetadata.paletteKind).toBe("shipment");
  });

  it("reads coords from the columns the node names", () => {
    expect(manifestRowToEntity(shipmentNode, row).coords).toEqual({ lat: 29.7371, lng: -95.5262 });
  });

  it("gives a coordless node (coords: null) null coords, never a sentinel", () => {
    const e = manifestRowToEntity(refundNode, { id: "r1", amount: 592, processed_at: "2026-05-29T10:05:00-05:00" });
    expect(e.coords).toBeNull();
  });

  it("gives null coords when the named columns are null or not finite", () => {
    expect(manifestRowToEntity(shipmentNode, { ...row, lat: null, lng: null }).coords).toBeNull();
    expect(manifestRowToEntity(shipmentNode, { ...row, lat: "x", lng: -95 }).coords).toBeNull();
  });

  it("substitutes ${field} placeholders into the labels (money fields to 2 decimals)", () => {
    const e = manifestRowToEntity(shipmentNode, row);
    expect(e.displayMetadata.primaryLabel).toBe("sh-0106 · RETURN");
    expect(e.displayMetadata.secondaryLabel).toBe("Mara Ellison · tok-414720******4729");
    const r = manifestRowToEntity(refundNode, { id: "r1", amount: 592, refund_card_token: "tok-522311******0187", processed_at: "2026-05-29T10:05:00-05:00" });
    expect(r.displayMetadata.primaryLabel).toBe("$592.00 refund");
  });

  it("parses the timestamp column with its UTC offset", () => {
    const e = manifestRowToEntity(shipmentNode, row);
    expect(e.timestamp).toBe(Date.parse("2026-05-17T16:08:00Z"));
  });

  it("uses 0 (timeless, like a place) when the timestamp is absent or unparseable", () => {
    expect(manifestRowToEntity(shipmentNode, { ...row, issued_at: null }).timestamp).toBe(0);
    expect(manifestRowToEntity({ ...shipmentNode, timestamp: undefined }, row).timestamp).toBe(0);
  });
});

describe("isGenericNode", () => {
  it("is true only for sql nodes outside the six concrete kinds", () => {
    expect(isGenericNode(shipmentNode)).toBe(true);
    for (const kind of ["auth", "fraud", "login", "place", "account_event", "transfer"]) {
      expect(isGenericNode({ ...shipmentNode, kind })).toBe(false);
    }
    expect(isGenericNode({ ...shipmentNode, source: "places-api" })).toBe(false);
  });
});

describe("entityBounds", () => {
  it("spans the timestamped entities and ignores timeless (0) ones", () => {
    const mk = (ts: number) => ({ ...manifestRowToEntity(shipmentNode, row), timestamp: ts });
    expect(entityBounds([mk(30), mk(0), mk(10), mk(20)])).toEqual({ min: 10, max: 30 });
  });

  it("is null when nothing carries a timestamp", () => {
    expect(entityBounds([])).toBeNull();
  });
});

describe("unionBounds", () => {
  it("covers both spans and passes a lone span through", () => {
    expect(unionBounds({ min: 10, max: 20 }, { min: 5, max: 15 })).toEqual({ min: 5, max: 20 });
    expect(unionBounds(null, { min: 5, max: 15 })).toEqual({ min: 5, max: 15 });
    expect(unionBounds({ min: 5, max: 15 }, null)).toEqual({ min: 5, max: 15 });
    expect(unionBounds(null, null)).toBeNull();
  });
});

describe("isGenericNode (json source)", () => {
  it("boots a file-backed node through the generic path", () => {
    const node = {
      kind: "message", label: "Email", palette: "#ffd166", source: "json", file: "data/notes.json",
      coords: { lat: "lat", lng: "lng" }, timestamp: "received_at",
      primary: "${sender}", secondary: "${topic}", pivotable: ["ip_address"],
    } as unknown as Parameters<typeof isGenericNode>[0];
    expect(isGenericNode(node)).toBe(true);
  });
});

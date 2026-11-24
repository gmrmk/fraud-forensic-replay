// frontend/investigator/src/lib/pulse-target.test.ts
import { describe, it, expect } from "vitest";
import { resolvePulseTarget } from "./pulse-target";
import type { LoginEvent, Place, Transaction } from "../types";

// Minimal fixtures - only the fields resolvePulseTarget actually reads.
function tx(id: string, lng: number, lat: number, is_fraud = 0): Transaction {
  return { id, merchant_lng: lng, merchant_lat: lat, is_fraud } as unknown as Transaction;
}
function login(id: string, lng: number, lat: number): LoginEvent {
  return { id, ip_lng: lng, ip_lat: lat } as unknown as LoginEvent;
}
function place(id: string, lng: number, lat: number): Place {
  return { id, lng, lat } as unknown as Place;
}

describe("resolvePulseTarget", () => {
  const txs = [tx("a1", -95.3, 29.7, 0), tx("f1", 3.4, 6.5, 1)];
  const logins = [login("l1", -80.1, 25.7)];
  const places = [place("p1", -118.2, 34.0)];

  it("returns null for a null id", () => {
    expect(resolvePulseTarget(null, txs, logins, places)).toBeNull();
  });

  it("returns null when the id matches nothing", () => {
    expect(resolvePulseTarget("nope", txs, logins, places)).toBeNull();
  });

  it("resolves a non-fraud transaction to kind auth at merchant coords", () => {
    expect(resolvePulseTarget("a1", txs, logins, places)).toEqual({
      pos: { lng: -95.3, lat: 29.7 },
      kind: "auth",
    });
  });

  it("resolves a fraud transaction to kind fraud at merchant coords", () => {
    expect(resolvePulseTarget("f1", txs, logins, places)).toEqual({
      pos: { lng: 3.4, lat: 6.5 },
      kind: "fraud",
    });
  });

  it("resolves a login to kind login at ip coords", () => {
    expect(resolvePulseTarget("l1", txs, logins, places)).toEqual({
      pos: { lng: -80.1, lat: 25.7 },
      kind: "login",
    });
  });

  it("resolves a place to kind place at its coords", () => {
    expect(resolvePulseTarget("p1", txs, logins, places)).toEqual({
      pos: { lng: -118.2, lat: 34.0 },
      kind: "place",
    });
  });

  it("prefers transactions over logins/places when an id collides", () => {
    const collidingLogin = [login("a1", 0, 0)];
    const t = resolvePulseTarget("a1", txs, collidingLogin, places);
    expect(t?.kind).toBe("auth");
  });
});

describe("resolvePulseTarget over generic entities", () => {
  const ent = (id: string, kind: string, coords: { lat: number; lng: number } | null) =>
    ({ id, kind, coords, timestamp: 1, fields: {}, displayMetadata: {} }) as never;
  const entities = [ent("hop-1", "hop", { lat: 51.47, lng: -0.45 }), ent("rfnd-1", "refund", null)];

  it("resolves a placed entity to kind generic, carrying its manifest kind", () => {
    expect(resolvePulseTarget("hop-1", [], [], [], entities)).toEqual({
      pos: { lng: -0.45, lat: 51.47 },
      kind: "generic",
      entityKind: "hop",
    });
  });

  it("returns null for a coordless entity (nothing on the globe to bloom)", () => {
    expect(resolvePulseTarget("rfnd-1", [], [], [], entities)).toBeNull();
  });
});

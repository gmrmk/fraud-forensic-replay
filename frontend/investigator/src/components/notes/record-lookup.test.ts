/**
 * The record lookup: what it resolves (time, the record as the one function reads it, the match for a
 * press), what it refuses, and that it walks a context's lists once and answers each record once.
 */
import { describe, it, expect } from "vitest";
import { lookupFromContext } from "./record-lookup";
import { drawRecordOf } from "../../lib/marks/draw";
import type { Entity } from "../../lib/entity";
import type { PivotContext } from "../../lib/matches";
import type { AccountEvent, LoginEvent, Place, Transaction, Transfer } from "../../types";

const NOW = "2026-11-16T10:00:00Z";
const tx = (id: string, isFraud: number): Transaction =>
  ({ id, timestamp: NOW, is_fraud: isFraud, merchant_name: "Corner Store", merchant_lat: 29.76, merchant_lng: -95.37 }) as unknown as Transaction;
const login = (id: string): LoginEvent => ({ id, timestamp: NOW, ip: "192.0.2.1", ip_lat: 3, ip_lng: 4 }) as unknown as LoginEvent;
const event = (id: string): AccountEvent => ({ id, timestamp: NOW, kind: "payee_add", field: null }) as unknown as AccountEvent;
const transfer = (id: string): Transfer => ({ id, timestamp: NOW, rail: "wire", status: "sent" }) as unknown as Transfer;
const place = (id: string): Place => ({ id, name: "Pier", category: "harbour", lat: 5, lng: 6 });
const entity = (id: string, kind: string, timestamp: number): Entity => ({
  id,
  kind,
  timestamp,
  coords: { lat: 7, lng: 8 },
  fields: {},
  displayMetadata: { primaryLabel: `Label ${id}`, secondaryLabel: "", paletteKind: kind, pivotableFields: [] },
});

const CTX: PivotContext = {
  transactions: [tx("tx-1", 0), tx("tx-2", 1)],
  logins: [login("lg-1")],
  places: [place("pl-1")],
  accountEvents: [event("ae-1")],
  transfers: [transfer("tf-1")],
  entities: [entity("si-1", "signin", Date.parse(NOW)), entity("org-1", "org", 0)],
};

describe("lookupFromContext: time, draw and match", () => {
  const lookup = lookupFromContext(CTX);

  it("gives a record's time from the navigation rule: parsed for a timed record, null for a place or an untimed entity", () => {
    expect(lookup({ kind: "auth", id: "tx-1" })?.time).toBe(Date.parse(NOW));
    expect(lookup({ kind: "login", id: "lg-1" })?.time).toBe(Date.parse(NOW));
    expect(lookup({ kind: "account_event", id: "ae-1" })?.time).toBe(Date.parse(NOW));
    expect(lookup({ kind: "transfer", id: "tf-1" })?.time).toBe(Date.parse(NOW));
    expect(lookup({ kind: "signin", id: "si-1" })?.time).toBe(Date.parse(NOW));
    expect(lookup({ kind: "org", id: "org-1" })?.time).toBeNull();
    expect(lookup({ kind: "place", id: "pl-1" })?.time).toBeNull();
  });

  it("gives the record as the one function reads it", () => {
    const info = lookup({ kind: "signin", id: "si-1" });
    expect(info?.draw).toEqual(drawRecordOf({ kind: "entity", entity: CTX.entities![0] }));
    expect(lookup({ kind: "auth", id: "tx-1" })?.draw).toEqual(drawRecordOf({ kind: "auth", tx: CTX.transactions[0] }));
    expect(lookup({ kind: "place", id: "pl-1" })?.draw).toEqual(drawRecordOf({ kind: "place", place: CTX.places[0] }));
  });

  it("finds a fraud transaction by an auth link, and an auth one by a fraud link", () => {
    const asAuth = lookup({ kind: "auth", id: "tx-2" });
    expect(asAuth?.match.kind).toBe("fraud");
    expect(asAuth?.draw.kind).toBe("fraud");
    expect(lookup({ kind: "fraud", id: "tx-2" })?.match.kind).toBe("fraud");
    expect(lookup({ kind: "fraud", id: "tx-1" })?.match.kind).toBe("auth");
  });

  it("answers each link with that link's own kind word, whichever was asked first", () => {
    // Two notes may link one charge, one as auth and one as fraud; each row and mark prints its own word.
    const authFirst = lookupFromContext(CTX);
    expect(authFirst({ kind: "auth", id: "tx-2" })?.kind).toBe("auth");
    expect(authFirst({ kind: "fraud", id: "tx-2" })?.kind).toBe("fraud");
    const fraudFirst = lookupFromContext(CTX);
    expect(fraudFirst({ kind: "fraud", id: "tx-2" })?.kind).toBe("fraud");
    expect(fraudFirst({ kind: "auth", id: "tx-2" })?.kind).toBe("auth");
    // Both answers hold the one match the lookup found, and each is the same object when asked again.
    expect(authFirst({ kind: "auth", id: "tx-2" })?.match).toBe(authFirst({ kind: "fraud", id: "tx-2" })?.match);
    expect(authFirst({ kind: "fraud", id: "tx-2" })).toBe(authFirst({ kind: "fraud", id: "tx-2" }));
  });

  it("holds the match the lookup found, so a press can navigate by it", () => {
    expect(lookup({ kind: "login", id: "lg-1" })?.match).toEqual({ kind: "login", login: CTX.logins[0] });
    expect(lookup({ kind: "signin", id: "si-1" })?.match).toEqual({ kind: "entity", entity: CTX.entities![0] });
    expect(lookup({ kind: "transfer", id: "tf-1" })?.match).toEqual({ kind: "transfer", transfer: CTX.transfers![0] });
  });

  it("gives a place link a place match, no time and its place", () => {
    const info = lookup({ kind: "place", id: "pl-1" });
    expect(info?.match).toEqual({ kind: "place", place: CTX.places[0] });
    expect(info?.time).toBeNull();
    expect(info?.lngLat).toEqual({ lng: 6, lat: 5 });
    expect(info?.headline).toBe("Pier");
  });

  it("keeps the link's kind as passed, and the headline and place as before", () => {
    const info = lookup({ kind: "signin", id: "si-1" });
    expect(info).toMatchObject({ kind: "signin", headline: "Label si-1", lngLat: { lng: 8, lat: 7 } });
    expect(lookup({ kind: "auth", id: "tx-1" })).toMatchObject({ kind: "auth", headline: "Corner Store", lngLat: { lng: -95.37, lat: 29.76 } });
    expect(lookup({ kind: "login", id: "lg-1" })?.lngLat).toEqual({ lng: 4, lat: 3 });
    expect(lookup({ kind: "account_event", id: "ae-1" })?.lngLat).toBeNull();
  });
});

describe("lookupFromContext: what it refuses", () => {
  const lookup = lookupFromContext(CTX);

  it("is null for an id the data does not hold", () => {
    expect(lookup({ kind: "auth", id: "nope" })).toBeNull();
    expect(lookup({ kind: "place", id: "nope" })).toBeNull();
  });

  it("is null when the kind does not agree with the record", () => {
    expect(lookup({ kind: "login", id: "tx-1" })).toBeNull();
    expect(lookup({ kind: "org", id: "si-1" })).toBeNull();
    expect(lookup({ kind: "signin", id: "pl-1" })).toBeNull();
  });

  it("looks a place up by a place link only, and an entity of the same id wins over a place", () => {
    const both = lookupFromContext({ ...CTX, entities: [entity("pl-1", "signin", 0)] });
    // The entity matches the id first; its kind is not "place", so the link is refused (as before).
    expect(both({ kind: "place", id: "pl-1" })).toBeNull();
    expect(both({ kind: "signin", id: "pl-1" })?.match.kind).toBe("entity");
  });

  it("takes the first record of an id, in the order transactions, logins, account events, transfers, entities", () => {
    const dup = lookupFromContext({ transactions: [tx("x-1", 0)], logins: [login("x-1")], places: [], entities: [entity("x-1", "signin", 0)] });
    expect(dup({ kind: "auth", id: "x-1" })?.match.kind).toBe("auth");
    expect(dup({ kind: "login", id: "x-1" })).toBeNull();
    const second = lookupFromContext({ transactions: [], logins: [login("x-1")], places: [], entities: [entity("x-1", "signin", 0)] });
    expect(second({ kind: "login", id: "x-1" })?.match.kind).toBe("login");
    const firstOfTwo = lookupFromContext({ transactions: [tx("x-2", 0), tx("x-2", 1)], logins: [], places: [] });
    expect(firstOfTwo({ kind: "auth", id: "x-2" })?.match).toEqual({ kind: "auth", tx: expect.objectContaining({ is_fraud: 0 }) });
  });
});

describe("lookupFromContext: one index and one answer per record", () => {
  function counted<T extends object>(list: T[]): { list: T[]; passes: () => number } {
    let passes = 0;
    const proxy = new Proxy(list, {
      get(target, prop, receiver) {
        if (prop === Symbol.iterator) passes += 1;
        return Reflect.get(target, prop, receiver);
      },
    });
    return { list: proxy, passes: () => passes };
  }

  it("answers a second lookup of one record with the identical object, and a missing record with null again", () => {
    const lookup = lookupFromContext(CTX);
    const first = lookup({ kind: "auth", id: "tx-1" });
    expect(first).not.toBeNull();
    expect(lookup({ kind: "auth", id: "tx-1" })).toBe(first);
    expect(lookup({ kind: "nope", id: "none" })).toBeNull();
    expect(lookup({ kind: "nope", id: "none" })).toBeNull();
  });

  it("walks every list of the context once for each lookup function, however many records it is asked for", () => {
    const t = counted(CTX.transactions.slice());
    const l = counted(CTX.logins.slice());
    const a = counted((CTX.accountEvents ?? []).slice());
    const f = counted((CTX.transfers ?? []).slice());
    const e = counted((CTX.entities ?? []).slice());
    const p = counted(CTX.places.slice());
    const lookup = lookupFromContext({ transactions: t.list, logins: l.list, places: p.list, accountEvents: a.list, transfers: f.list, entities: e.list });
    for (const link of [
      { kind: "auth", id: "tx-1" },
      { kind: "auth", id: "tx-1" },
      { kind: "login", id: "lg-1" },
      { kind: "account_event", id: "ae-1" },
      { kind: "transfer", id: "tf-1" },
      { kind: "signin", id: "si-1" },
      { kind: "place", id: "pl-1" },
      { kind: "place", id: "nope" },
    ]) {
      lookup(link);
    }
    expect([t, l, a, f, e, p].map((c) => c.passes())).toEqual([1, 1, 1, 1, 1, 1]);
  });

  it("walks nothing until the first lookup, and a second lookup function walks its own", () => {
    const t = counted(CTX.transactions.slice());
    const ctx = { ...CTX, transactions: t.list };
    const one = lookupFromContext(ctx);
    expect(t.passes()).toBe(0);
    one({ kind: "auth", id: "tx-1" });
    const two = lookupFromContext(ctx);
    two({ kind: "auth", id: "tx-1" });
    expect(t.passes()).toBe(2);
    expect(two({ kind: "auth", id: "tx-1" })).not.toBe(one({ kind: "auth", id: "tx-1" }));
  });
});

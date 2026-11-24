/**
 * The Yours row's counts: one record per row of the five lists of the case, in the order the lists are
 * named; `all` is every record, `touched` the records any of the six facets holds for (a record that is
 * pinned and noted counts once), and each facet counts its own records. Places are not in `all`. The
 * facts come from the real `factsIndex`, so a fraud transaction stored as an auth node is touched.
 * Nothing here reads a clock or the switches.
 */
import { describe, it, expect } from "vitest";
import { caseDrawRecords, yoursCounts } from "./yours-counts";
import { factsIndex } from "./marks/select";
import { YOURS_FACETS } from "./marks/types";
import { makeNode, makeNote, makePath } from "./notes/test-fixtures";
import type { Entity } from "./entity";
import type { AccountEvent, LoginEvent, Transaction, Transfer } from "../types";

const WHEN = "2026-11-16T10:00:00Z";
const tx = (id: string, isFraud: number): Transaction => ({ id, timestamp: WHEN, is_fraud: isFraud }) as unknown as Transaction;
const login = (id: string): LoginEvent => ({ id, timestamp: WHEN }) as unknown as LoginEvent;
const event = (id: string): AccountEvent => ({ id, timestamp: WHEN }) as unknown as AccountEvent;
const transfer = (id: string): Transfer => ({ id, timestamp: WHEN }) as unknown as Transfer;
const entity = (kind: string, id: string): Entity => ({ kind, id, timestamp: Date.parse(WHEN), fields: {} }) as unknown as Entity;

const LISTS = {
  transactions: [tx("t1", 0), tx("t2", 1)],
  logins: [login("l1")],
  accountEvents: [event("a1")],
  transfers: [transfer("x1")],
  entities: [entity("sign", "s1"), entity("sign", "s2")],
};
const SCENARIO = "card-fraud";
const nothing = factsIndex(SCENARIO, [], [], []);

describe("caseDrawRecords", () => {
  it("makes one record per row of the five lists, in the order transactions, logins, account events, transfers, entities", () => {
    const recs = caseDrawRecords(LISTS);
    expect(recs.map((r) => `${r.kind}:${r.id}`)).toEqual([
      "auth:t1",
      "fraud:t2",
      "login:l1",
      "account_event:a1",
      "transfer:x1",
      "sign:s1",
      "sign:s2",
    ]);
  });

  it("gives a fraud transaction the kind fraud and an empty case no record", () => {
    expect(caseDrawRecords(LISTS).find((r) => r.id === "t2")?.kind).toBe("fraud");
    expect(caseDrawRecords({ transactions: [], logins: [], accountEvents: [], transfers: [], entities: [] })).toEqual([]);
  });
});

describe("yoursCounts", () => {
  const recs = caseDrawRecords(LISTS);

  it("counts every record as all and nothing as touched when the investigator did nothing", () => {
    const c = yoursCounts(recs, nothing);
    expect(c.all).toBe(7);
    expect(c.touched).toBe(0);
    for (const f of YOURS_FACETS) expect(c.facets[f]).toBe(0);
  });

  it("counts each facet over the records it holds for, and touched once per record", () => {
    const facts = factsIndex(
      SCENARIO,
      [
        makeNode({ record: { kind: "sign", id: "s1" }, pinned: true }),
        makeNode({ record: { kind: "login", id: "l1" }, disposition: "pass" }),
        makeNode({ record: { kind: "transfer", id: "x1" }, disposition: "fail", category: "Mule" }),
        makeNode({ record: { kind: "account_event", id: "a1" }, disposition: "wait" }),
      ],
      // s1 is pinned and noted: touched counts it once. s2 is only noted.
      [makeNote({ link: { kind: "sign", id: "s1" } }), makeNote({ id: "note-" + "b".repeat(32), seq: 2, link: { kind: "sign", id: "s2" } })],
      // x1 is in a path as well as FAIL; t1 is in a path alone.
      [makePath({ stops: [{ kind: "auth", id: "t1" }, { kind: "transfer", id: "x1" }] })],
    );
    const c = yoursCounts(recs, facts);
    expect(c.all).toBe(7);
    // touched: s1 (pinned and noted), s2 (noted), l1 (PASS), x1 (FAIL and path), a1 (WAITING), t1 (path alone).
    expect(c.touched).toBe(6);
    expect(c.facets).toEqual({ pinned: 1, pass: 1, fail: 1, wait: 1, noted: 2, inPath: 2 });
  });

  it("finds a fraud transaction through a node stored as an auth record", () => {
    const facts = factsIndex(SCENARIO, [makeNode({ record: { kind: "auth", id: "t2" }, pinned: true })], [], []);
    const c = yoursCounts(recs, facts);
    expect(c.touched).toBe(1);
    expect(c.facets.pinned).toBe(1);
  });

  it("counts nowhere a node whose record is not in the data, and a note or path of another story", () => {
    const facts = factsIndex(
      SCENARIO,
      [makeNode({ record: { kind: "sign", id: "gone" }, pinned: true })],
      [makeNote({ scenario: "priya-ato", link: { kind: "sign", id: "s1" } })],
      [makePath({ scenario: "priya-ato", stops: [{ kind: "sign", id: "s1" }, { kind: "sign", id: "s2" }] })],
    );
    const c = yoursCounts(recs, facts);
    expect(c.touched).toBe(0);
    expect(c.facets.pinned).toBe(0);
  });

  it("does not count a place: it is not in the five lists", () => {
    // The case lists carry no places, so no place is in all; a facts function that holds a place changes nothing.
    const facts = factsIndex(SCENARIO, [makeNode({ record: { kind: "place", id: "p1" }, pinned: true })], [], []);
    const c = yoursCounts(recs, facts);
    expect(c.all).toBe(7);
    expect(c.touched).toBe(0);
  });

  it("is a pure function of its two arguments: the same input gives an equal answer", () => {
    const facts = factsIndex(SCENARIO, [makeNode({ record: { kind: "sign", id: "s1" }, pinned: true })], [], []);
    expect(yoursCounts(recs, facts)).toEqual(yoursCounts(recs, facts));
  });
});

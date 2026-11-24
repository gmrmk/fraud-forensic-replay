import { describe, it, expect } from "vitest";
import soloSource from "./solo.ts?raw";
import { decisionInSolo, narrowBySolo, soloHasData, soloIds, type Solo } from "./solo";
import { manifestRowToEntity } from "./adapters/manifest-row";
import type { PivotContext } from "./matches";
import type { ScenarioNode } from "./scenarios";
import type { AccountEvent, LoginEvent, Place, Transaction, Transfer } from "../types";

// Fixtures are written here, shaped like the stories: seed rows (card, session) and
// manifest-declared rows whose grouping field is declared pivotable by the node.

function tx(id: string, card_id: string): Transaction {
  return {
    id, card_id, account_id: "a", timestamp: "2026-05-26T10:00:00-05:00", amount: 5,
    merchant_name: "m", merchant_lat: 0, merchant_lng: 0, merchant_country: "US", mcc: "5814",
    category: "c", is_card_present: 1, is_fraud: 0, balance_after: 1, auth_response_code: "00",
    pos_entry_mode: "chip", network_ref_number: "n", terminal_id: "t", acquirer: "q",
    auth_source: "issuer", risk_score: 1, is_3ds: 0, currency: "USD",
  };
}
function login(id: string, session_id: string): LoginEvent {
  return {
    id, account_id: "a", timestamp: "2026-05-26T08:00:00-05:00", ip: "1", ip_country: "US",
    ip_lat: 0, ip_lng: 0, device_fp: "d", user_agent: "u", outcome: "success", two_fa_used: 0,
    session_id, ip_type: "r", ip_asn: "as", ip_reputation: 1, device_first_seen_at: "x",
    device_trust: "known", auth_method: "password", challenge_reason: null,
  };
}
function accountEvent(id: string, session_id: string): AccountEvent {
  return {
    id, account_id: "a", timestamp: "2026-05-25T10:14:00-05:00", kind: "profile_change",
    field: "email", old_value: null, new_value: null, payee_id: null, session_id, is_fraud: 0,
  };
}
function transfer(id: string, session_id: string): Transfer {
  return {
    id, account_id: "a", timestamp: "2026-05-25T10:36:00-05:00", amount: 1, payee_id: "p",
    rail: "wire", status: "sent", decline_reason: null, session_id, is_fraud: 0,
  };
}

const eventNode: ScenarioNode = {
  kind: "ping", label: "Ping", palette: "#4da3ff", source: "sql", coords: null, timestamp: "at",
  primary: "${id}", secondary: "${grp}", pivotable: ["grp"],
};
const barNode: ScenarioNode = {
  kind: "bar", label: "Bar", palette: "#ffb347", source: "sql", coords: null, timestamp: "at",
  primary: "${id}", secondary: "${grp}", pivotable: ["grp"],
};
const ent = (node: ScenarioNode, id: string, grp: string) =>
  manifestRowToEntity(node, { id, at: "2026-05-12T10:09:00-05:00", grp });

const place: Place = { id: "pl-1" } as unknown as Place;
const places = [place];

const ctx: PivotContext = {
  transactions: [tx("tx-1", "c1"), tx("tx-2", "c2"), tx("tx-3", "c1")],
  logins: [login("l-1", "s-A"), login("l-2", "s-B")],
  places,
  accountEvents: [accountEvent("ae-1", "s-A"), accountEvent("ae-2", "s-B")],
  transfers: [transfer("tr-1", "s-A"), transfer("tr-2", "s-B")],
  entities: [
    ent(eventNode, "e-1", "Acme"),
    ent(eventNode, "e-2", "Borne"),
    ent(barNode, "b-1", "Acme"),
    ent(barNode, "b-2", "Cairn"),
  ],
};
const idsOf = (xs: readonly { id: string }[] | undefined) => (xs ?? []).map((x) => x.id);

describe("narrowBySolo", () => {
  it("returns the same context when nothing is soloed", () => {
    expect(narrowBySolo(ctx, null)).toBe(ctx);
  });

  it("narrows transactions by a seed field", () => {
    const out = narrowBySolo(ctx, { field: "card_id", value: "c1" });
    expect(idsOf(out.transactions)).toEqual(["tx-1", "tx-3"]);
    // c1 is a card, not a session or a manifest field: no other list holds it
    expect(out.logins).toEqual([]);
    expect(out.accountEvents).toEqual([]);
    expect(out.transfers).toEqual([]);
    expect(out.entities).toEqual([]);
  });

  it("narrows logins, account events and transfers on the one session id", () => {
    const out = narrowBySolo(ctx, { field: "session_id", value: "s-A" });
    expect(idsOf(out.logins)).toEqual(["l-1"]);
    expect(idsOf(out.accountEvents)).toEqual(["ae-1"]);
    expect(idsOf(out.transfers)).toEqual(["tr-1"]);
    expect(out.transactions).toEqual([]);
  });

  it("narrows generic entities of every kind that carries the declared field", () => {
    const out = narrowBySolo(ctx, { field: "grp", value: "Acme" });
    expect(idsOf(out.entities).sort()).toEqual(["b-1", "e-1"]);
    expect(out.transactions).toEqual([]);
    expect(out.logins).toEqual([]);
  });

  it("keeps places as they are, by reference", () => {
    const out = narrowBySolo(ctx, { field: "card_id", value: "c1" });
    expect(out.places).toBe(places);
  });

  it("keeps an absent optional list absent", () => {
    const lean: PivotContext = { transactions: ctx.transactions, logins: [], places: [] };
    const out = narrowBySolo(lean, { field: "card_id", value: "c1" });
    expect(out.accountEvents).toBeUndefined();
    expect(out.transfers).toBeUndefined();
    expect(out.entities).toBeUndefined();
  });

  // One solo per narrowing path; each removes rows, so a list that changed would show.
  const soloPaths: Solo[] = [
    { field: "card_id", value: "c1" },
    { field: "session_id", value: "s-A" },
    { field: "grp", value: "Acme" },
  ];
  type ListKey = "transactions" | "logins" | "places" | "accountEvents" | "transfers" | "entities";
  const listKeys = (c: PivotContext) =>
    (Object.keys(c) as (keyof PivotContext)[]).filter((k): k is ListKey => Array.isArray(c[k]));

  it("does not change any list it was given, places included", () => {
    const keys = listKeys(ctx);
    // the fixture holds all six lists, so the loop below cannot skip one by accident
    expect([...keys].sort()).toEqual(["accountEvents", "entities", "logins", "places", "transactions", "transfers"]);
    for (const solo of soloPaths) {
      const snapshot = keys.map((k) => {
        const list = ctx[k] as { id: string }[];
        return { k, ref: list, copy: [...list], ids: idsOf(list) };
      });
      const keysBefore = Object.keys(ctx).sort();
      narrowBySolo(ctx, solo);
      expect(Object.keys(ctx).sort()).toEqual(keysBefore);
      for (const { k, ref, copy, ids } of snapshot) {
        const after = ctx[k] as { id: string }[];
        expect(after, `${k} reference`).toBe(ref);
        expect(idsOf(after), `${k} ids`).toEqual(ids);
        expect(after, `${k} length`).toHaveLength(copy.length);
        copy.forEach((row, i) => expect(after[i], `${k}[${i}]`).toBe(row));
      }
    }
  });

  it("returns the places list as the input list itself, with the same ids, for every solo", () => {
    const placeIds = idsOf(places);
    for (const solo of soloPaths) {
      const out = narrowBySolo(ctx, solo);
      expect(out.places).toBe(places);
      expect(idsOf(out.places)).toEqual(placeIds);
    }
  });

  it("a row with bars and no node narrows the bars and leaves every other list empty", () => {
    const out = narrowBySolo(ctx, { field: "grp", value: "Cairn" });
    expect(idsOf(out.entities)).toEqual(["b-2"]);
    expect(out.transactions).toEqual([]);
    expect(out.logins).toEqual([]);
  });

  it("a value that is in no list narrows every list to empty", () => {
    const out = narrowBySolo(ctx, { field: "grp", value: "Nobody" });
    expect(out.entities).toEqual([]);
    expect(out.transactions).toEqual([]);
  });

  it("takes the field from its argument: a fixture manifest with other names narrows the same way", () => {
    const other: ScenarioNode = { ...eventNode, kind: "visit", pivotable: ["seat"], secondary: "${seat}" };
    const e = manifestRowToEntity(other, { id: "v-1", at: "2026-05-12T10:09:00-05:00", seat: "S9" });
    const out = narrowBySolo({ transactions: [], logins: [], places: [], entities: [e] }, { field: "seat", value: "S9" });
    expect(idsOf(out.entities)).toEqual(["v-1"]);
  });
});

describe("soloIds and soloHasData", () => {
  it("collects the id of every record the solo keeps", () => {
    expect([...soloIds({ field: "session_id", value: "s-A" }, ctx)].sort()).toEqual(["ae-1", "l-1", "tr-1"]);
  });

  it("reports whether the soloed value is in the data", () => {
    expect(soloHasData({ field: "grp", value: "Acme" }, ctx)).toBe(true);
    expect(soloHasData({ field: "grp", value: "Nobody" }, ctx)).toBe(false);
    expect(soloHasData({ field: "not_a_field", value: "x" }, ctx)).toBe(false);
  });
});

// The rows trim a value and write a number as text; the solo has to match what a row holds, so a
// padded value and a numeric one narrow to their row and not to nothing.
describe("a solo matches a value as the rows hold it (trimmed, a number as text)", () => {
  const padded = ent(eventNode, "e-pad", "Acme ");
  const numeric = manifestRowToEntity(eventNode, { id: "e-num", at: "2026-05-12T10:09:00-05:00", grp: 42 });
  const wide: PivotContext = {
    ...ctx,
    transactions: [...ctx.transactions, tx("tx-pad", " c1 ")],
    entities: [...(ctx.entities ?? []), padded, numeric],
  };

  it("keeps a padded record when the solo holds the trimmed value", () => {
    const out = narrowBySolo(wide, { field: "grp", value: "Acme" });
    expect(idsOf(out.entities).sort()).toEqual(["b-1", "e-1", "e-pad"]);
    expect(idsOf(narrowBySolo(wide, { field: "card_id", value: "c1" }).transactions)).toEqual(["tx-1", "tx-3", "tx-pad"]);
  });

  it("keeps a record when the solo holds the padded value", () => {
    expect(idsOf(narrowBySolo(wide, { field: "grp", value: " Acme  " }).entities).sort()).toEqual(["b-1", "e-1", "e-pad"]);
  });

  it("keeps a record whose value is a number when the solo holds it as text", () => {
    expect(idsOf(narrowBySolo(wide, { field: "grp", value: "42" }).entities)).toEqual(["e-num"]);
  });

  it("matches nothing for an empty or blank value, and still nothing for a value in no record", () => {
    expect(idsOf(narrowBySolo(wide, { field: "grp", value: "" }).entities)).toEqual([]);
    expect(idsOf(narrowBySolo(wide, { field: "grp", value: "   " }).entities)).toEqual([]);
    expect(soloHasData({ field: "grp", value: "Nobody" }, wide)).toBe(false);
  });

  it("agrees with soloHasData and soloIds", () => {
    expect(soloHasData({ field: "grp", value: "42" }, wide)).toBe(true);
    expect([...soloIds({ field: "grp", value: "42" }, wide)]).toEqual(["e-num"]);
  });

  it("matches a field only where the records carry it: an inherited name matches nothing", () => {
    expect(soloHasData({ field: "constructor", value: "Object" }, wide)).toBe(false);
  });
});

describe("decisionInSolo", () => {
  const solo: Solo = { field: "session_id", value: "s-A" };
  const ids = soloIds(solo, ctx);

  it("is in the solo when any id in events is", () => {
    expect(decisionInSolo(ids, { events: ["l-2", "l-1"] })).toBe(true);
  });

  it("is in the solo when any id in triggerEntityIds is", () => {
    expect(decisionInSolo(ids, { triggerEntityIds: ["x", "tr-1"] })).toBe(true);
  });

  it("is out of the solo when none of its ids is", () => {
    expect(decisionInSolo(ids, { events: ["l-2"], triggerEntityIds: ["tr-2"] })).toBe(false);
    expect(decisionInSolo(ids, {})).toBe(false);
  });
});

describe("solo.ts source", () => {
  it("holds no word of one pack and no clock", () => {
    expect(soloSource).not.toMatch(/org_id|merchant_name|credential_id|API key|Date\.now|setTimeout|setInterval/);
  });
});

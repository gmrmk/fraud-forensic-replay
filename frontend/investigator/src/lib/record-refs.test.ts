import { describe, it, expect } from "vitest";
import { refsOf, resolveRefs, type RefNode } from "./record-refs";
import type { Entity } from "./entity";
import type { PivotContext } from "./matches";
import type { ScenarioNode } from "./scenarios";
import type { AccountEvent, LoginEvent, Transaction, Transfer } from "../types";

// The fixture is a pack nobody has: kinds `member` and `desk`, fields `member_id`, `desk_ids`.
function entity(id: string, kind: string, primaryLabel: string, timestamp = 0): Entity {
  return {
    id,
    kind,
    timestamp,
    coords: null,
    fields: { id },
    displayMetadata: { primaryLabel, secondaryLabel: "", paletteKind: kind, pivotableFields: [] },
  };
}

const dana = entity("mem-5169", "member", "Dana Whitlow", 1_700_000_000_000);
const lee = entity("mem-7001", "member", "Lee Okafor");
const deskA = entity("desk-1", "desk", "North desk");

const claimNode: RefNode = {
  kind: "claim",
  label: "Claim",
  palette: "#fff",
  source: "json",
  refs: { member_id: ["member"], desk_ids: ["desk", "member"] },
};

const nodes: ScenarioNode[] = [
  claimNode,
  { kind: "member", label: "Member", palette: "#fff", source: "json" },
  { kind: "desk", label: "Desk", palette: "#fff", source: "json" },
];

const context: PivotContext = {
  transactions: [],
  logins: [],
  places: [],
  entities: [dana, lee, deskA],
};

describe("refsOf", () => {
  it("returns the declared map of a node with refs", () => {
    expect(refsOf(claimNode)).toEqual({ member_id: ["member"], desk_ids: ["desk", "member"] });
  });

  it("returns an empty map for a node without refs, and for no node", () => {
    expect(refsOf({ kind: "k", label: "K", palette: "#fff", source: "json" })).toEqual({});
    expect(refsOf(undefined)).toEqual({});
    expect(refsOf(null)).toEqual({});
  });

  it("reads the key named refs and no other", () => {
    const other = { ...claimNode, links: claimNode.refs, refs: undefined } as unknown as ScenarioNode;
    expect(refsOf(other)).toEqual({});
  });

  it("ignores a ref whose value is not a list of strings, and keeps the others", () => {
    const bad = {
      ...claimNode,
      refs: {
        member_id: ["member"],
        a: "member",
        b: [1, 2],
        c: ["member", 3],
        d: null,
        e: { 0: "member" },
      },
    } as unknown as ScenarioNode;
    expect(refsOf(bad)).toEqual({ member_id: ["member"] });
  });

  it("returns an empty map when refs itself is not an object", () => {
    for (const refs of ["member", 7, null, ["member"], true]) {
      expect(refsOf({ ...claimNode, refs } as unknown as ScenarioNode)).toEqual({});
    }
  });

  it("gives no ref to an inherited name", () => {
    const refs = refsOf(claimNode);
    expect(Object.hasOwn(refs, "constructor")).toBe(false);
    expect(Object.hasOwn(refs, "toString")).toBe(false);
  });

  it("does not carry an empty kind list", () => {
    expect(refsOf({ ...claimNode, refs: { member_id: [] } } as unknown as ScenarioNode)).toEqual({});
  });

  it("drops an empty kind list and keeps the fields beside it", () => {
    const mixed = { ...claimNode, refs: { a: [], member_id: ["member"] } } as unknown as ScenarioNode;
    expect(refsOf(mixed)).toEqual({ member_id: ["member"] });
  });
});

describe("resolveRefs, a manifest pack the app has never seen", () => {
  it("resolves a scalar to the record, its kind's label and its name", () => {
    const [r] = resolveRefs("mem-5169", ["member"], context, nodes);
    expect(r).not.toBeNull();
    expect(r?.match).toEqual({ kind: "entity", entity: dana });
    expect(r?.id).toBe("mem-5169");
    expect(r?.kind).toBe("member");
    expect(r?.kindLabel).toBe("Member");
    expect(r?.name).toBe("Dana Whitlow");
  });

  it("gives one result for each member of a list, in order", () => {
    const out = resolveRefs(["desk-1", "mem-5169", "desk-1"], ["desk", "member"], context, nodes);
    expect(out.map((r) => r?.name)).toEqual(["North desk", "Dana Whitlow", "North desk"]);
    expect(out.map((r) => r?.kind)).toEqual(["desk", "member", "desk"]);
  });

  it("judges each id of a list alone: a missing id is null at its own index", () => {
    const out = resolveRefs(["mem-5169", "mem-9999", "mem-7001"], ["member"], context, nodes);
    expect(out.map((r) => r?.id ?? null)).toEqual(["mem-5169", null, "mem-7001"]);
  });

  it("returns null for an id that no record has", () => {
    expect(resolveRefs("nobody", ["member"], context, nodes)).toEqual([null]);
  });

  it("returns null for a record of a kind the ref does not list", () => {
    expect(resolveRefs("desk-1", ["member"], context, nodes)).toEqual([null]);
  });

  it("returns null for an empty, null or undefined value", () => {
    expect(resolveRefs("", ["member"], context, nodes)).toEqual([null]);
    expect(resolveRefs(null, ["member"], context, nodes)).toEqual([null]);
    expect(resolveRefs(undefined, ["member"], context, nodes)).toEqual([null]);
    expect(resolveRefs(["", null, undefined, 4], ["member"], context, nodes)).toEqual([null, null, null, null]);
  });

  it("returns an empty list for an empty list", () => {
    expect(resolveRefs([], ["member"], context, nodes)).toEqual([]);
  });

  it("returns null for the open record's own id, and resolves its neighbours in a list", () => {
    expect(resolveRefs("mem-5169", ["member"], context, nodes, "mem-5169")).toEqual([null]);
    const out = resolveRefs(["mem-5169", "mem-7001"], ["member"], context, nodes, "mem-5169");
    expect(out[0]).toBeNull();
    expect(out[1]?.name).toBe("Lee Okafor");
  });

  it("falls back to the kind's own name when no node carries a label", () => {
    const [r] = resolveRefs("mem-5169", ["member"], context, []);
    expect(r?.kindLabel).toBe("member");
  });

  it("judges a manifest record by its own kind, never by the word entity", () => {
    expect(resolveRefs("mem-5169", ["entity"], context, nodes)).toEqual([null]);
  });

  it("returns null for every value when the ref lists no kind", () => {
    expect(resolveRefs("mem-5169", [], context, nodes)).toEqual([null]);
  });

  it("returns null when the context holds no rows", () => {
    expect(resolveRefs("mem-5169", ["member"], { transactions: [], logins: [], places: [] }, nodes)).toEqual([null]);
  });
});

describe("resolveRefs, the five built-in kinds", () => {
  const fraudTx = {
    id: "tx-bad",
    is_fraud: 1,
    amount: 580.4,
    merchant_name: "Tidewater Trust Bank ATM",
    mcc: "6011",
    merchant_country: "NG",
    merchant_lat: 6.4,
    merchant_lng: 3.4,
    timestamp: "2026-01-02T03:04:05Z",
  } as unknown as Transaction;
  const authTx = { ...fraudTx, id: "tx-ok", is_fraud: 0, merchant_name: "Cobstead Grocers", amount: 12 } as Transaction;
  const login = {
    id: "lgn-1",
    device_fp: "Handset",
    outcome: "success",
    ip_type: "residential",
    ip_lat: 1,
    ip_lng: 2,
    timestamp: "2026-01-02T03:04:05Z",
  } as unknown as LoginEvent;
  const builtIn: PivotContext = { transactions: [fraudTx, authTx], logins: [login], places: [] };
  const labelled: ScenarioNode[] = [
    { kind: "fraud", label: "Fraud", palette: "#fff", source: "sql" },
    { kind: "auth", label: "Authorization", palette: "#fff", source: "sql" },
  ];

  it("judges a fraud transaction by match.kind: listed under fraud, not under auth", () => {
    const [yes] = resolveRefs("tx-bad", ["fraud"], builtIn, labelled);
    expect(yes?.kind).toBe("fraud");
    expect(yes?.kindLabel).toBe("Fraud");
    expect(yes?.name).toBe("$580.40 · Tidewater Trust Bank ATM");
    expect(resolveRefs("tx-bad", ["auth"], builtIn, labelled)).toEqual([null]);
  });

  it("judges an authorization by match.kind", () => {
    const [r] = resolveRefs("tx-ok", ["auth", "fraud"], builtIn, labelled);
    expect(r?.kind).toBe("auth");
    expect(r?.kindLabel).toBe("Authorization");
    expect(r?.match.kind).toBe("auth");
  });

  it("resolves a login and names it by its primary line", () => {
    const [r] = resolveRefs("lgn-1", ["login"], builtIn, labelled);
    expect(r?.kind).toBe("login");
    expect(r?.kindLabel).toBe("login");
    expect(r?.name).toBe("Handset");
  });

  it("does not let the word entity name a built-in record either", () => {
    expect(resolveRefs("tx-bad", ["entity"], builtIn, labelled)).toEqual([null]);
  });
});

// Rows copied field for field from the account story's static export (its account events file and its
// transfers file), typed as the app's own row types so tsc checks the shape. The match is built by
// resolveEntityRef (decision-entities.ts:20-23), the same `{ kind, event | transfer }`
// shape that matches.ts:141-155, case-events.ts:37-38 and boot-focus.ts:57-58 build.
describe("resolveRefs, the account story's behavioral kinds", () => {
  const emailChange: AccountEvent = {
    id: "gen-ae-40934",
    account_id: "gen-acct-priya",
    timestamp: "2026-05-25T10:14:00-05:00",
    kind: "profile_change",
    field: "email",
    old_value: "priya.patel@tealmoor.example",
    new_value: "p.patel.recovery@sentrypine.example",
    payee_id: null,
    session_id: "sess-takeover",
    is_fraud: 1,
  };
  const payeeAdd: AccountEvent = {
    id: "gen-ae-40943",
    account_id: "gen-acct-priya",
    timestamp: "2026-05-25T10:23:00-05:00",
    kind: "payee_add",
    field: null,
    old_value: null,
    new_value: null,
    payee_id: "gen-payee-daniel_reyes",
    session_id: "sess-takeover",
    is_fraud: 1,
  };
  const transfer: Transfer = {
    id: "gen-tr-04060",
    account_id: "gen-acct-priya",
    timestamp: "2026-04-29T19:40:00-05:00",
    amount: 22.5,
    payee_id: "gen-payee-alex_t",
    rail: "tamsinmere",
    status: "sent",
    decline_reason: null,
    session_id: "sess-04060",
    is_fraud: 0,
  };
  const story: PivotContext = {
    transactions: [],
    logins: [],
    places: [],
    accountEvents: [emailChange, payeeAdd],
    transfers: [transfer],
  };
  const labelled: ScenarioNode[] = [
    { kind: "account_event", label: "Account event", palette: "#fff", source: "sql" },
    { kind: "transfer", label: "Transfer", palette: "#fff", source: "sql" },
  ];

  it("resolves an account event to the match the app builds, its label and its name", () => {
    const [r] = resolveRefs("gen-ae-40934", ["account_event"], story, labelled);
    expect(r?.match).toEqual({ kind: "account_event", event: emailChange });
    expect(r?.kind).toBe("account_event");
    expect(r?.kindLabel).toBe("Account event");
    expect(r?.name).toBe("email changed");
    expect(r?.id).toBe("gen-ae-40934");
  });

  it("names a payee add by its own primary line", () => {
    const [r] = resolveRefs("gen-ae-40943", ["account_event"], story, labelled);
    expect(r?.name).toBe("payee added");
  });

  it("resolves a transfer to the match the app builds, its label and its name", () => {
    const [r] = resolveRefs("gen-tr-04060", ["transfer"], story, labelled);
    expect(r?.match).toEqual({ kind: "transfer", transfer });
    expect(r?.kind).toBe("transfer");
    expect(r?.kindLabel).toBe("Transfer");
    expect(r?.name).toBe("$22.50 · tamsinmere");
  });

  it("falls back to the kind's own name when no node carries a label", () => {
    const out = resolveRefs(["gen-ae-40934", "gen-tr-04060"], ["account_event", "transfer"], story, []);
    expect(out.map((r) => r?.kindLabel)).toEqual(["account_event", "transfer"]);
  });

  it("judges each by its kind: an event is not a transfer and a transfer is not an event", () => {
    expect(resolveRefs("gen-ae-40934", ["transfer"], story, labelled)).toEqual([null]);
    expect(resolveRefs("gen-tr-04060", ["account_event"], story, labelled)).toEqual([null]);
  });

  it("returns null when the context carries no rows of that kind", () => {
    const lean: PivotContext = { transactions: [], logins: [], places: [] };
    expect(resolveRefs("gen-ae-40934", ["account_event"], lean, labelled)).toEqual([null]);
    expect(resolveRefs("gen-tr-04060", ["transfer"], lean, labelled)).toEqual([null]);
    const noTransfers: PivotContext = { ...story, transfers: undefined };
    expect(resolveRefs("gen-tr-04060", ["transfer"], noTransfers, labelled)).toEqual([null]);
  });

  it("returns null for the open record's own id, and resolves a list of mixed kinds in order", () => {
    expect(resolveRefs("gen-ae-40934", ["account_event"], story, labelled, "gen-ae-40934")).toEqual([null]);
    const out = resolveRefs(["gen-tr-04060", "gen-ae-40934", "gen-ae-40943"], ["account_event", "transfer"], story, labelled, "gen-ae-40934");
    expect(out.map((r) => r?.id ?? null)).toEqual(["gen-tr-04060", null, "gen-ae-40943"]);
  });
});

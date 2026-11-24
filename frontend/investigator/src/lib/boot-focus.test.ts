import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it, expect } from "vitest";
import { bootFocusEntity, overlayFocusEntity, type BootFocusRows } from "./boot-focus";
import { transactionToEntity, loginToEntity, accountEventToEntity } from "./adapters/ffr-seed";
import { isGenericNode, manifestRowToEntity } from "./adapters/manifest-row";
import { caseStepEvents } from "./case-events";
import { stepTarget } from "./playhead-tools";
import type { Entity } from "./entity";
import type { ScenarioNode } from "./scenarios";
import type { Decision } from "./decisions";
import type { AccountEvent, LoginEvent, Transaction } from "../types";

// ── Fixtures ─────────────────────────────────────────────────────────────────

function makeTransaction(overrides: Partial<Transaction> & Pick<Transaction, "id">): Transaction {
  return {
    card_id: "card-1",
    account_id: "acct-1",
    timestamp: "2026-05-26T22:00:00Z",
    amount: 42,
    merchant_name: "Corner Store",
    merchant_lat: 29.76,
    merchant_lng: -95.37,
    merchant_country: "US",
    mcc: "5411",
    category: "grocery",
    is_card_present: 1,
    is_fraud: 0,
    balance_after: 1000,
    auth_response_code: "00",
    pos_entry_mode: "chip",
    network_ref_number: "NRN",
    terminal_id: "T-1",
    acquirer: "Harlowe Bank",
    auth_source: "issuer",
    risk_score: 10,
    is_3ds: 0,
    currency: "USD",
    ...overrides,
  };
}

function makeLogin(overrides: Partial<LoginEvent> & Pick<LoginEvent, "id">): LoginEvent {
  return {
    account_id: "acct-1",
    timestamp: "2026-05-26T18:00:00Z",
    ip: "192.0.2.4",
    ip_country: "NG",
    ip_lat: 6.5244,
    ip_lng: 3.3792,
    device_fp: "dev-new",
    user_agent: "ua",
    outcome: "success",
    two_fa_used: 0,
    session_id: "sess-ato",
    ip_type: "residential",
    ip_asn: "AS1",
    ip_reputation: 20,
    device_first_seen_at: "2026-05-26T18:00:00Z",
    device_trust: "new",
    auth_method: "password",
    challenge_reason: null,
    ...overrides,
  };
}

function makeAccountEvent(overrides: Partial<AccountEvent> & Pick<AccountEvent, "id">): AccountEvent {
  return {
    account_id: "acct-1",
    timestamp: "2026-05-26T18:05:00Z",
    kind: "profile_change",
    field: "email",
    old_value: "a@x.example",
    new_value: "b@y.example",
    payee_id: null,
    session_id: "sess-ato",
    is_fraud: 1,
    ...overrides,
  };
}

function makeDecision(overrides: Partial<Decision> & Pick<Decision, "id" | "triggerEntityIds">): Decision {
  return {
    rule: { id: "r", label: "Rule", kind: "k" },
    subjectPathKind: "login",
    inputs: [],
    thresholds: [],
    verdict: "VERDICT",
    decision: "REVIEW",
    evidence: [],
    severity: 0.5,
    ...overrides,
  };
}

const NO_ROWS: BootFocusRows = { transactions: [], logins: [], accountEvents: [], transfers: [] };

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("bootFocusEntity", () => {
  it("returns the top-severity reached decision's landing trigger, NOT the trailing auth (ERR-050 core)", () => {
    // The priya-ato shape: an ATO login (before maxTime, high severity) plus a
    // trailing ordinary auth (the frame the playhead pins to). Boot-focus must
    // pick the ATO trigger login, so the finding's pill is the opening frame.
    const atoLogin = makeLogin({ id: "login-ato", timestamp: "2026-05-26T18:00:00Z" });
    const trailingAuth = makeTransaction({ id: "tx-trailing", timestamp: "2026-05-26T23:59:00Z" });
    const rows: BootFocusRows = {
      transactions: [trailingAuth],
      logins: [atoLogin],
      accountEvents: [],
      transfers: [],
    };
    const ato = makeDecision({
      id: "d-ato",
      triggerEntityIds: ["login-ato"],
      verdict: "ACCOUNT TAKEOVER",
      severity: 0.99,
    });
    const entitiesByKind = {
      login: [loginToEntity(atoLogin)],
      auth: [transactionToEntity(trailingAuth)],
    };
    const maxTime = Date.parse(trailingAuth.timestamp);

    const focus = bootFocusEntity([ato], rows, entitiesByKind, maxTime);
    expect(focus).not.toBeNull();
    expect(focus!.kind).toBe("login");
    expect(focus!.kind === "login" && focus!.login.id).toBe("login-ato");
  });

  it("picks the HIGHEST-severity reached decision when several are reached", () => {
    const lowLogin = makeLogin({ id: "login-low" });
    const highLogin = makeLogin({ id: "login-high" });
    const rows: BootFocusRows = {
      transactions: [],
      logins: [lowLogin, highLogin],
      accountEvents: [],
      transfers: [],
    };
    const low = makeDecision({ id: "d-low", triggerEntityIds: ["login-low"], severity: 0.4 });
    const high = makeDecision({ id: "d-high", triggerEntityIds: ["login-high"], severity: 0.97 });
    const entitiesByKind = { login: [loginToEntity(lowLogin), loginToEntity(highLogin)] };

    const focus = bootFocusEntity([low, high], rows, entitiesByKind, 9e15);
    expect(focus!.kind === "login" && focus!.login.id).toBe("login-high");
  });

  it("resolves a behavioral (coordless) account_event trigger", () => {
    const ev = makeAccountEvent({ id: "ev-1" });
    const rows: BootFocusRows = {
      transactions: [],
      logins: [],
      accountEvents: [ev],
      transfers: [],
    };
    const d = makeDecision({ id: "d-ato", triggerEntityIds: ["ev-1"], verdict: "ACCOUNT TAKEOVER" });
    const entitiesByKind = { account_event: [accountEventToEntity(ev)] };

    const focus = bootFocusEntity([d], rows, entitiesByKind, 9e15);
    expect(focus!.kind).toBe("account_event");
    expect(focus!.kind === "account_event" && focus!.event.id).toBe("ev-1");
  });

  it("uses the LAST trigger id as the landing event", () => {
    const first = makeLogin({ id: "login-first" });
    const landing = makeLogin({ id: "login-landing" });
    const rows: BootFocusRows = {
      transactions: [],
      logins: [first, landing],
      accountEvents: [],
      transfers: [],
    };
    const d = makeDecision({ id: "d", triggerEntityIds: ["login-first", "login-landing"] });
    const entitiesByKind = { login: [loginToEntity(first), loginToEntity(landing)] };

    const focus = bootFocusEntity([d], rows, entitiesByKind, 9e15);
    expect(focus!.kind === "login" && focus!.login.id).toBe("login-landing");
  });

  it("NO-OP: returns null when there are no decisions (population pack)", () => {
    expect(bootFocusEntity([], NO_ROWS, {}, 9e15)).toBeNull();
  });

  it("NO-OP: returns null when no decision's trigger is reached at maxTime", () => {
    const lateLogin = makeLogin({ id: "login-late", timestamp: "2026-05-26T23:00:00Z" });
    const rows: BootFocusRows = {
      transactions: [],
      logins: [lateLogin],
      accountEvents: [],
      transfers: [],
    };
    const d = makeDecision({ id: "d", triggerEntityIds: ["login-late"] });
    const entitiesByKind = { login: [loginToEntity(lateLogin)] };
    // maxTime is BEFORE the trigger's timestamp → not reached → null.
    const maxTime = Date.parse("2026-05-26T20:00:00Z");
    expect(bootFocusEntity([d], rows, entitiesByKind, maxTime)).toBeNull();
  });

  it("skips a reached decision whose trigger ROW is absent, falling to the next resolvable one", () => {
    // Top decision's trigger id is not among the loaded rows (e.g. a scoping
    // mismatch); boot-focus must not throw or return a phantom - it falls to the
    // next reached decision whose row IS present.
    const login = makeLogin({ id: "login-present" });
    const rows: BootFocusRows = {
      transactions: [],
      logins: [login],
      accountEvents: [],
      transfers: [],
    };
    const ghostEntity = loginToEntity(makeLogin({ id: "login-ghost" }));
    const topGhost = makeDecision({ id: "d-ghost", triggerEntityIds: ["login-ghost"], severity: 0.99 });
    const present = makeDecision({ id: "d-present", triggerEntityIds: ["login-present"], severity: 0.5 });
    // entitiesByKind carries BOTH (so both are "reached"), but rows only carries the present login.
    const entitiesByKind = { login: [ghostEntity, loginToEntity(login)] };

    const focus = bootFocusEntity([topGhost, present], rows, entitiesByKind, 9e15);
    expect(focus!.kind === "login" && focus!.login.id).toBe("login-present");
  });
});

// ── The opening of a pack whose case is a manifest decision node ─────────────
// The five stories of 2026-11 carry no rule decision (`rules: []`), so /api/decisions is empty and
// bootFocusEntity finds nothing. Their case is a record of the manifest's decision node, and the
// events it names (through the node's `decision.event` mapping) are what the case turns on.

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), "../../../..");
type FileNode = ScenarioNode & { file?: string };

/** A shipped pack as the app reads it: its manifest nodes and every generic row, adapted. */
function loadPack(pack: string): { nodes: ScenarioNode[]; rows: BootFocusRows; maxTime: number } {
  const manifest = JSON.parse(readFileSync(resolve(REPO, `backend/scenarios/${pack}.scenario.json`), "utf8")) as {
    nodes: FileNode[];
  };
  const entities: Entity[] = [];
  for (const node of manifest.nodes) {
    if (!isGenericNode(node) || !node.file) continue;
    const list = JSON.parse(readFileSync(resolve(REPO, node.file), "utf8")) as Record<string, unknown>[];
    for (const row of list) entities.push(manifestRowToEntity(node, row));
  }
  const rows: BootFocusRows = { transactions: [], logins: [], accountEvents: [], transfers: [], entities };
  return { nodes: manifest.nodes, rows, maxTime: Math.max(...entities.map((e) => e.timestamp)) };
}

const stepsOf = (rows: BootFocusRows, nodes: ScenarioNode[]) =>
  caseStepEvents({ ...rows, entities: rows.entities ?? [] }, nodes);

// The record each story's case turns on: the latest event its decision names that the step keys
// can stand on. key-many-networks and volume-step name daily bars last (not steps), so they land
// on the last network hop and on the launch period.
const FIVE: [pack: string, landing: string][] = [
  ["key-many-networks", "nw-0004"],
  ["seats-two-networks", "rs-02"],
  ["seat-failed-signins", "ce-0001"],
  ["volume-step", "pd-03"],
  ["agent-runs-shared-key", "kr-0003"],
];

describe("overlayFocusEntity: the five stories open into their own case", () => {
  it.each(FIVE)("%s opens on %s, before the end of the data, with a step in both directions", (pack, landing) => {
    const { nodes, rows, maxTime } = loadPack(pack);
    const focus = overlayFocusEntity(nodes, rows);
    expect(focus?.kind).toBe("entity");
    const entity = focus!.kind === "entity" ? focus!.entity : null;
    expect(entity?.id).toBe(landing);
    // not the last instant of the data: the decision record itself sits there
    expect(entity!.timestamp).toBeLessThan(maxTime);
    const steps = stepsOf(rows, nodes);
    expect(stepTarget(steps, entity!.timestamp, landing, 1)).not.toBeNull();
    expect(stepTarget(steps, entity!.timestamp, landing, -1)).not.toBeNull();
  });

  it.each(FIVE)("%s: every event its decision names is a loaded record", (pack) => {
    const { rows } = loadPack(pack);
    const ids = new Set((rows.entities ?? []).map((e) => e.id));
    const decision = (rows.entities ?? []).find((e) => e.kind === "decision")!;
    const named = decision.fields.event_ids as string[];
    expect(named.length).toBeGreaterThan(0);
    for (const id of named) expect(ids.has(id)).toBe(true);
  });

  it("opens a sixth pack of the same shape with no pack code: another field name, a bar named last", () => {
    const base = { label: "k", palette: "#fff", source: "json", timestamp: "at", primary: "${id}", secondary: "${id}" };
    const nodes: ScenarioNode[] = [
      { ...base, kind: "ping" },
      { ...base, kind: "load", magnitude: "size" },
      {
        ...base, kind: "alert",
        decision: { status: "st", outcome: "word", note: "n", actor: "a", target: "t", key: "k", event: "evidence" },
      },
    ];
    const at = (h: number) => `2026-12-01T0${h}:00:00Z`;
    const entities = [
      manifestRowToEntity(nodes[0], { id: "p1", at: at(1) }),
      manifestRowToEntity(nodes[0], { id: "p2", at: at(2) }),
      manifestRowToEntity(nodes[1], { id: "l1", at: at(3), size: 9 }),
      manifestRowToEntity(nodes[2], { id: "a1", at: at(4), st: "FAIL", word: "X", evidence: ["p1", "l1", "p2"] }),
    ];
    const rows: BootFocusRows = { transactions: [], logins: [], accountEvents: [], transfers: [], entities };
    const focus = overlayFocusEntity(nodes, rows);
    expect(focus!.kind === "entity" && focus!.entity.id).toBe("p2");
  });

  it("opens on the decision record itself when it names no event", () => {
    const base = { label: "k", palette: "#fff", source: "json", timestamp: "at", primary: "${id}", secondary: "${id}" };
    const nodes: ScenarioNode[] = [
      { ...base, kind: "alert", decision: { status: "st", outcome: "w", note: "n", actor: "a", target: "t", key: "k", event: "ev" } },
    ];
    const entities = [manifestRowToEntity(nodes[0], { id: "a1", at: "2026-12-01T04:00:00Z", st: "FAIL" })];
    const rows: BootFocusRows = { transactions: [], logins: [], accountEvents: [], transfers: [], entities };
    const focus = overlayFocusEntity(nodes, rows);
    expect(focus?.kind === "entity" && focus.entity.id).toBe("a1");
  });

  it("waits (null) while any named event has not loaded, so a late row cannot be skipped over", () => {
    const base = { label: "k", palette: "#fff", source: "json", timestamp: "at", primary: "${id}", secondary: "${id}" };
    const nodes: ScenarioNode[] = [
      { ...base, kind: "ping" },
      { ...base, kind: "alert", decision: { status: "st", outcome: "w", note: "n", actor: "a", target: "t", key: "k", event: "ev" } },
    ];
    const entities = [
      manifestRowToEntity(nodes[0], { id: "p1", at: "2026-12-01T01:00:00Z" }),
      manifestRowToEntity(nodes[1], { id: "a1", at: "2026-12-01T04:00:00Z", st: "FAIL", ev: ["p1", "tx-not-loaded-yet"] }),
    ];
    const rows: BootFocusRows = { transactions: [], logins: [], accountEvents: [], transfers: [], entities };
    expect(overlayFocusEntity(nodes, rows)).toBeNull();
  });

  it("takes a finding before a held or cleared decision", () => {
    const base = { label: "k", palette: "#fff", source: "json", timestamp: "at", primary: "${id}", secondary: "${id}" };
    const nodes: ScenarioNode[] = [
      { ...base, kind: "ping" },
      { ...base, kind: "alert", decision: { status: "st", outcome: "w", note: "n", actor: "a", target: "t", key: "k", event: "ev" } },
    ];
    const entities = [
      manifestRowToEntity(nodes[0], { id: "p1", at: "2026-12-01T01:00:00Z" }),
      manifestRowToEntity(nodes[0], { id: "p2", at: "2026-12-01T02:00:00Z" }),
      manifestRowToEntity(nodes[1], { id: "a1", at: "2026-12-01T03:00:00Z", st: "PASS", ev: ["p2"] }),
      manifestRowToEntity(nodes[1], { id: "a2", at: "2026-12-01T04:00:00Z", st: "FAIL", ev: ["p1"] }),
    ];
    const rows: BootFocusRows = { transactions: [], logins: [], accountEvents: [], transfers: [], entities };
    const focus = overlayFocusEntity(nodes, rows);
    expect(focus?.kind === "entity" && focus.entity.id).toBe("p1");
  });

  it("NO-OP: a pack with no decision node, or no rows, opens nowhere", () => {
    expect(overlayFocusEntity([], NO_ROWS)).toBeNull();
    const { nodes } = loadPack("key-many-networks");
    expect(overlayFocusEntity(nodes, NO_ROWS)).toBeNull();
  });
});

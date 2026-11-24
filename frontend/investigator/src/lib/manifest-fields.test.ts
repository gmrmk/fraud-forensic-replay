import { describe, it, expect } from "vitest";
import { parseTemplateFields, headlineFields, classifyField, formatFieldValue, labelForField, displayLabel, buildFieldEntries, sectionEntries } from "./manifest-fields";
import type { ScenarioNode } from "./scenarios";
import { plainNode, verdictNode } from "./verdict-fixtures";

const AUTH_NODE: ScenarioNode = {
  kind: "auth", label: "Authorization", palette: "#00e5ff", source: "sql",
  coords: { lat: "merchant_lat", lng: "merchant_lng" }, timestamp: "timestamp",
  primary: "$${amount} · ${merchant_name}",
  secondary: "${mcc} · ${merchant_country}",
  pivotable: ["acquirer", "pos_entry_mode", "merchant_country", "mcc", "merchant_name", "card_id"],
};

const LOGIN_NODE: ScenarioNode = {
  kind: "login", label: "Login", palette: "#ff5ce8", source: "sql",
  coords: { lat: "ip_lat", lng: "ip_lng" }, timestamp: "timestamp",
  primary: "${device_fp}",
  secondary: "${outcome} · ${ip_type}",
  pivotable: ["ip_asn", "device_fp"],
};

const AE_NODE: ScenarioNode = {
  kind: "account_event", label: "Account event", palette: "#ffb347", source: "sql",
  coords: null, timestamp: "timestamp",
  primary: "${kind}",
  secondary: "${field}",
  pivotable: ["session_id"],
};
describe("parseTemplateFields", () => {
  it("extracts field names from a compound template", () => {
    expect(parseTemplateFields("$${amount} · ${merchant_name}")).toEqual(["amount", "merchant_name"]);
  });
  it("handles a single-field template", () => {
    expect(parseTemplateFields("${device_fp}")).toEqual(["device_fp"]);
  });
  it("returns empty array for undefined", () => {
    expect(parseTemplateFields(undefined)).toEqual([]);
  });
  it("returns empty array for null", () => {
    expect(parseTemplateFields(null)).toEqual([]);
  });
  it("returns empty array for a template with no placeholders", () => {
    expect(parseTemplateFields("plain text")).toEqual([]);
  });
  it("handles the priya-ato transfer template compound form", () => {
    expect(parseTemplateFields("${rail} $${amount}")).toEqual(["rail", "amount"]);
  });
});

describe("headlineFields", () => {
  it("returns the union of primary and secondary template fields", () => {
    const h = headlineFields(AUTH_NODE);
    expect(h.has("amount")).toBe(true);
    expect(h.has("merchant_name")).toBe(true);
    expect(h.has("mcc")).toBe(true);
    expect(h.has("merchant_country")).toBe(true);
    expect(h.has("acquirer")).toBe(false);
  });
});

describe("classifyField", () => {
  it("classifies pivotable fields as pivotable", () => {
    expect(classifyField("acquirer", AUTH_NODE)).toBe("pivotable");
    expect(classifyField("mcc", AUTH_NODE)).toBe("pivotable");
  });
  it("classifies amount as currency when not in pivotable", () => {
    const node = { ...AUTH_NODE, pivotable: [] };
    expect(classifyField("amount", node)).toBe("currency");
  });
  it("classifies other fields as text", () => {
    expect(classifyField("auth_response_code", AUTH_NODE)).toBe("text");
    expect(classifyField("network_ref_number", AUTH_NODE)).toBe("text");
  });
});

describe("formatFieldValue", () => {
  it("renders null as a hyphen", () => { expect(formatFieldValue("any", null)).toBe("-"); });
  it("renders undefined as a hyphen", () => { expect(formatFieldValue("any", undefined)).toBe("-"); });
  it("renders currency fields with 2 decimal places", () => {
    expect(formatFieldValue("amount", 123.5)).toBe("123.50");
  });
  it("does not apply currency formatting to non-money numeric fields", () => {
    expect(formatFieldValue("risk_score", 750)).toBe("750");
  });
  it("renders an ISO datetime string in Houston time", () => {
    expect(formatFieldValue("changed_at", "2026-06-08T09:04:17-05:00")).toBe("Mon Jun 8 · 9:04a");
    expect(formatFieldValue("ip_asn", "AS64511 Cloud host")).toBe("AS64511 Cloud host");
  });
  it("renders a list as its values, each formatted, separated by commas", () => {
    expect(formatFieldValue("worked", ["ke-0004", "us-02517"])).toBe("ke-0004, us-02517");
    expect(formatFieldValue("amounts", [1, 2.5])).toBe("1.00, 2.50");
    expect(formatFieldValue("worked", [])).toBe("");
  });
  it("renders is_fraud 1 as Yes", () => { expect(formatFieldValue("is_fraud", 1)).toBe("Yes"); });
  it("renders is_fraud 0 as No", () => { expect(formatFieldValue("is_fraud", 0)).toBe("No"); });
  it("renders two_fa_used 1 as Yes", () => { expect(formatFieldValue("two_fa_used", 1)).toBe("Yes"); });
  it("renders booleans as Yes/No", () => {
    expect(formatFieldValue("some_flag", true)).toBe("Yes");
    expect(formatFieldValue("some_flag", false)).toBe("No");
  });
  it("renders arbitrary integers as strings, not Yes/No", () => {
    expect(formatFieldValue("risk_score", 2)).toBe("2");
    expect(formatFieldValue("count", 42)).toBe("42");
  });
});

describe("labelForField", () => {
  it("converts snake_case to Title Case", () => {
    expect(labelForField("merchant_name")).toBe("Merchant Name");
    expect(labelForField("pos_entry_mode")).toBe("Pos Entry Mode");
  });
  it("handles single-word fields", () => {
    expect(labelForField("amount")).toBe("Amount");
  });
});
const AUTH_FIELDS: Record<string, unknown> = {
  id: "tx-001", timestamp: "2026-05-26T09:23:00-05:00",
  amount: 47.50, merchant_name: "COBSTEAD GROCERS",
  merchant_lat: 29.7604, merchant_lng: -95.3698,
  merchant_country: "US", mcc: "5411",
  is_fraud: 0, acquirer: "Halvard Settlement Services",
  pos_entry_mode: "chip_and_pin", risk_score: 120,
  card_id: "card-marcus-visa-001", auth_response_code: "00",
};

describe("buildFieldEntries", () => {
  it("excludes the id field always", () => {
    const entries = buildFieldEntries(AUTH_FIELDS, AUTH_NODE);
    expect(entries.find(e => e.key === "id")).toBeUndefined();
  });
  it("excludes declared coord fields (merchant_lat, merchant_lng)", () => {
    const entries = buildFieldEntries(AUTH_FIELDS, AUTH_NODE);
    expect(entries.find(e => e.key === "merchant_lat")).toBeUndefined();
    expect(entries.find(e => e.key === "merchant_lng")).toBeUndefined();
  });
  it("excludes the declared timestamp field", () => {
    const entries = buildFieldEntries(AUTH_FIELDS, AUTH_NODE);
    expect(entries.find(e => e.key === "timestamp")).toBeUndefined();
  });
  it("includes non-excluded fields", () => {
    const entries = buildFieldEntries(AUTH_FIELDS, AUTH_NODE);
    const keys = entries.map(e => e.key);
    expect(keys).toContain("amount");
    expect(keys).toContain("merchant_name");
    expect(keys).toContain("risk_score");
  });
  it("pivotable fields appear before text fields in the result", () => {
    const entries = buildFieldEntries(AUTH_FIELDS, AUTH_NODE);
    const pivotableIdx = entries.findIndex(e => e.fieldClass === "pivotable");
    const textIdx = entries.findIndex(e => e.fieldClass === "text");
    expect(pivotableIdx).toBeGreaterThanOrEqual(0);
    expect(textIdx).toBeGreaterThanOrEqual(0);
    expect(pivotableIdx).toBeLessThan(textIdx);
  });
  it("marks headline fields correctly", () => {
    const entries = buildFieldEntries(AUTH_FIELDS, AUTH_NODE);
    const amountEntry = entries.find(e => e.key === "amount");
    const merchantEntry = entries.find(e => e.key === "merchant_name");
    expect(amountEntry?.isHeadline).toBe(true);
    expect(merchantEntry?.isHeadline).toBe(true);
    const riskEntry = entries.find(e => e.key === "risk_score");
    expect(riskEntry?.isHeadline).toBe(false);
  });
  it("formats is_fraud=0 as No", () => {
    const entries = buildFieldEntries(AUTH_FIELDS, AUTH_NODE);
    const entry = entries.find(e => e.key === "is_fraud");
    expect(entry?.value).toBe("No");
  });
  it("handles an entity with null coords (account_event)", () => {
    const AE_FIELDS: Record<string, unknown> = {
      id: "ae-001", timestamp: "2026-05-24T12:00:00-05:00",
      kind: "profile_change", field: "email",
      old_value: "priya@tealmoor.example", new_value: "attacker@sentrypine.example",
      session_id: "sess-takeover-001", is_fraud: 1,
    };
    const entries = buildFieldEntries(AE_FIELDS, AE_NODE);
    expect(entries.find(e => e.key === "kind")).toBeDefined();
    expect(entries.find(e => e.key === "session_id")).toBeDefined();
    const sessionIdx = entries.findIndex(e => e.key === "session_id");
    expect(sessionIdx).toBe(0);
  });
  it("schema-agnostic: works for the login node without code changes", () => {
    const LOGIN_FIELDS: Record<string, unknown> = {
      id: "login-001", timestamp: "2026-05-24T12:00:00-05:00",
      ip: "203.0.113.56", ip_country: "US",
      ip_lat: 37.7749, ip_lng: -122.4194,
      device_fp: "fp-abc-123", outcome: "success",
      ip_type: "datacenter", ip_asn: "AS64511", device_trust: "new",
    };
    const entries = buildFieldEntries(LOGIN_FIELDS, LOGIN_NODE);
    expect(entries.find(e => e.key === "ip_lat")).toBeUndefined();
    expect(entries.find(e => e.key === "timestamp")).toBeUndefined();
    const pivotKeys = entries.filter(e => e.fieldClass === "pivotable").map(e => e.key);
    expect(pivotKeys).toContain("device_fp");
    expect(pivotKeys).toContain("ip_asn");
  });
  it("is idempotent: same input -> same output", () => {
    const a = buildFieldEntries(AUTH_FIELDS, AUTH_NODE);
    const b = buildFieldEntries(AUTH_FIELDS, AUTH_NODE);
    expect(a.map(e => e.key)).toEqual(b.map(e => e.key));
  });
});
describe("sections", () => {
  const node: ScenarioNode = {
    kind: "signin", label: "Portal sign-in", palette: "#7ee787", source: "json",
    coords: { lat: "lat", lng: "lng" }, timestamp: "timestamp",
    primary: "${holder_name} · ${ip_address}", secondary: "${ip_asn} · ${device_id}",
    pivotable: ["member_id", "session_id", "device_id", "ip_address", "ip_asn"],
    sections: [{ id: "sign-in", label: "Sign-in", fields: ["device_id", "ip_type", "timestamp", "ip_asn"] }],
  };
  const fields = {
    id: "si-0628", member_id: "mem-5169", holder_name: "Dana Whitlow",
    timestamp: "2026-06-08T09:04:17-05:00", session_id: "ps-5fb98c1a88", device_id: "QX4T7N2RB9KM",
    ip_address: "203.0.113.66", ip_asn: "AS64511 Cloud host", ip_type: "datacenter",
    lat: 52.3676, lng: 4.9041,
  };

  it("keeps the declared order and includes the timestamp when a section names it", () => {
    const e = sectionEntries(fields, node, ["device_id", "ip_type", "timestamp", "ip_asn"]);
    expect(e.map((x) => x.key)).toEqual(["device_id", "ip_type", "timestamp", "ip_asn"]);
    expect(e[2].value).toBe("Mon Jun 8 · 9:04a"); // Houston time, the timeline's style
    expect(e[2].raw).toBe("2026-06-08T09:04:17-05:00"); // raw kept for the title and the pivot
    expect(e[0].fieldClass).toBe("pivotable");
    expect(e[1].fieldClass).toBe("text");
  });

  it("flags a field the record lacks instead of dropping it", () => {
    const [e] = sectionEntries(fields, node, ["ip_country"]);
    expect(e.value).toBe("-");
    expect(e.raw).toBeUndefined();
  });

  it("classifies a money field in a section as currency", () => {
    const shipment: ScenarioNode = { kind: "shipment", label: "Shipment", palette: "#ffb347", source: "sql" };
    const [e] = sectionEntries({ fee_amount: 1184 }, shipment, ["fee_amount"]);
    expect(e.fieldClass).toBe("currency");
    expect(e.value).toBe("1184.00");
  });

  it("the remaining-fields list omits keys a section claims", () => {
    const keys = buildFieldEntries(fields, node).map((x) => x.key);
    expect(keys).not.toContain("device_id");
    expect(keys).not.toContain("ip_type");
    expect(keys).not.toContain("ip_asn");
    expect(keys).toContain("ip_address"); // pivotable, not in the section: stays
    expect(keys).toContain("holder_name");
  });
});

describe("the decision status field", () => {
  // verdictNode maps the status to `state` and the outcome to `finding`.
  const keysOf = (fields: Record<string, unknown>, node: ScenarioNode = verdictNode) =>
    buildFieldEntries({ id: "d1", memo: "m", ...fields }, node).map((e) => e.key);

  it("is dropped when the outcome repeats it", () => {
    expect(keysOf({ state: "PASS", finding: "PASSED" })).not.toContain("state");
    expect(keysOf({ state: "WAITING", finding: "WAITING" })).not.toContain("state");
  });

  it("stays when it adds information", () => {
    expect(keysOf({ state: "FAIL", finding: "ATO" })).toContain("state");
  });

  it("stays beside an empty outcome, whose row prints nothing", () => {
    expect(keysOf({ state: "WAITING", finding: "" })).toContain("state");
  });

  it("stays when the record has no outcome field at all", () => {
    expect(keysOf({ state: "PASS" })).toContain("state");
  });

  it("stays when empty: the table shows that gap in the data", () => {
    expect(keysOf({ state: "", finding: "ATO" })).toContain("state");
    expect(keysOf({ state: "   ", finding: "ATO" })).toContain("state");
    expect(keysOf({ state: null, finding: "ATO" })).toContain("state");
  });

  it("is untouched on a node with no decision mapping", () => {
    expect(keysOf({ state: "PASS", finding: "PASSED" }, plainNode)).toContain("state");
  });
});

// The printed label of a field: displayLabel is the one place that keeps an initialism in capitals. Every
// caller hands it a label made by labelForField (a key's words, each capitalised), so the cases do too.
describe("displayLabel", () => {
  it("keeps an initialism in capitals inside a capitalised label", () => {
    expect(displayLabel("Principal Id")).toBe("Principal ID");
    expect(displayLabel("Spend Limit Usd")).toBe("Spend Limit USD");
  });

  it("reads a key's label as the Inspector prints it", () => {
    expect(displayLabel(labelForField("payee_id"))).toBe("Payee ID");
    expect(displayLabel(labelForField("two_fa_used"))).toBe("2FA Used");
    expect(displayLabel(labelForField("principal_id"))).toBe("Principal ID");
  });

  it("changes a label that holds no initialism by its separators only", () => {
    expect(displayLabel("Billing City")).toBe("Billing City");
    expect(displayLabel("host_name")).toBe("host name");
  });
});

// The manifest key `omit`: fields the Inspector leaves out for records of a node. The node type does not
// name the key (lib/scenarios.ts is the model piece's), so a fixture reaches it through a cast.
describe("a node's omit key", () => {
  const withOmit = (omit: unknown): ScenarioNode =>
    ({
      kind: "org", label: "Organisation", palette: "#4da3ff", source: "json",
      pivotable: ["org_id"], omit,
    }) as unknown as ScenarioNode;
  const row = { id: "org-1", org_id: "org-1", name: "Example Org", timestamp: 0 };
  const keysOf = (node: ScenarioNode, fields: Record<string, unknown> = row) =>
    buildFieldEntries(fields, node).map((e) => e.key);

  it("prints no Timestamp row for a record whose node omits the filler timestamp", () => {
    expect(keysOf(withOmit(["timestamp"]))).not.toContain("timestamp");
    expect(keysOf(withOmit(["timestamp"]))).toContain("name");
  });

  it("prints the row as it does today when the node declares no omit", () => {
    expect(keysOf(withOmit(undefined))).toContain("timestamp");
  });

  it("changes nothing when it names a key the row lacks", () => {
    expect(keysOf(withOmit(["no_such_key"]))).toEqual(keysOf(withOmit(undefined)));
  });

  it("changes nothing when it is not an array of strings", () => {
    const plain = keysOf(withOmit(undefined));
    for (const bad of ["timestamp", 7, { 0: "timestamp" }, null, true, [1, "timestamp"], ["timestamp", null]]) {
      expect(keysOf(withOmit(bad)), JSON.stringify(bad)).toEqual(plain);
    }
  });

  it("leaves no entry, so no section, when every key left is omitted", () => {
    expect(keysOf(withOmit(["name", "timestamp"]), { id: "org-1", name: "Example Org", timestamp: 0 })).toEqual([]);
  });
});

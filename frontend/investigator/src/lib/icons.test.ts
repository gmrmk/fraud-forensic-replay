// Tests for lib/icons.ts: the vocabulary, the icon set and the two finders. They assert behaviour (the
// ids, the icons, the order of the lookup, the repository's own stories), not that the file agrees with
// itself. Nothing here reads a clock or a random source.
import { readFileSync, readdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it, expect } from "vitest";
import { FALLBACK_ICON, ICONS, VOCABULARY, fieldIconName, kindIconName } from "./icons";
import { buildFieldEntries, sectionEntries } from "./manifest-fields";
import type { ScenarioFieldWords, ScenarioNode } from "./scenarios";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(HERE, "../../../..");

const pascal = (file: string): string => {
  const camel = file.replace(/-(\w)/g, (_, c: string) => c.toUpperCase());
  return camel.charAt(0).toUpperCase() + camel.slice(1);
};

const iconOf = (id: string, kind: boolean): string | undefined =>
  VOCABULARY.find((e) => e.id === id && e.kind === kind)?.icon;

describe("the vocabulary", () => {
  it("holds 220 entries, 35 kinds and 185 attributes, each id once for its flag", () => {
    expect(VOCABULARY).toHaveLength(220);
    expect(VOCABULARY.filter((e) => e.kind)).toHaveLength(35);
    expect(VOCABULARY.filter((e) => !e.kind)).toHaveLength(185);
    const pairs = VOCABULARY.map((e) => `${e.kind ? "kind" : "field"}:${e.id}`);
    expect(new Set(pairs).size).toBe(220);
    const kindIds = new Set(VOCABULARY.filter((e) => e.kind).map((e) => e.id));
    const both = VOCABULARY.filter((e) => !e.kind && kindIds.has(e.id)).map((e) => e.id);
    expect(both.sort()).toEqual(["decision", "note"]);
  });

  it("takes each first choice, and AMEND's icon for the four it names", () => {
    expect(iconOf("cards_compromised", false)).toBe("copy-minus");
    expect(iconOf("decline_reason", false)).toBe("scroll-text");
    expect(iconOf("error_responses", false)).toBe("message-square-reply");
    expect(iconOf("billing_city", false)).toBe("house");
    expect(iconOf("auth", true)).toBe("receipt-text");
    expect(iconOf("ip_address", false)).toBe("ethernet-port");
    expect(iconOf("merchant_country", false)).toBe("map");
    expect(iconOf("session_id", false)).toBe("cookie");
  });

  it("no two entries share an icon, and none is the fallback", () => {
    expect(new Set(VOCABULARY.map((e) => e.icon)).size).toBe(220);
    for (const e of VOCABULARY) expect(e.icon).not.toBe(FALLBACK_ICON);
  });
});

describe("the icon set", () => {
  it("every vocabulary icon has its own component in the set", () => {
    for (const e of VOCABULARY) {
      expect(Object.hasOwn(ICONS, e.icon), e.icon).toBe(true);
      expect(ICONS[e.icon].displayName, e.icon).toBe(pascal(e.icon));
    }
  });

  it("holds the vocabulary's icons and the fallback, and nothing else", () => {
    const want = [...VOCABULARY.map((e) => e.icon), "square-dashed"].sort();
    expect(Object.keys(ICONS).sort()).toEqual(want);
    expect(Object.keys(ICONS)).toHaveLength(221);
    expect(FALLBACK_ICON).toBe("square-dashed");
    expect(ICONS["square-dashed"].displayName).toBe("SquareDashed");
  });

  it("imports named icons only, never the whole map or the loader", () => {
    const src = readFileSync(resolve(HERE, "icons.ts"), "utf8");
    expect(src).not.toContain("import * as");
    expect(src).not.toContain("lucide-react/");
    expect(src).not.toContain("DynamicIcon");
    expect(src).not.toContain("dynamicIconImports");
    const imports = [...src.matchAll(/import\s+([^;]*?)\s+from\s+"lucide-react"/g)];
    expect(imports.length).toBeGreaterThan(0);
    for (const m of imports) expect(m[1]).toMatch(/^(type\s+)?\{[\s\S]*\}$/);
  });
});

const node = (extra: Record<string, unknown>): ScenarioNode =>
  ({ kind: "auth", label: "Authorization", palette: "accent", source: "sql", ...extra }) as unknown as ScenarioNode;

describe("finding a kind's icon", () => {
  it("finds a kind by its id, and the fallback for an id the vocabulary does not hold", () => {
    expect(kindIconName("auth", [])).toBe("receipt-text");
    expect(kindIconName("parcel", [])).toBe("square-dashed");
  });

  it("tells a kind from an attribute of the same id", () => {
    expect(kindIconName("note", [])).toBe("sticky-note");
    expect(fieldIconName("note", undefined)).toBe("message-square-text");
    expect(kindIconName("decision", [])).toBe("gavel");
    expect(fieldIconName("decision", undefined)).toBe("scale");
  });

  it("a story's own kind icon wins: a hand-made schema node", () => {
    expect(kindIconName("auth", [node({ icon: "orbit" })])).toBe("orbit");
    expect(kindIconName("auth", [node({ icon: "tags" })])).toBe("receipt-text");
    expect(kindIconName("auth", [node({ icon: 42 })])).toBe("receipt-text");
    const other = node({ kind: "login", icon: "orbit" });
    expect(kindIconName("auth", [other, node({})])).toBe("receipt-text");
  });
});

describe("finding an attribute's icon", () => {
  it("finds an attribute by its id or the record key's alias", () => {
    expect(fieldIconName("mcc", undefined)).toBe("tag");
    expect(fieldIconName("ip", undefined)).toBe("ethernet-port");
    expect(fieldIconName("event_id", undefined)).toBe("logs");
    expect(fieldIconName("holder_name", undefined)).toBe("square-dashed");
    expect(fieldIconName("constructor", undefined)).toBe("square-dashed");
  });

  it("a story's own field icon wins: a hand-made fields map", () => {
    const words = (m: Record<string, unknown>) => m as unknown as Record<string, ScenarioFieldWords>;
    expect(fieldIconName("mcc", words({ mcc: { label: "MCC", icon: "hash" } }))).toBe("hash");
    expect(fieldIconName("mcc", words({ mcc: { label: "MCC", icon: "tags" } }))).toBe("tag");
    expect(fieldIconName("mcc", words({ mcc: { label: "MCC" } }))).toBe("tag");
    expect(fieldIconName("ip", words({ ip: { label: "IP", icon: "hash" } }))).toBe("hash");
  });
});

describe("the repository's own stories", () => {
  // The pinned list of record keys a shipped story prints that fall back to square-dashed. Empty today:
  // every key is a vocabulary id or an alias of one. A new story key must be added to the vocabulary or
  // named here on purpose.
  const EXPECTED_FALLBACKS: readonly string[] = [];
  const BUILT_IN = new Set(["auth", "fraud", "login", "place", "account_event", "transfer"]);
  // The public copy leaves these two manifests out (SKIP in scripts/export-public.mjs), so the folder
  // holds ten files in the working repository and eight in the copy. The eight that ship are pinned by
  // name, and every manifest that is there is read, in either tree.
  const LEFT_OUT_OF_THE_COPY = ["card-fraud-concordia.scenario.json", "population.scenario.json"];
  const SHIPPED = [
    "agent-runs-shared-key.scenario.json",
    "card-fraud.scenario.json",
    "key-many-networks.scenario.json",
    "platform-access.scenario.json",
    "priya-ato.scenario.json",
    "seat-failed-signins.scenario.json",
    "seats-two-networks.scenario.json",
    "volume-step.scenario.json",
  ];

  it("fall back nowhere (the pinned list)", () => {
    const dir = resolve(REPO_ROOT, "backend/scenarios");
    const files = readdirSync(dir).filter((f) => f.endsWith(".scenario.json")).sort();
    expect(files.filter((f) => !LEFT_OUT_OF_THE_COPY.includes(f))).toEqual(SHIPPED);

    const seen = new Set<string>();
    let nodesRead = 0;
    for (const f of files) {
      const manifest = JSON.parse(readFileSync(resolve(dir, f), "utf8")) as { nodes: ScenarioNode[] };
      for (const n of manifest.nodes) {
        expect(kindIconName(n.kind, []), `${f} ${n.kind}`).not.toBe(FALLBACK_ICON);
        const file = (n as ScenarioNode & { file?: string }).file;
        if (BUILT_IN.has(n.kind) || !file) continue;
        const rows = JSON.parse(readFileSync(resolve(REPO_ROOT, file), "utf8")) as Record<string, unknown>[];
        nodesRead += 1;
        for (const row of rows) {
          for (const e of buildFieldEntries(row, n)) seen.add(e.key);
          for (const s of n.sections ?? []) for (const e of sectionEntries(row, n, s.fields)) seen.add(e.key);
        }
      }
    }
    expect(nodesRead).toBeGreaterThan(0);
    expect(seen.has("ip")).toBe(true);
    expect(seen.has("event_id")).toBe(true);
    const fallen = [...seen].filter((k) => fieldIconName(k, undefined) === FALLBACK_ICON).sort();
    expect(fallen).toEqual(EXPECTED_FALLBACKS);
  });
});

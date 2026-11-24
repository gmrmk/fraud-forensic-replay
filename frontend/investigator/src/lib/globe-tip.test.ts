// frontend/investigator/src/lib/globe-tip.test.ts
// What the globe's tooltip says. One mark gives that record's own lines, the same
// lines as its node on the Timeline (kind label, headline, second line, when, then its field
// lines). Several marks at one place give a count, and a count by kind, with a sum only for a kind
// that has an amount. A tooltip says what a thing is and its values, never what to conclude.
// The records are written here, as entities of two kinds the test names (the lib knows no pack).
import { describe, expect, it } from "vitest";
import type { Entity } from "./entity";
import { buildGlobeTipIndex, globeTip, type GlobeTipEntry } from "./globe-tip";
import { recordLines } from "./time-words";

const T0 = Date.parse("2026-06-08T22:37:00Z");

const entity = (id: string, kind: string, fields: Record<string, unknown> = {}, t = T0): Entity => ({
  id,
  kind,
  timestamp: t,
  coords: { lat: 1, lng: 2 },
  fields,
  displayMetadata: { primaryLabel: `head ${id}`, secondaryLabel: `second ${id}`, paletteKind: kind, pivotableFields: [] },
});

const NODES = [
  { kind: "usage", label: "Token usage", magnitude: "usd", magnitudeUnit: "USD" },
  { kind: "signin", label: "Console sign-in" },
];

const accentFor = (kind: string): string => `accent-${kind}`;

describe("buildGlobeTipIndex", () => {
  it("keys each record by id and takes the kind's label from the manifest", () => {
    const index = buildGlobeTipIndex([entity("a", "signin")], NODES);
    const rec = index.get("a");
    expect(rec).toMatchObject({ kind: "signin", kindLabel: "Console sign-in", primary: "head a", secondary: "second a", t: T0 });
  });

  it("names a kind the manifest does not label by its own id", () => {
    expect(buildGlobeTipIndex([entity("a", "mystery")], NODES).get("a")?.kindLabel).toBe("mystery");
  });

  it("holds an amount only when the kind names a field and the record holds a number there", () => {
    const index = buildGlobeTipIndex(
      [entity("u1", "usage", { usd: 12.5 }), entity("u2", "usage", { usd: "n/a" }), entity("s1", "signin", { usd: 9 })],
      NODES,
    );
    expect(index.get("u1")).toMatchObject({ value: 12.5, unit: "USD" });
    expect(index.get("u2")?.value).toBeNull();
    expect(index.get("s1")?.value).toBeNull();
  });

  it("keeps a record's field lines from the function the caller gives", () => {
    const index = buildGlobeTipIndex([entity("a", "signin")], NODES, () => ["Device trust: new"]);
    expect(index.get("a")?.facts).toEqual(["Device trust: new"]);
    expect(buildGlobeTipIndex([entity("a", "signin")], NODES).get("a")?.facts).toEqual([]);
  });
});

describe("globeTip: one mark", () => {
  const index = buildGlobeTipIndex([entity("a", "signin")], NODES, () => ["Device trust: new"]);

  it("gives that record's own lines, as the Timeline's node gives them", () => {
    const shown = globeTip([index.get("a")!], "12h", accentFor);
    expect(shown?.lines).toEqual(recordLines("Console sign-in", "head a", "second a", T0, ["Device trust: new"], "12h"));
  });

  it("takes the colour of its kind", () => {
    expect(globeTip([index.get("a")!], "12h", accentFor)?.accent).toBe("accent-signin");
  });

  it("prints the time in the clock's form", () => {
    const at12 = globeTip([index.get("a")!], "12h", accentFor)?.lines.join("|");
    const at24 = globeTip([index.get("a")!], "24h", accentFor)?.lines.join("|");
    expect(at12).not.toBe(at24);
    expect(at24).toMatch(/\d{2}:\d{2}/);
  });
});

describe("globeTip: several marks", () => {
  const index = buildGlobeTipIndex(
    [
      entity("u1", "usage", { usd: 10 }),
      entity("u2", "usage", { usd: 2.25 }),
      entity("s1", "signin"),
      entity("s2", "signin"),
      entity("s3", "signin"),
    ],
    NODES,
  );
  const pick = (...ids: string[]): GlobeTipEntry[] => ids.map((id) => index.get(id)!);

  it("counts the marks, then each kind, in the order the kinds first appear", () => {
    const shown = globeTip(pick("s1", "u1", "s2", "s3", "u2"), "12h", accentFor);
    expect(shown?.lines).toEqual(["5 marks at this place", "Console sign-in 3", "Token usage 2 · 12.25 USD in all"]);
  });

  it("gives a sum only for a kind that has an amount", () => {
    const lines = globeTip(pick("s1", "s2"), "12h", accentFor)?.lines ?? [];
    expect(lines).toEqual(["2 marks at this place", "Console sign-in 2"]);
  });

  it("gives a sum of nothing for a kind whose amounts add up to 0, since the kind has an amount", () => {
    const zero = buildGlobeTipIndex([entity("z1", "usage", { usd: 0 }), entity("z2", "usage", { usd: 0 })], NODES);
    expect(globeTip([zero.get("z1")!, zero.get("z2")!], "12h", accentFor)?.lines).toEqual([
      "2 marks at this place",
      "Token usage 2 · 0 USD in all",
    ]);
  });

  it("adds only the records of a kind that hold a number", () => {
    const mixed = buildGlobeTipIndex([entity("m1", "usage", { usd: 4 }), entity("m2", "usage", {})], NODES);
    expect(globeTip([mixed.get("m1")!, mixed.get("m2")!], "12h", accentFor)?.lines[1]).toBe("Token usage 2 · 4 USD in all");
  });

  it("takes the colour of the kind when all the marks are one kind, and none when they are several", () => {
    expect(globeTip(pick("s1", "s2"), "12h", accentFor)?.accent).toBe("accent-signin");
    expect(globeTip(pick("s1", "u1"), "12h", accentFor)?.accent).toBeNull();
  });
});

describe("globeTip: no mark", () => {
  it("gives nothing", () => {
    expect(globeTip([], "12h", accentFor)).toBeNull();
  });
});

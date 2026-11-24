import { beforeEach, describe, expect, it } from "vitest";
import { syncSolo, useSolo } from "./solo";
import { useMatches } from "./matches";
import { manifestRowToEntity } from "../lib/adapters/manifest-row";
import type { PivotContext } from "../lib/matches";
import type { ScenarioNode } from "../lib/scenarios";

// Captured at import, before any test mutates the store: the module's own default.
const initialSolo = useSolo.getState().solo;

const node: ScenarioNode = {
  kind: "ping", label: "Ping", palette: "#4da3ff", source: "sql", coords: null, timestamp: "at",
  primary: "${id}", secondary: "${grp}", pivotable: ["grp"],
};
const entities = [
  manifestRowToEntity(node, { id: "e-1", at: "2026-05-12T10:09:00-05:00", grp: "Acme" }),
];
const ctx: PivotContext = { transactions: [], logins: [], places: [], entities };

describe("useSolo", () => {
  beforeEach(() => {
    useSolo.setState({ solo: null });
    useMatches.setState({ active: null });
  });

  it("defaults to no solo", () => {
    expect(initialSolo).toBeNull();
  });

  it("toggle sets the solo as { field, value }", () => {
    useSolo.getState().toggle("grp", "Acme");
    expect(useSolo.getState().solo).toEqual({ field: "grp", value: "Acme" });
    expect(Object.keys(useSolo.getState().solo ?? {}).sort()).toEqual(["field", "value"]);
  });

  it("a second toggle of the same row clears it", () => {
    useSolo.getState().toggle("grp", "Acme");
    useSolo.getState().toggle("grp", "Acme");
    expect(useSolo.getState().solo).toBeNull();
  });

  it("a toggle of another value switches the solo", () => {
    useSolo.getState().toggle("grp", "Acme");
    useSolo.getState().toggle("grp", "Borne");
    expect(useSolo.getState().solo).toEqual({ field: "grp", value: "Borne" });
  });

  it("the same value under another field is another row", () => {
    useSolo.getState().toggle("grp", "x");
    useSolo.getState().toggle("seat", "x");
    expect(useSolo.getState().solo).toEqual({ field: "seat", value: "x" });
  });

  it("clear removes the solo, and clear with none stays none", () => {
    useSolo.getState().toggle("grp", "Acme");
    useSolo.getState().clear();
    expect(useSolo.getState().solo).toBeNull();
    useSolo.getState().clear();
    expect(useSolo.getState().solo).toBeNull();
  });

  it("an empty field or value is not a row and sets nothing", () => {
    useSolo.getState().toggle("", "Acme");
    expect(useSolo.getState().solo).toBeNull();
    useSolo.getState().toggle("grp", "");
    expect(useSolo.getState().solo).toBeNull();
  });

  it("leaves the Matches window as it was", () => {
    useMatches.getState().open("card_id", "c1");
    const before = useMatches.getState().active;
    useSolo.getState().toggle("grp", "Acme");
    expect(useMatches.getState().active).toBe(before);
  });

  it("leaves the whole matches store state equal through every toggle, clear and syncSolo", () => {
    useMatches.getState().open("card_id", "c1");
    const stateBefore = useMatches.getState();
    // a deep copy of the data entries (functions dropped): an in-place write to `active` would not hide in a shared reference
    const dataOf = (s: object) => structuredClone(Object.fromEntries(Object.entries(s).filter(([, v]) => typeof v !== "function")));
    const copyBefore = dataOf(stateBefore);
    expect(copyBefore).toEqual({ active: { mode: "field", field: "card_id", value: "c1", parentKind: "auth" } });
    const steps: [string, () => void][] = [
      ["toggle on", () => useSolo.getState().toggle("grp", "Acme")],
      ["syncSolo keeps it", () => syncSolo(ctx)],
      ["toggle to another value", () => useSolo.getState().toggle("grp", "Borne")],
      ["syncSolo clears it", () => syncSolo(ctx)],
      ["toggle on again", () => useSolo.getState().toggle("grp", "Acme")],
      ["toggle off", () => useSolo.getState().toggle("grp", "Acme")],
      ["toggle on, then clear", () => { useSolo.getState().toggle("grp", "Acme"); useSolo.getState().clear(); }],
    ];
    const soloAfter: (string | null)[] = [];
    for (const [name, step] of steps) {
      step();
      soloAfter.push(useSolo.getState().solo?.value ?? null);
      expect(dataOf(useMatches.getState()), name).toEqual(copyBefore);
      expect(useMatches.getState(), name).toBe(stateBefore);
    }
    // the steps did write the solo store (so the matches checks above had something to catch),
    // the syncSolo that clears among them
    expect(soloAfter).toEqual(["Acme", "Acme", "Borne", null, "Acme", null, null]);
  });
});

describe("syncSolo", () => {
  beforeEach(() => useSolo.setState({ solo: null }));

  it("keeps a solo whose value is in the data", () => {
    useSolo.getState().toggle("grp", "Acme");
    syncSolo(ctx);
    expect(useSolo.getState().solo).toEqual({ field: "grp", value: "Acme" });
  });

  it("clears a solo whose value has left the data", () => {
    useSolo.getState().toggle("grp", "Gone");
    syncSolo(ctx);
    expect(useSolo.getState().solo).toBeNull();
  });

  it("clears a solo when the data holds none of that field (a scenario change)", () => {
    useSolo.getState().toggle("grp", "Acme");
    syncSolo({ transactions: [], logins: [], places: [] });
    expect(useSolo.getState().solo).toBeNull();
  });

  it("does nothing when nothing is soloed", () => {
    syncSolo(ctx);
    expect(useSolo.getState().solo).toBeNull();
  });
});

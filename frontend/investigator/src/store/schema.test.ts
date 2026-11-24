import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it, expect, beforeEach } from "vitest";
import { useSchema } from "./schema";
import type { ScenarioNode } from "../lib/scenarios";

const LOGIN_NODE: ScenarioNode = {
  kind: "login",
  label: "Login",
  palette: "#b388ff",
  source: "sql",
  timestamp: "timestamp",
  primary: "device_fp",
  secondary: "outcome",
  pivotable: ["session_id"],
};

beforeEach(() => {
  useSchema.setState({ nodes: [], scenarioId: null, rows: undefined, fields: undefined, lanes: undefined });
});

describe("useSchema", () => {
  it("exposes nodes and answers nodeFor(kind)", () => {
    useSchema.getState().setNodes([LOGIN_NODE]);
    expect(useSchema.getState().nodeFor("login")?.primary).toBe("device_fp");
    expect(useSchema.getState().nodeFor("nope")).toBeUndefined();
  });

  describe("setActive and the manifest's root keys", () => {
    const rows = { by: "region" };
    const fields = { region: { label: "Region" } };
    const lanes = [
      {
        id: "cost-by-hour",
        name: "Orders",
        label: "Cost",
        unit: "EUR",
        kinds: ["order"],
        field: "cost",
        bucket: "hour" as const,
        aggregate: "sum" as const,
      },
    ];

    it("takes rows, fields and lanes as an optional third argument and holds them as given", () => {
      useSchema.getState().setActive("fixture", [LOGIN_NODE], { rows, fields, lanes });
      const state = useSchema.getState();
      expect(state.scenarioId).toBe("fixture");
      expect(state.nodes).toEqual([LOGIN_NODE]);
      expect(state.rows).toEqual(rows);
      expect(state.fields).toEqual(fields);
      expect(state.lanes).toEqual(lanes);
    });

    it("with no third argument, or keys left undefined, holds none: the last pack's do not stay", () => {
      useSchema.getState().setActive("fixture", [LOGIN_NODE], { rows, fields, lanes });
      useSchema.getState().setActive("bare", [LOGIN_NODE]);
      expect(useSchema.getState()).toMatchObject({ scenarioId: "bare", rows: undefined, fields: undefined, lanes: undefined });
      useSchema.getState().setActive("fixture", [LOGIN_NODE], { rows, fields, lanes });
      useSchema.getState().setActive("partial", [LOGIN_NODE], { lanes });
      expect(useSchema.getState()).toMatchObject({ rows: undefined, fields: undefined, lanes });
    });

    // The keys are optional, so a type check cannot see the app drop them: the app's one call is read.
    it("the app seeds the store with the active manifest's rows, fields and lanes", () => {
      const app = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), "../App.tsx"), "utf8");
      expect(app).toMatch(/setActive\(\s*s\.id,\s*s\.nodes,\s*\{\s*rows: s\.rows,\s*fields: s\.fields,\s*lanes: s\.lanes\s*\}\s*\)/);
    });

    it("setNodes leaves them alone", () => {
      useSchema.getState().setActive("fixture", [LOGIN_NODE], { rows, fields, lanes });
      useSchema.getState().setNodes([]);
      expect(useSchema.getState().lanes).toEqual(lanes);
    });
  });
});

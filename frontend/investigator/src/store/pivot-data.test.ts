import { describe, it, expect } from "vitest";
import { usePivotData } from "./pivot-data";
import type { Entity } from "../lib/entity";

describe("usePivotData", () => {
  it("stores the manifest entities beside the behavioral arrays", () => {
    const e = { id: "x1", kind: "k", timestamp: 0, coords: null, fields: {}, displayMetadata: { primaryLabel: "", secondaryLabel: "", paletteKind: "k", pivotableFields: [] } } as Entity;
    usePivotData.getState().setPivotData({ transactions: [], logins: [], accountEvents: [], transfers: [], entities: [e] });
    expect(usePivotData.getState().entities).toEqual([e]);
  });
});

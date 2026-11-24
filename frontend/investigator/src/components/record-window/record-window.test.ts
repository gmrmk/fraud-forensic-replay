/**
 * The record window's small helpers (PLAN-window R1.4): the kind's label, the disposition glyphs,
 * the status line of a refused press, the window's accent and the Inspector's lookup.
 */
import { beforeEach, describe, expect, it } from "vitest";
import { GLYPH_OF, MID, inspectorLookup, kindLabelOf, recordAccent, statusWord } from "./record-window";
import { paletteForKind } from "../../lib/entity-palette";
import type { Entity } from "../../lib/entity";
import { infoOf } from "../../lib/notes/test-fixtures";
import type { ScenarioNode } from "../../lib/scenarios";
import { STATUS } from "../../lib/tooltip-words/record-window";
import { usePivotData } from "../../store/pivot-data";
import type { Place, SelectedEntity } from "../../types";

const node = (kind: string, label: string): ScenarioNode => ({ kind, label, palette: "#ffffff", source: kind });

const entity = (id: string, kind: string): Entity => ({
  id,
  kind,
  timestamp: 1_000,
  coords: { lat: 10, lng: 20 },
  fields: {},
  displayMetadata: { primaryLabel: `name ${id}`, secondaryLabel: "", paletteKind: kind, pivotableFields: [] },
});

const place = (id: string): Place => ({ id, name: `Place ${id}`, category: "cafe", lat: 30.5, lng: -90.25 });

beforeEach(() => {
  usePivotData.setState({ transactions: [], logins: [], accountEvents: [], transfers: [], entities: [] });
});

describe("record window helpers", () => {
  it("MID is the middle dot, built from its code point", () => {
    expect(MID).toBe(String.fromCharCode(0xb7));
  });

  it("kindLabelOf gives the manifest node's label, and the kind itself when no node has it", () => {
    const nodes = [node("reset", "Password reset"), node("signin", "Sign-in")];
    expect(kindLabelOf("reset", nodes)).toBe("Password reset");
    expect(kindLabelOf("signin", nodes)).toBe("Sign-in");
    expect(kindLabelOf("auth", nodes)).toBe("auth");
  });

  it("statusWord maps a refusal code to the window's three status lines", () => {
    expect(statusWord("backing_failed")).toBe(STATUS.backingFailed);
    expect(statusWord("limit_reached")).toBe(STATUS.limitReached);
    expect(statusWord("bad_reply")).toBe(STATUS.refused);
    expect(statusWord("bad_scenario")).toBe(STATUS.refused);
  });

  it("GLYPH_OF maps pass, fail and wait to check, cross and hourglass", () => {
    expect(GLYPH_OF).toEqual({ pass: "check", fail: "cross", wait: "hourglass" });
  });

  it("recordAccent is the palette of the drawn kind, and of the record's own kind when there is no info", () => {
    const withInfo = infoOf({ draw: { kind: "auth", id: "rec-1", timestamp: 0, fields: {} } });
    expect(recordAccent(withInfo, { kind: "fraud", id: "rec-1" })).toBe(paletteForKind("auth").hex);
    expect(recordAccent(null, { kind: "login", id: "lg-1" })).toBe(paletteForKind("login").hex);
  });

  it("inspectorLookup finds an entity record from the pivot data", () => {
    usePivotData.setState({ entities: [entity("rec-1", "stop")] });
    const info = inspectorLookup(null)({ kind: "stop", id: "rec-1" });
    expect(info?.headline).toBe("name rec-1");
    expect(info?.lngLat).toEqual({ lng: 20, lat: 10 });
    expect(inspectorLookup(null)({ kind: "stop", id: "rec-9" })).toBeNull();
  });

  it("inspectorLookup finds the selected place, which the pivot data does not hold", () => {
    const p = place("pl-1");
    const selected: SelectedEntity = { kind: "place", place: p };
    expect(inspectorLookup(null)({ kind: "place", id: "pl-1" })).toBeNull();
    const info = inspectorLookup(selected)({ kind: "place", id: "pl-1" });
    expect(info?.lngLat).toEqual({ lng: -90.25, lat: 30.5 });
    expect(info?.headline).toBe("Place pl-1");
  });

  it("inspectorLookup builds its lookup once for one selection and one set of lists", () => {
    usePivotData.setState({ entities: [entity("rec-1", "stop")] });
    const p = place("pl-1");
    const a = inspectorLookup({ kind: "place", place: p });
    expect(inspectorLookup({ kind: "place", place: p })).toBe(a);
    // a fresh selection object for the same place does not rebuild it
    expect(inspectorLookup({ kind: "place", place: p })).toBe(a);
    // a new selected place, or new data, does
    expect(inspectorLookup({ kind: "place", place: place("pl-2") })).not.toBe(a);
    usePivotData.setState({ entities: [entity("rec-2", "stop")] });
    expect(inspectorLookup({ kind: "place", place: p })).not.toBe(a);
    expect(inspectorLookup(null)({ kind: "stop", id: "rec-2" })?.headline).toBe("name rec-2");
  });
});

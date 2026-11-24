// The card globe's authorization and login layers are never hidden by a visibility call. The
// Authorizations and Logins switches act on the data App hands the globe (the one function in
// lib/marks/draw narrows it), so the selected record of a switched-off kind, which that function
// keeps, is drawn here too. Only the Places switch hides its layers. This test reads GlobeMap.tsx as
// source, as App.layers-menu.test.ts does for App: GlobeMap needs WebGL and is not mounted for this.
// It does not test the data's narrowing (App.layers-narrow.test.tsx).
import { describe, expect, it } from "vitest";
import source from "./GlobeMap.tsx?raw";

const setLines = source.split("\n").filter((l) => l.includes("set(["));

describe("GlobeMap: the card layers' visibility", () => {
  it("no line hides the authorization or login layers: their switches act on the data", () => {
    const hiding = setLines.filter((l) => l.includes('"ml-auths-halo"') || l.includes('"ml-logins-halo"'));
    expect(hiding).toEqual([]);
  });

  it("the Places switch still hides its layers", () => {
    const lines = setLines.filter((l) => l.includes('"ml-places-halo"'));
    expect(lines, "one set([...]) line names ml-places-halo").toHaveLength(1);
    expect(lines[0].trim()).toMatch(/, showPlaces\);$/);
  });

  it("the visibility effect depends on the Places switch only", () => {
    const start = source.indexOf("Reactive layer visibility.");
    expect(start).toBeGreaterThan(-1);
    const end = source.indexOf("}, [", start);
    expect(end).toBeGreaterThan(start);
    const deps = source.slice(end, source.indexOf("]);", end) + 3);
    expect(deps).toBe("}, [showPlaces]);");
  });

  it("the globe draws no heat layer and reads no view", () => {
    expect(source).not.toContain("ml-heat");
    expect(source).not.toContain("useView");
  });
});

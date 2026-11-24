import { describe, it, expect } from "vitest";
import appSource from "./App.tsx?raw";

// The map is mounted through its recovery wrapper, so a throw from the map's effects or a
// lost WebGL context rebuilds the map instead of unmounting the app. The behaviour is tested in
// components/MapRecovery.test.tsx and in a browser; this pins that App still uses the wrapper.
describe("App mounts the map through MapRecovery", () => {
  it("imports and renders RecoveringGlobeMap, never GlobeMap bare", () => {
    expect(appSource).toMatch(/import \{ RecoveringGlobeMap \} from "\.\/components\/MapRecovery";/);
    expect(appSource.match(/<RecoveringGlobeMap\b/g) ?? []).toHaveLength(1);
    expect(appSource).not.toMatch(/<GlobeMap\b/);
    expect(appSource).not.toMatch(/from "\.\/components\/GlobeMap"/);
  });

  it("gives the wrapper the setter that also takes null, so a lost map leaves no stale instance", () => {
    const tag = appSource.match(/<RecoveringGlobeMap\b[\s\S]*?\/>/);
    expect(tag, "the RecoveringGlobeMap element").not.toBeNull();
    expect(tag![0]).toMatch(/onMapReady=\{setMapInstance\}/);
    expect(appSource).toMatch(/useState<maplibregl\.Map \| null>\(null\)/);
  });
});

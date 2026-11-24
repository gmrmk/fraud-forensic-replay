import { describe, it, expect } from "vitest";
import globeSource from "./GlobeMap.tsx?raw";

// GlobeMap needs a WebGL map and is mounted by no test, so its wiring to the pulse hooks and the
// shared tween is read from source (the pattern of App.root-clip.test.ts). The hooks themselves
// are tested in isolation.
describe("GlobeMap wires the radar pulse", () => {
  // closes G11.
  it("imports and calls useRadarPulse with the map, the loaded flag and the fraud marker ref", () => {
    expect(globeSource).toMatch(/import\s*\{\s*useRadarPulse\s*\}\s*from\s*["']\.\/useRadarPulse["']/);
    const call = /useRadarPulse\(\{([^}]*)\}\)/.exec(globeSource);
    expect(call, "a useRadarPulse({ ... }) call").not.toBeNull();
    const args = call![1].split(",").map((a) => a.trim()).filter(Boolean).sort();
    expect(args).toEqual(["fraudMarkersRef", "mapLoadedRef", "mapRef"]);
  });

  it("mirrors the visible fraud transactions into fraudMarkersRef as { id, ts }", () => {
    const mirror = /fraudMarkersRef\.current\s*=\s*fraudTransactions\.map\(\(t\)\s*=>\s*\(\{([^}]*)\}\)\)/.exec(globeSource);
    expect(mirror, "the ref mirror assignment").not.toBeNull();
    expect(mirror![1]).toMatch(/\bid:\s*t\.id\b/);
    expect(mirror![1]).toMatch(/\bts:\s*Date\.parse\(t\.timestamp\)/);
  });

  it("no longer drives the map motion through animejs", () => {
    expect(globeSource).not.toMatch(/from\s*["']animejs/);
    expect(globeSource).not.toMatch(/\banime\s*\(/);
  });
});

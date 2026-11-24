import { describe, it, expect } from "vitest";
import territorySource from "./territory-layer.ts?raw";

// The hatch's draw callback needs a GL context, so the shared reduced-motion read is checked from
// source (the pattern of App.root-clip.test.ts). territory-layer.test.ts reaches reduced motion
// only through hatchPhasePx's argument, not through the import the draw path reads it from.
describe("territory hatch reduced motion", () => {
  // closes G13.
  it("reads the shared prefersReducedMotion from lib/tween, not a local matchMedia", () => {
    expect(territorySource).toMatch(/import\s*\{[^}]*\bprefersReducedMotion\b[^}]*\}\s*from\s*["']\.\.\/lib\/tween["']/);
    expect(territorySource).toMatch(/const reducedMotion = prefersReducedMotion\(\)/);
    expect(territorySource).not.toMatch(/matchMedia/);
  });

  it("feeds that flag to both the hatch phase and the repaint loop", () => {
    expect(territorySource).toMatch(/hatchPhasePx\([^)]*reducedMotion\)/);
    expect(territorySource).toMatch(/isPlaying\s*&&\s*!reducedMotion/);
  });
});

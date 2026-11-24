import { describe, it, expect } from "vitest";
import { contrastRatio, legibleOnPanel } from "./legibility";
import { hexToRgb01 } from "./to-rgb";

// WCAG contrast + a luminance-clamp that makes a globe-tuned slot color legible
// on a panel substrate. The ramp slots are tuned for the dark globe;
// as text/dots on the instrument panel they can drop to ~1.1:1 (deuteranopia auth
// navy on the near-black panel). legibleOnPanel lightens (dark panel) or darkens
// (light panel) the color, preserving hue, until it clears the contrast floor.

const DARK_PANEL = hexToRgb01("#222a36"); // panelTop dark "34 42 54" - lightest stop
const LIGHT_PANEL = hexToRgb01("#eef2f7"); // panelFloor light "238 242 247" - darkest stop

describe("contrastRatio", () => {
  it("is 21:1 for black on white", () => {
    expect(contrastRatio(hexToRgb01("#000000"), hexToRgb01("#ffffff"))).toBeCloseTo(21, 0);
  });

  it("is 1:1 for a color against itself", () => {
    expect(contrastRatio(hexToRgb01("#3690c0"), hexToRgb01("#3690c0"))).toBeCloseTo(1, 5);
  });

  it("is order-independent", () => {
    const a = hexToRgb01("#00316f");
    const b = hexToRgb01("#222a36");
    expect(contrastRatio(a, b)).toBeCloseTo(contrastRatio(b, a), 6);
  });
});

describe("legibleOnPanel", () => {
  it("returns an already-legible color unchanged (white on the dark panel)", () => {
    // White already clears 4.5:1 on the dark panel, so the vivid input is kept.
    expect(legibleOnPanel("#ffffff", DARK_PANEL)).toBe("#ffffff");
  });

  it("lightens a dark navy until it clears 4.5:1 on the dark panel", () => {
    // The deuteranopia auth slot (#00316F) fails at ~1.1:1 as panel text.
    const before = contrastRatio(hexToRgb01("#00316f"), DARK_PANEL);
    expect(before).toBeLessThan(4.5);
    const fixed = legibleOnPanel("#00316f", DARK_PANEL);
    expect(contrastRatio(hexToRgb01(fixed), DARK_PANEL)).toBeGreaterThanOrEqual(4.5);
    // It moved toward higher luminance (lightened), not darker.
    expect(hexToRgb01(fixed)[2]).toBeGreaterThan(hexToRgb01("#00316f")[2]);
  });

  it("darkens a light color until it clears 4.5:1 on the light panel", () => {
    // A light slot (#bfc9e1 tritanopia-ish) fails as dark-panel-less text on white.
    const fixed = legibleOnPanel("#bdc9e1", LIGHT_PANEL);
    expect(contrastRatio(hexToRgb01(fixed), LIGHT_PANEL)).toBeGreaterThanOrEqual(4.5);
    // It moved toward lower luminance (darkened).
    const lum = (h: string) => hexToRgb01(h)[0] + hexToRgb01(h)[1] + hexToRgb01(h)[2];
    expect(lum(fixed)).toBeLessThan(lum("#bdc9e1"));
  });

  it("preserves the hue family of a saturated color while fixing contrast", () => {
    // #00316F is a blue (B is the dominant channel). After lightening for the dark
    // panel, blue must still dominate - CVD-safe hue must survive the clamp.
    const fixed = legibleOnPanel("#00316f", DARK_PANEL);
    const [r, g, b] = hexToRgb01(fixed);
    expect(b).toBeGreaterThan(r);
    expect(b).toBeGreaterThanOrEqual(g);
  });

  it("lightens a mid gray (monochrome) until legible, staying gray", () => {
    const fixed = legibleOnPanel("#595959", DARK_PANEL);
    expect(contrastRatio(hexToRgb01(fixed), DARK_PANEL)).toBeGreaterThanOrEqual(4.5);
    const [r, g, b] = hexToRgb01(fixed);
    // Gray stays gray (channels equal within rounding).
    expect(Math.abs(r - g)).toBeLessThan(0.02);
    expect(Math.abs(g - b)).toBeLessThan(0.02);
  });

  it("always returns a valid #rrggbb string", () => {
    for (const c of ["#00316f", "#ffffff", "#595959", "#ff6b35", "#bdc9e1"]) {
      expect(legibleOnPanel(c, DARK_PANEL)).toMatch(/^#[0-9a-f]{6}$/);
    }
  });

  it("returns best-effort (possibly below floor) for an UNREACHABLE floor - documents the AAA gap", () => {
    // AA (4.5) is reachable against any background, but the max contrast any color
    // can reach against a mid-luminance bg bottoms out at ~4.58:1, so AAA (7) is
    // unreachable there. The loop exhausts at the extreme and returns the best
    // achievable - which the JSDoc states may be below minContrast. Pin that limit
    // so the gap is documented, not discovered (the sole production caller uses 4.5).
    const MID = hexToRgb01("#767676"); // luminance ~0.18 - the worst case for reachability
    const result = legibleOnPanel("#808080", MID, 7);
    expect(result).toMatch(/^#[0-9a-f]{6}$/);
    const reached = contrastRatio(hexToRgb01(result), MID);
    expect(reached).toBeLessThan(7); // could NOT reach the unreachable floor...
    expect(reached).toBeGreaterThan(4); // ...but returned the best achievable
  });
});

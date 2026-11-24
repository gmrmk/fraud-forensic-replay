import { describe, it, expect } from "vitest";
import { steppedRate } from "./speed-control";

// SPEED_CHIPS = [-4, -1, -0.25, 0, 0.25, 0.5, 1, 4, 16]
describe("steppedRate - step the playback rate through the discrete speed set", () => {
  it("steps faster from 1× to 4×", () => {
    expect(steppedRate(1, 1)).toBe(4);
  });

  it("steps slower from 1× to 0.5×", () => {
    expect(steppedRate(1, -1)).toBe(0.5);
  });

  it("clamps at the fast end (16× stays 16×)", () => {
    expect(steppedRate(16, 1)).toBe(16);
  });

  it("clamps at the reverse end (−4× stays −4×)", () => {
    expect(steppedRate(-4, -1)).toBe(-4);
  });

  it("steps across 0 in both directions (0 → 0.25 forward, 0 → −0.25 back)", () => {
    expect(steppedRate(0, 1)).toBe(0.25);
    expect(steppedRate(0, -1)).toBe(-0.25);
  });

  it("an off-axis rate anchors at 1× before stepping", () => {
    expect(steppedRate(0.3, 1)).toBe(4); // 0.3 not in the set → anchor 1× → faster → 4×
  });
});

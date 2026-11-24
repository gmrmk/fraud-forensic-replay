import { describe, it, expect } from "vitest";
import { nodeProminence } from "./node-prominence";

describe("nodeProminence - density-aware node emphasis", () => {
  it("is full (1) when few events are visible (zoomed in / sparse)", () => {
    expect(nodeProminence(3)).toBe(1);
    expect(nodeProminence(10)).toBe(1);
  });

  it("is zero when many events are visible (zoomed out / dense)", () => {
    expect(nodeProminence(70)).toBe(0);
    expect(nodeProminence(200)).toBe(0);
  });

  it("crossfades linearly between low and high", () => {
    expect(nodeProminence(40)).toBeCloseTo(0.5, 5); // midpoint of [10, 70]
  });

  it("clamps to [0, 1] for degenerate counts", () => {
    expect(nodeProminence(0)).toBe(1);
    expect(nodeProminence(-5)).toBe(1);
  });
});

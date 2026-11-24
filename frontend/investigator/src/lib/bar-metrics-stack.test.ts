// frontend/investigator/src/lib/bar-metrics-stack.test.ts
// The layout numbers of the folded Timeline's line for each section. The first column
// of the stack holds the Timeline button and the clock, and each section's small version brings a name
// column of the same width, so the three strips start together.
import { describe, expect, it } from "vitest";
import * as stack from "./bar-metrics-stack";

describe("bar-metrics-stack", () => {
  it("pins the stack's name column at 216 px", () => {
    expect(stack.STACK_NAME_PX).toBe(216);
  });

  it("pins the gap before the transport at 16 px, which is the one line's own gap", () => {
    expect(stack.STACK_GAP_PX).toBe(16);
  });

  it("is wider than the open bar's name column, which the Timeline button and the clock do not fit", () => {
    expect(stack.STACK_NAME_PX).toBeGreaterThan(148);
  });
});

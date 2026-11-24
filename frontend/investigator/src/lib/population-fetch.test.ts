/**
 * The case-boot must not pull the unscoped whole table on a focal-less
 * (population-scale) pack.
 */
import { describe, it, expect } from "vitest";
import { shouldSkipUnscopedCaseBundle } from "./population-fetch";

describe("shouldSkipUnscopedCaseBundle", () => {
  it("skips when the manifest has no focal (population boot)", () => {
    expect(shouldSkipUnscopedCaseBundle(false)).toBe(true);
  });

  it("does NOT skip when the manifest declares a focal (card-fraud/priya boot)", () => {
    expect(shouldSkipUnscopedCaseBundle(true)).toBe(false);
  });
});

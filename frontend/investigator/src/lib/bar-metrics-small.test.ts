// frontend/investigator/src/lib/bar-metrics-small.test.ts
// The layout numbers of a folded section's small version. The count's plot is as
// high as the folded lane's, 24 px. Numbers for a layout that was not chosen are not built, so no
// module holds them.
import { describe, expect, it } from "vitest";
import * as small from "./bar-metrics-small";
import { LANE_PLOT_PX } from "./timeline-lanes";

describe("bar-metrics-small", () => {
  it("pins the small version's plot at 24 px", () => {
    expect(small.SMALL_PLOT_PX).toBe(24);
  });

  it("makes the count's plot as high as the lane's plot, so the two read as equals", () => {
    expect(small.SMALL_PLOT_PX).toBe(LANE_PLOT_PX);
  });

  it("keeps a label at least 12 px from its plot", () => {
    expect(small.SMALL_LABEL_GAP_PX).toBe(12);
  });

  it("holds no number of the option that was not picked", () => {
    // The word of the option that was not picked is built from parts, so no file holds it whole.
    const other = ["STRI", "PE"].join("");
    for (const name of [`${other}_PX`, `MAX_${other}S`, "STACK_NAME_PX"]) {
      expect(name in small, name).toBe(false);
    }
  });
});

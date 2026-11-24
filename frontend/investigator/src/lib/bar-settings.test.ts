import { afterEach, describe, expect, it, vi } from "vitest";
import source from "./bar-settings.ts?raw";
import {
  LANE_DEPTH,
  LANE_FOLD,
  ROWS_FOLD,
  TIMELINE_DEPTH,
  TIMELINE_FOLD,
} from "./bar-settings";

// Each setting is a constant of the module: the
// build reads no saved value for it, draws no control for it and adds nothing to the share link.
describe("bar settings hold the owner's picks", () => {
  it("call 13: a folded rows section shows how many rows are active each hour", () => {
    expect(ROWS_FOLD).toBe("count");
  });
  it("call 14: a folded lane shows its bars and its number on one line", () => {
    expect(LANE_FOLD).toBe("bars");
  });
  it("call 15: a folded Timeline leaves a line for each section", () => {
    expect(TIMELINE_FOLD).toBe("each");
  });
  it("call 16: a lane opens into the networks it came from", () => {
    expect(LANE_DEPTH).toBe("networks");
  });
  it("call 17: the Timeline opens into a line for each kind of event", () => {
    expect(TIMELINE_DEPTH).toBe("kinds");
  });
});

describe("bar settings read nothing from the browser", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.resetModules();
  });

  it("a fresh import never calls getItem", async () => {
    // The static import above ran before any spy existed, so the module is loaded again
    // under the spy.
    const spy = vi.spyOn(Storage.prototype, "getItem");
    vi.resetModules();
    await import("./bar-settings");
    expect(spy).not.toHaveBeenCalled();
  });

  it("the source names no storage, and no saved key", () => {
    expect(source).not.toMatch(/localStorage|sessionStorage|getItem|indexedDB/);
    expect(source).not.toContain("ffr.bar.");
  });

  it("the source holds no word stripes, comments included", () => {
    expect(source).not.toMatch(/stripes/i);
  });
});

describe("bar settings stay out of the share link", () => {
  it("the source names the share-link module nowhere, so it neither imports from it nor adds to it", () => {
    expect(source).not.toContain("share-link");
  });
});

import { beforeEach, describe, expect, it } from "vitest";
import { TEXT_SIZE_KEY } from "../lib/text-size";
import { applyTextSize, chromeToWindowNow, useTextSize, windowToChromeNow } from "./text-size";

const root = (): HTMLElement => document.documentElement;

beforeEach(() => {
  localStorage.clear();
  useTextSize.getState().setSize(100);
  localStorage.clear();
});

describe("the text size store", () => {
  it("starts at 100 on a first visit", () => {
    expect(useTextSize.getState().size).toBe(100);
  });

  it("puts the factor on the root, so the chrome reads one custom property", () => {
    useTextSize.getState().setSize(125);
    expect(root().style.getPropertyValue("--ts")).toBe("1.25");
    expect(root().getAttribute("data-text-size")).toBe("125");
    useTextSize.getState().setSize(90);
    expect(root().style.getPropertyValue("--ts")).toBe("0.9");
    useTextSize.getState().setSize(100);
    expect(root().style.getPropertyValue("--ts")).toBe("1");
  });

  it("applies a step to the root without the store, as main.tsx does before the first render", () => {
    applyTextSize(112);
    expect(root().style.getPropertyValue("--ts")).toBe("1.12");
    applyTextSize(100);
  });

  it("saves the step in this browser's storage", () => {
    useTextSize.getState().setSize(112);
    expect(localStorage.getItem(TEXT_SIZE_KEY)).toBe("112");
  });

  it("holds the step for the session when storage throws", () => {
    const real = Object.getOwnPropertyDescriptor(window, "localStorage");
    Object.defineProperty(window, "localStorage", {
      configurable: true,
      get() {
        throw new Error("denied");
      },
    });
    try {
      expect(() => useTextSize.getState().setSize(125)).not.toThrow();
      expect(useTextSize.getState().size).toBe(125);
    } finally {
      if (real) Object.defineProperty(window, "localStorage", real);
    }
  });

  it("converts a length at the step now held, in the two named directions", () => {
    useTextSize.getState().setSize(125);
    expect(windowToChromeNow(1000)).toBeCloseTo(800, 8);
    expect(chromeToWindowNow(800)).toBeCloseTo(1000, 8);
    useTextSize.getState().setSize(100);
    expect(windowToChromeNow(1000)).toBe(1000);
  });
});

import { describe, expect, it } from "vitest";
import {
  DEFAULT_TEXT_SIZE,
  TEXT_SIZES,
  TEXT_SIZE_KEY,
  chromeToWindow,
  clampTextSize,
  nextTextSize,
  parseTextSize,
  prevTextSize,
  readTextSize,
  textFactor,
  windowToChrome,
  writeTextSize,
} from "./text-size";

describe("the steps", () => {
  it("are 90, 100, 112 and 125, and a first visit is 100", () => {
    expect([...TEXT_SIZES]).toEqual([90, 100, 112, 125]);
    expect(DEFAULT_TEXT_SIZE).toBe(100);
  });
});

describe("parse", () => {
  it("takes an exact step and nothing else", () => {
    for (const s of TEXT_SIZES) expect(parseTextSize(String(s))).toBe(s);
    for (const bad of [null, undefined, "", "abc", "95", "100.0", " 112", "0", "-90", "constructor", "__proto__", "NaN"]) {
      expect(parseTextSize(bad)).toBe(100);
    }
  });
});

describe("clamp", () => {
  it("gives the nearest step, and 100 for a number that is not finite", () => {
    expect(clampTextSize(50)).toBe(90);
    expect(clampTextSize(200)).toBe(125);
    expect(clampTextSize(95)).toBe(90);
    expect(clampTextSize(107)).toBe(112);
    expect(clampTextSize(105)).toBe(100);
    expect(clampTextSize(112)).toBe(112);
    expect(clampTextSize(Number.NaN)).toBe(100);
    expect(clampTextSize(Number.POSITIVE_INFINITY)).toBe(100);
  });
});

describe("next and previous", () => {
  it("move one step and stop at the ends", () => {
    expect(nextTextSize(90)).toBe(100);
    expect(nextTextSize(100)).toBe(112);
    expect(nextTextSize(112)).toBe(125);
    expect(nextTextSize(125)).toBe(125);
    expect(prevTextSize(125)).toBe(112);
    expect(prevTextSize(112)).toBe(100);
    expect(prevTextSize(100)).toBe(90);
    expect(prevTextSize(90)).toBe(90);
  });
});

describe("the factor", () => {
  it("is the step over 100, and exactly 1 at 100", () => {
    expect(textFactor(100)).toBe(1);
    expect(textFactor(90)).toBeCloseTo(0.9, 10);
    expect(textFactor(112)).toBeCloseTo(1.12, 10);
    expect(textFactor(125)).toBeCloseTo(1.25, 10);
  });
  it("converts a length across the boundary in the two named directions", () => {
    // A length that crosses into the chrome is divided; one that crosses out is multiplied.
    expect(windowToChrome(1000, 125)).toBeCloseTo(800, 8);
    expect(chromeToWindow(800, 125)).toBeCloseTo(1000, 8);
    expect(windowToChrome(1000, 100)).toBe(1000);
    expect(chromeToWindow(37, 100)).toBe(37);
    expect(chromeToWindow(windowToChrome(913, 112), 112)).toBeCloseTo(913, 8);
  });
});

describe("the saved preference", () => {
  const store = (initial: Record<string, string> = {}) => {
    const data = { ...initial };
    return {
      data,
      getItem: (k: string) => data[k] ?? null,
      setItem: (k: string, v: string) => {
        data[k] = v;
      },
    };
  };
  it("is read back, and a bad stored value gives 100", () => {
    expect(readTextSize(store({ [TEXT_SIZE_KEY]: "125" }))).toBe(125);
    expect(readTextSize(store({ [TEXT_SIZE_KEY]: "huge" }))).toBe(100);
    expect(readTextSize(store())).toBe(100);
  });
  it("is written under one key", () => {
    const s = store();
    writeTextSize(112, s);
    expect(s.data).toEqual({ "ffr.textsize": "112" });
  });
  it("does not throw when the storage throws, on a read or a write", () => {
    const broken = {
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => {
        throw new Error("blocked");
      },
    };
    expect(readTextSize(broken)).toBe(100);
    expect(() => writeTextSize(125, broken)).not.toThrow();
  });
  it("does not throw when touching localStorage itself throws", () => {
    const real = Object.getOwnPropertyDescriptor(window, "localStorage");
    Object.defineProperty(window, "localStorage", {
      configurable: true,
      get() {
        throw new Error("denied");
      },
    });
    try {
      expect(readTextSize()).toBe(100);
      expect(() => writeTextSize(90)).not.toThrow();
    } finally {
      if (real) Object.defineProperty(window, "localStorage", real);
    }
  });
});

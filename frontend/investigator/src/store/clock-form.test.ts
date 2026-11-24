// frontend/investigator/src/store/clock-form.test.ts
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { CLOCK_KEY, initialClockForm, useClockForm } from "./clock-form";

describe("clock form key", () => {
  it("is written once, as the constant the store exports", () => {
    expect(CLOCK_KEY).toBe("ffr.clock");
  });
});

describe("initialClockForm - the form the page opens on", () => {
  it("is 12 hour when nothing is saved", () => {
    expect(initialClockForm({ getItem: () => null })).toBe(false);
  });
  it("reads a saved 24 hour form back", () => {
    expect(initialClockForm({ getItem: () => "24" })).toBe(true);
  });
  it("reads a saved 12 hour form back", () => {
    expect(initialClockForm({ getItem: () => "12" })).toBe(false);
  });
  it("falls back to 12 hour for junk", () => {
    for (const junk of ["", "true", "24h", "36", " 24", "{}"]) {
      expect(initialClockForm({ getItem: () => junk })).toBe(false);
    }
  });
  it("falls back to 12 hour when getItem throws", () => {
    expect(
      initialClockForm({
        getItem: () => {
          throw new Error("blocked");
        },
      }),
    ).toBe(false);
  });
  it("falls back to 12 hour when touching localStorage itself throws", () => {
    const own = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
    Object.defineProperty(globalThis, "localStorage", {
      configurable: true,
      get() {
        throw new Error("blocked");
      },
    });
    try {
      expect(initialClockForm()).toBe(false);
    } finally {
      if (own) Object.defineProperty(globalThis, "localStorage", own);
      else delete (globalThis as { localStorage?: Storage }).localStorage;
    }
  });
  it("reads localStorage by default", () => {
    localStorage.setItem(CLOCK_KEY, "24");
    try {
      expect(initialClockForm()).toBe(true);
    } finally {
      localStorage.clear();
    }
  });
});

describe("useClockForm - one value for every place that draws the clock", () => {
  beforeEach(() => {
    localStorage.clear();
    useClockForm.setState({ h24: false });
  });
  afterEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
  });

  it("starts on 12 hour", () => {
    expect(useClockForm.getInitialState().h24).toBe(false);
  });

  it("set changes the form and saves it under the key", () => {
    useClockForm.getState().set(true);
    expect(useClockForm.getState().h24).toBe(true);
    expect(localStorage.getItem(CLOCK_KEY)).toBe("24");
    useClockForm.getState().set(false);
    expect(useClockForm.getState().h24).toBe(false);
    expect(localStorage.getItem(CLOCK_KEY)).toBe("12");
  });

  it("toggle flips the form and saves each time", () => {
    useClockForm.getState().toggle();
    expect(useClockForm.getState().h24).toBe(true);
    expect(localStorage.getItem(CLOCK_KEY)).toBe("24");
    useClockForm.getState().toggle();
    expect(useClockForm.getState().h24).toBe(false);
    expect(localStorage.getItem(CLOCK_KEY)).toBe("12");
  });

  it("still changes the form when saving throws", () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("quota");
    });
    expect(() => useClockForm.getState().toggle()).not.toThrow();
    expect(useClockForm.getState().h24).toBe(true);
    expect(() => useClockForm.getState().set(false)).not.toThrow();
    expect(useClockForm.getState().h24).toBe(false);
  });
});

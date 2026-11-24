// frontend/investigator/src/store/map-mode.test.ts
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { MAP_KEY, initialMapMode, isMapMode, useMapMode } from "./map-mode";

/** A storage stand-in that holds `held` and records every write it is asked for. */
const holding = (held: string | null) => ({ getItem: vi.fn(() => held), setItem: vi.fn() });
const blocked = () => ({
  getItem: vi.fn(() => {
    throw new Error("blocked");
  }),
  setItem: vi.fn(),
});

describe("map shape key", () => {
  it("is written once, as the constant the store exports", () => {
    expect(MAP_KEY).toBe("ffr.map");
  });
});

describe("isMapMode", () => {
  it("knows the two shapes and nothing else", () => {
    expect(isMapMode("globe")).toBe(true);
    expect(isMapMode("flat")).toBe(true);
    for (const junk of [null, "", "Globe", "FLAT", "mercator", " flat", "map"]) expect(isMapMode(junk)).toBe(false);
  });
});

// Each call is one pairing of the address (it names a shape or none) with the storage (it holds a
// choice, holds none, or is blocked).
describe("initialMapMode - the shape the page opens on", () => {
  it("opens in the shape the address names, whatever the storage holds", () => {
    expect(initialMapMode("?map=flat", holding("globe"))).toBe("flat");
    expect(initialMapMode("?map=globe", holding("flat"))).toBe("globe");
    expect(initialMapMode("?map=flat", holding(null))).toBe("flat");
    expect(initialMapMode("?map=globe", holding(null))).toBe("globe");
    expect(initialMapMode("?map=flat", blocked())).toBe("flat");
    expect(initialMapMode("?map=globe", blocked())).toBe("globe");
  });

  it("opens in the stored choice when the address names no shape", () => {
    expect(initialMapMode("", holding("flat"))).toBe("flat");
    expect(initialMapMode("?theme=dark", holding("globe"))).toBe("globe");
  });

  it("opens on the globe when the address names none and the storage holds none or is blocked", () => {
    expect(initialMapMode("", holding(null))).toBe("globe");
    expect(initialMapMode("?theme=light", blocked())).toBe("globe");
  });

  it("never writes the storage it is handed", () => {
    for (const search of ["?map=flat", "?map=globe", "", "?map=junk"]) {
      for (const held of ["flat", "globe", null, "junk"]) {
        const storage = holding(held);
        initialMapMode(search, storage);
        expect(storage.setItem).not.toHaveBeenCalled();
      }
    }
  });

  it("never writes the page's own storage either", () => {
    localStorage.clear();
    try {
      for (const search of ["?map=flat", "?map=globe", "", "?map=junk"]) {
        initialMapMode(search);
        expect(localStorage.length).toBe(0);
      }
    } finally {
      localStorage.clear();
    }
  });

  it("counts a word that is not a shape as none, in the address and in storage", () => {
    expect(initialMapMode("?map=mercator", holding("flat"))).toBe("flat");
    expect(initialMapMode("?map=", holding("flat"))).toBe("flat");
    expect(initialMapMode("?map=Flat", holding(null))).toBe("globe");
    expect(initialMapMode("", holding("mercator"))).toBe("globe");
    expect(initialMapMode("?map=junk", holding("junk"))).toBe("globe");
  });

  it("counts a storage that throws on reading as none", () => {
    expect(initialMapMode("", blocked())).toBe("globe");
  });

  it("counts a storage whose accessor throws as none", () => {
    const own = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
    Object.defineProperty(globalThis, "localStorage", {
      configurable: true,
      get() {
        throw new Error("blocked");
      },
    });
    try {
      expect(initialMapMode("")).toBe("globe");
      expect(initialMapMode("?map=flat")).toBe("flat");
    } finally {
      if (own) Object.defineProperty(globalThis, "localStorage", own);
      else delete (globalThis as { localStorage?: Storage }).localStorage;
    }
  });

  it("reads the browser's storage by default", () => {
    localStorage.setItem(MAP_KEY, "flat");
    try {
      expect(initialMapMode("")).toBe("flat");
    } finally {
      localStorage.clear();
    }
  });
});

describe("useMapMode - the one owner of the chosen shape", () => {
  beforeEach(() => {
    localStorage.clear();
    useMapMode.setState({ shape: "globe" });
  });
  afterEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
    useMapMode.setState({ shape: "globe" });
  });

  it("setShape sets the shape and saves it under the key", () => {
    useMapMode.getState().setShape("flat");
    expect(useMapMode.getState().shape).toBe("flat");
    expect(localStorage.getItem(MAP_KEY)).toBe("flat");
    useMapMode.getState().setShape("globe");
    expect(useMapMode.getState().shape).toBe("globe");
    expect(localStorage.getItem(MAP_KEY)).toBe("globe");
  });

  // The test DOM (happy-dom 14) ignores history.replaceState, so the address is set through
  // location, as the share link's own tests set it.
  it("reads the page's address when it is created", async () => {
    const before = window.location.href;
    window.location.search = "?map=flat";
    try {
      vi.resetModules();
      const fresh = await import("./map-mode");
      expect(fresh.useMapMode.getState().shape).toBe("flat");
    } finally {
      window.location.href = before;
    }
    expect(window.location.search).toBe("");
  });

  it("keeps the shape set when the save throws", () => {
    const setItem = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("quota");
    });
    expect(() => useMapMode.getState().setShape("flat")).not.toThrow();
    expect(setItem).toHaveBeenCalled();
    expect(useMapMode.getState().shape).toBe("flat");
  });
});

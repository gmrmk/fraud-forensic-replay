// frontend/investigator/src/lib/bar-size.test.ts
import { describe, it, expect } from "vitest";
import {
  BAR_SIZE_KEY,
  BAR_SIZES,
  DEFAULT_BAR_SIZE,
  parseBarSize,
  readBarSize,
  writeBarSize,
} from "./bar-size";
import barSizeSource from "./bar-size.ts?raw";
import shareLinkSource from "./share-link.ts?raw";
import useShareLinkSource from "../hooks/useShareLink.ts?raw";

/** A storage that holds strings in a map, as the browser's does. */
function memoryStorage(initial: Record<string, string> = {}) {
  const map = new Map(Object.entries(initial));
  return {
    map,
    getItem: (k: string) => (map.has(k) ? (map.get(k) as string) : null),
    setItem: (k: string, v: string) => void map.set(k, v),
  };
}

describe("the key and the three values", () => {
  it("the key is ffr.barsize, beside ffr.lanes.collapsed", () => {
    expect(BAR_SIZE_KEY).toBe("ffr.barsize");
  });

  it("the three values are line, middle and open, and the default is middle", () => {
    expect([...BAR_SIZES]).toEqual(["line", "middle", "open"]);
    expect(DEFAULT_BAR_SIZE).toBe("middle");
  });

  it("the key is written once in this module, as the exported constant", () => {
    expect(barSizeSource.match(/ffr\.barsize/g)).toHaveLength(1);
  });
});

describe("parseBarSize", () => {
  it.each(["line", "middle", "open"] as const)("reads %s as itself", (v) => {
    expect(parseBarSize(v)).toBe(v);
  });

  it.each([
    null,
    undefined,
    "",
    "today",
    "OPEN",
    "Line",
    " open ",
    "open\n",
    "constructor",
    "__proto__",
    "toString",
    '"open"',
    "0",
  ])("gives middle for %j", (raw) => {
    expect(parseBarSize(raw as string | null | undefined)).toBe("middle");
  });
});

describe("readBarSize", () => {
  it("gives middle when nothing is saved", () => {
    expect(readBarSize(memoryStorage())).toBe("middle");
  });

  it.each(["line", "middle", "open"] as const)("reads a saved %s as the plain string", (v) => {
    expect(readBarSize(memoryStorage({ [BAR_SIZE_KEY]: v }))).toBe(v);
  });

  it("gives middle for a saved value that is not one of the three", () => {
    expect(readBarSize(memoryStorage({ [BAR_SIZE_KEY]: "today" }))).toBe("middle");
  });

  it("does not throw and gives middle when getItem throws", () => {
    const blocked = {
      getItem: () => {
        throw new Error("blocked");
      },
    };
    expect(readBarSize(blocked)).toBe("middle");
  });

  it("does not throw and gives middle when the default storage cannot be touched", () => {
    const real = Object.getOwnPropertyDescriptor(window, "localStorage");
    Object.defineProperty(window, "localStorage", {
      configurable: true,
      get() {
        throw new Error("blocked");
      },
    });
    try {
      expect(readBarSize()).toBe("middle");
    } finally {
      if (real) Object.defineProperty(window, "localStorage", real);
    }
  });
});

describe("writeBarSize", () => {
  it.each(["line", "middle", "open"] as const)("writes %s as the plain string under the key", (v) => {
    const s = memoryStorage();
    writeBarSize(v, s);
    expect(s.map.get(BAR_SIZE_KEY)).toBe(v);
  });

  it("round-trips through readBarSize", () => {
    const s = memoryStorage();
    writeBarSize("line", s);
    expect(readBarSize(s)).toBe("line");
  });

  it("does not throw when setItem throws", () => {
    const blocked = {
      setItem: () => {
        throw new Error("quota");
      },
    };
    expect(() => writeBarSize("open", blocked)).not.toThrow();
  });
});

describe("the size stays out of the share link", () => {
  it("neither the link's parser and builder nor the hook that writes the address names the size", () => {
    for (const src of [shareLinkSource, useShareLinkSource]) {
      expect(src).not.toMatch(/barsize|bar-size|barSize/i);
    }
  });
});

// frontend/investigator/src/store/layers.test.ts
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { PIN_WINS, initialCollapsedLanes, useLayers } from "./layers";

describe("useLayers pathKinds", () => {
  beforeEach(() => useLayers.setState({ pathKinds: { fraud: true, auth: false, login: false } }));
  it("defaults Fraud Path on, others off", () => {
    expect(useLayers.getState().pathKinds.fraud).toBe(true);
    expect(useLayers.getState().pathKinds.auth).toBe(false);
  });
  it("togglePath flips a kind", () => {
    useLayers.getState().togglePath("auth");
    expect(useLayers.getState().pathKinds.auth).toBe(true);
    useLayers.getState().togglePath("fraud");
    expect(useLayers.getState().pathKinds.fraud).toBe(false);
  });
});

describe("useLayers showTimezone", () => {
  beforeEach(() => useLayers.setState({ showTimezone: false }));
  it("defaults the timezone overlay off (opt-in)", () => {
    expect(useLayers.getState().showTimezone).toBe(false);
  });
  it("toggleTimezone flips the overlay on then off", () => {
    useLayers.getState().toggleTimezone();
    expect(useLayers.getState().showTimezone).toBe(true);
    useLayers.getState().toggleTimezone();
    expect(useLayers.getState().showTimezone).toBe(false);
  });
});

describe("useLayers collapsedLanes", () => {
  const KEY = "ffr.lanes.collapsed";
  beforeEach(() => {
    localStorage.clear();
    useLayers.setState({ collapsedLanes: [] });
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("starts empty", () => {
    expect(useLayers.getInitialState().collapsedLanes).toEqual([]);
    expect(useLayers.getState().collapsedLanes).toEqual([]);
  });

  it("toggleLane adds, then removes, and writes the storage key each time", () => {
    useLayers.getState().toggleLane("parcel");
    expect(useLayers.getState().collapsedLanes).toEqual(["parcel"]);
    expect(localStorage.getItem(KEY)).toBe('["parcel"]');
    useLayers.getState().toggleLane("crate");
    expect(localStorage.getItem(KEY)).toBe('["parcel","crate"]');
    useLayers.getState().toggleLane("parcel");
    expect(useLayers.getState().collapsedLanes).toEqual(["crate"]);
    expect(localStorage.getItem(KEY)).toBe('["crate"]');
    useLayers.getState().toggleLane("crate");
    expect(useLayers.getState().collapsedLanes).toEqual([]);
    expect(localStorage.getItem(KEY)).toBe("[]");
  });

  it("initialCollapsedLanes reads a saved list, and gives [] for a throwing or malformed storage", () => {
    expect(initialCollapsedLanes({ getItem: () => '["parcel"]' })).toEqual(["parcel"]);
    expect(
      initialCollapsedLanes({
        getItem: () => {
          throw new Error("blocked");
        },
      }),
    ).toEqual([]);
    expect(initialCollapsedLanes({ getItem: () => '{"parcel":true}' })).toEqual([]);
    expect(initialCollapsedLanes({ getItem: () => null })).toEqual([]);
  });

  it("initialCollapsedLanes reads localStorage by default", () => {
    localStorage.setItem(KEY, '["crate"]');
    expect(initialCollapsedLanes()).toEqual(["crate"]);
  });

  // Each pins a wrong version that once survived.
  it("initialCollapsedLanes gives [] when touching localStorage itself throws", () => {
    const own = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
    Object.defineProperty(globalThis, "localStorage", {
      configurable: true,
      get: () => {
        throw new Error("denied");
      },
    });
    try {
      expect(initialCollapsedLanes()).toEqual([]);
    } finally {
      if (own) Object.defineProperty(globalThis, "localStorage", own);
      else delete (globalThis as { localStorage?: Storage }).localStorage;
    }
  });

  it("toggleLane writes the list through the fold rule", () => {
    const long = "k".repeat(65);
    useLayers.getState().toggleLane(long);
    expect(useLayers.getState().collapsedLanes).toEqual([long]);
    expect(localStorage.getItem(KEY)).toBe("[]");
  });

  it("toggleLane still changes the state when the storage write throws", () => {
    const setItem = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("quota");
    });
    useLayers.getState().toggleLane("parcel");
    expect(setItem).toHaveBeenCalled();
    expect(useLayers.getState().collapsedLanes).toEqual(["parcel"]);
  });
});

describe("useLayers barSize", () => {
  // The literal key, on purpose: this block reads the saved value as a user's browser holds it.
  const SIZE_KEY = "ffr.barsize";
  const LANES_KEY = "ffr.lanes.collapsed";
  beforeEach(() => {
    localStorage.clear();
    useLayers.setState({ barSize: "middle", collapsedLanes: [] });
  });
  afterEach(() => {
    vi.restoreAllMocks();
    vi.resetModules();
  });

  it("a first visit, with nothing saved, is the middle size", async () => {
    vi.resetModules();
    const fresh = await import("./layers");
    expect(fresh.useLayers.getState().barSize).toBe("middle");
  });

  it("reads a saved size once, when the store is made", async () => {
    localStorage.setItem(SIZE_KEY, "line");
    vi.resetModules();
    const fresh = await import("./layers");
    expect(fresh.useLayers.getState().barSize).toBe("line");
  });

  it("a saved value that is not one of the three gives the middle size", async () => {
    localStorage.setItem(SIZE_KEY, "today");
    vi.resetModules();
    const fresh = await import("./layers");
    expect(fresh.useLayers.getState().barSize).toBe("middle");
  });

  it("setBarSize sets the size and writes it", () => {
    useLayers.getState().setBarSize("line");
    expect(useLayers.getState().barSize).toBe("line");
    expect(localStorage.getItem(SIZE_KEY)).toBe("line");
    useLayers.getState().setBarSize("open");
    expect(localStorage.getItem(SIZE_KEY)).toBe("open");
  });

  it("setBarSize still sets the size when the storage write throws", () => {
    const setItem = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("quota");
    });
    useLayers.getState().setBarSize("line");
    expect(setItem).toHaveBeenCalled();
    expect(useLayers.getState().barSize).toBe("line");
  });

  it("openBar sets open and writes nothing: a missing key stays missing", () => {
    const setItem = vi.spyOn(Storage.prototype, "setItem");
    useLayers.getState().openBar();
    expect(useLayers.getState().barSize).toBe("open");
    expect(setItem).not.toHaveBeenCalled();
    expect(localStorage.getItem(SIZE_KEY)).toBeNull();
  });

  it("openBar leaves a saved value as it was", () => {
    localStorage.setItem(SIZE_KEY, "line");
    useLayers.setState({ barSize: "line" });
    const setItem = vi.spyOn(Storage.prototype, "setItem");
    useLayers.getState().openBar();
    expect(useLayers.getState().barSize).toBe("open");
    expect(setItem).not.toHaveBeenCalled();
    expect(localStorage.getItem(SIZE_KEY)).toBe("line");
  });

  it("the folded-lane list and its key are unchanged by a size change or openBar", () => {
    useLayers.getState().toggleLane("parcel");
    useLayers.getState().setBarSize("line");
    useLayers.getState().openBar();
    expect(useLayers.getState().collapsedLanes).toEqual(["parcel"]);
    expect(localStorage.getItem(LANES_KEY)).toBe('["parcel"]');
  });

  it("toggleLane does not touch the size or its key", () => {
    useLayers.getState().setBarSize("open");
    useLayers.getState().toggleLane("parcel");
    expect(useLayers.getState().barSize).toBe("open");
    expect(localStorage.getItem(SIZE_KEY)).toBe("open");
  });
});

describe("useLayers: the switches of the investigator's marks", () => {
  const ALL_ON = { pinned: true, pass: true, fail: true, wait: true, noted: true, inPath: true };
  beforeEach(() => {
    localStorage.clear();
    useLayers.setState({ hiddenKinds: [], hiddenValues: {}, yoursOn: false, yoursFacets: { ...ALL_ON } });
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("starts with nothing hidden, Yours off and all six facets on", () => {
    const s = useLayers.getInitialState();
    expect(s.hiddenKinds).toEqual([]);
    expect(s.hiddenValues).toEqual({});
    expect(s.yoursOn).toBe(false);
    expect(s.yoursFacets).toEqual(ALL_ON);
  });

  it("toggleKind adds a kind and, pressed again, restores the list", () => {
    useLayers.getState().toggleKind("signin");
    expect(useLayers.getState().hiddenKinds).toEqual(["signin"]);
    useLayers.getState().toggleKind("org");
    expect(useLayers.getState().hiddenKinds).toEqual(["signin", "org"]);
    useLayers.getState().toggleKind("signin");
    useLayers.getState().toggleKind("org");
    expect(useLayers.getState().hiddenKinds).toEqual([]);
  });

  it("toggleValue adds and removes a value and keeps the other kinds' lists", () => {
    useLayers.getState().toggleValue("signin", "residential proxy");
    useLayers.getState().toggleValue("decision", "WAITING");
    useLayers.getState().toggleValue("signin", "mobile");
    expect(useLayers.getState().hiddenValues).toEqual({ signin: ["residential proxy", "mobile"], decision: ["WAITING"] });
    useLayers.getState().toggleValue("signin", "residential proxy");
    expect(useLayers.getState().hiddenValues).toEqual({ signin: ["mobile"], decision: ["WAITING"] });
    useLayers.getState().toggleValue("signin", "mobile");
    useLayers.getState().toggleValue("decision", "WAITING");
    expect(useLayers.getState().hiddenValues).toEqual({});
  });

  it("toggleValue builds a fresh record each time", () => {
    useLayers.getState().toggleValue("signin", "a");
    const before = useLayers.getState().hiddenValues;
    useLayers.getState().toggleValue("signin", "b");
    expect(useLayers.getState().hiddenValues).not.toBe(before);
    expect(before).toEqual({ signin: ["a"] });
  });

  it("works for a kind named constructor or __proto__", () => {
    useLayers.getState().toggleKind("constructor");
    expect(useLayers.getState().hiddenKinds).toEqual(["constructor"]);
    useLayers.getState().toggleValue("constructor", "x");
    expect(Object.hasOwn(useLayers.getState().hiddenValues, "constructor")).toBe(true);
    expect(useLayers.getState().hiddenValues["constructor"]).toEqual(["x"]);
    useLayers.getState().toggleValue("constructor", "x");
    expect(useLayers.getState().hiddenValues).toEqual({});
    useLayers.getState().toggleValue("__proto__", "y");
    expect(Object.hasOwn(useLayers.getState().hiddenValues, "__proto__")).toBe(true);
    expect(Object.getPrototypeOf(useLayers.getState().hiddenValues)).toBe(Object.prototype);
    expect(({} as Record<string, unknown>).y).toBeUndefined();
  });

  it("toggleYours flips Dispositions", () => {
    useLayers.getState().toggleYours();
    expect(useLayers.getState().yoursOn).toBe(true);
    useLayers.getState().toggleYours();
    expect(useLayers.getState().yoursOn).toBe(false);
  });

  it("toggleFacet flips one facet and leaves the other five", () => {
    useLayers.getState().toggleFacet("inPath");
    expect(useLayers.getState().yoursFacets).toEqual({ ...ALL_ON, inPath: false });
    useLayers.getState().toggleFacet("inPath");
    expect(useLayers.getState().yoursFacets).toEqual(ALL_ON);
  });

  it("none of the four toggles, nor the two kind toggles, writes to Storage", () => {
    const setItem = vi.spyOn(Storage.prototype, "setItem");
    const removeItem = vi.spyOn(Storage.prototype, "removeItem");
    const clear = vi.spyOn(Storage.prototype, "clear");
    const s = useLayers.getState();
    s.toggleKind("signin");
    s.toggleValue("signin", "mobile");
    s.toggleYours();
    s.toggleFacet("pass");
    expect(setItem).not.toHaveBeenCalled();
    expect(removeItem).not.toHaveBeenCalled();
    expect(clear).not.toHaveBeenCalled();
  });

  it("PIN_WINS is false until the layers piece's item 1 commit sets it", () => {
    expect(PIN_WINS).toBe(false);
  });
});

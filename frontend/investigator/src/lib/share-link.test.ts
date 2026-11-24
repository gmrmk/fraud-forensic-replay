/**
 * The share link: what the address bar says about the scenario, the moment, the selection,
 * the marks, the zoom window and the camera. Reading is forgiving (anything that does not
 * parse is dropped); writing leaves out whatever is absent.
 */
import { describe, it, expect } from "vitest";
import { buildShareLink, parseShareLink, type ShareState } from "./share-link";

describe("parseShareLink", () => {
  it("is empty for an empty search", () => {
    expect(parseShareLink("")).toEqual({});
    expect(parseShareLink("?")).toEqual({});
  });

  it("reads the scenario, the moment, the selection, the marks, the window and the camera", () => {
    const link = parseShareLink(
      "?scenario=platform-access&t=1780933500000&sel=ke-0004&a=1780930000000&b=1780933500000" +
        "&w0=1780900000000&w1=1780990000000&lng=4.9&lat=52.37&zoom=3.1&pitch=20&bearing=-15",
    );
    expect(link).toEqual({
      scenario: "platform-access",
      playhead: 1780933500000,
      sel: "ke-0004",
      a: 1780930000000,
      b: 1780933500000,
      window: [1780900000000, 1780990000000],
      center: [4.9, 52.37],
      zoom: 3.1,
      pitch: 20,
      bearing: -15,
    });
  });

  it("takes `t` over the older `playhead`, and still reads `playhead` alone", () => {
    expect(parseShareLink("?playhead=5&t=9").playhead).toBe(9);
    expect(parseShareLink("?playhead=5").playhead).toBe(5);
  });

  it("drops what does not parse instead of guessing", () => {
    expect(parseShareLink("?t=soon&a=&b=x&sel=&scenario=")).toEqual({});
    expect(parseShareLink("?t=NaN&a=Infinity")).toEqual({});
  });

  it("drops a camera position whose latitude is off the globe (the map throws on one)", () => {
    expect(parseShareLink("?lng=10&lat=95&zoom=3")).toEqual({ zoom: 3 });
    expect(parseShareLink("?lng=10&lat=-90.5")).toEqual({});
    expect(parseShareLink("?lng=10&lat=-90")).toEqual({ center: [10, -90] });
  });

  it("needs both ends of the window, in order", () => {
    expect(parseShareLink("?w0=10").window).toBeUndefined();
    expect(parseShareLink("?w1=10").window).toBeUndefined();
    expect(parseShareLink("?w0=20&w1=10").window).toBeUndefined();
    expect(parseShareLink("?w0=10&w1=20").window).toEqual([10, 20]);
  });

  it("keeps the marks in time order whichever way the link wrote them", () => {
    expect(parseShareLink("?a=900&b=500")).toMatchObject({ a: 500, b: 900 });
    expect(parseShareLink("?b=500")).toMatchObject({ a: 500 }); // B alone is A
  });

  it("refuses a scenario or a selection that is not a plain id", () => {
    expect(parseShareLink("?scenario=../../etc").scenario).toBeUndefined();
    expect(parseShareLink("?scenario=a b").scenario).toBeUndefined();
    expect(parseShareLink(`?sel=${"x".repeat(200)}`).sel).toBeUndefined();
    expect(parseShareLink("?sel=<script>").sel).toBeUndefined();
    expect(parseShareLink("?sel=tx-card-marcus-visa-001-0140").sel).toBe("tx-card-marcus-visa-001-0140");
  });
});

describe("parseShareLink: the grouping and the solo (untrusted input)", () => {
  // toStrictEqual: a key set to undefined must not pass for an absent key.
  const BASE = "t=1780933500000&sel=ke-0004";
  const KEPT = { playhead: 1780933500000, sel: "ke-0004" };

  it("reads `by` and `solo`", () => {
    expect(parseShareLink("?by=org_id&solo=Acme%20Ltd")).toStrictEqual({ by: "org_id", solo: "Acme Ltd" });
  });

  it("keeps a `by` that is a field name, and drops one that breaks the pattern, keeping the other keys", () => {
    expect(parseShareLink(`?${BASE}&by=org_id`)).toStrictEqual({ ...KEPT, by: "org_id" });
    expect(parseShareLink(`?by=_x9`).by).toBe("_x9");
    for (const bad of ["", "1org", "org-id", "org%20id", "org.id", "a%2Fb", "%3Cscript%3E", "x".repeat(65)]) {
      expect(parseShareLink(`?${BASE}&by=${bad}`)).toStrictEqual(KEPT);
    }
    expect(parseShareLink(`?by=${"x".repeat(64)}`).by).toBe("x".repeat(64));
  });

  it("keeps a `solo` of up to 128 characters, and drops one of 129, keeping the other keys", () => {
    expect(parseShareLink(`?solo=${"v".repeat(128)}`).solo).toBe("v".repeat(128));
    expect(parseShareLink(`?${BASE}&solo=${"v".repeat(129)}`)).toStrictEqual(KEPT);
  });

  it("drops a `solo` that holds a control character, keeping the other keys", () => {
    // Percent-encoded in the source: the C0 range, the tab and the line ends, DEL, and the C1 range.
    for (const code of ["%00", "%01", "%09", "%0A", "%0D", "%1B", "%1F", "%7F", "%C2%80", "%C2%9F"]) {
      expect(parseShareLink(`?${BASE}&solo=ab${code}cd`)).toStrictEqual(KEPT);
    }
    expect(parseShareLink("?solo=caf%C3%A9%20%E6%97%A5%E6%9C%AC").solo).toBe("café 日本");
  });

  it("drops an empty `solo` and does not trim a spaced one", () => {
    expect(parseShareLink(`?${BASE}&solo=`)).toStrictEqual(KEPT);
    expect(parseShareLink("?solo=%20a%20").solo).toBe(" a ");
  });

  it("reads each key on its own: a bad `by` does not drop a good `solo`, and the reverse", () => {
    expect(parseShareLink("?by=1x&solo=acme")).toStrictEqual({ solo: "acme" });
    expect(parseShareLink(`?by=org_id&solo=${"v".repeat(129)}`)).toStrictEqual({ by: "org_id" });
  });
});

describe("buildShareLink", () => {
  it("is empty for an empty state", () => {
    expect(buildShareLink({})).toBe("");
  });

  it("writes `by` and `solo` after the other keys, encoded, and leaves out an absent or empty one", () => {
    expect(buildShareLink({ playhead: 5, by: "org_id", solo: "Acme & Sons" })).toBe("t=5&by=org_id&solo=Acme%20%26%20Sons");
    expect(buildShareLink({ by: null, solo: null })).toBe("");
    expect(buildShareLink({ by: "", solo: "" })).toBe("");
    expect(buildShareLink({ solo: "x" })).toBe("solo=x");
  });

  it("names no size, fold, depth or setting beside the keys it knows", () => {
    const qs = buildShareLink({ scenario: "p", playhead: 1, sel: "s", a: 1, b: 2, window: [1, 2], by: "f", solo: "v", theme: "dark", color: "neon", map: "flat" });
    const keys = qs.split("&").map((kv) => kv.split("=")[0]);
    expect(keys).toEqual(["scenario", "t", "sel", "a", "b", "w0", "w1", "theme", "color", "map", "by", "solo"]);
  });

  it("writes `map` after `color`, and leaves out an absent or empty shape", () => {
    expect(buildShareLink({ theme: "dark", color: "neon", map: "flat", by: "f" })).toBe("theme=dark&color=neon&map=flat&by=f");
    expect(buildShareLink({ color: "neon", map: "globe" })).toBe("color=neon&map=globe");
    expect(buildShareLink({ map: null })).toBe("");
    expect(buildShareLink({ map: "" })).toBe("");
  });

  it("round-trips `by` and `solo`", () => {
    const qs = buildShareLink({ by: "org_id", solo: "Acme & Sons / 日本" });
    expect(parseShareLink(`?${qs}`)).toStrictEqual({ by: "org_id", solo: "Acme & Sons / 日本" });
  });

  it("writes whole milliseconds, four decimals of position and two of zoom, in a fixed order", () => {
    const qs = buildShareLink({
      camera: { center: [4.90412345, 52.36761234], zoom: 3.14159, pitch: 0, bearing: 0 },
      b: 1780933500000.4,
      a: 1780930000000,
      sel: "ke-0004",
      playhead: 1780933500000.6,
      scenario: "platform-access",
      theme: "light",
    });
    expect(qs).toBe(
      "scenario=platform-access&t=1780933500001&sel=ke-0004&a=1780930000000&b=1780933500000" +
        "&lng=4.9041&lat=52.3676&zoom=3.14&theme=light",
    );
  });

  it("leaves out what is absent or null", () => {
    expect(buildShareLink({ playhead: 5, sel: null, a: null, b: null, window: null, camera: null })).toBe("t=5");
  });

  it("round-trips: what it writes parses back to the same state", () => {
    const state: ShareState = {
      scenario: "priya-ato",
      playhead: 1780933500000,
      sel: "gen-login-40927",
      a: 1780930000000,
      b: 1780933500000,
      window: [1780900000000, 1780990000000],
      camera: { center: [-95.3698, 29.7604], zoom: 9.5, pitch: 35, bearing: 12.25 },
    };
    expect(parseShareLink(`?${buildShareLink(state)}`)).toEqual({
      scenario: "priya-ato",
      playhead: 1780933500000,
      sel: "gen-login-40927",
      a: 1780930000000,
      b: 1780933500000,
      window: [1780900000000, 1780990000000],
      center: [-95.3698, 29.7604],
      zoom: 9.5,
      pitch: 35,
      bearing: 12.25,
    });
  });
});

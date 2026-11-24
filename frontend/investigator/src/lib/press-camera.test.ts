// frontend/investigator/src/lib/press-camera.test.ts
// What a press on a record does with the camera: a turn at the present zoom from a view below zoom
// 11, a flight in from zoom 11 or more, and a flight in when the camera's centre is already at the
// record's place.
import { describe, expect, it } from "vitest";
import { AT_RECORD_DEG, AT_RECORD_ZOOM, TURN_BELOW_ZOOM, pressMove, restsAtPress } from "./press-camera";

const LAGOS = { lng: 3.401, lat: 6.532 };

describe("pressMove", () => {
  it("turns from the card story's opening view at zoom 1.321 over 20 N, 40 W to Lagos", () => {
    expect(pressMove({ lng: -40, lat: 20, zoom: 1.321 }, LAGOS, false)).toBe("turn");
  });

  it("flies when the centre is within 0.5 degrees of the record, and turns just past it", () => {
    expect(pressMove({ ...LAGOS, zoom: 1.4 }, LAGOS, true)).toBe("fly");
    expect(pressMove({ lng: LAGOS.lng, lat: LAGOS.lat + 0.49, zoom: 1.4 }, LAGOS, true)).toBe("fly");
    expect(pressMove({ lng: LAGOS.lng, lat: LAGOS.lat + 0.51, zoom: 1.4 }, LAGOS, true)).toBe("turn");
  });

  it("flies from zoom 11 and from zoom 12, and turns just below zoom 11", () => {
    expect(pressMove({ lng: -95.37, lat: 29.76, zoom: 11 }, LAGOS, false)).toBe("fly");
    expect(pressMove({ lng: -95.37, lat: 29.76, zoom: 12 }, LAGOS, false)).toBe("fly");
    expect(pressMove({ lng: -95.37, lat: 29.76, zoom: 10.99 }, LAGOS, false)).toBe("turn");
  });

  it("by default flies on a first press on another record within 0.5 degrees of the centre", () => {
    const near = { lng: LAGOS.lng, lat: LAGOS.lat + 0.2 };
    expect(pressMove({ ...LAGOS, zoom: 1.4 }, near, false)).toBe("fly");
  });

  it("under the record reading, the same press turns for another record and flies for the same one", () => {
    const near = { lng: LAGOS.lng, lat: LAGOS.lat + 0.2 };
    expect(pressMove({ ...LAGOS, zoom: 1.4 }, near, false, "record")).toBe("turn");
    expect(pressMove({ ...LAGOS, zoom: 1.4 }, near, true, "record")).toBe("fly");
  });

  it("holds the numbers the page of clips showed", () => {
    expect(TURN_BELOW_ZOOM).toBe(11);
    expect(AT_RECORD_DEG).toBe(0.5);
  });
});

describe("restsAtPress", () => {
  const PRESS = { ...LAGOS, zoom: 12 };

  it("is true with the camera at the record and its zoom", () => {
    expect(restsAtPress({ ...LAGOS, zoom: 12 }, PRESS)).toBe(true);
    expect(restsAtPress({ lng: LAGOS.lng, lat: LAGOS.lat + 0.49, zoom: 12.04 }, PRESS)).toBe(true);
  });

  it("is false with the camera 1 degree off the record", () => {
    expect(restsAtPress({ lng: LAGOS.lng, lat: LAGOS.lat + 1, zoom: 12 }, PRESS)).toBe(false);
  });

  it("is false with the camera 0.3 zoom levels off the record's zoom", () => {
    expect(restsAtPress({ ...LAGOS, zoom: 12.3 }, PRESS)).toBe(false);
    expect(restsAtPress({ ...LAGOS, zoom: 11.7 }, PRESS)).toBe(false);
  });

  it("holds the spec's zoom test of 0.05", () => {
    expect(AT_RECORD_ZOOM).toBe(0.05);
  });
});

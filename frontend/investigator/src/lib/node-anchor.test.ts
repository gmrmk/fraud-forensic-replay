import { describe, it, expect } from "vitest";
import { entityLngLat, isOccludedByGlobe } from "./node-anchor";
import type { Transaction, LoginEvent } from "../types";

const tx = {
  id: "t1", merchant_lat: 6.43, merchant_lng: 3.42,
} as Transaction;
const login = { id: "l1", ip_lat: 29.76, ip_lng: -95.36 } as LoginEvent;

describe("entityLngLat", () => {
  it("maps transaction kinds to merchant coords", () => {
    expect(entityLngLat({ kind: "fraud", tx })).toEqual({ lng: 3.42, lat: 6.43 });
    expect(entityLngLat({ kind: "auth", tx })).toEqual({ lng: 3.42, lat: 6.43 });
  });
  it("maps login to ip coords", () => {
    expect(entityLngLat({ kind: "login", login })).toEqual({ lng: -95.36, lat: 29.76 });
  });
  it("maps place to its own coords", () => {
    const place = { id: "p1", name: "Garrmere Mall", category: "mall", lat: 6.44, lng: 3.47 };
    expect(entityLngLat({ kind: "place", place })).toEqual({ lng: 3.47, lat: 6.44 });
  });
  it("returns null for geography-less kinds (account_event, transfer)", () => {
    expect(entityLngLat({ kind: "account_event", event: { id: "e1" } as never })).toBeNull();
    expect(entityLngLat({ kind: "transfer", transfer: { id: "tr1" } as never })).toBeNull();
  });
});

describe("great-circle occlusion fallback", () => {
  it("a point more than 90 degrees from camera center is occluded", () => {
    expect(isOccludedByGlobe({ lng: 0, lat: 0 }, { lng: 120, lat: 0 })).toBe(true);
    expect(isOccludedByGlobe({ lng: 0, lat: 0 }, { lng: 45, lat: 0 })).toBe(false);
  });
  it("treats exactly 90 degrees as occluded (>= convention)", () => {
    expect(isOccludedByGlobe({ lng: 0, lat: 0 }, { lng: 90, lat: 0 })).toBe(true);
  });
});

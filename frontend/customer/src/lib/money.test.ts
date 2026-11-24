import { describe, it, expect } from "vitest";
import { formatMoney, odometerDigits, rollDurationMs } from "./money";

describe("formatMoney", () => {
  it("formats with commas and 2 decimals", () => {
    expect(formatMoney(2847.32)).toBe("2,847.32");
    expect(formatMoney(58.2)).toBe("58.20");
  });
});

describe("odometerDigits", () => {
  it("returns 6 digits [int4, dec2] for the wheels", () => {
    expect(odometerDigits(2847.32)).toEqual([2, 8, 4, 7, 3, 2]);
  });
  it("zero-pads the integer side", () => {
    expect(odometerDigits(58.2)).toEqual([0, 0, 5, 8, 2, 0]);
  });
});

describe("rollDurationMs", () => {
  it("is the base duration at 1x", () => {
    expect(rollDurationMs(1)).toBe(500);
  });
  it("shortens as the playback rate increases", () => {
    expect(rollDurationMs(4)).toBe(125);
  });
  it("clamps fast rates to a floor", () => {
    expect(rollDurationMs(16)).toBe(70); // 500/16 ~= 31 -> clamped to 70
  });
  it("lengthens for slowmo, clamped to a ceiling", () => {
    expect(rollDurationMs(0.5)).toBe(1000);
    expect(rollDurationMs(0.25)).toBe(1600); // 500/0.25 = 2000 -> clamped to 1600
  });
  it("uses the magnitude so reverse rolls at the same pace", () => {
    expect(rollDurationMs(-4)).toBe(125);
  });
  it("treats paused (rate 0) as 1x", () => {
    expect(rollDurationMs(0)).toBe(500);
  });
});

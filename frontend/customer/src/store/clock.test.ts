import { it, expect, vi, beforeEach, afterEach } from "vitest";
import { useClock, startClockPolling } from "./clock";

beforeEach(() => { vi.useFakeTimers(); useClock.setState({ t: 0, playing: false, rate: 1 }); });
afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers(); });

it("polls /api/clock and updates state", async () => {
  vi.stubGlobal("fetch", vi.fn(async () => ({
    ok: true, json: async () => ({ t: 1748400000000, playing: true, rate: 4 }),
  })));
  const stop = startClockPolling(160);
  await vi.advanceTimersByTimeAsync(200);
  expect(useClock.getState().t).toBe(1748400000000);
  expect(useClock.getState().playing).toBe(true);
  stop();
});

it("keeps last t when a poll fails (no crash)", async () => {
  useClock.setState({ t: 999, playing: false, rate: 1 });
  vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("net"); }));
  const stop = startClockPolling(160);
  await vi.advanceTimersByTimeAsync(200);
  expect(useClock.getState().t).toBe(999);
  stop();
});

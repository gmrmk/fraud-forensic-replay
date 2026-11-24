import { it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook } from "@testing-library/react";
import { usePlayhead } from "../store/playhead";
import { usePublishClock } from "./usePublishClock";

beforeEach(() => { vi.useFakeTimers(); usePlayhead.setState({ playhead: 1000, isPlaying: false, playbackRate: 1 }); });
afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers(); });

it("POSTs the playhead to /api/clock, debounced", async () => {
  const fetchMock = vi.fn(async () => ({ ok: true, json: async () => ({}) }));
  vi.stubGlobal("fetch", fetchMock);
  renderHook(() => usePublishClock(50));
  usePlayhead.setState({ playhead: 2000 });
  await vi.advanceTimersByTimeAsync(80);
  expect(fetchMock).toHaveBeenCalledWith("/api/clock", expect.objectContaining({ method: "POST" }));
  const lastCall = fetchMock.mock.calls.at(-1) as unknown as [string, { body: string }];
  const body = JSON.parse(lastCall[1].body);
  expect(body.t).toBe(2000);
});

it("keeps publishing during continuous playback (a debounce would starve)", async () => {
  const fetchMock = vi.fn(async () => ({ ok: true, json: async () => ({}) }));
  vi.stubGlobal("fetch", fetchMock);
  renderHook(() => usePublishClock(80));
  // Simulate the rAF playback driver: ~60fps playhead advancement (~16ms/frame)
  // for ~320ms. A value changing every 16ms perpetually resets a 100ms debounce
  // (0 publishes); an 80ms sampling publisher fires ~4x and tracks the playhead.
  for (let ms = 0; ms < 320; ms += 16) {
    usePlayhead.setState({ playhead: 1000 + ms });
    await vi.advanceTimersByTimeAsync(16);
  }
  expect(fetchMock.mock.calls.length).toBeGreaterThanOrEqual(3);
  const lastCall = fetchMock.mock.calls.at(-1) as unknown as [string, { body: string }];
  expect(JSON.parse(lastCall[1].body).t).toBeGreaterThan(1000); // latest, not stale
});

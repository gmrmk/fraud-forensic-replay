/**
 * Static builds have no backend clock. The customer app starts at the exported default
 * instant and then follows the investigator tab over a BroadcastChannel.
 */
import { it, expect, vi, beforeEach, afterEach } from "vitest";
import { useClock, startClockChannel } from "./clock";

interface FakeChannel {
  onmessage: ((e: { data: unknown }) => void) | null;
  posted: unknown[];
  closed: boolean;
  postMessage(m: unknown): void;
  close(): void;
}

function fakeChannel(): FakeChannel {
  return {
    onmessage: null,
    posted: [],
    closed: false,
    postMessage(m) { this.posted.push(m); },
    close() { this.closed = true; },
  };
}

const DEFAULT = { t: 1780000000000, playing: false, rate: 1 };

beforeEach(() => {
  useClock.setState({ t: 0, playing: false, rate: 1 });
  vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, json: async () => DEFAULT })));
});
afterEach(() => { vi.unstubAllGlobals(); });

it("opened alone, shows the exported default instant", async () => {
  const channel = fakeChannel();
  const stop = startClockChannel(() => channel);
  await vi.waitFor(() => expect(useClock.getState().t).toBe(DEFAULT.t));
  stop();
});

it("asks any open investigator tab for its playhead", () => {
  const channel = fakeChannel();
  const stop = startClockChannel(() => channel);
  expect(channel.posted).toEqual([{ type: "hello" }]);
  stop();
});

it("follows the playhead the investigator publishes", async () => {
  const channel = fakeChannel();
  const stop = startClockChannel(() => channel);
  channel.onmessage?.({ data: { t: 1779000000000, playing: true, rate: 4 } });
  expect(useClock.getState()).toMatchObject({ t: 1779000000000, playing: true, rate: 4 });
  stop();
});

it("does not let the default overwrite a playhead that arrived first", async () => {
  const channel = fakeChannel();
  const stop = startClockChannel(() => channel);
  channel.onmessage?.({ data: { t: 1779000000000, playing: false, rate: 1 } });
  await new Promise((r) => setTimeout(r, 0));
  await new Promise((r) => setTimeout(r, 0));
  expect(useClock.getState().t).toBe(1779000000000);
  stop();
});

it("ignores a message that is not a clock state", () => {
  const channel = fakeChannel();
  const stop = startClockChannel(() => channel);
  useClock.setState({ t: 5, playing: false, rate: 1 });
  channel.onmessage?.({ data: { type: "hello" } });
  channel.onmessage?.({ data: { t: "soon", playing: true, rate: 1 } });
  channel.onmessage?.({ data: null });
  expect(useClock.getState().t).toBe(5);
  stop();
});

it("closes the channel when stopped", () => {
  const channel = fakeChannel();
  startClockChannel(() => channel)();
  expect(channel.closed).toBe(true);
});

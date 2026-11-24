import { create } from "zustand";
import type { ClockState } from "../lib/types";
import { fetchClock } from "../lib/api";
import { IS_STATIC_BUILD } from "../lib/build-flags";

export const useClock = create<ClockState>(() => ({ t: 0, playing: false, rate: 1 }));

/** Poll /api/clock on an interval. Returns a stop fn. A failed poll holds the
 *  last value (no crash, silent retry next tick). */
export function startClockPolling(intervalMs = 160): () => void {
  let alive = true;
  const tick = async () => {
    try {
      const c = await fetchClock();
      if (alive) useClock.setState(c);
    } catch {
      /* hold last t; next tick retries */
    }
  };
  void tick();
  const id = setInterval(tick, intervalMs);
  return () => { alive = false; clearInterval(id); };
}

/** The playhead relay in static builds (the investigator's static adapter publishes on it). */
export const CLOCK_CHANNEL = "ffr-clock";

/** The part of BroadcastChannel this module uses. */
export interface ClockChannel {
  onmessage: ((event: { data: unknown }) => void) | null;
  postMessage(message: unknown): void;
  close(): void;
}

/** A real BroadcastChannel, narrowed to ClockChannel (its event carries far more than data). */
function openBroadcast(): ClockChannel {
  const broadcast = new BroadcastChannel(CLOCK_CHANNEL);
  const channel: ClockChannel = {
    onmessage: null,
    postMessage: (message) => broadcast.postMessage(message),
    close: () => broadcast.close(),
  };
  broadcast.onmessage = (event: MessageEvent<unknown>) => channel.onmessage?.({ data: event.data });
  return channel;
}

function isClockState(v: unknown): v is ClockState {
  if (typeof v !== "object" || v === null) return false;
  const c = v as Record<string, unknown>;
  return typeof c.t === "number" && typeof c.playing === "boolean" && typeof c.rate === "number";
}

/** Static builds have no backend clock. Start at the exported default instant, ask any
 *  open investigator tab for its playhead, then follow what it publishes. Returns a stop fn.
 *
 *  This is the one place the two apps talk without the backend. The slice-8a spec set
 *  BroadcastChannel aside because the dev apps sit on two origins; a static site has one
 *  origin and no backend. Dev builds still poll /api/clock. */
export function startClockChannel(open: () => ClockChannel = openBroadcast): () => void {
  let live = false; // true once a real playhead arrived; the default must not overwrite it
  const channel = open();
  channel.onmessage = (event) => {
    if (!isClockState(event.data)) return;
    live = true;
    useClock.setState(event.data);
  };
  channel.postMessage({ type: "hello" });
  void fetchClock()
    .then((c) => { if (!live) useClock.setState(c); })
    .catch(() => { /* no default: the store keeps t = 0 until a playhead arrives */ });
  return () => { live = true; channel.close(); };
}

/** The clock source for this build: the backend relay, or the channel in a static build. */
export function startClock(): () => void {
  return IS_STATIC_BUILD ? startClockChannel() : startClockPolling();
}

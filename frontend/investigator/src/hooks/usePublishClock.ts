import { useEffect } from "react";
import { usePlayhead } from "../store/playhead";

/** Samples the playhead every `intervalMs` and publishes it to the shared
 *  backend clock WHEN IT CHANGES, so the customer app (:5174) follows both
 *  scrubbing AND continuous rAF playback.
 *
 *  Why sampling, not a debounce: the playback driver advances the playhead
 *  every ~16ms (60fps), which is faster than any debounce window - a debounce
 *  is perpetually reset and never fires during playback, freezing the customer
 *  Change-detection
 *  keeps idle quiet (no spam); reads the latest state at fire time. Backend-only
 *  relay - the two apps stay decoupled. */
export function usePublishClock(intervalMs = 80): void {
  useEffect(() => {
    let lastSig = "";
    const tick = () => {
      const { playhead, isPlaying, playbackRate } = usePlayhead.getState();
      const sig = `${playhead}|${isPlaying}|${playbackRate}`;
      if (sig === lastSig) return; // nothing changed since last sample
      lastSig = sig;
      void fetch("/api/clock", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ t: playhead, playing: isPlaying, rate: playbackRate }),
      }).catch(() => {
        /* best-effort relay; the customer holds its last t until the next poll */
      });
    };
    tick(); // publish the initial state immediately
    const id = setInterval(tick, intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
}

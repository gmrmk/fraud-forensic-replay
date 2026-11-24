/**
 * useRadarPulse - the at-rest pulse driver, extracted from GlobeMap so a test can mount it
 * (the same pattern as useBloomPulse).
 *
 * A 2400ms looping 0→1 sawtooth that writes welded maplibre paint imperatively (no React
 * state). Two consumers: the three fraud radar-ping rings (each offset by a third of the
 * cycle) and the pin-drop landing. Under reduced motion the rings hold one still phase
 * (ringPhase); the loop keeps ticking so the playhead-keyed landing still writes.
 */
import { useEffect, type MutableRefObject } from "react";
import type maplibregl from "maplibre-gl";
import { linear, prefersReducedMotion, tween } from "../lib/tween";
import { ringFrame, ringPhase, landingScale, landingFraction, LANDING_FRAC } from "../lib/globe-motion";
import { usePlayhead } from "../store/playhead";
import { setFeatureStateGuarded } from "./useBloomPulse";

interface RadarPulseDeps {
  mapRef: MutableRefObject<maplibregl.Map | null>;
  mapLoadedRef: MutableRefObject<boolean>;
  /** The visible fraud markers (id + event timestamp ms), mirrored by GlobeMap. */
  fraudMarkersRef: MutableRefObject<{ id: string; ts: number }[]>;
}

export function useRadarPulse({ mapRef, mapLoadedRef, fraudMarkersRef }: RadarPulseDeps): void {
  useEffect(() => {
    return tween({
      values: [0, 1],
      duration: 2400,
      ease: linear,
      loop: true,
      onUpdate: (v) => {
        const map = mapRef.current;
        // map.style is gone while a WebGL context is lost; a getLayer then throws, and a throw
        // in this frame would end the loop for the life of the page.
        if (map && mapLoadedRef.current && map.style) {
          const frames = ringFrame(ringPhase(v, prefersReducedMotion()));
          for (let i = 0; i < frames.length; i++) {
            const id = `ml-fraud-ping-${i}`;
            if (!map.getLayer(id)) continue;
            map.setPaintProperty(id, "circle-radius", frames[i].radiusPx);
            map.setPaintProperty(id, "circle-stroke-opacity", frames[i].strokeOpacity);
            map.setPaintProperty(id, "circle-stroke-width", frames[i].strokeWidthPx);
          }
          // Pin-drop landing: scale each visible fraud marker's dot via the `land`
          // feature-state, keyed to the PLAYHEAD (not wall-clock). landingFraction is a pure fn
          // of (playhead, eventTs), so the drop is deterministic + scrubbable (scrub back ->
          // un-lands). The radar-ping above stays an ambient wall-clock loop (decoration, not state).
          const { playhead, minTime, maxTime } = usePlayhead.getState();
          const span = (maxTime - minTime) * LANDING_FRAC;
          for (const m of fraudMarkersRef.current) {
            setFeatureStateGuarded(map, "ml-auths", m.id, {
              land: landingScale(landingFraction(playhead, m.ts, span)),
            });
          }
        }
      },
    });
    // The refs are stable for the life of GlobeMap; the loop reads .current each tick.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}

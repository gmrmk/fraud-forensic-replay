/**
 * useBloomPulse - the TARGET-click pulse/bloom interaction, extracted from
 * GlobeMap to keep that file under the 800-line cap (one file, one reason to
 * change: this hook owns the click-ack animation surface).
 *
 * When useNavigation.pulseEntityId matches a marker, two parallel tweens
 * (lib/tween.ts) run against welded maplibre paint (no React state):
 *   - the clicked marker scales 1 → 1.9 → 1 over 600ms (outBack overshoot,
 *     reads as a tactile "ack") via the `sel` feature-state on whichever source
 *     owns the clicked id, and
 *   - the welded BLOOM glow + inner/outer rings expand on a single linear
 *     0 → 1 pass feeding cascadeFrame() (per user pick V4 BLOOM, 2026-05-28),
 *     positioned + kind-tinted at the clicked entity.
 * Under reduced motion neither tween starts: the bloom is positioned, then the
 * pulse clears at once. The cleanup puts the marker back at scale 1.
 *
 * Re-trigger correctness: the effect depends on BOTH pulseEntityId AND
 * pulseToken so a same-entity re-click re-fires (same trick as the radar-pulse
 * per-phase layer id). It reads entity arrays from the already-current
 * markerHandlersRef so it does NOT list transactions/logins/places as
 * deps - those would cancel an in-flight bloom on every scenario hot-swap or
 * data refetch.
 *
 * The ml-bloom source + ml-bloom-{glow,inner,outer} layers are created (hidden,
 * EMPTY) in setupLayers and re-created on a destructive setStyle swap; this hook
 * only positions, tints, and animates them.
 */
import { useEffect, type MutableRefObject } from "react";
import type maplibregl from "maplibre-gl";
import { linear, outBack, prefersReducedMotion, tween } from "../lib/tween";
import { cascadeFrame, PULSE_DURATION_MS } from "../lib/marker-cascade";
import { resolvePulseTarget, type PulseKind } from "../lib/pulse-target";
import { mlColors } from "../lib/globe/repaint";
import { resolvePalette } from "../theme/resolve";
import { useTheme } from "../store/theme";
import { useNavigation } from "../store/navigation";
import { useSchema } from "../store/schema";
import { storyInkNow } from "../store/kind-ink";
import type { Entity } from "../lib/entity";
import type { LoginEvent, Place, Transaction } from "../types";

/** Live props + callbacks for the maplibre marker click handlers, bound once in
 *  the mount effect but resolving clicks against the latest data. Mirrored into
 *  a ref in GlobeMap; this hook reads only transactions/logins/places from it.
 *  Structurally identical to setupLayers' SetupLayersDeps.markerHandlersRef. */
export interface MarkerHandlers {
  transactions: Transaction[];
  logins: LoginEvent[];
  places: Place[];
  onTransactionClick?: (t: Transaction) => void;
  onLoginClick?: (l: LoginEvent) => void;
  onPlaceClick?: (p: Place) => void;
  genericEntities?: Entity[];
  navigate: ReturnType<typeof useNavigation.getState>["navigate"];
}

/** Bloom-tint colour per resolved pulse kind - derived from the active palette
 *  so the bloom follows theme changes. Called at click time (not render time)
 *  via useTheme.getState() so it always reads the current palette. */
function bloomColorByKind(): Record<Exclude<PulseKind, "generic">, string> {
  const { theme, color } = useTheme.getState();
  const c = mlColors(resolvePalette(theme, color));
  return { auth: c.auth, fraud: c.fraud, login: c.login, place: c.place };
}

/** maplibre marker source that owns each kind - drives the click-ack `sel`
 *  feature-state. Fraud markers live in the shared auth source. */
const ML_SOURCE_BY_KIND: Record<PulseKind, "ml-auths" | "ml-logins" | "ml-places" | "ml-generic"> = {
  auth: "ml-auths",
  fraud: "ml-auths",
  login: "ml-logins",
  place: "ml-places",
  generic: "ml-generic",
};

const BLOOM_LAYER_IDS = ["ml-bloom-glow", "ml-bloom-inner", "ml-bloom-outer"] as const;

/**
 * Style-swap-safe map mutation guards. The pulse drivers run for
 * ~600ms (marker) / PULSE_DURATION_MS (cascade); a theme flip meanwhile does a
 * destructive `map.setStyle({diff:false})` that wipes every source/layer and
 * reloads the style. An in-flight callback then hit a removed source
 * ("The source 'ml-auths' does not exist") or a mid-load style ("Style is not
 * done loading"). The contract: a late pulse throws nothing and writes only to
 * a source or layer that exists. Each guard returns early when `map.style` is
 * missing (a removed map: `getSource`/`getLayer` would dereference it), then
 * checks the specific `getSource`/`getLayer` existence before mutating. A pulse
 * landing after the style changed has nothing valid to paint, so a silent no-op
 * is the correct outcome, not a throw.
 *
 * `isStyleLoaded()` is deliberately NOT consulted. It is false whenever any
 * source's tiles or data are loading, not only while the style document loads,
 * so it skipped the bloom twice over on every click: the guard's own `setData`
 * on ml-bloom leaves that source not loaded, and the click's camera fly keeps
 * tiles loading through the 600ms ack and most of the 1,300ms bloom. It was also redundant: the style's
 * `_loaded` flag is set before sources are added and every add/set call checks
 * it, so a source or layer that exists implies a loaded style document, and
 * after a destructive swap the new empty style has no ml-* sources until it
 * reloads.
 * Kept as tiny pure helpers so the guard logic is unit-testable in isolation
 * (see .test.ts).
 */
export function setFeatureStateGuarded(
  map: maplibregl.Map,
  source: string,
  id: string,
  state: Record<string, unknown>,
): void {
  if (!map.style || !map.getSource(source)) return;
  map.setFeatureState({ source, id }, state);
}

export function setSourceDataGuarded(
  map: maplibregl.Map,
  sourceId: string,
  data: GeoJSON.FeatureCollection,
): void {
  if (!map.style) return;
  const src = map.getSource(sourceId) as maplibregl.GeoJSONSource | undefined;
  src?.setData(data);
}

export function setPaintPropertyGuarded(
  map: maplibregl.Map,
  layerId: string,
  prop: string,
  value: unknown,
): void {
  if (!map.style || !map.getLayer(layerId)) return;
  map.setPaintProperty(layerId, prop, value);
}

interface BloomPulseDeps {
  mapRef: MutableRefObject<maplibregl.Map | null>;
  mapLoadedRef: MutableRefObject<boolean>;
  markerHandlersRef: MutableRefObject<MarkerHandlers | null>;
}

export function useBloomPulse({
  mapRef,
  mapLoadedRef,
  markerHandlersRef,
}: BloomPulseDeps): void {
  // TARGET-click pulse - when useNavigation.pulseEntityId matches a marker, run
  // the marker-scale + bloom-cascade drivers. Depends on BOTH pulseEntityId AND
  // pulseToken so a same-entity re-click re-fires (token forces re-fire).
  const pulseEntityId = useNavigation((s) => s.pulseEntityId);
  const pulseToken = useNavigation((s) => s.pulseToken);
  const clearPulse = useNavigation((s) => s.clearPulse);

  useEffect(() => {
    if (!pulseEntityId) return;

    // Read entity arrays from the already-current markerHandlersRef so
    // this effect depends only on pulseEntityId + pulseToken. Listing
    // transactions/logins/places as deps would cancel an in-flight bloom on
    // every scenario hot-swap or data refetch. markerHandlersRef.current is
    // kept in sync by its own effect and is always the latest data at click time.
    const { transactions: txs, logins: lgs, places: pls, genericEntities: gen } = markerHandlersRef.current ?? {
      transactions: [],
      logins: [],
      places: [],
      genericEntities: [],
    };

    // Resolve the clicked entity once - position, kind (bloom tint), and the
    // marker source that owns it (click-ack `sel` state) - in a single pass over
    // the arrays (was three lookups: findPulsePosition + an inline kindColor
    // lookup + an inline selSource lookup, each re-scanning tx/logins/places).
    const target = resolvePulseTarget(pulseEntityId, txs, lgs, pls, gen);

    // Position the welded BLOOM source at the clicked entity + tint to its kind
    // (Phase 2b.4). The glow + rings are maplibre layers welded to the globe;
    // only their paint animates (below) - driven imperatively, no React churn.
    const map = mapRef.current;
    if (map && mapLoadedRef.current && target) {
      const kindColor =
        target.kind === "generic"
          ? (storyInkNow().get(target.entityKind ?? "")?.mark ?? useSchema.getState().nodeFor(target.entityKind ?? "")?.palette ?? "#808080")
          : bloomColorByKind()[target.kind];
      setSourceDataGuarded(map, "ml-bloom", {
        type: "FeatureCollection",
        features: [
          { type: "Feature", geometry: { type: "Point", coordinates: [target.pos.lng, target.pos.lat] }, properties: {} },
        ],
      });
      for (const id of BLOOM_LAYER_IDS) {
        setPaintPropertyGuarded(
          map,
          id,
          id === "ml-bloom-glow" ? "circle-color" : "circle-stroke-color",
          kindColor,
        );
      }
    }

    // The bloom is done (played out, cancelled, or never played): its three layers go invisible.
    const zeroBloomOpacities = (): void => {
      const m = mapRef.current;
      if (!m) return;
      for (const id of BLOOM_LAYER_IDS) {
        setPaintPropertyGuarded(m, id, id === "ml-bloom-glow" ? "circle-opacity" : "circle-stroke-opacity", 0);
      }
    };
    const selSource = target ? ML_SOURCE_BY_KIND[target.kind] : null;
    const writeSel = (sel: number): void => {
      const m = mapRef.current;
      if (m && selSource) setFeatureStateGuarded(m, selSource, pulseEntityId, { sel });
    };

    // Reduced motion, read once as the effect starts: the bloom stays positioned and tinted
    // above, but neither the ack nor the bloom plays, and the bloom's completion runs at once.
    if (prefersReducedMotion()) {
      clearPulse();
      zeroBloomOpacities();
      return;
    }

    // Marker scale driver - 1 → 1.9 → 1 with outBack overshoot. Reads as a
    // tactile "ack" on the clicked marker, driven via the `sel` feature-state
    // on whichever source owns the clicked id (Phase 2b.5). No React state -
    // the dot radius expression reads `sel` directly.
    const cancelAck = tween({
      values: [1, 1.9, 1],
      duration: 600,
      ease: outBack,
      onUpdate: writeSel,
      onComplete: () => writeSel(1),
    });

    // BLOOM cascade driver - a single 0 → 1 linear pass feeding cascadeFrame() for
    // the welded glow + inner/outer rings, applied via setPaintProperty (no
    // per-frame React re-render). Per user pick V4 BLOOM (2026-05-28).
    const cancelBloom = tween({
      values: [0, 1],
      duration: PULSE_DURATION_MS,
      ease: linear,
      onUpdate: (v) => {
        const m = mapRef.current;
        if (!m) return;
        const f = cascadeFrame(v);
        setPaintPropertyGuarded(m, "ml-bloom-glow", "circle-radius", f.glow.radius);
        setPaintPropertyGuarded(m, "ml-bloom-glow", "circle-opacity", f.glow.alpha);
        setPaintPropertyGuarded(m, "ml-bloom-inner", "circle-radius", f.inner.radius);
        setPaintPropertyGuarded(m, "ml-bloom-inner", "circle-stroke-opacity", f.inner.alpha);
        setPaintPropertyGuarded(m, "ml-bloom-inner", "circle-stroke-width", f.inner.lineWidthMinPixels);
        setPaintPropertyGuarded(m, "ml-bloom-outer", "circle-radius", f.outer.radius);
        setPaintPropertyGuarded(m, "ml-bloom-outer", "circle-stroke-opacity", f.outer.alpha);
        setPaintPropertyGuarded(m, "ml-bloom-outer", "circle-stroke-width", f.outer.lineWidthMinPixels);
      },
      onComplete: () => {
        clearPulse();
        zeroBloomOpacities();
      },
    });

    // A cancelled tween calls no completion, so the cleanup resets what this run animated: the
    // marker it scaled goes back to 1 (a click on another marker mid-ack must not strand the
    // first one scaled) and the bloom goes invisible.
    return () => {
      cancelAck();
      cancelBloom();
      writeSel(1);
      zeroBloomOpacities();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pulseEntityId, pulseToken, clearPulse]);
}

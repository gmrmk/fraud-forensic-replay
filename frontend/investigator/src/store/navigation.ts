/**
 * Navigation store - the unified navigate() primitive.
 *
 * navigate(entity) fires atomically:
 *   1. set panTarget = entity coords
 *   2. set zoomTarget = entity-kind-specific zoom level
 *   3. set pulseEntityId = entity id
 *   4. increment pulseToken (re-trigger correctness)
 *   5. flip usePlayhead.isPlaying = false (pause)
 *   6. seek usePlayhead.playhead = entity.timestamp (snap timeline)
 *   7. fire selection echo via useSelection
 *
 * Zoom levels are kind-specific per the spec:
 *   auth  / fraud → 12 (neighborhood - merchant context)
 *   login         → 10 (city - IPs locate to broader regions)
 *   place         → 13 (tightest - places ARE the spatial anchors)
 *
 * The renamed-from-goToEntity primitive that the matches table /
 * ticker bar / Inspector TARGET / map marker click / Timeline tick
 * click all call. ANY surface that "snaps to a node" calls this and
 * gets the full pan + zoom + pulse + playhead-seek + selection-echo
 * atomically - the BLOOM cascade and temporal sync are properties of
 * the primitive, not each caller (was a per-caller concern through
 * 2026-05-28; promoted to the primitive once the audit surfaced 5
 * snap-to-node surfaces all needing the same behavior).
 *
 * Place entities have no `timestamp` (they're spatial anchors, not
 * temporal events). For place navigation, playhead is left untouched.
 *
 * pulseToken is the re-trigger correctness trick: marker layers watch
 * the token (not just the id), so the same-id-twice case still
 * re-fires the pulse animation. Same conceptual pattern as the
 * per-phase deck.gl layer-id.
 */
import { create } from "zustand";
import { usePlayhead } from "./playhead";
import { echoSelection } from "../lib/selection-echo";
import type { EntityMatch } from "../lib/matches";

const ZOOM_PER_KIND: Record<EntityMatch["kind"], number> = {
  auth:  12,  // neighborhood-level - merchant context
  fraud: 12,  // same
  login: 10,  // city-level - IPs locate to broader regions
  place: 13,  // tightest - places are the spatial anchors
  account_event: 10, // unused (no coords) - kept for the Record shape
  transfer: 10, // unused (no coords)
  entity: 8,  // a manifest kind: airport / office scale
};

export interface NavigationState {
  panTarget: { lat: number; lng: number } | null;
  zoomTarget: number | null;
  pulseEntityId: string | null;
  pulseToken: number;
  /** `pan: false` selects and seeks without moving the camera (the page's first focus: the map
   *  already opened where it would have flown). */
  navigate: (entity: EntityMatch, options?: { pan?: boolean }) => void;
  /** Pan the globe to a spot without selecting, seeking or pausing (a timeline capsule bringing
   *  its popout's pin into view). */
  panTo: (coords: { lat: number; lng: number }) => void;
  clearPulse: () => void;
}

/** Coords for the map pan, or null for BEHAVIORAL kinds (account events,
 *  transfers) - they have no geography; navigate() skips the pan/zoom and
 *  performs only the temporal + selection parts of the cascade. */
function entityCoords(entity: EntityMatch): { lat: number; lng: number } | null {
  switch (entity.kind) {
    case "auth":
    case "fraud":
      return { lat: entity.tx.merchant_lat, lng: entity.tx.merchant_lng };
    case "login":
      return { lat: entity.login.ip_lat, lng: entity.login.ip_lng };
    case "place":
      return { lat: entity.place.lat, lng: entity.place.lng };
    case "entity":
      return entity.entity.coords;
    case "account_event":
    case "transfer":
      return null; // timeline-only evidence
    default: {
      const _exhaustive: never = entity; // new EntityMatch variant -> compile error here
      return _exhaustive;
    }
  }
}

function entityId(entity: EntityMatch): string {
  if (entity.kind === "auth" || entity.kind === "fraud") return entity.tx.id;
  if (entity.kind === "login") return entity.login.id;
  if (entity.kind === "place") return entity.place.id;
  if (entity.kind === "account_event") return entity.event.id;
  if (entity.kind === "entity") return entity.entity.id;
  return entity.transfer.id;
}

/** Unix-ms timestamp for the entity, or null for kinds without temporal
 *  position (place). Used by navigate() to seek playhead. */
export function entityTimestamp(entity: EntityMatch): number | null {
  switch (entity.kind) {
    case "auth":
    case "fraud":
      return Date.parse(entity.tx.timestamp);
    case "login":
      return Date.parse(entity.login.timestamp);
    case "account_event":
      return Date.parse(entity.event.timestamp);
    case "transfer":
      return Date.parse(entity.transfer.timestamp);
    // A generic entity with no timestamp column carries 0 (timeless, like a place).
    case "entity":
      return entity.entity.timestamp > 0 ? entity.entity.timestamp : null;
    case "place":
      return null; // spatial anchor, no temporal position
    default: {
      const _exhaustive: never = entity;
      return _exhaustive;
    }
  }
}

export const useNavigation = create<NavigationState>((set) => ({
  panTarget: null,
  zoomTarget: null,
  pulseEntityId: null,
  pulseToken: 0,

  navigate: (entity, options) => {
    const coords = options?.pan === false ? null : entityCoords(entity);
    set((s) => ({
      // Behavioral kinds (coords null) skip the pan/zoom: there is nothing
      // on the globe to fly to - the timeline seek IS the navigation.
      panTarget: coords,
      zoomTarget: coords ? ZOOM_PER_KIND[entity.kind] : null,
      pulseEntityId: entityId(entity),
      pulseToken: s.pulseToken + 1,
    }));
    // pause() is a named method on usePlayhead (verified in playhead.ts line 58)
    const ph = usePlayhead.getState();
    ph.pause();
    // Snap playhead to the entity's timestamp so the timeline aligns
    // with the navigated entity. Places have no timestamp (spatial
    // anchors, not temporal events) - leave playhead untouched. All
    // other kinds: seek atomically with the navigate.
    const ts = entityTimestamp(entity);
    if (ts !== null) ph.setPlayhead(ts);
    // echoSelection is the shared kind-dispatch helper used by both the
    // navigate-from-TARGET path and the pivot-window open path. Keeping
    // the dispatch in one place prevents drift between the two surfaces.
    echoSelection(entity);
  },

  panTo: (coords) => set({ panTarget: { lat: coords.lat, lng: coords.lng }, zoomTarget: null }),

  clearPulse: () => set({ pulseEntityId: null }),
  // pulseToken intentionally preserved on clearPulse
}));

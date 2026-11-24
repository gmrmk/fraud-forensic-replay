/**
 * The generic `{ kind: "entity" }` variant of SelectedEntity / EntityMatch:
 * every surface that dispatches on the union must handle it (the never-guard
 * sweep), not fall through to the place or transfer branch.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { selectedToEntity } from "./adapters/ffr-seed";
import { manifestRowToEntity } from "./adapters/manifest-row";
import { echoSelection } from "./selection-echo";
import { entityLngLat } from "./node-anchor";
import { paletteFor, paletteForKind } from "./entity-palette";
import { useNavigation } from "../store/navigation";
import { useSelection } from "../store/selection";
import { usePlayhead } from "../store/playhead";
import { useSchema } from "../store/schema";
import { useMatches } from "../store/matches";
import type { ScenarioNode } from "./scenarios";

const shipmentNode: ScenarioNode = {
  kind: "shipment", label: "Shipment", palette: "#ffb347", source: "sql",
  coords: { lat: "lat", lng: "lng" }, timestamp: "issued_at", primary: "${id}",
};
const refundNode: ScenarioNode = {
  kind: "refund", label: "Refund", palette: "#ff5c5c", source: "sql",
  coords: null, timestamp: "processed_at", primary: "${id}",
};
const shipment = manifestRowToEntity(shipmentNode, {
  id: "sh-0106", lat: 29.7371, lng: -95.5262, issued_at: "2026-05-17T11:08:00-05:00",
});
const refund = manifestRowToEntity(refundNode, { id: "rfnd-1", processed_at: "2026-05-29T10:05:00-05:00" });

beforeEach(() => {
  useNavigation.setState({ panTarget: null, zoomTarget: null, pulseEntityId: null, pulseToken: 0 });
  useSelection.setState({ selected: null });
  usePlayhead.setState({ isPlaying: true, playhead: 1 });
  useSchema.setState({ nodes: [shipmentNode, refundNode] });
});

describe("generic entity variant", () => {
  it("selectedToEntity returns the wrapped entity itself", () => {
    expect(selectedToEntity({ kind: "entity", entity: shipment })).toBe(shipment);
  });

  it("selectEntity selects it as the generic variant", () => {
    useSelection.getState().selectEntity(shipment);
    expect(useSelection.getState().selected).toEqual({ kind: "entity", entity: shipment });
  });

  it("echoSelection selects a generic entity, not a place", () => {
    echoSelection({ kind: "entity", entity: shipment });
    expect(useSelection.getState().selected).toEqual({ kind: "entity", entity: shipment });
  });

  it("navigate pans, zooms, pulses, pauses, seeks the playhead and selects", () => {
    useNavigation.getState().navigate({ kind: "entity", entity: shipment });
    const nav = useNavigation.getState();
    expect(nav.panTarget).toEqual({ lat: 29.7371, lng: -95.5262 });
    expect(nav.zoomTarget).toBe(8);
    expect(nav.pulseEntityId).toBe("sh-0106");
    expect(usePlayhead.getState().isPlaying).toBe(false);
    expect(usePlayhead.getState().playhead).toBe(shipment.timestamp);
    expect(useSelection.getState().selected).toEqual({ kind: "entity", entity: shipment });
  });

  it("navigate to a coordless entity seeks and selects but never pans", () => {
    useNavigation.getState().navigate({ kind: "entity", entity: refund });
    const nav = useNavigation.getState();
    expect(nav.panTarget).toBeNull();
    expect(nav.zoomTarget).toBeNull();
    expect(usePlayhead.getState().playhead).toBe(refund.timestamp);
    expect(useSelection.getState().selected).toEqual({ kind: "entity", entity: refund });
  });

  it("navigate to a timeless entity leaves the playhead where it was", () => {
    useNavigation.getState().navigate({ kind: "entity", entity: { ...refund, timestamp: 0 } });
    expect(usePlayhead.getState().playhead).toBe(1);
  });

  it("entityLngLat is the entity's coords, null when coordless", () => {
    expect(entityLngLat({ kind: "entity", entity: shipment })).toEqual({ lng: -95.5262, lat: 29.7371 });
    expect(entityLngLat({ kind: "entity", entity: refund })).toBeNull();
  });

  it("Matches opened from a generic entity takes its own kind as the window palette kind", () => {
    useSelection.getState().selectEntity(shipment);
    useMatches.getState().open("card_token", "tok-414720******4729");
    expect(useMatches.getState().active).toMatchObject({ mode: "field", parentKind: "shipment" });
    useMatches.getState().close();
  });

  it("paletteFor takes the node's manifest colour, not the place fallback", () => {
    expect(paletteFor({ kind: "entity", entity: shipment }).hex).toBe("#ffb347");
    expect(paletteForKind("refund").hex).toBe("#ff5c5c");
    expect(paletteForKind("not_in_schema").hex).toBe("#808080");
  });
});

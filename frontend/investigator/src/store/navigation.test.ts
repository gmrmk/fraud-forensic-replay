import { describe, it, expect, beforeEach } from "vitest";
import { useNavigation } from "./navigation";
import { useSelection } from "./selection";
import { usePlayhead } from "./playhead";
import type { Transaction } from "../types";

function makeTransaction(overrides: Partial<Transaction> = {}): Transaction {
  return {
    id: "tx-1",
    card_id: "card-marcus-visa-001",
    account_id: "acct-1",
    amount: 100,
    merchant_name: "Test Merchant",
    merchant_lat: 29.76,
    merchant_lng: -95.37,
    merchant_country: "US",
    mcc: "5411",
    category: "grocery",
    timestamp: "2026-05-26T22:18:00Z",
    is_card_present: 1,
    is_fraud: 0,
    balance_after: 1000,
    auth_response_code: "00",
    pos_entry_mode: "chip",
    network_ref_number: "NRN1",
    terminal_id: "TERM-1",
    acquirer: "Harlowe Bank",
    auth_source: "issuer",
    risk_score: 100,
    is_3ds: 0,
    currency: "USD",
    ...overrides,
  };
}

function fakeTx(overrides: Partial<Transaction> = {}): Transaction {
  return makeTransaction(overrides);
}

describe("useNavigation.navigate()", () => {
  beforeEach(() => {
    useNavigation.setState({ panTarget: null, zoomTarget: null, pulseEntityId: null, pulseToken: 0 });
    useSelection.setState({ selected: null });
    usePlayhead.setState({ isPlaying: true });  // start playing to verify pause
  });

  it("sets zoomTarget = 12 for auth", () => {
    const tx = fakeTx({ is_fraud: 0 });
    useNavigation.getState().navigate({ kind: "auth", tx });
    expect(useNavigation.getState().zoomTarget).toBe(12);
  });

  it("sets zoomTarget = 12 for fraud", () => {
    const tx = fakeTx({ is_fraud: 1 });
    useNavigation.getState().navigate({ kind: "fraud", tx });
    expect(useNavigation.getState().zoomTarget).toBe(12);
  });

  it("sets zoomTarget = 10 for login", () => {
    const login = {
      id: "l-1", account_id: "a", timestamp: "2026-05-26T20:00:00Z",
      ip: "1", ip_country: "US", ip_lat: 40, ip_lng: -74,
      ip_type: "residential" as const, ip_asn: "AS1", ip_reputation: 90,
      device_fp: "dev", user_agent: "ua", outcome: "success" as const,
      session_id: "s", two_fa_used: 0,
      device_first_seen_at: "2026-01-01T00:00:00Z",
      device_trust: "known" as const, auth_method: "password" as const, challenge_reason: null,
    };
    useNavigation.getState().navigate({ kind: "login", login });
    expect(useNavigation.getState().zoomTarget).toBe(10);
  });

  it("sets zoomTarget = 13 for place", () => {
    useNavigation.getState().navigate({
      kind: "place",
      place: { id: "p1", name: "X", category: "y", lat: 1, lng: 2 },
    });
    expect(useNavigation.getState().zoomTarget).toBe(13);
  });

  it("pulseToken increments monotonically across calls", () => {
    const a = fakeTx({ id: "a" });
    const b = fakeTx({ id: "b" });
    useNavigation.getState().navigate({ kind: "auth", tx: a });
    expect(useNavigation.getState().pulseToken).toBe(1);
    useNavigation.getState().navigate({ kind: "auth", tx: b });
    expect(useNavigation.getState().pulseToken).toBe(2);
  });

  it("navigate(entity, { pan: false }) leaves the camera targets empty and still selects, seeks and pulses", () => {
    usePlayhead.setState({ playhead: 0 });
    const tx = fakeTx({ id: "quiet", timestamp: "2026-05-26T22:18:00Z" });
    useNavigation.getState().navigate({ kind: "auth", tx }, { pan: false });
    const s = useNavigation.getState();
    expect(s.panTarget).toBeNull();
    expect(s.zoomTarget).toBeNull();
    expect(s.pulseEntityId).toBe("quiet");
    expect(s.pulseToken).toBe(1);
    expect(usePlayhead.getState().playhead).toBe(Date.parse("2026-05-26T22:18:00Z"));
    expect(useSelection.getState().selected?.kind).toBe("auth");
  });

  it("navigate(entity) still sets panTarget", () => {
    useNavigation.getState().navigate({ kind: "auth", tx: fakeTx({ merchant_lat: 30, merchant_lng: -90 }) });
    expect(useNavigation.getState().panTarget).toEqual({ lat: 30, lng: -90 });
  });

  it("flips usePlayhead.isPlaying to false (pause)", () => {
    expect(usePlayhead.getState().isPlaying).toBe(true);
    useNavigation.getState().navigate({ kind: "auth", tx: fakeTx() });
    expect(usePlayhead.getState().isPlaying).toBe(false);
  });

  it("fires selection echo via useSelection", () => {
    const tx = fakeTx({ id: "echo" });
    useNavigation.getState().navigate({ kind: "auth", tx });
    expect(useSelection.getState().selected?.kind).toBe("auth");
  });

  it("clearPulse() clears pulseEntityId, preserves pulseToken", () => {
    useNavigation.getState().navigate({ kind: "auth", tx: fakeTx() });
    expect(useNavigation.getState().pulseEntityId).not.toBeNull();
    useNavigation.getState().clearPulse();
    expect(useNavigation.getState().pulseEntityId).toBeNull();
    expect(useNavigation.getState().pulseToken).toBe(1);
  });

  // Coverage backfill - these were in the old goToEntity suite and got
  // dropped in the zoom-focused rewrite. Restoring per Task 5 review.

  it("starts with null panTarget, null zoomTarget, null pulseEntityId, pulseToken 0", () => {
    // Reset store to fresh state (don't use beforeEach values).
    useNavigation.setState({ panTarget: null, zoomTarget: null, pulseEntityId: null, pulseToken: 0 });
    const s = useNavigation.getState();
    expect(s.panTarget).toBeNull();
    expect(s.zoomTarget).toBeNull();
    expect(s.pulseEntityId).toBeNull();
    expect(s.pulseToken).toBe(0);
  });

  it("navigate sets panTarget per kind (auth=merchant, login=ip, place=place)", () => {
    // auth -> merchant_lat/lng
    const tx = fakeTx({ merchant_lat: 30, merchant_lng: -90 });
    useNavigation.getState().navigate({ kind: "auth", tx });
    expect(useNavigation.getState().panTarget).toEqual({ lat: 30, lng: -90 });

    // login -> ip_lat/ip_lng
    const login = {
      id: "l-99", account_id: "a", timestamp: "2026-05-26T20:00:00Z",
      ip: "1", ip_country: "US", ip_lat: 40.7, ip_lng: -74,
      ip_type: "residential" as const, ip_asn: "AS1", ip_reputation: 90,
      device_fp: "dev", user_agent: "ua", outcome: "success" as const,
      session_id: "s", two_fa_used: 0,
      device_first_seen_at: "2026-01-01T00:00:00Z",
      device_trust: "known" as const, auth_method: "password" as const, challenge_reason: null,
    };
    useNavigation.getState().navigate({ kind: "login", login });
    expect(useNavigation.getState().panTarget).toEqual({ lat: 40.7, lng: -74 });

    // place -> place lat/lng
    useNavigation.getState().navigate({
      kind: "place",
      place: { id: "p1", name: "X", category: "y", lat: 29.76, lng: -95.37 },
    });
    expect(useNavigation.getState().panTarget).toEqual({ lat: 29.76, lng: -95.37 });
  });

  it("navigate sets pulseEntityId to entity.id (auth + login)", () => {
    const tx = fakeTx({ id: "tx-99" });
    useNavigation.getState().navigate({ kind: "auth", tx });
    expect(useNavigation.getState().pulseEntityId).toBe("tx-99");

    const login = {
      id: "login-77", account_id: "a", timestamp: "2026-05-26T20:00:00Z",
      ip: "1", ip_country: "US", ip_lat: 0, ip_lng: 0,
      ip_type: "residential" as const, ip_asn: "AS1", ip_reputation: 90,
      device_fp: "dev", user_agent: "ua", outcome: "success" as const,
      session_id: "s", two_fa_used: 0,
      device_first_seen_at: "2026-01-01T00:00:00Z",
      device_trust: "known" as const, auth_method: "password" as const, challenge_reason: null,
    };
    useNavigation.getState().navigate({ kind: "login", login });
    expect(useNavigation.getState().pulseEntityId).toBe("login-77");
  });
});

describe("useNavigation.panTo()", () => {
  it("pans without zoom, selection, seek or pulse", () => {
    useNavigation.setState({ panTarget: null, zoomTarget: 9, pulseEntityId: "x", pulseToken: 3 });
    useSelection.setState({ selected: null });
    usePlayhead.setState({ playhead: 1234 });
    useNavigation.getState().panTo({ lat: 1, lng: 2 });
    expect(useNavigation.getState()).toMatchObject({ panTarget: { lat: 1, lng: 2 }, zoomTarget: null, pulseEntityId: "x", pulseToken: 3 });
    expect(useSelection.getState().selected).toBeNull();
    expect(usePlayhead.getState().playhead).toBe(1234);
  });
});

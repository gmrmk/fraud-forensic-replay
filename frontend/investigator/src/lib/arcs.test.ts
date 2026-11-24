import { describe, it, expect } from "vitest";
import { detectArcs, arcDrawFraction, interpolateTarget, SPEED_THRESHOLD_MPH } from "./arcs";
import type { Transaction } from "../types";

// Factory - only the fields detectArcs reads need to be meaningful.
function tx(over: Partial<Transaction>): Transaction {
  return {
    id: "tx", card_id: "c", account_id: "a",
    timestamp: "2026-05-26T12:00:00-05:00", amount: 10,
    merchant_name: "m", merchant_lat: 29.78, merchant_lng: -95.55,
    merchant_country: "US", mcc: "5411", category: "groceries",
    is_card_present: 1, is_fraud: 0, balance_after: 0,
    auth_response_code: "00", pos_entry_mode: "chip",
    network_ref_number: "NRN", terminal_id: "T-1", acquirer: "X",
    auth_source: "issuer", risk_score: 50, is_3ds: 0, currency: "USD",
    ...over,
  };
}

const HOUSTON = { merchant_lat: 29.78, merchant_lng: -95.55 };
const LAGOS = { merchant_lat: 6.5364, merchant_lng: 3.3972 };
const LAGOS2 = { merchant_lat: 6.5324, merchant_lng: 3.4012 };

it("arcDrawFraction eases 0->1 over the duration", () => {
  expect(arcDrawFraction(0)).toBe(0);
  expect(arcDrawFraction(800)).toBe(1);
  expect(arcDrawFraction(1000)).toBe(1);
  expect(arcDrawFraction(400)).toBeGreaterThan(0);
});
it("interpolateTarget returns source at 0, target at 1", () => {
  expect(interpolateTarget([-95, 29], [3, 6], 0)).toEqual([-95, 29]);
  expect(interpolateTarget([-95, 29], [3, 6], 1)).toEqual([3, 6]);
});

describe("detectArcs", () => {
  it("flags Houston->Lagos (~9.7h) as an impossible-travel arc, marked hero", () => {
    const arcs = detectArcs([
      tx({ id: "h", ...HOUSTON, timestamp: "2026-05-26T22:00:00-05:00" }),
      tx({ id: "l", ...LAGOS, merchant_country: "NG",
           timestamp: "2026-05-27T07:42:00-05:00" }),
    ]);
    expect(arcs).toHaveLength(1);
    expect(arcs[0].kind).toBe("impossible");
    expect(arcs[0].impliedSpeedMph).toBeGreaterThan(SPEED_THRESHOLD_MPH);
    expect(arcs[0].isHero).toBe(true);
    expect(arcs[0].source).toEqual([-95.55, 29.78]); // [lng, lat]
    expect(arcs[0].target).toEqual([3.3972, 6.5364]);
  });

  it("draws a velocity connector for a rapid cross-location pair INSIDE a fraud cluster", () => {
    // The Houston->Lagos impossible arc anchors the Lagos neighborhood as a
    // fraud cluster; the subsequent rapid Lagos pair connects within it.
    const arcs = detectArcs([
      tx({ id: "anchor", ...HOUSTON, timestamp: "2026-05-26T22:00:00-05:00" }),
      tx({ id: "a", ...LAGOS, merchant_country: "NG", timestamp: "2026-05-27T07:42:00-05:00" }),
      tx({ id: "b", ...LAGOS2, merchant_country: "NG", timestamp: "2026-05-27T07:45:00-05:00" }),
    ]);
    const velocity = arcs.filter((a) => a.kind === "velocity");
    expect(velocity).toHaveLength(1);
    expect(velocity[0].gapMinutes).toBeLessThanOrEqual(5);
    expect(velocity[0].isHero).toBe(false);
  });

  it("does NOT draw velocity connectors outside a fraud cluster (baseline rapid errands)", () => {
    // Two legitimate baseline txns at different Houston merchants, 3 min apart,
    // with NO impossible-travel landing nearby. Rapid + cross-location, but not a
    // fraud cluster -> no connector. (This is the baseline-noise the live seed had.)
    const HOUSTON_B = { merchant_lat: 29.70, merchant_lng: -95.40 }; // ~10 mi from HOUSTON
    const arcs = detectArcs([
      tx({ id: "a", ...HOUSTON, timestamp: "2026-05-10T12:00:00-05:00" }),
      tx({ id: "b", ...HOUSTON_B, timestamp: "2026-05-10T12:03:00-05:00" }),
    ]);
    expect(arcs).toHaveLength(0);
  });

  it("does NOT connect a same-location rapid pair (gas then snack)", () => {
    const arcs = detectArcs([
      tx({ id: "a", ...HOUSTON, timestamp: "2026-05-26T12:00:00-05:00" }),
      tx({ id: "b", ...HOUSTON, timestamp: "2026-05-26T12:03:00-05:00" }),
    ]);
    expect(arcs).toHaveLength(0);
  });

  it("does NOT flag a short intra-city pair as impossible, even at an absurd implied speed", () => {
    // Two baseline Houston txns ~8 mi apart, 3 seconds apart => ~9,600 mph implied.
    // High speed but tiny distance is a data artifact, NOT impossible travel. The
    // distance guard stops it from stealing the hero crown from Houston->Lagos.
    const HOUSTON_B = { merchant_lat: 29.70, merchant_lng: -95.37 }; // ~8 mi from HOUSTON
    const arcs = detectArcs([
      tx({ id: "a", ...HOUSTON, timestamp: "2026-05-19T11:59:47-05:00" }),
      tx({ id: "b", ...HOUSTON_B, timestamp: "2026-05-19T11:59:50-05:00" }),
    ]);
    expect(arcs.filter((a) => a.kind === "impossible")).toHaveLength(0);
    expect(arcs).toHaveLength(0); // and not velocity either - no fraud-cluster anchor
  });

  it("ignores card-not-present transactions", () => {
    const arcs = detectArcs([
      tx({ id: "h", ...HOUSTON, timestamp: "2026-05-26T22:00:00-05:00" }),
      tx({ id: "cnp", ...LAGOS, is_card_present: 0,
           timestamp: "2026-05-27T07:42:00-05:00" }),
    ]);
    expect(arcs).toHaveLength(0);
  });

  it("returns empty for fewer than two CP transactions", () => {
    expect(detectArcs([])).toEqual([]);
    expect(detectArcs([tx({ id: "h", ...HOUSTON })])).toEqual([]);
  });

  it("marks only the most-severe impossible arc as hero", () => {
    const arcs = detectArcs([
      tx({ id: "h", ...HOUSTON, timestamp: "2026-05-26T22:00:00-05:00" }),
      tx({ id: "l", ...LAGOS, timestamp: "2026-05-27T07:42:00-05:00" }),     // ~674mph
      tx({ id: "h2", ...HOUSTON, timestamp: "2026-05-27T08:42:00-05:00" }),  // Lagos->Houston in 1h => much faster
    ]);
    const heroes = arcs.filter((a) => a.isHero);
    expect(heroes).toHaveLength(1);
    const impossibleSpeeds = arcs.filter((a) => a.kind === "impossible").map((a) => a.impliedSpeedMph);
    expect(heroes[0].impliedSpeedMph).toBe(Math.max(...impossibleSpeeds));
  });

  it("on baseline noise + the fraud signature, yields exactly the Houston->Lagos hero + Lagos velocity connectors", () => {
    // Mirrors the real 143-row seed's problem shapes: baseline rapid Houston pairs
    // that previously produced false-positive arcs (one even stole the hero crown),
    // plus the genuine fraud signature. Regression guard for the live-verify finding.
    const HOUSTON_B = { merchant_lat: 29.70, merchant_lng: -95.37 }; // ~8 mi from HOUSTON
    const LEKKI_1 = { merchant_lat: 6.536, merchant_lng: 3.397 };
    const LEKKI_2 = { merchant_lat: 6.532, merchant_lng: 3.401 };
    const LEKKI_3 = { merchant_lat: 6.538, merchant_lng: 3.404 };
    const arcs = detectArcs([
      // baseline near-simultaneous Houston pair (was a false "impossible" @ ~9,600 mph)
      tx({ id: "b1a", ...HOUSTON, timestamp: "2026-05-10T10:00:00-05:00" }),
      tx({ id: "b1b", ...HOUSTON_B, timestamp: "2026-05-10T10:00:03-05:00" }),
      // baseline rapid Houston errand pair (was a false "velocity")
      tx({ id: "b2a", ...HOUSTON, timestamp: "2026-05-15T18:00:00-05:00" }),
      tx({ id: "b2b", ...HOUSTON_B, timestamp: "2026-05-15T18:03:00-05:00" }),
      // the fraud signature: Cobstead Grocers anchor -> Lagos cluster (decline + 3 successes)
      tx({ id: "grocery", ...HOUSTON, timestamp: "2026-05-26T22:00:00-05:00" }),
      tx({ id: "lz", ...LEKKI_1, merchant_country: "NG", timestamp: "2026-05-27T07:41:00-05:00" }), // decline (shares l1 coords)
      tx({ id: "l1", ...LEKKI_1, merchant_country: "NG", timestamp: "2026-05-27T07:42:00-05:00" }),
      tx({ id: "l2", ...LEKKI_2, merchant_country: "NG", timestamp: "2026-05-27T07:45:00-05:00" }),
      tx({ id: "l3", ...LEKKI_3, merchant_country: "NG", timestamp: "2026-05-27T07:49:00-05:00" }),
    ]);
    const impossible = arcs.filter((a) => a.kind === "impossible");
    const velocity = arcs.filter((a) => a.kind === "velocity");
    // exactly one impossible arc - the marquee - and it is the hero
    expect(impossible).toHaveLength(1);
    expect(impossible[0].isHero).toBe(true);
    expect(impossible[0].source).toEqual([-95.55, 29.78]); // Houston (Cobstead Grocers)
    expect(impossible[0].target).toEqual([3.397, 6.536]);  // Lagos
    // velocity connectors only within the Lagos cluster (l1->l2, l2->l3);
    // decline->l1 shares coords so it does not connect
    expect(velocity).toHaveLength(2);
    // zero Houston-local arcs (both endpoints in the western hemisphere)
    const houstonArcs = arcs.filter((a) => a.source[0] < -50 && a.target[0] < -50);
    expect(houstonArcs).toHaveLength(0);
  });

  it("severity stays in [0,1] and a tighter velocity gap is more severe", () => {
    const arcs = detectArcs([
      tx({ id: "h", ...HOUSTON, timestamp: "2026-05-26T22:00:00-05:00" }),
      tx({ id: "l", ...LAGOS, timestamp: "2026-05-27T07:42:00-05:00" }),
    ]);
    for (const a of arcs) {
      expect(a.severity).toBeGreaterThanOrEqual(0);
      expect(a.severity).toBeLessThanOrEqual(1);
    }
    // velocity severity compared within a fraud cluster (Houston->Lagos anchor present)
    const tight = detectArcs([
      tx({ id: "anchor", ...HOUSTON, timestamp: "2026-05-26T22:00:00-05:00" }),
      tx({ id: "a", ...LAGOS, timestamp: "2026-05-27T07:42:00-05:00" }),
      tx({ id: "b", ...LAGOS2, timestamp: "2026-05-27T07:43:00-05:00" }), // 1 min
    ]).filter((a) => a.kind === "velocity")[0];
    const loose = detectArcs([
      tx({ id: "anchor", ...HOUSTON, timestamp: "2026-05-26T22:00:00-05:00" }),
      tx({ id: "a", ...LAGOS, timestamp: "2026-05-27T07:42:00-05:00" }),
      tx({ id: "b", ...LAGOS2, timestamp: "2026-05-27T07:46:00-05:00" }), // 4 min
    ]).filter((a) => a.kind === "velocity")[0];
    expect(tight.severity).toBeGreaterThan(loose.severity);
  });
});

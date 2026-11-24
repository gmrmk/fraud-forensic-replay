import { describe, it, expect } from "vitest";
import { computeTerminator } from "./terminator";

/**
 * Cited anchors come from the VERIFIED spec (NOAA gml.noaa.gov General Solar
 * Position Calculations PDF + Wikipedia 'Subsolar point', cross-checked two ways).
 * The 12:00-UTC longitude anchor is the strongest test: a closed-form internal
 * invariant (subsolarLng = -eqtime/4) independent of any ephemeris.
 */

const DEG = Math.PI / 180;

/** Great-circle angular distance (degrees) between two [lat, lng] points. */
function greatCircleDeg(
  aLat: number,
  aLng: number,
  bLat: number,
  bLng: number,
): number {
  const dLat = (bLat - aLat) * DEG;
  const dLng = (bLng - aLng) * DEG;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(aLat * DEG) * Math.cos(bLat * DEG) * Math.sin(dLng / 2) ** 2;
  return 2 * Math.asin(Math.min(1, Math.sqrt(h))) / DEG;
}

describe("computeTerminator - cited subsolar anchors (NOAA / Wikipedia)", () => {
  it("June solstice 2026: subsolar point at the Tropic of Cancer (max +decl)", () => {
    // 2026-06-21T08:25:00Z. NOAA formula -> lat +23.451 deg, lng +54.07 deg.
    const { subsolar } = computeTerminator(1782030300000);
    expect(subsolar.lat).toBeCloseTo(23.44, 0); // within +-0.15 deg (assert via abs below)
    expect(Math.abs(subsolar.lat - 23.44)).toBeLessThanOrEqual(0.15);
    expect(Math.abs(subsolar.lng - 54.07)).toBeLessThanOrEqual(0.5);
  });

  it("September equinox 2026: subsolar latitude ~0 (Sun crosses the equator)", () => {
    // 2026-09-23T00:06:00Z. NOAA series -> lat +0.44 deg, lng +176.64 deg.
    const { subsolar } = computeTerminator(1790121960000);
    expect(Math.abs(subsolar.lat - 0)).toBeLessThanOrEqual(0.6);
    expect(Math.abs(subsolar.lng - 176.64)).toBeLessThanOrEqual(0.7);
  });

  it("equinox-day 12:00 UTC: subsolarLng == -eqtime/4 (zero-dependency invariant)", () => {
    // 2026-09-23T12:00:00Z. EXACT internal invariant: at 12:00 UTC,
    // subsolarLng = -eqtime/4 deg = -1.9105 deg (eqtime = +7.642 min by NOAA).
    const { subsolar } = computeTerminator(1790164800000);
    expect(subsolar.lng).toBeCloseTo(-1.91, 2); // +-0.01 deg
    expect(Math.abs(subsolar.lat - 0.25)).toBeLessThanOrEqual(0.6);
  });
});

describe("computeTerminator - terminator polyline geometry", () => {
  it("has ~361 vertices spanning the full longitude range [-180, 180]", () => {
    const { terminatorLine } = computeTerminator(1782030300000);
    expect(terminatorLine.type).toBe("Feature");
    expect(terminatorLine.geometry.type).toBe("LineString");
    const coords = terminatorLine.geometry.coordinates;
    expect(coords.length).toBe(361);
    expect(coords[0][0]).toBeCloseTo(-180, 6);
    expect(coords[coords.length - 1][0]).toBeCloseTo(180, 6);
  });

  it("every terminator vertex is ~90 deg great-circle from the subsolar point", () => {
    // Sample several instants spanning the year, incl. an equinox (decl ~ 0).
    for (const ms of [
      1782030300000, // June solstice
      1790121960000, // Sep equinox
      1790164800000, // equinox-day noon
      1767225600000, // 2026-01-01T00:00:00Z (decl strongly negative)
    ]) {
      const { subsolar, terminatorLine } = computeTerminator(ms);
      for (const [lng, lat] of terminatorLine.geometry.coordinates) {
        expect(Number.isNaN(lat)).toBe(false);
        expect(Number.isNaN(lng)).toBe(false);
        const d = greatCircleDeg(lat, lng, subsolar.lat, subsolar.lng);
        // 90 deg from the subsolar point, within float/series epsilon.
        expect(Math.abs(d - 90)).toBeLessThanOrEqual(0.5);
      }
    }
  });

  it("keeps all longitudes normalized to [-180, 180]", () => {
    const { terminatorLine, nightPolygon } = computeTerminator(1790121960000);
    for (const [lng] of terminatorLine.geometry.coordinates) {
      expect(lng).toBeGreaterThanOrEqual(-180);
      expect(lng).toBeLessThanOrEqual(180);
    }
    for (const [lng] of nightPolygon.geometry.coordinates[0]) {
      expect(lng).toBeGreaterThanOrEqual(-180);
      expect(lng).toBeLessThanOrEqual(180);
    }
  });
});

describe("computeTerminator - nightPolygon validity", () => {
  it("is a closed ring (first vertex == last vertex) with no NaN", () => {
    for (const ms of [1782030300000, 1790121960000, 1767225600000]) {
      const { nightPolygon } = computeTerminator(ms);
      expect(nightPolygon.type).toBe("Feature");
      expect(nightPolygon.geometry.type).toBe("Polygon");
      const ring = nightPolygon.geometry.coordinates[0];
      expect(ring.length).toBeGreaterThan(3);
      const first = ring[0];
      const last = ring[ring.length - 1];
      expect(first[0]).toBeCloseTo(last[0], 9);
      expect(first[1]).toBeCloseTo(last[1], 9);
      for (const [lng, lat] of ring) {
        expect(Number.isNaN(lng)).toBe(false);
        expect(Number.isNaN(lat)).toBe(false);
      }
    }
  });

  it("encloses the DARK (south) hemisphere and excludes the subsolar point", () => {
    // June solstice: decl > 0 -> South pole is dark. Test just-inside the pole
    // (the dark hemisphere), not the exact pole VERTEX which lies on the ring's
    // closing edge - an ambiguous point-in-polygon boundary, not a real check.
    const { nightPolygon, subsolar } = computeTerminator(1782030300000);
    const ring = nightPolygon.geometry.coordinates[0];
    expect(pointInRing(0, -89.9, ring)).toBe(true); // dark (south) hemisphere inside
    expect(pointInRing(subsolar.lng, subsolar.lat, ring)).toBe(false); // subsolar outside
  });

  it("December: decl < 0 -> North hemisphere is dark, inside the night polygon", () => {
    // Late-December instant, decl < 0 (Sun over the Tropic of Capricorn region).
    const { nightPolygon, subsolar } = computeTerminator(1766620800000);
    const ring = nightPolygon.geometry.coordinates[0];
    expect(pointInRing(0, 89.9, ring)).toBe(true); // dark (north) hemisphere inside
    expect(pointInRing(subsolar.lng, subsolar.lat, ring)).toBe(false); // subsolar outside
  });
});

/**
 * Exact spherical day/night classification (the GROUND TRUTH the night overlay
 * must match): a point P is NIGHT iff its great-circle distance from the subsolar
 * point S exceeds 90 deg, i.e. cos(c) < 0 where
 *   cos(c) = sin(latS)sin(latP) + cos(latS)cos(latP)cos(lngP - lngS).
 * This is independent of the polygon construction, so agreement between this and
 * pointInRing(nightPolygon) is a real second signal, not a tautology.
 */
function isNightTruth(
  subLat: number,
  subLng: number,
  lat: number,
  lng: number,
): boolean {
  const latS = subLat * DEG;
  const lngS = subLng * DEG;
  const latP = lat * DEG;
  const lngP = lng * DEG;
  const cosC =
    Math.sin(latS) * Math.sin(latP) +
    Math.cos(latS) * Math.cos(latP) * Math.cos(lngP - lngS);
  return cosC < 0;
}

function normLng(lng: number): number {
  return ((((lng + 180) % 360) + 360) % 360) - 180;
}

describe("computeTerminator - nightPolygon matches exact spherical day/night", () => {
  // REGRESSION GUARD for the near-equinox night overlay. At small |decl| the
  // night region is NOT a circular polar cap - it is a pole-to-pole longitudinal
  // lune (|lng - subLng| > 90 at every latitude), so a point at lat +-89.9 is
  // night ONLY near the anti-subsolar meridian and day elsewhere. The polygon's
  // point-in-ring result must agree with the exact cos(c) < 0 classification
  // across the whole sphere, including longitudes far from 0 and across the
  // antimeridian seam. These instants all have |decl| > EQUINOX_DECL_EPS so the
  // equinox floor never fires; they exercise the live atan + closure path.
  const instants: { ms: number; iso: string }[] = [
    { ms: 1774108200000, iso: "2026-03-21T15:50Z (decl~-5e-5, N dark, cited)" },
    { ms: 1774109400000, iso: "2026-03-21T16:10Z (decl~+5e-5, S dark)" },
    { ms: 1790220600000, iso: "2026-09-24T03:30Z (decl~-4e-5, N dark)" },
    { ms: 1782030300000, iso: "2026-06-21T08:25Z (solstice, S dark)" },
  ];

  for (const { ms, iso } of instants) {
    it(`${iso}: ring membership equals cos(c)<0 across the sphere`, () => {
      const { nightPolygon, subsolar } = computeTerminator(ms);
      const ring = nightPolygon.geometry.coordinates[0];

      // Dense lat/lng grid, biased to include high latitudes and the seam so a
      // degenerate sliver ring (the cited failure mode) would be caught.
      let mismatches = 0;
      for (let lat = -85; lat <= 85; lat += 5) {
        for (let lng = -175; lng <= 175; lng += 5) {
          const lngN = normLng(lng);
          const inRing = pointInRing(lngN, lat, ring);
          const truth = isNightTruth(subsolar.lat, subsolar.lng, lat, lngN);
          if (inRing !== truth) mismatches++;
        }
      }
      expect(mismatches).toBe(0);

      // And the cited assertions, derived from ground truth (not assumed):
      // the anti-subsolar bulk is night; the subsolar point is day.
      const antiLng = normLng(subsolar.lng + 180);
      expect(pointInRing(antiLng, -subsolar.lat, ring)).toBe(true);
      expect(pointInRing(subsolar.lng, subsolar.lat, ring)).toBe(false);
    });
  }
});

/** Signed area (shoelace) of a closed [lng, lat] ring. > 0 => CCW. */
function signedArea(ring: number[][]): number {
  let sum = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    sum += (ring[j][0] - ring[i][0]) * (ring[j][1] + ring[i][1]);
  }
  return sum / 2;
}

describe("computeTerminator - nightPolygon RFC-7946 exterior winding (CCW)", () => {
  // RFC 7946 section 3.1.6: a Polygon's exterior ring MUST wind counter-clockwise
  // (positive signed area). This must hold for ALL decl - solstice, equinox, and
  // either dark pole - regardless of where the winding self-correction's probes
  // happen to land.
  for (const ms of [
    1782030300000, // June solstice (S dark)
    1766620800000, // late December (N dark)
    1774108200000, // near March equinox, decl < 0 (N dark)
    1774109400000, // near March equinox, decl > 0 (S dark)
    1767225600000, // 2026-01-01T00:00:00Z (decl strongly negative)
    1790164800000, // equinox-day noon
  ]) {
    it(`ms=${ms}: exterior ring is counter-clockwise`, () => {
      const { nightPolygon } = computeTerminator(ms);
      const ring = nightPolygon.geometry.coordinates[0];
      expect(signedArea(ring)).toBeGreaterThan(0);
    });
  }
});

describe("computeTerminator - determinism (playhead-as-truth)", () => {
  it("deep-equals itself for fixed inputs (pure, no clock)", () => {
    for (const ms of [1782030300000, 1790121960000, 1767225600000, 0]) {
      expect(computeTerminator(ms)).toEqual(computeTerminator(ms));
    }
  });
});

/** Ray-casting point-in-polygon for a closed [lng, lat] ring. */
function pointInRing(lng: number, lat: number, ring: number[][]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][0];
    const yi = ring[i][1];
    const xj = ring[j][0];
    const yj = ring[j][1];
    const intersect =
      yi > lat !== yj > lat &&
      lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

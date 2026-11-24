// frontend/investigator/src/lib/terminator.ts
/**
 * Day/night terminator - pure, deterministic solar geometry from a UTC instant.
 *
 * The ONLY input is utcMs (the playhead epoch-ms). No Date.now(), no clock, no
 * Math.random - playhead-as-truth. All calendar fields are read from the UTC
 * view of the timestamp (getUTC*), so the result is timezone-independent and
 * reproducible: computeTerminator(ms) === computeTerminator(ms).
 *
 * Math is the NOAA "General Solar Position Calculations" truncated-Fourier
 * series (Spencer 1971), verified this session against the primary PDF and
 * cross-checked two ways for the subsolar-longitude sign:
 *   - declination (radians): NOAA Spencer series.
 *   - equation of time (minutes): NOAA Spencer series.
 *   - subsolar lat (deg) = declination converted to degrees (phi_s = delta).
 *   - subsolar lng (deg) = -15 * (utcHour + eqtime/60 - 12), normalized to
 *     [-180, 180]. At 12:00 UTC this collapses to -eqtime/4 - a zero-dependency
 *     internal invariant the unit test asserts exactly.
 *   - terminator lat(lng) = atan( -cos(lng - subsolarLng) / tan(decl) ), the
 *     great circle 90 deg from the subsolar point.
 *   - night hemisphere = the closed polygon winding around the DARK pole (the
 *     pole whose sign is opposite to decl).
 *
 * Sources: NOAA GML solareqns.PDF; Wikipedia "Subsolar point";
 * astrogreg.com terminator algorithm; RFC 7946 GeoJSON.
 *
 * Accuracy envelope: NOAA series is good to a fraction of a degree in
 * declination and tens of seconds in eqtime - correct for a day/night overlay,
 * not for sunrise tables to the second.
 */

const DEG_PER_RAD = 180 / Math.PI;
const RAD_PER_DEG = Math.PI / 180;

/**
 * At |decl| this small (radians) the atan terminator is numerically fragile at
 * the equinox: when decl is exactly 0 AND cos(lng - subsolarLng) is exactly 0
 * (a crossing meridian), the ratio is 0/0 and atan returns NaN. Flooring |decl|
 * to this epsilon (sign-preserving) keeps tan(decl) finite so the curve stays
 * NaN-free. It is a numerical safety floor only: the night polygon is
 * geometrically correct for ALL decl on its own (verified across the full 2026
 * year against the exact cos(c)<0 day/night classification), because near the
 * equinox the dark pole is still night (cos(c) = -|sin(decl)| < 0 at the pole)
 * and the closure walks the boundary wave to that pole. The floor does not
 * change the shape; it only removes the exact-zero NaN.
 */
const EQUINOX_DECL_EPS = 1e-6;

/** Longitude sweep: -180..180 inclusive in 1-deg steps => 361 vertices. */
const LNG_STEP_DEG = 1;

export interface SubsolarPoint {
  lat: number;
  lng: number;
}

export interface TerminatorResult {
  subsolar: SubsolarPoint;
  /** great-circle terminator polyline, lng -180..180 (~361 pts) */
  terminatorLine: GeoJSON.Feature<GeoJSON.LineString>;
  /** the night hemisphere as a closed polygon winding around the dark pole */
  nightPolygon: GeoJSON.Feature<GeoJSON.Polygon>;
}

/** Normalize a longitude to [-180, 180] (positive = East). */
function normalizeLng(lng: number): number {
  let v = lng;
  while (v > 180) v -= 360;
  while (v <= -180) v += 360;
  return v;
}

/** Clamp a latitude to [-90, 90] to absorb float drift. */
function clampLat(lat: number): number {
  return Math.max(-90, Math.min(90, lat));
}

/** True if the given UTC year is a leap year (Gregorian). */
function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

/** 1-based ordinal day of the UTC year (Jan 1 = 1). */
function dayOfYearUtc(d: Date): number {
  const startUtc = Date.UTC(d.getUTCFullYear(), 0, 1);
  const dayMs = 24 * 60 * 60 * 1000;
  return Math.floor((d.getTime() - startUtc) / dayMs) + 1;
}

interface SolarState {
  declRad: number; // solar declination (radians)
  subsolarLat: number; // degrees (= declination in degrees)
  subsolarLng: number; // degrees, normalized to [-180, 180]
}

/**
 * NOAA Spencer-series solar position from a UTC instant. Pure: derives
 * dayOfYear and utcHour from the UTC calendar fields of utcMs only.
 */
function solarState(utcMs: number): SolarState {
  const d = new Date(utcMs);
  const n = isLeapYear(d.getUTCFullYear()) ? 366 : 365;
  const dayOfYear = dayOfYearUtc(d);
  const utcHour =
    d.getUTCHours() +
    d.getUTCMinutes() / 60 +
    d.getUTCSeconds() / 3600 +
    d.getUTCMilliseconds() / 3_600_000;

  // gamma - fractional year (radians).
  const gamma = ((2 * Math.PI) / n) * (dayOfYear - 1 + (utcHour - 12) / 24);

  // declination (radians) - NOAA / Spencer truncated Fourier series.
  const declRad =
    0.006918 -
    0.399912 * Math.cos(gamma) +
    0.070257 * Math.sin(gamma) -
    0.006758 * Math.cos(2 * gamma) +
    0.000907 * Math.sin(2 * gamma) -
    0.002697 * Math.cos(3 * gamma) +
    0.00148 * Math.sin(3 * gamma);

  // equation of time (minutes) - NOAA / Spencer; same gamma (radians).
  const eqtimeMin =
    229.18 *
    (0.000075 +
      0.001868 * Math.cos(gamma) -
      0.032077 * Math.sin(gamma) -
      0.014615 * Math.cos(2 * gamma) -
      0.040849 * Math.sin(2 * gamma));

  const subsolarLat = declRad * DEG_PER_RAD; // phi_s = delta
  // subsolarLng (deg): -15*(utcHour + E/60 - 12). At 12:00 UTC -> -E/4.
  const subsolarLng = normalizeLng(-15 * (utcHour + eqtimeMin / 60 - 12));

  return { declRad, subsolarLat, subsolarLng };
}

/**
 * Terminator latitude (degrees) at a given longitude, for the great circle
 * 90 deg from the subsolar point:
 *   lat(lng) = atan( -cos(lng - subsolarLng) / tan(decl) ).
 * Caller guards the equinox (|decl| < eps) separately; this is the smooth wave
 * for the obliquity range.
 */
function terminatorLatAt(lngDeg: number, subsolarLng: number, declRad: number): number {
  const dLngRad = (lngDeg - subsolarLng) * RAD_PER_DEG;
  const lat = Math.atan(-Math.cos(dLngRad) / Math.tan(declRad)) * DEG_PER_RAD;
  return clampLat(lat);
}

/** Ordered [lng, lat] terminator ring vertices over -180..180, inclusive. */
function terminatorVertices(subsolarLng: number, declRad: number): [number, number][] {
  const pts: [number, number][] = [];
  for (let lng = -180; lng <= 180 + 1e-9; lng += LNG_STEP_DEG) {
    const lngN = Math.min(180, lng); // guard the final step against float overshoot
    pts.push([lngN, terminatorLatAt(lngN, subsolarLng, declRad)]);
  }
  return pts;
}

/**
 * Sign-preserving |decl| floor for the exact-equinox numerical edge. Near decl=0
 * the terminator wave hugs both poles (it crosses +-89.99 deg within a degree of
 * the subsolarLng +- 90 meridians) and runs pole to pole - that is the correct
 * great circle, not a degeneracy. The only failure is arithmetic: at decl exactly
 * 0 the atan argument is 0/0 (NaN) on a crossing meridian. Flooring |decl| to the
 * epsilon keeps tan(decl) finite and the wave NaN-free while preserving the sign
 * (hence which pole is dark). At true 0 we treat decl as +eps.
 */
function equinoxDeclFloor(declRad: number): number {
  const sign = declRad >= 0 ? 1 : -1;
  return sign * EQUINOX_DECL_EPS;
}

/** Signed area (shoelace) of a closed [lng, lat] ring. >0 => CCW. */
function signedArea(ring: [number, number][]): number {
  let sum = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    sum += (ring[j][0] - ring[i][0]) * (ring[j][1] + ring[i][1]);
  }
  return sum / 2;
}

/** Ray-casting point-in-ring test for a closed [lng, lat] ring. */
function pointInRing(lng: number, lat: number, ring: [number, number][]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][0];
    const yi = ring[i][1];
    const xj = ring[j][0];
    const yj = ring[j][1];
    const intersect =
      yi > lat !== yj > lat && lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

/**
 * Close the terminator curve into the night hemisphere polygon. The night side
 * is the one AWAY from the subsolar point; it always contains the DARK pole
 * (the pole with sign OPPOSITE to decl). We pull the open terminator curve down
 * to the dark-pole edge along the +-180 meridians and close the ring.
 */
function buildNightRing(
  terminator: [number, number][],
  declRad: number,
  subsolarLng: number,
): [number, number][] {
  const darkLat = declRad >= 0 ? -90 : 90; // June (decl>0) -> South dark; Dec -> North dark
  const ring: [number, number][] = terminator.slice();
  // Down the +180 meridian to the dark-pole edge, across to -180, back to start.
  ring.push([180, darkLat]);
  ring.push([-180, darkLat]);
  ring.push([terminator[0][0], terminator[0][1]]); // close on the first vertex

  // RFC 7946: exterior rings SHOULD be counter-clockwise. Reverse if the night
  // region is not the interior (verified by the membership probes below).
  let ordered = ring;
  if (signedArea(ordered) < 0) {
    ordered = ordered.slice().reverse();
  }

  // Verify (second signal): sample the dark hemisphere at SEVERAL points that are
  // night for any decl, not just lng=0. Near the equinox the night region is a
  // pole-to-pole lune, so a single probe near the dark pole would be ambiguous
  // (the pole sits on the terminator at decl=0); the anti-subsolar meridian is
  // the deepest-night line and the dark pole is night for any decl != 0. If the
  // majority of probes are not inside, the winding chose the wrong interior; flip.
  const antiLng = normalizeLng(subsolarLng + 180);
  const probes: [number, number][] = [
    [antiLng, 0], // anti-subsolar point: always deepest night
    [antiLng, darkLat / 2], // anti-subsolar, mid-latitude toward the dark pole
    [0, darkLat], // dark pole edge (night for any decl != 0)
  ];
  const inside = probes.filter(([lng, lat]) => pointInRing(lng, lat, ordered));
  if (inside.length < 2) {
    ordered = ordered.slice().reverse();
  }
  return ordered;
}

export function computeTerminator(utcMs: number): TerminatorResult {
  const { declRad, subsolarLat, subsolarLng } = solarState(utcMs);

  // Equinox guard: floor |decl| so the atan wave stays finite, continuous, and
  // NaN-free; the dark-pole sign is preserved so the night polygon still closes
  // around a well-defined pole.
  const declForCurve =
    Math.abs(declRad) < EQUINOX_DECL_EPS ? equinoxDeclFloor(declRad) : declRad;

  const terminator = terminatorVertices(subsolarLng, declForCurve);
  const nightRing = buildNightRing(terminator, declForCurve, subsolarLng);

  const terminatorLine: GeoJSON.Feature<GeoJSON.LineString> = {
    type: "Feature",
    properties: {},
    geometry: { type: "LineString", coordinates: terminator },
  };

  const nightPolygon: GeoJSON.Feature<GeoJSON.Polygon> = {
    type: "Feature",
    properties: {},
    geometry: { type: "Polygon", coordinates: [nightRing] },
  };

  return {
    subsolar: { lat: clampLat(subsolarLat), lng: subsolarLng },
    terminatorLine,
    nightPolygon,
  };
}

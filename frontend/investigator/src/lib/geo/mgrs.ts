/**
 * WGS84 lat/lng -> MGRS string (pure). UTM via the Kruger n-series (4th order, sub-mm),
 * then the standard 100 km square letters (WGS84 "AA" scheme). UPS (beyond 80S..84N)
 * is out of scope and returns null.
 */
const A = 6378137;
const F = 1 / 298.257223563;
const K0 = 0.9996;

const BANDS = "CDEFGHJKLMNPQRSTUVWX";
const COL_SETS = ["ABCDEFGH", "JKLMNPQR", "STUVWXYZ"]; // by (zone - 1) % 3
const ROWS = "ABCDEFGHJKLMNPQRSTUV"; // 20 letters, offset by 5 on even zones

// Kruger series coefficients for WGS84 (third flattening n).
const N = F / (2 - F);
const RECT = (A / (1 + N)) * (1 + N ** 2 / 4 + N ** 4 / 64);
const ALPHA = [
  N / 2 - (2 * N ** 2) / 3 + (5 * N ** 3) / 16 + (41 * N ** 4) / 180,
  (13 * N ** 2) / 48 - (3 * N ** 3) / 5 + (557 * N ** 4) / 1440,
  (61 * N ** 3) / 240 - (103 * N ** 4) / 140,
  (49561 * N ** 4) / 161280,
];

function zoneFor(lat: number, lng: number): number {
  // Norway (32V) and Svalbard (31X..37X) exceptions.
  if (lat >= 56 && lat < 64 && lng >= 3 && lng < 12) return 32;
  if (lat >= 72) {
    if (lng >= 0 && lng < 9) return 31;
    if (lng >= 9 && lng < 21) return 33;
    if (lng >= 21 && lng < 33) return 35;
    if (lng >= 33 && lng < 42) return 37;
  }
  return Math.floor((lng + 180) / 6) + 1;
}

function utm(lat: number, lng: number, zone: number): { e: number; n: number } {
  const e2 = F * (2 - F);
  const ecc = Math.sqrt(e2);
  const phi = (lat * Math.PI) / 180;
  const lam = ((lng - ((zone - 1) * 6 - 180 + 3)) * Math.PI) / 180;
  const tau = Math.tan(phi);
  const sigma = Math.sinh(ecc * Math.atanh((ecc * tau) / Math.sqrt(1 + tau * tau)));
  const tauP = tau * Math.sqrt(1 + sigma * sigma) - sigma * Math.sqrt(1 + tau * tau);
  const xiP = Math.atan2(tauP, Math.cos(lam));
  const etaP = Math.asinh(Math.sin(lam) / Math.hypot(tauP, Math.cos(lam)));
  let xi = xiP;
  let eta = etaP;
  ALPHA.forEach((a, i) => {
    const j = 2 * (i + 1);
    xi += a * Math.sin(j * xiP) * Math.cosh(j * etaP);
    eta += a * Math.cos(j * xiP) * Math.sinh(j * etaP);
  });
  return {
    e: 500000 + K0 * RECT * eta,
    n: K0 * RECT * xi + (lat < 0 ? 10000000 : 0),
  };
}

export function toMgrs(lat: number, lng: number, precision = 5): string | null {
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || lat < -80 || lat > 84) return null;
  const lngN = ((((lng + 180) % 360) + 360) % 360) - 180;
  const zone = zoneFor(lat, lngN);
  const band = BANDS[Math.min(Math.floor((lat + 80) / 8), 19)];
  const { e, n } = utm(lat, lngN, zone);
  const col = COL_SETS[(zone - 1) % 3][Math.floor(e / 100000) - 1];
  const row = ROWS[(Math.floor(n / 100000) + (zone % 2 === 0 ? 5 : 0)) % 20];
  const step = 10 ** (5 - precision);
  const digits = (v: number) =>
    String(Math.floor((v % 100000) / step)).padStart(precision, "0");
  const grid = `${zone}${band} ${col}${row}`;
  return precision === 0 ? grid : `${grid} ${digits(e)} ${digits(n)}`;
}

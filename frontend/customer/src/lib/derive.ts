import type { Transaction } from "./types";

/** Parse the seed's ISO TEXT timestamp to epoch ms - same as the investigator. */
export const txMs = (tx: Transaction): number => Date.parse(tx.timestamp);

/** Transactions posted at or before the playhead `t`, newest first. */
export function visibleTxns(txns: readonly Transaction[], t: number): Transaction[] {
  return txns.filter((x) => txMs(x) <= t).sort((a, b) => txMs(b) - txMs(a));
}

/** Balance at `t` = the DB-computed balance_after of the latest visible txn. */
export function currentBalance(visible: readonly Transaction[]): number {
  return visible.length > 0 ? visible[0].balance_after : 0;
}

/** True once any visible txn is fraud-flagged (the Lagos charges). */
export function fraudAlerted(visible: readonly Transaction[]): boolean {
  return visible.some((x) => x.is_fraud === 1);
}

// Owner rule: every brand on screen is fictional; the seeded card's real network reads as V***.
export const maskBrand = (s: string): string => s.replace(/visa/gi, (m) => `${m[0]}***`);

// The greeting and date follow the replay clock in Marcus's own time zone, not the viewer's today.
export const HOUSTON = "America/Chicago";
export function greetingFor(t: number): string {
  const h = Number(new Date(t).toLocaleString("en-US", { hour: "numeric", hourCycle: "h23", timeZone: HOUSTON }));
  return h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
}
export const dayLine = (t: number): string =>
  new Date(t).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", timeZone: HOUSTON });

export const availableCredit = (limit: number, balance: number): number => limit - balance;

/** Great-circle miles (haversine, mean Earth radius in miles). */
export function milesBetween(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const r = Math.PI / 180, dLat = (bLat - aLat) * r, dLng = (bLng - aLng) * r;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(aLat * r) * Math.cos(bLat * r) * Math.sin(dLng / 2) ** 2;
  return 2 * 3958.8 * Math.asin(Math.sqrt(h));
}

/** True when the row carries an authorisation response code that is not "00" (approved). A row
 *  with no code (missing, null or empty) counts as approved: the app's own reading for a row it
 *  was not told about. */
export function isDeclined(tx: Transaction): boolean {
  const code = tx.auth_response_code;
  return typeof code === "string" && code !== "" && code !== "00";
}

export interface LagosAlert { count: number; miles: number; minutes: number }

/** The card-present fraud in Lagos, measured from the last domestic card-present purchase before
 *  it (the same pair the investigator's impossible-travel row uses). Null until one is visible;
 *  the online card-testing charges are fraud too, but they are not "in Lagos". `count` is the
 *  charges: a declined attempt is not one, though the distance and time still run from the first
 *  Lagos attempt, declined or not. While only declined rows are visible the count is 0 and the
 *  miles and minutes are still the pair's own (the banner prints nothing at 0; the Alerts
 *  callout keeps its distance). */
export function lagosAlert(visible: readonly Transaction[]): LagosAlert | null {
  const lagos = visible.filter((x) => x.is_fraud === 1 && x.is_card_present === 1 && x.merchant_country === "NG");
  if (lagos.length === 0) return null;
  const charges = lagos.filter((x) => !isDeclined(x)).length;
  const first = lagos.reduce((a, b) => (txMs(a) <= txMs(b) ? a : b));
  const prior = visible
    .filter((x) => x.is_card_present === 1 && x.merchant_country === "US" && txMs(x) < txMs(first))
    .reduce<Transaction | null>((a, b) => (a === null || txMs(b) > txMs(a) ? b : a), null);
  if (prior === null) return { count: charges, miles: 0, minutes: 0 };
  return {
    count: charges,
    miles: milesBetween(prior.merchant_lat, prior.merchant_lng, first.merchant_lat, first.merchant_lng),
    minutes: Math.round((txMs(first) - txMs(prior)) / 60000),
  };
}

/** "9h 41m" */
export const hoursMinutes = (minutes: number): string => `${Math.floor(minutes / 60)}h ${String(minutes % 60).padStart(2, "0")}m`;

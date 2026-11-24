/**
 * Data-derived case-header lines for the layer panels. These replace hardcoded
 * single-identity chrome ("PAN ····4729", "Marcus Chen · 2 devices") that lied
 * whenever the active scenario wasn't the original single-card case - the S1
 * portfolio has 301 cardholders, the Concordia pack has Dana. The panel must
 * describe the data it is showing. Manifest-declared subject chrome is the
 * fuller D2 follow-up; until then, derive from the rows themselves.
 */
import type { LoginEvent, Transaction } from "../types";

// Owner rule: every brand on screen is fictional, so a real card network inside a seeded id reads as V***.
const maskNetwork = (s: string): string => s.replace(/visa/gi, (m) => `${m[0]}***`);

export function cardLine(transactions: Transaction[]): string {
  const cards = new Set(transactions.map((t) => t.card_id));
  if (cards.size === 0) return "no cards";
  if (cards.size === 1) return `card ${maskNetwork(String(cards.values().next().value))}`;
  return `${cards.size} cards`;
}

export function deviceLine(logins: LoginEvent[]): string {
  const devices = new Set(logins.map((l) => l.device_fp));
  const dev = `${devices.size} device${devices.size === 1 ? "" : "s"}`;
  const ev = `${logins.length} event${logins.length === 1 ? "" : "s"}`;
  return `${dev} · ${ev}`;
}

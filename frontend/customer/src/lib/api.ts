import type { AccountSummary, ClockState, Transaction } from "./types";
import { IS_STATIC_BUILD } from "./build-flags";

// A static build has no backend: it reads the files backend/export_static.py wrote for
// the card case. The site serves this app from customer/, one level below static-api/.
const STATIC_ROOT = `${import.meta.env.BASE_URL}../static-api/card-fraud/`;

const source = (live: string, exported: string): string =>
  IS_STATIC_BUILD ? `${STATIC_ROOT}${exported}` : live;

async function getJson<T>(url: string): Promise<T> {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`${url} -> ${r.status}`);
  return (await r.json()) as T;
}

export const fetchAccount = (): Promise<AccountSummary> =>
  getJson<AccountSummary>(source("/api/account", "account/_.json"));

export const fetchClock = (): Promise<ClockState> =>
  getJson<ClockState>(source("/api/clock", "clock/_.json"));

// In a static build the case bundle is the cardholder's own transactions; the exporter
// refuses to write it otherwise.
export const fetchTransactions = (cardId: string): Promise<Transaction[]> =>
  getJson<Transaction[]>(
    source(`/api/transactions?card_id=${encodeURIComponent(cardId)}`, "transactions/_.json"),
  );

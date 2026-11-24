/**
 * The case readout's pure parts: the playhead's date words and the day's tally.
 *
 * A profile of playback put 60 ms of script in the date formatting and 33 in the day key over
 * 3,000 ms, because both ran again at every tick. Here the date formatters are built once per
 * zone and the Houston day of every transaction is read once per transactions array, so a tick
 * costs one formatter call and one day key.
 *
 * The zone is an argument: the caller names it (Timeline.tsx holds the Houston zone).
 */
import { houstonDayKey } from "./houston-day";

/**
 * Builds the playhead's date-words function for a zone: `Mon May 12 · 2:34p`.
 * The three Intl formatters are made here, once, and every call reuses them.
 */
export function makePlayheadFormatter(timeZone: string): (ms: number) => string {
  const weekday = new Intl.DateTimeFormat("en-US", { weekday: "short", timeZone });
  const monthDay = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone });
  const clock = new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
    timeZone,
  });
  return (ms: number): string => {
    const d = new Date(ms);
    const time = clock.format(d).replace(" AM", "a").replace(" PM", "p");
    return `${weekday.format(d)} ${monthDay.format(d)} · ${time}`;
  };
}

/** One transaction's time, Houston day and amount, read once. */
export interface TxDay {
  ts: number;
  day: string;
  amount: number;
}

/** Reads each transaction's time and Houston day once. Build it per transactions array. */
export function buildTxDays(transactions: readonly { timestamp: string; amount: number }[]): TxDay[] {
  return transactions.map((t) => {
    const ts = Date.parse(t.timestamp);
    return { ts, day: houstonDayKey(ts), amount: t.amount };
  });
}

/**
 * The count and spend of the transactions that share the playhead's Houston day and have
 * already happened (their time is at or before the playhead).
 */
export function todayTotals(days: readonly TxDay[], playhead: number): { auths: number; spend: number } {
  const playheadDay = houstonDayKey(playhead);
  let auths = 0;
  let spend = 0;
  for (const t of days) {
    if (t.ts <= playhead && t.day === playheadDay) {
      auths += 1;
      spend += t.amount;
    }
  }
  return { auths, spend };
}

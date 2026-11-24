/**
 * Every word of the investigator's marks: the accessible name and the tooltip lines of a mark on the
 * globe or under the Timeline. The nouns are the window's ("Your mark", "Open your mark"), so one
 * control has one name across the app. A plate prints digits and glyphs only; these words are for
 * readers and tooltips.
 *
 * `kindLabel` is the kind's manifest label, else the canonical kind (the caller resolves it; this file
 * never prints "fraud" for an authorisation). None of the words states a cause, a likelihood or a
 * finding: the disposition line is the investigator's own entry.
 *
 * What this file does not do: it reads no store, resolves no label and formats no time (the caller
 * passes the clock's text).
 */
import { DISPOSITION_WORD } from "../marks/words";
import type { Disposition, SetDisposition } from "../marks/types";

/** The accessible name of a mark, globe and Timeline. */
export const markName = (kindLabel: string, headline: string): string => `Open your mark: ${kindLabel}: ${headline}`;

export interface MarkTipInput {
  kindLabel: string;
  headline: string;
  /** The clock's text for the record's time, or null when the record has none. */
  time: string | null;
  /** How many notes link the record. */
  notes: number;
  disposition: Disposition;
  /** Printed only while the disposition is "fail". */
  category: string | null;
  pinned: boolean;
}

/** The tooltip lines of a mark: what it is first, then only the values it holds. */
export function markTip(m: MarkTipInput): string[] {
  const out = [`Your mark on ${m.kindLabel}: ${m.headline}.`];
  if (m.time !== null) out.push(`Time: ${m.time}`);
  if (m.notes >= 1) out.push(`Notes: ${m.notes}`);
  if (m.disposition !== "none") out.push(`You marked this ${DISPOSITION_WORD[m.disposition]}.`);
  if (m.disposition === "fail" && m.category !== null) out.push(`Category: ${m.category}`);
  if (m.pinned) out.push("Pinned.");
  return out;
}

/**
 * The accessible name of a pile of marks: what it is, how many records it holds, and what a press
 * does. "Records" is the app's own noun (a pile may hold records of several kinds, so no one kind's
 * label fits).
 */
export const pileName = (records: number, unfolded: boolean): string =>
  `Your marks on ${records} records. ${unfolded ? "Fold them." : "Show each one."}`;

export interface PileTipInput {
  /** How many records the pile holds. */
  records: number;
  /** The clock's text for the earliest and the latest timed member, or null when no member has a time. */
  first: string | null;
  last: string | null;
  /** How many members carry each decision. */
  counts: Record<SetDisposition, number>;
  /** How many members are pinned. */
  pinned: number;
  unfolded: boolean;
}

/** The decisions in the order the plate shows their glyphs: check, cross, hourglass. */
const GLYPH_ORDER: readonly SetDisposition[] = ["pass", "fail", "wait"];

/**
 * The tooltip lines of a pile: what it is first, then only the values it holds (the span of its
 * times, one line for each decision a member carries, the pinned count), then what a press does. The
 * decision lines are the investigator's own entry, so they name no cause and no likelihood.
 */
export function pileTip(p: PileTipInput): string[] {
  const out = [`Your marks on ${p.records} records.`];
  const first = p.first ?? p.last;
  const last = p.last ?? p.first;
  if (first !== null && last !== null) out.push(first === last ? `Time: ${first}` : `Time: ${first} to ${last}`);
  for (const d of GLYPH_ORDER) if (p.counts[d] >= 1) out.push(`You marked ${DISPOSITION_WORD[d]}: ${p.counts[d]}`);
  if (p.pinned >= 1) out.push(`Pinned: ${p.pinned}`);
  out.push(p.unfolded ? "Press to fold them." : "Press to show each one.");
  return out;
}

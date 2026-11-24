// frontend/investigator/src/lib/time-words.ts
// The pure words of the bar's tooltips: moments, spans, amounts and a record's lines. Every
// function takes numbers or strings and returns a string; none reads a clock or the playhead.
// The zone is the app's one exported constant, not a string written here.
import { HOU_TZ, formatHoustonDateTime } from "./houston-day";

const CLOCK = new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit", hour12: true, timeZone: HOU_TZ });
const DAY = new Intl.DateTimeFormat("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: HOU_TZ });
// en-GB with hourCycle h23 prints midnight as "00:00"; en-US with hour12 false prints "24:00".
const CLOCK24 = new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone: HOU_TZ });

/** "Mon Jun 8 · 5:00p". A time that is not a time (NaN, infinite, past the Date range) comes back
 *  as its own text, as formatHoustonDateTime gives back a date that is impossible; it never throws. */
export function when(ms: number): string {
  const d = new Date(ms);
  if (Number.isNaN(d.getTime())) return String(ms);
  return formatHoustonDateTime(d.toISOString());
}

/** "Mon Jun 8 · 17:00": the moment in 24 hour form, as the hours under the bar are written then.
 *  An invalid time comes back as its own text, as `when` gives it. */
export function when24(ms: number): string {
  const d = new Date(ms);
  if (Number.isNaN(d.getTime())) return String(ms);
  return `${DAY.format(d).replace(",", "")} · ${CLOCK24.format(d)}`;
}

/** The clock's form, as the switch holds it: "12h" or "24h". Every word below that prints a time
 *  takes it as its last argument and prints 12 hour when none is passed, so a caller that passes
 *  nothing prints as it always did. The caller reads the switch; this file reads no store. */
export type TimeForm = "12h" | "24h";

/** "5:00p", or "17:00" in 24 hour form. An invalid time comes back as its own text, as `when`
 *  gives it, so `span` through it never throws either. */
export function clock(ms: number, form: TimeForm = "12h"): string {
  const d = new Date(ms);
  if (Number.isNaN(d.getTime())) return String(ms);
  if (form === "24h") return CLOCK24.format(d);
  return CLOCK.format(d).replace(/\s?AM/, "a").replace(/\s?PM/, "p");
}

/** A moment in the asked form: `when` or `when24`. */
const moment = (ms: number, form: TimeForm): string => (form === "24h" ? when24(ms) : when(ms));

/** "Mon Jun 8 · 5:00p to 6:00p" ("Mon Jun 8 · 17:00 to 18:00" in 24 hour form); the moment alone
 *  when the step is not above zero. */
export function span(fromMs: number, stepMs: number, form: TimeForm = "12h"): string {
  return stepMs > 0 ? `${moment(fromMs, form)} to ${clock(fromMs + stepMs, form)}` : moment(fromMs, form);
}

const MONEY = new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const WHOLE = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });

/** "4,061.71 USD": a whole number prints without cents, a fraction with two. */
export function amount(value: number, unit: string): string {
  return `${Number.isInteger(value) ? WHOLE.format(value) : MONEY.format(value)}${unit ? " " + unit : ""}`;
}

/** A record: its kind in the manifest's words, its own two lines, when (a line of its own, so it
 *  never wraps to an orphan), then any field lines. */
export function recordLines(
  kindLabel: string,
  primary: string,
  secondary: string,
  ms: number,
  facts: readonly string[] = [],
  form: TimeForm = "12h",
): string[] {
  return [kindLabel, primary, secondary, moment(ms, form), ...facts];
}

/** One line for a record inside a pile of marks: its headline and when. */
export function nodeBrief(primary: string, ms: number, form: TimeForm = "12h"): string {
  return `${primary} · ${moment(ms, form)}`;
}

/** A field of the record and its value, in the record's own words: "Device trust: new". A ring or
 *  a hollow mark on a node is explained by the field that draws it, never by an adjective. */
export function fact(field: string, value: string): string {
  const words = field.replace(/_/g, " ");
  return `${words.charAt(0).toUpperCase()}${words.slice(1)}: ${value.replace(/_/g, " ")}`;
}

/** The field lines behind a node's rings: a sign-in's device trust and its outcome when a
 *  challenge was asked, a transfer's status when it was blocked. These are the fields of the six
 *  kinds the app has code for (the node's ring code in CaseTimelineLayer reads the same ones). */
export function ringFacts(mark: {
  deviceTrust?: string | null;
  outcome?: string | null;
  status?: string | null;
}): string[] {
  const out: string[] = [];
  if (mark.deviceTrust === "new") out.push(fact("device_trust", mark.deviceTrust));
  if (mark.outcome && mark.outcome.startsWith("challenge")) out.push(fact("outcome", mark.outcome));
  if (mark.status === "blocked") out.push(fact("status", mark.status));
  return out;
}

/** How long, in plain words and with the seconds, so that it prints the same digits as the time
 *  left on screen: "0 days, 17 hours, 24 minutes, 0 seconds". */
export function remaining(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000));
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  return `${d} ${d === 1 ? "day" : "days"}, ${h} ${h === 1 ? "hour" : "hours"}, ${m} ${m === 1 ? "minute" : "minutes"}, ${s % 60} ${s % 60 === 1 ? "second" : "seconds"}`;
}

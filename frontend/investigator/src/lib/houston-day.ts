/**
 * Houston-frozen day-bucket key.
 *
 * Houston is the canonical timezone (all seed data is in -05:00 CDT),
 * so "today" must mean the America/Chicago calendar day, not the runner's local
 * day. `houstonDayKey` collapses a Unix-ms instant to its America/Chicago
 * calendar date as a "YYYY-MM-DD" string.
 *
 * It derives the date through `Intl.DateTimeFormat` with an EXPLICIT
 * `timeZone: "America/Chicago"`, so the result is independent of the runner's
 * timezone by construction - and DST-correct without any offset reconstruction
 * (Intl resolves CST vs CDT for the instant).
 */
/** The app's one time zone: every pack is replayed in Houston time. Files added later import this
 *  instead of writing the zone again. */
export const HOU_TZ = "America/Chicago";

const dayKeyFormatter = new Intl.DateTimeFormat("en-US", {
  timeZone: HOU_TZ,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/** The America/Chicago calendar date of `ms`, as "YYYY-MM-DD". */
export function houstonDayKey(ms: number): string {
  const parts = dayKeyFormatter.formatToParts(new Date(ms));
  const get = (type: Intl.DateTimeFormatPartTypes): string =>
    parts.find((p) => p.type === type)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

/** An ISO 8601 datetime that names its zone (Z or ±hh:mm); seconds and fractions optional. A
 *  zone-less time is left alone: reading it as the runner's local time would be a guess. */
const ISO_DATETIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2})$/;

const dateTimeFormatter = new Intl.DateTimeFormat("en-US", {
  timeZone: HOU_TZ,
  weekday: "short",
  month: "short",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
  hour12: true,
});

/** An ISO datetime in the timeline's Houston style ("Mon Jun 8 · 9:04a"); any other string,
 *  or an impossible date, comes back unchanged. */
export function formatHoustonDateTime(value: string): string {
  if (!ISO_DATETIME.test(value)) return value;
  const ms = Date.parse(value);
  if (Number.isNaN(ms)) return value;
  const parts = dateTimeFormatter.formatToParts(new Date(ms));
  const get = (type: Intl.DateTimeFormatPartTypes): string =>
    parts.find((p) => p.type === type)?.value ?? "";
  return `${get("weekday")} ${get("month")} ${get("day")} · ${get("hour")}:${get("minute")}${get("dayPeriod").charAt(0).toLowerCase()}`;
}

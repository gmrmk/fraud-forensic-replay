/** "2,847.32" - grouped, always 2 decimals. */
export function formatMoney(n: number): string {
  return n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/** Six wheel digits for a fixed #,###.## layout (4 integer + 2 decimal).
 *  Values are clamped to < 10000 for the demo (Marcus's balance band). */
export function odometerDigits(n: number): number[] {
  const cents = Math.round(n * 100);                 // e.g. 284732
  const s = String(Math.min(cents, 999999)).padStart(6, "0"); // "284732"
  return s.split("").map(Number);                    // [2,8,4,7,3,2]
}

/** Odometer roll duration (ms), scaled to the playback rate so the wheels track
 *  the playhead: 1x = `base`, faster = quicker, slowmo = longer, reverse uses the
 *  same |rate| (direction is carried by the value changing, not the duration).
 *  Paused (rate 0) -> 1x. Clamped to [min, max]. */
export function rollDurationMs(rate: number, base = 500, min = 70, max = 1600): number {
  const speed = Math.abs(rate) || 1;
  return Math.min(max, Math.max(min, Math.round(base / speed)));
}

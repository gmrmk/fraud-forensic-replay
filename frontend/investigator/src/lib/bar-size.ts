// The playbar's size: one saved preference of three values. It is a UI preference only (the
// share link never carries it; `lib/share-link.ts` is an allowlist and does not name it).
//
//   line    one line
//   middle  the open bar with its rows folded
//   open    the open bar with rows and lanes
//
// A first visit opens at the middle size. Any other
// string, an absent key and blocked storage all give the middle size.

/** Where the size is saved, beside `ffr.lanes.collapsed`. The only place the key is spelled. */
export const BAR_SIZE_KEY = "ffr.barsize";

export const BAR_SIZES = ["line", "middle", "open"] as const;
export type BarSize = (typeof BAR_SIZES)[number];

export const DEFAULT_BAR_SIZE: BarSize = "middle";

/** The size a saved string names; anything but an exact match gives the default. Compared by
 *  array membership, not by object key, so "constructor" and "__proto__" are not sizes. */
export function parseBarSize(raw: string | null | undefined): BarSize {
  return BAR_SIZES.find((s) => s === raw) ?? DEFAULT_BAR_SIZE;
}

/** The saved size. Never throws: a blocked or absent storage gives the default. The default
 *  storage is resolved inside the try, because merely touching `localStorage` can throw. */
export function readBarSize(storage?: Pick<Storage, "getItem">): BarSize {
  try {
    return parseBarSize((storage ?? localStorage).getItem(BAR_SIZE_KEY));
  } catch {
    return DEFAULT_BAR_SIZE;
  }
}

/** Save the size. Best-effort: a blocked or full storage is ignored, the size still holds for
 *  this session. */
export function writeBarSize(size: BarSize, storage?: Pick<Storage, "setItem">): void {
  try {
    (storage ?? localStorage).setItem(BAR_SIZE_KEY, size);
  } catch {
    /* best-effort: the size still holds for this session */
  }
}

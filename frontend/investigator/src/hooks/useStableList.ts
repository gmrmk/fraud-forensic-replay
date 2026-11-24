import { useState } from "react";

/** True when both arrays hold the same members (by identity) in the same order. */
function sameMembers<T>(a: readonly T[], b: readonly T[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

/**
 * Keeps a list's identity while its members are the same.
 *
 * The playhead hands the globe a fresh array at every tick, whether or not an event was crossed.
 * Each map source is re-sent to the map's worker when its array changes identity, and that
 * round trip was the largest playing cost on the token story. With this hook a source is sent
 * only when the playhead crosses an event and the members change.
 *
 * The held list lives in state and is replaced during render when the members differ, the
 * pattern React documents for state derived from props, so no ref is read or written in render.
 */
export function useStableList<T>(list: T[]): T[] {
  const [held, setHeld] = useState(list);
  if (held === list || sameMembers(held, list)) return held;
  setHeld(list);
  return list;
}

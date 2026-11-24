/**
 * Playhead tools: stepping from event to event, the two marks, and the wording of the gap
 * between them. Pure. The timeline supplies its events and acts on the answers; nothing here
 * reads a clock or a store.
 */

/** One steppable event. The caller keeps the list in time order, ties by id. */
export interface StepEvent {
  id: string;
  t: number;
}

/**
 * The index of the event a step lands on, or null at an end.
 *
 * When the selected record is one of the events and sits at the playhead, the step goes to its
 * neighbour by index, so several events at one instant are visited one by one. Otherwise time
 * decides: the first event after the playhead going forward, the last before it going back.
 */
export function stepTarget(
  events: readonly StepEvent[],
  playhead: number,
  selectedId: string | null,
  dir: 1 | -1,
): number | null {
  const at = selectedId === null ? -1 : events.findIndex((e) => e.id === selectedId);
  if (at >= 0 && events[at].t === playhead) {
    const next = at + dir;
    return next >= 0 && next < events.length ? next : null;
  }
  if (dir === 1) {
    const next = events.findIndex((e) => e.t > playhead);
    return next >= 0 ? next : null;
  }
  for (let i = events.length - 1; i >= 0; i--) if (events[i].t < playhead) return i;
  return null;
}

/** The two marks, A before B. Either may be absent; B is never set without A. */
export interface Marks {
  a: number | null;
  b: number | null;
}

/**
 * The marks after `m` is pressed at `at`: the mark sitting there is lifted; otherwise an empty
 * slot is filled (A, then B); with both set, the nearer one moves. The pair stays in time order.
 */
export function nextMarks(marks: Marks, at: number): Marks {
  const { a, b } = marks;
  if (a === at) return { a: b, b: null };
  if (b === at) return { a, b: null };
  if (a === null) return { a: at, b: null };
  if (b === null) return a <= at ? { a, b: at } : { a: at, b: a };
  const moved = Math.abs(at - a) <= Math.abs(at - b) ? [at, b] : [a, at];
  return { a: Math.min(moved[0], moved[1]), b: Math.max(moved[0], moved[1]) };
}

const pad = (n: number): string => String(n).padStart(2, "0");

/** A length of time in its two largest units: "12 s", "4 min 12 s", "2 h 05 min", "3 d 4 h". */
export function formatGap(ms: number): string {
  const total = Math.round(Math.abs(ms) / 1000);
  if (total < 60) return `${total} s`;
  if (total < 3600) return `${Math.floor(total / 60)} min ${pad(total % 60)} s`;
  if (total < 86400) return `${Math.floor(total / 3600)} h ${pad(Math.floor((total % 3600) / 60))} min`;
  return `${Math.floor(total / 86400)} d ${Math.floor((total % 86400) / 3600)} h`;
}

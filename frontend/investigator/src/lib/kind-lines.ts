// frontend/investigator/src/lib/kind-lines.ts
// The Timeline's kind lines, as a pure model:
// one line for each kind of event, the kind with the most events first, named by the
// manifest's label unchanged. Pure: no clock, no storage, no DOM, and no word of one pack.
//
// Two sets come in. `ticks` is the set the track draws (the soloed row's events while a row is
// alone), and `caseTicks` is every event of the case. The lines are the case's kinds, in the case's
// order, so a solo changes the counts and the copies and moves no line; the counts and the copies
// come from `ticks`, so the lines and the rail narrow with the track.
import { DEPTH_MAX_LINES, LINE } from "./bar-metrics";
import type { RowTick } from "./row-ticks";

export interface KindLine {
  kind: string;
  /** The kind's label in the manifest's words, unchanged. */
  name: string;
  /** The events of this kind that the track draws, by id. */
  ids: ReadonlySet<string>;
  /** `ids.size`, kept as a number for the line's text. */
  count: number;
}

/** The kinds the case has, the kind with the most events first (a tie by name), and for each the
 *  events in `ticks`. A case with fewer than two kinds offers no line: its one line would repeat the
 *  track. */
export function kindLines(ticks: readonly RowTick[], kindLabel: (kind: string) => string, caseTicks: readonly RowTick[] = ticks): KindLine[] {
  const caseIds = new Map<string, Set<string>>();
  for (const t of caseTicks) {
    let ids = caseIds.get(t.kind);
    if (!ids) caseIds.set(t.kind, (ids = new Set()));
    ids.add(t.id);
  }
  if (caseIds.size < 2) return [];
  const own = new Map<string, Set<string>>();
  for (const t of ticks) {
    let ids = own.get(t.kind);
    if (!ids) own.set(t.kind, (ids = new Set()));
    ids.add(t.id);
  }
  return [...caseIds]
    .map(([kind, all]) => ({ kind, name: kindLabel(kind), all: all.size, ids: own.get(kind) ?? new Set<string>() }))
    .sort((a, b) => b.all - a.all || a.name.localeCompare(b.name))
    .map(({ kind, name, ids }) => ({ kind, name, ids, count: ids.size }));
}

/** The events the lines hold, which is the rail's number. */
export function kindsTotal(lines: readonly KindLine[]): number {
  return lines.reduce((n, l) => n + l.count, 0);
}

/** The px the block of lines takes: one open row's line of nodes for each line, up to the most a block
 *  of depth lines shows; it scrolls beyond. */
export function kindsBlockPx(lineCount: number): number {
  return Math.min(Math.max(0, lineCount), DEPTH_MAX_LINES) * LINE;
}

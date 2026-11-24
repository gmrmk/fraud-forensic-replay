// frontend/investigator/src/lib/globe-tip.ts
// What the globe's tooltip says. The map's marks are not
// elements, so the hook asks the map which records lie under the pointer and this file turns them
// into lines. One mark gives its record's own lines, the same as its node on the Timeline: the
// kind's label from the manifest, the headline, the second line, when, then its field lines.
// Several marks give a count, and a count by kind with a sum for a kind that has an amount.
// A tooltip says what a thing is and its values, never what to conclude.
//
// The file knows no pack: the kinds, their labels, their amount field and their unit come from the
// manifest's nodes, the field lines from a function the caller gives, and the colour of a kind from
// another the caller gives. It reads no clock; the time of a record is the record's own.
import type { Entity } from "./entity";
import { globeKindLine, globeManyTitle } from "./tooltip-words/globe";
import { amount, recordLines, type TimeForm } from "./time-words";

/** What the tooltip needs to know about a record on the globe. */
export interface GlobeTipEntry {
  kind: string;
  /** The manifest's word for the kind, or the kind's own id when it names none. */
  kindLabel: string;
  primary: string;
  secondary: string;
  t: number;
  /** The record's field lines (the fields that draw a ring on its node), already worded. */
  facts: readonly string[];
  /** The record's amount when its kind declares an amount field and the record holds a number there. */
  value: number | null;
  unit: string;
}

/** The part of a manifest node the tooltip reads. */
export interface GlobeTipNode {
  kind: string;
  label?: string;
  /** The field that holds a record's amount. */
  magnitude?: string;
  magnitudeUnit?: string;
}

/** The records the globe can show, by id. `factsFor` gives a record's field lines; none by default. */
export function buildGlobeTipIndex(
  entities: readonly Entity[],
  nodes: readonly GlobeTipNode[],
  factsFor?: (e: Entity) => readonly string[],
): Map<string, GlobeTipEntry> {
  const byKind = new Map(nodes.map((n) => [n.kind, n]));
  const index = new Map<string, GlobeTipEntry>();
  for (const e of entities) {
    const node = byKind.get(e.kind);
    const raw = node?.magnitude ? e.fields[node.magnitude] : undefined;
    index.set(e.id, {
      kind: e.kind,
      kindLabel: node?.label || e.kind,
      primary: e.displayMetadata.primaryLabel,
      secondary: e.displayMetadata.secondaryLabel ?? "",
      t: e.timestamp,
      facts: factsFor?.(e) ?? [],
      value: typeof raw === "number" && Number.isFinite(raw) ? raw : null,
      unit: node?.magnitudeUnit ?? "",
    });
  }
  return index;
}

/** The lines and the dot's colour of a tooltip; `accent` is null when the marks are of several kinds. */
export interface GlobeTipShown {
  lines: string[];
  accent: string | null;
}

/** The tooltip for the records under the pointer, each once; null when there is none. */
export function globeTip(
  entries: readonly GlobeTipEntry[],
  form: TimeForm,
  accentFor: (kind: string) => string,
): GlobeTipShown | null {
  if (entries.length === 0) return null;
  if (entries.length === 1) {
    const r = entries[0];
    return { lines: recordLines(r.kindLabel, r.primary, r.secondary, r.t, r.facts, form), accent: accentFor(r.kind) };
  }
  // A kind's line holds its count and, when it has an amount, the sum of the amounts the records
  // hold. A kind whose amounts add up to 0 still has an amount, so it still prints its sum.
  const kinds = new Map<string, { label: string; n: number; sum: number | null; unit: string }>();
  for (const r of entries) {
    const k = kinds.get(r.kind) ?? { label: r.kindLabel, n: 0, sum: null, unit: r.unit };
    k.n += 1;
    if (r.value !== null) k.sum = (k.sum ?? 0) + r.value;
    kinds.set(r.kind, k);
  }
  const lines = [globeManyTitle(entries.length)];
  for (const k of kinds.values()) lines.push(globeKindLine(k.label, k.n, k.sum === null ? null : amount(k.sum, k.unit)));
  return { lines, accent: kinds.size === 1 ? accentFor(entries[0].kind) : null };
}

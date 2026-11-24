/**
 * The rows model: the case's step events grouped into named rows by one field, each row with its
 * own bars and, where the pack declares a member field, the lines it opens into. Pure: the grouping
 * field, the name field, the member field and every label come in as arguments read from the
 * manifest, and nothing here names a pack. The playhead plays no part; a row is a function of the
 * events alone.
 *
 * Rules the tests pin:
 *  - a value is matched after trimming, so "Acme" and "Acme " are one row;
 *  - a row takes the first non-empty value of the name field among its events in time order, else
 *    its value (a bar's entity names a row only while no event has);
 *  - an event whose value is empty keeps a rest row named by its kind's label, unchanged, and rest
 *    rows follow the named rows however busy they are;
 *  - named rows run busiest first (most events), then by name, then by key, with a comparison that
 *    does not depend on the runtime's locale;
 *  - a row's bars come from the one kind that declares a node-level magnitude, and from no other lane;
 *  - a member line exists for each member value among a row's events and bars, and the lines' bars
 *    add up to the row's wherever a bar names a member.
 */
import { accountEventToEntity, loginToEntity, transactionToEntity, transferToEntity } from "./adapters/ffr-seed";
import type { CaseStepEvent } from "./case-events";
import type { Entity } from "./entity";
import { barStep, magnitudeOf, type MagnitudeBar } from "./magnitude";
import type { ScenarioFieldWords, ScenarioNode, ScenarioRows } from "./scenarios";
import { displayText, laneScale, magnitudeNodes, type LaneScale } from "./timeline-lanes";

/** What a manifest may call a field: the pattern the manifest's own tests hold it to. */
export const FIELD_NAME_PATTERN = /^[A-Za-z_][A-Za-z0-9_]{0,63}$/;

/** The longest label a manifest may give a field, in characters after trimming. */
export const FIELD_LABEL_MOST = 24;

export const isFieldName = (value: unknown): value is string => typeof value === "string" && FIELD_NAME_PATTERN.test(value);

export interface TrackBar {
  t: number;
  value: number;
}

/** One line of an open row: the events and bars of one member value. */
export interface MemberLine {
  key: string;
  /** The member field's label and the line's number, "<label> <n>". */
  name: string;
  /** The member value itself, for the line's tooltip. */
  value: string;
  /** The ids of the row's events that name this member. */
  ids: ReadonlySet<string>;
  bars: TrackBar[];
  /** The top of the line's bars: the rows' shared top, so the lines add up to the row. 0 with no bars. */
  top: number;
  total: number;
  /** The member's events in time order, with the second line the manifest gives each. */
  events: readonly { id: string; t: number; words: string }[];
}

export interface Track {
  key: string;
  name: string;
  /** True for a row of events that lack the grouping value (named by their kind's label). */
  rest: boolean;
  /** How many events sit on the row. */
  count: number;
  bars: TrackBar[];
  /** The sum of the row's bars. */
  total: number;
  /** The row's events counted by their kind's label, in order of first appearance. */
  kinds: readonly (readonly [string, number])[];
  /** The lines the row opens into; empty when it has nothing to open. */
  lines: MemberLine[];
}

export interface TrackSet {
  /** The grouping in force. */
  by: string;
  /** The grouping field's label from the manifest; "" when the manifest gives none. */
  heading: string;
  /** Named rows first (busiest first), then the rest rows. */
  tracks: Track[];
  /** How many of the rows are named by a value of the field. */
  named: number;
  /** An event's row index, by the event's id. */
  trackOf: ReadonlyMap<string, number>;
  /** The scale of every row's bars together; null when no row has a bar. */
  scale: LaneScale | null;
  /** The bars' step in ms, inferred from the instants as the lane does; 0 with fewer than two. */
  step: number;
  barPalette: string;
  /** The bar kind's label and its quantity's label, as the manifest words them; "" with no bars. */
  barName: string;
  barUnit: string;
  /** The member field's label; "" when rows do not open. */
  memberLabel: string;
}

export interface TrackInput {
  events: readonly CaseStepEvent[];
  /** Every entity of the pack that the generic read gives; only the bar kind's are read from it. */
  entities: readonly Entity[];
  nodes: readonly ScenarioNode[];
  /** The manifest's root `rows`; undefined when the pack declares none. Not trusted. */
  rows: ScenarioRows | undefined;
  /** The manifest's root `fields`; not trusted. */
  fields: Record<string, ScenarioFieldWords> | undefined;
  /** The grouping in force when it is not the manifest's own (the share link's, the switch's). */
  by?: string | null;
}

/** The one reading of a grouping value: a string trimmed, a finite number as its text, anything else
 *  "". The rows' keys are made from it, and a solo matches a record by it (lib/solo), so a padded or
 *  a numeric value gives a row whose solo finds its records. */
export const rowValue = (v: unknown): string =>
  typeof v === "string" ? v.trim() : typeof v === "number" && Number.isFinite(v) ? String(v) : "";

const own = (record: object, key: string): boolean => Object.prototype.hasOwnProperty.call(record, key);

/** A field's value on an entity, trimmed; "" when the entity does not carry the field itself. */
const valueOf = (entity: Entity, field: string): string => (own(entity.fields, field) ? rowValue(entity.fields[field]) : "");

/** A field's label from the manifest's words: 1 to 24 characters after trimming, else "". */
function labelOf(fields: TrackInput["fields"], field: string): string {
  if (typeof fields !== "object" || fields === null || !own(fields, field)) return "";
  const words = fields[field] as unknown;
  return typeof words === "object" && words !== null ? displayText((words as { label?: unknown }).label, FIELD_LABEL_MOST) : "";
}

/** The grouping in force: the asked field when it is a field name, else the manifest's, else none. */
export function groupingOf(rows: ScenarioRows | undefined, asked: string | null | undefined): string | null {
  if (isFieldName(asked)) return asked;
  const by = rows?.by;
  return isFieldName(by) ? by : null;
}

/** The entity a step event stands for; null for a place, which has no row. */
export function entityOfEvent(e: CaseStepEvent): Entity | null {
  const m = e.match;
  switch (m.kind) {
    case "entity": return m.entity;
    case "login": return loginToEntity(m.login);
    case "account_event": return accountEventToEntity(m.event);
    case "transfer": return transferToEntity(m.transfer);
    case "place": return null;
    default: return transactionToEntity(m.tx);
  }
}

// One fixed comparison: case-folded code units, then the raw text. It does not ask the runtime's locale.
function compareText(a: string, b: string): number {
  const x = a.toLowerCase();
  const y = b.toLowerCase();
  if (x !== y) return x < y ? -1 : 1;
  return a === b ? 0 : a < b ? -1 : 1;
}

interface Member {
  ids: string[];
  sums: Map<number, number>;
  first: number;
  events: { id: string; t: number; words: string }[];
}

interface Row {
  key: string;
  name: string;
  rest: boolean;
  ids: string[];
  sums: Map<number, number>;
  kinds: Map<string, number>;
  members: Map<string, Member>;
  /** What gave the row its name: an event (rank 0) or a bar's entity (rank 1), and when; null for none. */
  namedBy: { rank: number; t: number; id: string } | null;
}

const barsOf = (sums: ReadonlyMap<number, number>): TrackBar[] =>
  [...sums].map(([t, value]) => ({ t, value })).sort((a, b) => a.t - b.t);

const add = (sums: Map<number, number>, t: number, value: number): void => {
  sums.set(t, (sums.get(t) ?? 0) + value);
};

/** The rows of a case, or null when the pack declares no usable grouping. */
export function buildTracks(input: TrackInput): TrackSet | null {
  const { events, entities, nodes, rows: declared, fields } = input;
  const by = groupingOf(declared, input.by);
  if (by === null) return null;
  // The name field belongs to the manifest's own grouping; under another grouping the value is the name.
  const nameField = by === declared?.by && isFieldName(declared?.name) ? declared.name : "";
  const memberLabel = isFieldName(declared?.member) ? labelOf(fields, declared.member) : "";
  const memberField = memberLabel ? (declared?.member as string) : "";

  const kindLabel = new Map(nodes.map((n) => [n.kind, n.label || n.kind]));
  const map = new Map<string, Row>();
  const rowFor = (ent: Entity): Row => {
    const value = valueOf(ent, by);
    // An event without the field keeps a row of its own, named by its kind's label.
    const key = value ? `v:${value}` : `k:${ent.kind}`;
    let row = map.get(key);
    if (!row) {
      // The value is the name until an entity of the row carries one (see nameRow).
      const name = value || (kindLabel.get(ent.kind) ?? ent.kind);
      row = { key, name, rest: !value, ids: [], sums: new Map(), kinds: new Map(), members: new Map(), namedBy: null };
      map.set(key, row);
    }
    return row;
  };
  // A row takes the first non-empty name among its events in time order (ties by id); a bar's
  // entity names the row only while no event has. Where none carries one, the row keeps its value.
  const nameRow = (row: Row, ent: Entity, rank: number, t: number): void => {
    const name = row.rest || !nameField ? "" : valueOf(ent, nameField);
    if (!name) return;
    const by = row.namedBy;
    if (by && (by.rank < rank || (by.rank === rank && (by.t < t || (by.t === t && by.id <= ent.id))))) return;
    row.name = name;
    row.namedBy = { rank, t, id: ent.id };
  };
  const memberOf = (row: Row, ent: Entity, t: number): Member | null => {
    const value = memberField && !row.rest ? valueOf(ent, memberField) : "";
    if (!value) return null;
    let m = row.members.get(value);
    if (!m) {
      m = { ids: [], sums: new Map(), first: t, events: [] };
      row.members.set(value, m);
    }
    m.first = Math.min(m.first, t);
    return m;
  };

  for (const e of events) {
    const ent = entityOfEvent(e);
    if (!ent) continue;
    const row = rowFor(ent);
    nameRow(row, ent, 0, e.t);
    row.ids.push(e.id);
    const label = kindLabel.get(ent.kind) ?? ent.kind;
    row.kinds.set(label, (row.kinds.get(label) ?? 0) + 1);
    const member = memberOf(row, ent, e.t);
    if (member) {
      member.ids.push(e.id);
      member.events.push({ id: e.id, t: e.t, words: ent.displayMetadata.secondaryLabel });
    }
  }

  const barNode = magnitudeNodes([...nodes])[0];
  if (barNode) {
    for (const ent of entities) {
      // No timestamp guard: the lane's bars (magnitudeBars) keep an instant of 0, so the rows keep it too.
      if (ent.kind !== barNode.kind) continue;
      const value = magnitudeOf(ent, barNode);
      if (value === null) continue;
      const row = rowFor(ent);
      nameRow(row, ent, 1, ent.timestamp);
      add(row.sums, ent.timestamp, value);
      const member = memberOf(row, ent, ent.timestamp);
      if (member) add(member.sums, ent.timestamp, value);
    }
  }

  const sorted = [...map.values()].sort(
    (a, b) =>
      Number(a.rest) - Number(b.rest) ||
      b.ids.length - a.ids.length ||
      compareText(a.name, b.name) ||
      compareText(a.key, b.key),
  );

  const trackOf = new Map<string, number>();
  const stamps = new Set<number>();
  const values: number[] = [];
  const tracks: Track[] = sorted.map((row, i) => {
    for (const id of row.ids) trackOf.set(id, i);
    const bars = barsOf(row.sums);
    for (const b of bars) {
      stamps.add(b.t);
      values.push(b.value);
    }
    return {
      key: row.key,
      name: row.name,
      rest: row.rest,
      count: row.ids.length,
      bars,
      total: bars.reduce((sum, b) => sum + b.value, 0),
      kinds: [...row.kinds],
      lines: [],
    };
  });
  const scale = laneScale(values);
  const instants: MagnitudeBar[] = [...stamps].sort((a, b) => a - b).map((t) => ({ t, value: 0 }));

  // A member's lines, earliest first and by value where two first appear together. Their bars sit on
  // the rows' shared top, so the lines add up to the row.
  sorted.forEach((row, i) => {
    tracks[i].lines = [...row.members]
      .sort((a, b) => a[1].first - b[1].first || compareText(a[0], b[0]) || (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))
      .map(([value, m], n): MemberLine => {
        const bars = barsOf(m.sums);
        return {
          key: `member:${value}`,
          name: `${memberLabel} ${n + 1}`,
          value,
          ids: new Set(m.ids),
          bars,
          top: scale ? scale.top : 0,
          total: bars.reduce((sum, b) => sum + b.value, 0),
          events: [...m.events].sort((a, b) => a.t - b.t || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)),
        };
      });
  });

  return {
    by,
    heading: labelOf(fields, by),
    tracks,
    named: tracks.filter((t) => !t.rest).length,
    trackOf,
    scale,
    step: barStep(instants),
    barPalette: barNode?.palette ?? "",
    barName: barNode ? [barNode.label || barNode.kind, barNode.magnitudeLabel].filter(Boolean).join(" · ") : "",
    barUnit: barNode?.magnitudeUnit ?? "",
    memberLabel,
  };
}

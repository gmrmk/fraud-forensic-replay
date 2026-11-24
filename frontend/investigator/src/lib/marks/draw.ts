/**
 * THE ONE FUNCTION: whether a record is drawn, and which of the investigator's marks it carries.
 * `drawState` reads the switches (kind, value, Yours), the pin, the playhead and the record, and
 * answers for every reader at once: the globe, the Timeline, the lists, the counts and the marks.
 * Nothing else decides whether a record is shown.
 *
 * Per record: K = the kind is on; V = the kind has no filter field, or the record's value for it is
 * on; Y = Yours is off, or the record's facts match an on facet; P = the record is pinned; W = the pin
 * wins over a switched-off kind or value; M = marked; R = the record is reached (the playhead bounds
 * have not loaded, or the record has no time, or its time is at or before the playhead); L = not a
 * place, or Places is on; S = the record is the one the Inspector shows (it stays drawn against every
 * switch, so the Inspector never describes a record that is nowhere on screen).
 *
 *   shown        = S || (Y && ((W && P) || (K && V)))
 *   reached      = shown && R              ("reached and shown": a reached account event has no dot)
 *   dot          = reached && L
 *   globeMark    = shown && M ? (R ? lit : P ? dim : none) : none
 *   timelineMark = shown && M ? (R ? lit : dim) : none
 *
 * A record with no time draws no Timeline mark whatever `timelineMark` reads: the Timeline has no
 * place for it. The playhead is the only clock; a timestamp that does not parse is never reached
 * while the bounds are loaded.
 *
 * What this file does not do: it reads no store (callers pass `ShowInputs` and `DrawInputs`, built
 * from the stores by the hooks), holds no wall clock or random source, and keeps no state.
 */
import { filterOf, type ScenarioNode } from "../scenarios";
import { rowValue } from "../tracks";
import type { Entity } from "../entity";
import type { EntityMatch, PivotContext } from "../matches";
import type { AccountEvent, LoginEvent, Transaction, Transfer } from "../../types";
import { isMarked, yoursMatch } from "./facts";
import { recordKey, type RecordFacts, type RecordRef, type YoursFacet } from "./types";

/** The record as the one function reads it: a kind, an id, a time (0 when it has none) and its fields. */
export interface DrawRecord {
  kind: string;
  id: string;
  timestamp: number;
  fields: Readonly<Record<string, unknown>>;
}

/**
 * The seed schema's one adapter into `DrawRecord`: no component reads a transaction's fields to
 * decide whether it is drawn. A transaction is "fraud" or "auth" by `is_fraud`; a place has no time;
 * a manifest entity keeps its own kind, time and fields. A time that does not parse is NaN.
 */
export function drawRecordOf(m: EntityMatch): DrawRecord {
  switch (m.kind) {
    case "auth":
    case "fraud":
      return txRecord(m.tx);
    case "login":
      return timed("login", m.login);
    case "account_event":
      return timed("account_event", m.event);
    case "transfer":
      return timed("transfer", m.transfer);
    case "place":
      return { kind: "place", id: m.place.id, timestamp: 0, fields: { ...m.place } };
    case "entity":
      return entityRecord(m.entity);
  }
}

function txRecord(tx: Transaction): DrawRecord {
  return { kind: tx.is_fraud ? "fraud" : "auth", id: tx.id, timestamp: Date.parse(tx.timestamp), fields: { ...tx } };
}
function timed(kind: string, row: LoginEvent | AccountEvent | Transfer): DrawRecord {
  return { kind, id: row.id, timestamp: Date.parse(row.timestamp), fields: { ...row } };
}
function entityRecord(e: Entity): DrawRecord {
  return { kind: e.kind, id: e.id, timestamp: e.timestamp, fields: e.fields };
}

/** The switches the one function reads, as the layers store and the Places switch hold them. */
export interface ShowSwitches {
  showAuths: boolean;
  showLogins: boolean;
  showPlaces: boolean;
  pinWins: boolean;
  hiddenKinds: readonly string[];
  hiddenValues: Readonly<Record<string, readonly string[]>>;
  yoursOn: boolean;
  yoursFacets: Readonly<Record<YoursFacet, boolean>>;
}

export interface ShowInputs {
  kindOn(kind: string): boolean;
  /** Reads an own key of the hidden values only. */
  valueOn(kind: string, value: string): boolean;
  /** The kind's declared filter field, or null. */
  filterField(kind: string): string | null;
  yours: { on: boolean; facets: Record<YoursFacet, boolean> };
  facts(r: RecordRef): RecordFacts;
  placesOn: boolean;
  pinWins: boolean;
  /** The record the Inspector shows, in canonical form, or null when none: it is shown against every switch. */
  selected: RecordRef | null;
}

export interface DrawInputs extends ShowInputs {
  playhead: number;
  /** True once the playhead's bounds have loaded (maxTime above minTime). */
  windowed: boolean;
}

export interface DrawState {
  /** Passes the switches (or the pin, from item 1), or is the selected record: the playhead is free. */
  shown: boolean;
  /** Shown and reached by the playhead. */
  reached: boolean;
  /** The record's own dot is drawn now (a place needs Places on). */
  dot: boolean;
  globeMark: "none" | "lit" | "dim";
  timelineMark: "none" | "lit" | "dim";
}

/** Auth and fraud read showAuths, login showLogins, a place is always on, any other kind reads the list. */
export function kindOnOf(sw: ShowSwitches): (kind: string) => boolean {
  return (kind) => {
    switch (kind) {
      case "auth":
      case "fraud":
        return sw.showAuths;
      case "login":
        return sw.showLogins;
      case "place":
        return true;
      default:
        return !sw.hiddenKinds.includes(kind);
    }
  };
}

/**
 * What `useShowInputs` builds: the switches, the manifest's filters, a facts function and the selected
 * record, as one value.
 */
export function showInputsOf(
  sw: ShowSwitches,
  nodes: readonly ScenarioNode[],
  facts: (r: RecordRef) => RecordFacts,
  selected: RecordRef | null,
): ShowInputs {
  const fields = new Map<string, string>();
  for (const node of nodes) {
    const filter = filterOf(node);
    if (filter && !fields.has(node.kind)) fields.set(node.kind, filter.field);
  }
  return {
    kindOn: kindOnOf(sw),
    valueOn: (kind, value) => !(Object.hasOwn(sw.hiddenValues, kind) && sw.hiddenValues[kind].includes(value)),
    filterField: (kind) => fields.get(kind) ?? null,
    yours: { on: sw.yoursOn, facets: { ...sw.yoursFacets } },
    facts,
    placesOn: sw.showPlaces,
    pinWins: sw.pinWins,
    selected,
  };
}

/** A record's value for its kind's filter field, as the Timeline's rows read it; "" when it has none. */
function valueOf(rec: DrawRecord, field: string): string {
  return Object.hasOwn(rec.fields, field) ? rowValue(rec.fields[field]) : "";
}

/** `shown`, with the record's facts read once. */
function judge(rec: DrawRecord, s: ShowInputs): { shown: boolean; f: RecordFacts } {
  const f = s.facts({ kind: rec.kind, id: rec.id });
  const y = !s.yours.on || yoursMatch(f, s.yours.facets);
  const field = s.filterField(rec.kind);
  const k = s.kindOn(rec.kind);
  const v = field === null || s.valueOn(rec.kind, valueOf(rec, field));
  // S: the selected record is compared by canonical key, so a fraud transaction selected as "auth" is the same record.
  const sel = s.selected !== null && recordKey(s.selected) === recordKey(rec);
  return { shown: sel || (y && ((s.pinWins && f.pinned) || (k && v))), f };
}

/** Whether the record passes the switches (and Yours), whatever the playhead says. */
export function isShown(rec: DrawRecord, s: ShowInputs): boolean {
  return judge(rec, s).shown;
}

export function drawState(rec: DrawRecord, d: DrawInputs): DrawState {
  const { shown, f } = judge(rec, d);
  const marked = isMarked(f);
  const r = !d.windowed || rec.timestamp <= 0 || rec.timestamp <= d.playhead;
  return {
    shown,
    reached: shown && r,
    dot: shown && r && (rec.kind !== "place" || d.placesOn),
    globeMark: !(shown && marked) ? "none" : r ? "lit" : f.pinned ? "dim" : "none",
    timelineMark: !(shown && marked) ? "none" : r ? "lit" : "dim",
  };
}

/** A list cut to what `keep` keeps; the list itself when nothing was lost. */
function cut<T>(list: readonly T[], keep: (item: T) => boolean): T[] {
  const kept = list.filter(keep);
  return kept.length === list.length ? (list as T[]) : kept;
}

/**
 * The context with only the records the switches show, in transactions, logins, account events,
 * transfers and entities; places by reference. An absent optional list stays absent. The context
 * itself comes back whenever no list lost a record, so an unchanged case keeps its identity.
 */
export function narrowByShown(ctx: PivotContext, s: ShowInputs): PivotContext {
  const transactions = cut(ctx.transactions, (t) => isShown(txRecord(t), s));
  const logins = cut(ctx.logins, (l) => isShown(timed("login", l), s));
  const accountEvents = ctx.accountEvents && cut(ctx.accountEvents, (e) => isShown(timed("account_event", e), s));
  const transfers = ctx.transfers && cut(ctx.transfers, (t) => isShown(timed("transfer", t), s));
  const entities = ctx.entities && cut(ctx.entities, (e) => isShown(entityRecord(e), s));
  if (
    transactions === ctx.transactions &&
    logins === ctx.logins &&
    accountEvents === ctx.accountEvents &&
    transfers === ctx.transfers &&
    entities === ctx.entities
  ) {
    return ctx;
  }
  const out: PivotContext = { ...ctx, transactions, logins };
  if (accountEvents) out.accountEvents = accountEvents;
  if (transfers) out.transfers = transfers;
  if (entities) out.entities = entities;
  return out;
}

/** How many of `recs` pass the switches, how many of those the playhead has reached, and how many there are. */
export function drawCounts(recs: readonly DrawRecord[], d: DrawInputs): { shown: number; reached: number; all: number } {
  let shown = 0;
  let reached = 0;
  for (const rec of recs) {
    const st = drawState(rec, d);
    if (st.shown) shown += 1;
    if (st.reached) reached += 1;
  }
  return { shown, reached, all: recs.length };
}

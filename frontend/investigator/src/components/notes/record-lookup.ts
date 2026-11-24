/**
 * Looking up the record a note links to, and making a link from the selected record. The link is
 * `{ kind, id }` and nothing else: no coordinates and no record data are stored, so the place and
 * the headline are looked up here at draw time, from the data the app holds.
 */
import type { EntityMatch, PivotContext } from "../../lib/matches";
import { selectionId } from "../../lib/case-events";
import { drawRecordOf, type DrawRecord } from "../../lib/marks/draw";
import { entityLngLat } from "../../lib/node-anchor";
import { checkLink } from "../../lib/notes/schema";
import type { NoteLink } from "../../lib/notes/types";
import { entityTimestamp } from "../../store/navigation";
import type { Place, SelectedEntity } from "../../types";

export interface RecordInfo {
  /** The link's kind as passed. A note's row and marks print it as it is; a mark of the investigator's
   *  node prints the canonical kind or the kind's manifest label instead. */
  kind: string;
  headline: string;
  /** Null for a record with no place (an account event, a transfer). */
  lngLat: { lng: number; lat: number } | null;
  /** The record's time (`entityTimestamp`): null for a place and for a record with no time. */
  time: number | null;
  /** The record as the one function reads it. */
  draw: DrawRecord;
  /** The match the lookup found, for `navigate` (a place link gives `{ kind: "place", place }`). */
  match: EntityMatch;
}

/** Resolves a link to its record, or null when the record is not in the data. */
export type RecordLookup = (link: NoteLink) => RecordInfo | null;

const kindOf = (m: EntityMatch): string => (m.kind === "entity" ? m.entity.kind : m.kind);
const isTx = (k: string): boolean => k === "auth" || k === "fraud";

/** The record's own name for itself, one short line. */
export function headlineOf(m: EntityMatch): string {
  switch (m.kind) {
    case "auth":
    case "fraud":
      return m.tx.merchant_name;
    case "login":
      return m.login.ip;
    case "place":
      return m.place.name;
    case "account_event":
      return m.event.field ?? m.event.kind;
    case "transfer":
      return `${m.transfer.rail} ${m.transfer.status}`;
    case "entity":
      return m.entity.displayMetadata.primaryLabel;
  }
}

/**
 * A lookup over one context. On its first call it walks each list of the context once, into one map
 * from id to match (the order `resolveEntityRef` reads: transactions, logins, account events,
 * transfers, entities; the first record of an id wins) and one from place id to place; it keeps each
 * answer by the link as it was asked (its own kind and its id), so a link is resolved once for this
 * lookup. It must not be built or called per playhead tick: a mark view takes the resolved
 * `info.draw` and `info.time`.
 *
 * A fraud link and an auth link to one transaction are two answers: each carries its own link's
 * `kind` (a note's row and its marks print that word), and both hold the one match the lookup found.
 * A kind holds no colon (the link check), so a kind and an id joined by one cannot name two links.
 */
export function lookupFromContext(ctx: PivotContext): RecordLookup {
  let index: { byId: Map<string, EntityMatch>; placesById: Map<string, Place> } | null = null;
  const answers = new Map<string, RecordInfo | null>();

  const build = (): { byId: Map<string, EntityMatch>; placesById: Map<string, Place> } => {
    const ids = new Map<string, EntityMatch>();
    const first = (id: string, m: EntityMatch): void => {
      if (!ids.has(id)) ids.set(id, m);
    };
    for (const tx of ctx.transactions) first(tx.id, tx.is_fraud ? { kind: "fraud", tx } : { kind: "auth", tx });
    for (const login of ctx.logins) first(login.id, { kind: "login", login });
    for (const event of ctx.accountEvents ?? []) first(event.id, { kind: "account_event", event });
    for (const transfer of ctx.transfers ?? []) first(transfer.id, { kind: "transfer", transfer });
    for (const entity of ctx.entities ?? []) first(entity.id, { kind: "entity", entity });
    const places = new Map<string, Place>();
    for (const place of ctx.places) if (!places.has(place.id)) places.set(place.id, place);
    return { byId: ids, placesById: places };
  };

  const resolve = (link: NoteLink, found: { byId: Map<string, EntityMatch>; placesById: Map<string, Place> }): RecordInfo | null => {
    let m: EntityMatch | undefined = found.byId.get(link.id);
    if (!m && link.kind === "place") {
      const place = found.placesById.get(link.id);
      if (place) m = { kind: "place", place };
    }
    if (!m) return null;
    const k = kindOf(m);
    if (!(k === link.kind || (isTx(k) && isTx(link.kind)))) return null;
    return { kind: link.kind, headline: headlineOf(m), lngLat: entityLngLat(m), time: entityTimestamp(m), draw: drawRecordOf(m), match: m };
  };

  return (link) => {
    const key = `${link.kind}:${link.id}`;
    if (answers.has(key)) return answers.get(key) ?? null;
    index ??= build();
    const info = resolve(link, index);
    answers.set(key, info);
    return info;
  };
}

/** The link for the selected record, or null when nothing is selected, the record is a note (a
 *  selected note is never a link target), or the record's kind or id does not pass the link check. */
export function linkFromSelected(selected: SelectedEntity | null): NoteLink | null {
  const id = selectionId(selected);
  if (!selected || id === null) return null;
  const kind = selected.kind === "entity" ? selected.entity.kind : selected.kind;
  if (kind === "note") return null;
  const checked = checkLink({ kind, id });
  return checked.ok ? checked.value : null;
}

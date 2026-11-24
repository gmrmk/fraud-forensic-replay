/**
 * Solo: one row of the bar shown alone. A solo is a field and a value; every list narrows
 * through one derivation, so the dots, lanes, step keys, globe and ticker cannot disagree.
 *
 * The match rule is relatedEntities()'s walk: seed rows by their registered fields, and
 * manifest-declared rows by their declared pivotable fields. It differs in one place: the value is
 * read as the rows read it (`rowValue`, which trims a string and writes a number as text), so the
 * solo of a row whose value is padded or a number finds that row's records. relatedEntities() stays
 * strict (the Inspector and the Matches list rely on it). This file holds no field name: the field
 * arrives in the solo.
 *
 * Left alone on purpose: places (no field to match, so they pass by reference) and the Matches
 * list, which a solo never reads or changes. What the other rows do while one is soloed is not
 * decided here; this file only says which records stay.
 */
import { fieldSources, type PivotContext } from "./matches";
import { rowValue } from "./tracks";

/** The soloed row: the field the rows group by, and one value of it. */
export interface Solo {
  field: string;
  value: string;
}

/** Whether the record carries `field` itself and reads as `wanted` (an own key, so an inherited
 *  name never matches). */
const holds = (record: object, field: string, wanted: string): boolean =>
  Object.hasOwn(record, field) && rowValue((record as Record<string, unknown>)[field]) === wanted;

/** The ids of every record the solo keeps, over every list in `context`. A value that reads as
 *  empty is not a row and keeps nothing. */
export function soloIds(solo: Solo, context: PivotContext): Set<string> {
  const ids = new Set<string>();
  const wanted = rowValue(solo.value);
  if (wanted === "") return ids;
  const sources = fieldSources(solo.field) ?? [];
  const take = (rows: readonly { id: string }[] | undefined): void => {
    for (const r of rows ?? []) if (holds(r, solo.field, wanted)) ids.add(r.id);
  };
  if (sources.includes("transaction")) take(context.transactions);
  if (sources.includes("login")) take(context.logins);
  if (sources.includes("account_event")) take(context.accountEvents);
  if (sources.includes("transfer")) take(context.transfers);
  for (const e of context.entities ?? []) {
    if (e.displayMetadata.pivotableFields.includes(solo.field) && holds(e.fields, solo.field, wanted)) ids.add(e.id);
  }
  return ids;
}

/** Whether the soloed value is still in the data (false once it has left, as on a scenario change). */
export function soloHasData(solo: Solo, context: PivotContext): boolean {
  return soloIds(solo, context).size > 0;
}

/** `context` narrowed to the solo. No solo returns `context` itself. Places pass through by
 *  reference; an optional list that is absent stays absent. The input lists are not changed. */
export function narrowBySolo(context: PivotContext, solo: Solo | null): PivotContext {
  if (solo === null) return context;
  const keep = soloIds(solo, context);
  const only = <T extends { id: string }>(rows: T[]): T[] => rows.filter((r) => keep.has(r.id));
  return {
    ...context,
    transactions: only(context.transactions),
    logins: only(context.logins),
    accountEvents: context.accountEvents && only(context.accountEvents),
    transfers: context.transfers && only(context.transfers),
    entities: context.entities && only(context.entities),
  };
}

/** A decision is in the solo when any id in its `events` or `triggerEntityIds` is. Takes the ids
 *  from soloIds() and reads either list, so the overlay view and the decision record both fit. */
export function decisionInSolo(
  ids: ReadonlySet<string>,
  decision: { events?: readonly string[]; triggerEntityIds?: readonly string[] },
): boolean {
  return (decision.events ?? []).some((id) => ids.has(id)) || (decision.triggerEntityIds ?? []).some((id) => ids.has(id));
}

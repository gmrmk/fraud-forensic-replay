// frontend/investigator/src/components/record-window/record-window.ts
// Small helpers of the record's own window and its opener in the Inspector's header: the kind's label,
// the glyph of each disposition, the status line of a refused press, the window's accent colour, the
// colour its title and pin are drawn in, and the lookup the Inspector's opener resolves a record with.
// A `.ts` file on purpose: the `.tsx` files beside it export components only (the react-refresh lint
// rule). It draws nothing, holds no state and reads no clock; the one store it reads is the pivot data,
// in `inspectorLookup`.
import type { GlyphName } from "../marks/glyphs";
import { paletteForKind } from "../../lib/entity-palette";
import type { RecordRef, SetDisposition } from "../../lib/marks/types";
import type { NoteErrorCode } from "../../lib/notes/types";
import type { ScenarioNode } from "../../lib/scenarios";
import { MID, STATUS } from "../../lib/tooltip-words/record-window";
import { usePivotData } from "../../store/pivot-data";
import type { Place, SelectedEntity } from "../../types";
import { lookupFromContext, type RecordInfo, type RecordLookup } from "../notes/record-lookup";

export { MID };

/** The kind's own label from the story's manifest, or the kind itself when no node has it. */
export function kindLabelOf(kind: string, nodes: readonly ScenarioNode[]): string {
  return nodes.find((n) => n.kind === kind)?.label ?? kind;
}

/** The drawing of each set disposition: PASS a check, FAIL a cross, WAITING an hourglass. */
export const GLYPH_OF: Readonly<Record<SetDisposition, GlyphName>> = { pass: "check", fail: "cross", wait: "hourglass" };

/** The window's status line for a refused press: three lines, by the store's fixed code. */
export function statusWord(code: NoteErrorCode): string {
  if (code === "backing_failed") return STATUS.backingFailed;
  if (code === "limit_reached") return STATUS.limitReached;
  return STATUS.refused;
}

/** The window's accent: the palette of the kind the record draws as (a fraud transaction draws as
 *  fraud), or of the record's own kind when the lookup does not find it. */
export function recordAccent(info: RecordInfo | null, record: RecordRef): string {
  return paletteForKind(recordColourKind(info, record)).hex;
}

/** The kind the window's colours are read for: the kind the record draws as, or its own kind when the
 *  lookup does not find it. */
export function recordColourKind(info: RecordInfo | null, record: RecordRef): string {
  return info ? info.draw.kind : record.kind;
}

// The fit of the window's title and lit pin to its header is one pure function, now in lib/window-ink.ts
// (the frame fits its own ink with it); these re-exports keep the names the record window and its test use.
export { PIN_CONTRAST, TITLE_CONTRAST, windowInk } from "../../lib/window-ink";

// One entry, kept for the last lists and the last selected place. The lookup holds an index of the
// case, so it is built once and reused until a list of the pivot data changes or another place is
// selected (a place is the only selection the pivot data does not hold). Limit: one entry, so two
// callers alternating between places rebuild each time; the one caller today is the Inspector's opener.
let memo: { lists: readonly unknown[]; place: Place | null; lookup: RecordLookup } | null = null;

/**
 * The lookup the Inspector's opener uses: the pivot data's five lists plus the selected place (the
 * pivot data holds no places). Memoised, so a press does not rebuild the case's index.
 */
export function inspectorLookup(selected: SelectedEntity | null): RecordLookup {
  const data = usePivotData.getState();
  const lists = [data.transactions, data.logins, data.accountEvents, data.transfers, data.entities];
  const place = selected?.kind === "place" ? selected.place : null;
  if (memo && memo.place === place && memo.lists.every((l, i) => l === lists[i])) return memo.lookup;
  const lookup = lookupFromContext({
    transactions: data.transactions,
    logins: data.logins,
    accountEvents: data.accountEvents,
    transfers: data.transfers,
    entities: data.entities,
    places: place ? [place] : [],
  });
  memo = { lists, place, lookup };
  return lookup;
}

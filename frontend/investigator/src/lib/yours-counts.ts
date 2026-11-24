/**
 * The Yours row's counts: the investigator's state over every record of the case. Places are not
 * counted: no switch acts on them.
 *
 * `caseDrawRecords` makes one record per row of the case's five lists, in the order transactions, logins,
 * account events, transfers, manifest entities. `yoursCounts` reads the investigator's facts for each
 * record: `touched` is the records any of the six Yours facets holds for (a record pinned and noted counts
 * once), `facets[f]` the records one facet holds for, `all` every record. The counts read the investigator's
 * state only: not the Layers switches and not the playhead, so they hold still while either moves.
 *
 * What this file does not do: it reads no store (the caller passes the lists and the facts function),
 * decides nothing about what is drawn (that is `lib/marks/draw`), and holds no wall clock.
 */
import type { Entity } from "./entity";
import { drawRecordOf, type DrawRecord } from "./marks/draw";
import { YOURS_PREDICATES } from "./marks/facts";
import { YOURS_FACETS, type RecordFacts, type RecordRef, type YoursFacet } from "./marks/types";
import type { AccountEvent, LoginEvent, Transaction, Transfer } from "../types";

export interface CaseRows {
  transactions: readonly Transaction[];
  logins: readonly LoginEvent[];
  accountEvents: readonly AccountEvent[];
  transfers: readonly Transfer[];
  entities: readonly Entity[];
}

export interface YoursCounts {
  /** Every record of the case's five lists. */
  all: number;
  /** The records any facet holds for. */
  touched: number;
  /** The records each facet holds for. */
  facets: Record<YoursFacet, number>;
}

/** One draw record per row of the five lists, in that order (a fraud transaction has the kind fraud). */
export function caseDrawRecords(rows: CaseRows): DrawRecord[] {
  return [
    ...rows.transactions.map((tx) => drawRecordOf({ kind: "auth", tx })),
    ...rows.logins.map((login) => drawRecordOf({ kind: "login", login })),
    ...rows.accountEvents.map((event) => drawRecordOf({ kind: "account_event", event })),
    ...rows.transfers.map((transfer) => drawRecordOf({ kind: "transfer", transfer })),
    ...rows.entities.map((entity) => drawRecordOf({ kind: "entity", entity })),
  ];
}

export function yoursCounts(recs: readonly DrawRecord[], facts: (r: RecordRef) => RecordFacts): YoursCounts {
  const facets: Record<YoursFacet, number> = { pinned: 0, pass: 0, fail: 0, wait: 0, noted: 0, inPath: 0 };
  let touched = 0;
  for (const rec of recs) {
    const f = facts({ kind: rec.kind, id: rec.id });
    let any = false;
    for (const facet of YOURS_FACETS) {
      if (YOURS_PREDICATES[facet](f)) {
        facets[facet] += 1;
        any = true;
      }
    }
    if (any) touched += 1;
  }
  return { all: recs.length, touched, facets };
}

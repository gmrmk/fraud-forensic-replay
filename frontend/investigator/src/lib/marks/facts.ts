/**
 * What the investigator has done to a record, read as facts: marked, and the six Yours facets. Pure
 * predicates over `RecordFacts`. They live apart from `select.ts` so the one function (`draw.ts`) and
 * the selectors can both read them without importing each other; `select.ts` re-exports them.
 *
 * What this file does not do: it finds no record, reads no store, and holds no wall clock.
 */
import { YOURS_FACETS, type RecordFacts, type YoursFacet } from "./types";

/** A record is marked when it is pinned, has a disposition or has a note. Being in a path alone is not a mark. */
export const isMarked = (f: RecordFacts): boolean => f.pinned || f.disposition !== "none" || f.noted;

/** The six facets of Dispositions, each as a test of one record's facts. */
export const YOURS_PREDICATES: Record<YoursFacet, (f: RecordFacts) => boolean> = {
  pinned: (f) => f.pinned,
  pass: (f) => f.disposition === "pass",
  fail: (f) => f.disposition === "fail",
  wait: (f) => f.disposition === "wait",
  noted: (f) => f.noted,
  inPath: (f) => f.inPath,
};

/** The facets join by OR over the ones that are on; with all six off nothing matches. */
export function yoursMatch(f: RecordFacts, facets: Readonly<Record<YoursFacet, boolean>>): boolean {
  return YOURS_FACETS.some((facet) => facets[facet] && YOURS_PREDICATES[facet](f));
}

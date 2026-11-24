// frontend/investigator/src/lib/tooltip-words/globe.ts
// The words of the globe's tooltip when several marks lie at one place.
// A single mark gives its record's own lines from time-words.ts, the same lines
// as its node on the Timeline, so no word of a record is written here. A tooltip says what a thing
// is and its values; it never says what to conclude.
//
// Both lines are labels with values, not sentences: a title with a count, and a kind's label with
// a count and, for a kind that has an amount, the sum after a middle dot. A label has no full stop
// and keeps its words, as the title lines of head.ts do, so the writing rules of Simplified
// Technical English apply to a sentence and there is none here. The
// words are "marks" as the bar's piles say it in Tip.tsx, and "in all" for the sum.

/** The first line of a pile of marks on the globe: how many lie at the place. */
export const globeManyTitle = (count: number): string => `${count} marks at this place`;

/** One kind's line in a pile: the manifest's label unchanged, the count, and, when the kind has an
 *  amount, the sum already printed with its unit ("22,797.25 USD"). */
export function globeKindLine(label: string, count: number, total: string | null): string {
  return total === null ? `${label} ${count}` : `${label} ${count} · ${total} in all`;
}

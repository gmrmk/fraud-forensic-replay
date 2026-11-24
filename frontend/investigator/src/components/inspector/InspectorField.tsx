import type { ReactNode } from "react";
import { displayLabel } from "../../lib/manifest-fields";
import { fieldRowWords } from "../../lib/tooltip-words/inspector";
import { tip } from "../ui/Tip";
import { FieldIcon } from "./LibraryIcon";

interface Props {
  label: string;
  value: ReactNode;
  /** Optional emphasis class (e.g. "text-signal" for fraud-relevant
   *  numbers). Default is `text-text`. */
  valueClass?: string;
  /** The attribute's field id: a vocabulary id, or the record's key in a manifest body. Given, the label
   *  starts with the field's library icon and names the attribute on hover. Left out, the row is drawn
   *  as before (a rule trace's rows, a decision's notes). */
  field?: string;
}

/** Inspector field primitive - a Capitalized-Case muted `label:` floated left,
 *  value hard-right on the same line. Owner direction 2026-06-21: Capitalized-Case
 *  left label, data RIGHT-justified, AND keep the single-line copy.
 *
 *  HOW both: the row is NOT a flex/grid (those insert a selection newline between
 *  cells). Instead the label `float-left` and the value is plain inline text in a
 *  `text-right` row - so the value right-aligns to the panel edge while the row
 *  stays one inline run, and a native selection copies a clean single line
 *  "label: value" (verified live via getSelection, no newline). A trailing nbsp
 *  on the label is the copy's `: ` gap. The label keeps 8 px to its right, so
 *  a long value never runs into it. The value keeps its mono face + the
 *  `valueClass` caller contract (20+ body call sites). */
export function InspectorField({
  label,
  value,
  valueClass = "text-text",
  field,
}: Props) {
  return (
    <div className="py-0.5 text-[11px] leading-snug text-right overflow-hidden">
      <span className="float-left mr-2 text-muted align-baseline" {...(field === undefined ? {} : tip(fieldRowWords(displayLabel(label))))}>
        {field === undefined ? null : <FieldIcon field={field} className="mr-1 align-middle" />}
        <span>{displayLabel(label)}</span>:{" "}
      </span>
      <span className={`font-mono ${valueClass} align-baseline`}>{value}</span>
    </div>
  );
}

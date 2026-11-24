/**
 * Helpers of the Your marks block (window N1): a kind's label from the manifest, the row's name, and
 * the parts of its second line. A `.ts` file, so the `.tsx` block beside it exports components only.
 *
 * `MID` and `kindLabelOf` are twins of the ones the record window's own helpers hold
 * (`record-window.ts`, a second builder's file): two builders, no shared file, so each keeps its copy.
 *
 * What this file does not do: it reads no store and resolves no record (the lookup does, in
 * `useYourMarks`), and it prints no word of its own beyond joining parts.
 */
import { DISPOSITION_WORD } from "../../lib/marks/words";
import type { YourMark } from "../../lib/marks/select";
import { canonicalKind } from "../../lib/marks/types";
import type { ScenarioNode } from "../../lib/scenarios";
import { PINNED, noteCount } from "../../lib/tooltip-words/your-marks";

/** The middle dot, built from its code point. */
export const MID = String.fromCharCode(0xb7);

/** The kind's label as the manifest has it, else the kind itself. */
export function kindLabelOf(kind: string, nodes: readonly ScenarioNode[]): string {
  return nodes.find((n) => n.kind === kind)?.label ?? kind;
}

/**
 * The row's name: `<kind label>: <headline>`, or `<kind label>: <id>` for a record that is not in the
 * data. The kind is the canonical one (a transaction is "auth", never "fraud").
 */
export function markName(m: YourMark, nodes: readonly ScenarioNode[]): string {
  const label = kindLabelOf(canonicalKind(m.record.kind), nodes);
  return `${label}: ${m.info?.headline ?? m.record.id}`;
}

/** The parts of the row's second line that exist: the disposition word, the Fail category, the note count, Pinned. */
export function markParts(m: YourMark): string[] {
  const parts: string[] = [];
  const d = m.node?.disposition ?? "none";
  if (d !== "none") parts.push(DISPOSITION_WORD[d]);
  if (m.node?.category) parts.push(m.node.category);
  if (m.notes.length > 0) parts.push(noteCount(m.notes.length));
  if (m.node?.pinned) parts.push(PINNED);
  return parts;
}

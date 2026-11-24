/**
 * Two readers of a stop's words, for every part of the investigator's paths: the label of a kind and a
 * stop in words. The lookup itself is the model's (`useCaseLookup`, in `store/marks.ts`), and a press on
 * a plate navigates with the record's own `info.match`; neither is rebuilt here.
 *
 * The label is the manifest's for the kind, else the kind with spaces for underscores (the rule of the
 * Paths menu's kind rows). A fraud transaction draws as a fraud kind, so the kind is made canonical
 * first: the word the investigator reads for it is the auth kind's, never "fraud".
 *
 * What this file does not do: it holds no state and calls no hook.
 */
import { canonicalKind } from "../../lib/marks/types";
import type { PathStopView } from "../../lib/marks/select";
import type { ScenarioNode } from "../../lib/scenarios";
import { PATH_WORDS, recordWords } from "../../lib/tooltip-words/paths";

/** The kind's manifest label, else its canonical kind with spaces for underscores. */
export function kindLabelOf(nodes: readonly ScenarioNode[], kind: string): string {
  const canonical = canonicalKind(kind);
  return nodes.find((n) => n.kind === canonical)?.label ?? canonical.replace(/_/g, " ");
}

/** A stop in words: "<kind label>: <headline>", or "Record not found" when its record is not in the data. */
export function stopWords(view: PathStopView, nodes: readonly ScenarioNode[]): string {
  const info = view.info;
  if (info === null) return PATH_WORDS.labels.recordNotFound;
  return recordWords(kindLabelOf(nodes, info.draw.kind), info.headline);
}

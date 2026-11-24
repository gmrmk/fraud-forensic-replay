// frontend/investigator/src/components/timeline/head/BarFold.tsx
// The Timeline's fold button, in the idiom of the rows'
// and the lane's buttons: a mark, the control's own word, and a sentence for assistive tech that
// ends its name with the state it is in.
//
// Every state of the fold draws the one FoldMark: closed (the folded bar, with its name alone or
// with a small version, the two read apart by the words and by what is drawn below it) and open.
// The mark is the same triangle in every state and turns a quarter turn when the bar opens, so the
// fold does not change size when it opens. The words below keep the difference between a fold that
// shows its name alone and one that shows a small version.
import { tip } from "../../ui/Tip";
import { FoldMark } from "../FoldMark";
import { BAR_FOCUS_RING } from "../../../lib/bar-metrics";
import { barFoldWords, foldTail, type BarView, type FoldState } from "../../../lib/tooltip-words/head";

export interface BarFoldProps {
  folded: boolean;
  /** True when the folded bar still draws a small version of itself (a line for each section). */
  small: boolean;
  /** What the folded Timeline draws, for the words: a line for each section ("stack") or the one
   *  line ("line"). Left out, the words follow `small`. `small` alone draws the mark. */
  view?: BarView;
  /** What a press opens or folds, in words ("the track, the rows and the lane"). */
  part: string;
  /** The id of the element a press opens. It is set only while the bar is open, since the body
   *  does not exist while the bar is folded. */
  controls?: string;
  onToggle: () => void;
}

export function BarFold({ folded, small, view, part, controls, onToggle }: BarFoldProps) {
  const state: FoldState = !folded ? "open" : (view ?? (small ? "small" : "name"));
  return (
    <button
      type="button"
      data-bar-fold
      aria-expanded={!folded}
      {...(controls && !folded ? { "aria-controls": controls } : {})}
      onClick={onToggle}
      {...tip(barFoldWords(folded, view))}
      className={`flex h-6 shrink-0 items-center whitespace-nowrap font-mono text-[8px] uppercase tracking-[0.18em] text-text ${BAR_FOCUS_RING}`}
    >
      <FoldMark open={!folded} />
      Timeline
      <span data-fold-words className="sr-only">
        {" "}
        {foldTail(state, part)}
      </span>
    </button>
  );
}

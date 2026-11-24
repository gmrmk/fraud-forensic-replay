// frontend/investigator/src/components/timeline/rows/TrackHeader.tsx
// The rows' header: the fold button, which reads the
// grouping's heading and the count of named rows ("SQUAD · 30"), and, while one row is alone, a
// control that clears it. The clear control stays on screen however the rows are folded, so a solo
// is never on without a control that ends it. The grouping control (GroupBy) mounts here, last,
// so it stays on screen when the rows are folded; it reads its own data from the stores.
import { BAR_FOCUS_RING } from "../../../lib/bar-metrics";
import { cutName, nameChars, rowsCountName } from "../../../lib/row-ticks";
import { rowsFoldWords } from "../../../lib/tooltip-words/rows";
import { soloClearName, soloClearWords } from "../../../lib/tooltip-words/solo";
import { tip } from "../../ui/Tip";
import { FoldMark } from "../FoldMark";
import { GroupBy } from "./GroupBy";

/** The most characters of a soloed row's name the header shows. The whole name is in its words. */
const CLEAR_CHARS = nameChars(110, 8);

export interface TrackHeaderProps {
  heading: string;
  named: number;
  open: boolean;
  onToggle: () => void;
  /** The id of the list the button folds. */
  listId: string;
  /** The name of the row that is alone, or null when none is. */
  soloName: string | null;
  onClearSolo: () => void;
}

export function TrackHeader({ heading, named, open, onToggle, listId, soloName, onClearSolo }: TrackHeaderProps) {
  return (
    <div data-track-header className="flex h-6 items-center gap-4 font-mono text-[8px] uppercase tracking-[0.18em]">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={listId}
        aria-label={rowsCountName(heading, named)}
        onClick={onToggle}
        {...tip(rowsFoldWords(heading, named))}
        className={`flex h-6 min-w-0 items-center whitespace-nowrap uppercase text-text ${BAR_FOCUS_RING}`}
      >
        <FoldMark open={open} />
        <span className="min-w-0 truncate">{heading}</span>
        <span aria-hidden="true" className="shrink-0 whitespace-pre">
          {heading ? " · " : ""}
          {named}
        </span>
      </button>
      {soloName !== null ? (
        <button
          type="button"
          data-solo-clear
          aria-label={soloClearName(soloName)}
          onClick={onClearSolo}
          {...tip(soloClearWords(soloName))}
          className={`flex h-6 min-w-0 items-center whitespace-nowrap px-1 text-text ${BAR_FOCUS_RING}`}
          style={{ backgroundColor: "rgb(var(--text-rgb) / 0.14)" }}
        >
          <span aria-hidden="true" className="min-w-0 truncate">
            {cutName(soloName, CLEAR_CHARS)}
          </span>
          <span aria-hidden="true" className="ml-1 shrink-0">
            ×
          </span>
        </button>
      ) : null}
      <GroupBy />
    </div>
  );
}

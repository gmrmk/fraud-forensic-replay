/**
 * The buttons at the foot of the Paths menu. Join pinned makes a path of the pinned records in time
 * order (a copy: a later pin or unpin does not change it) and shows at its right how many stops a
 * press makes. It is not available under two stops, while a path is being drawn, and at the limit of
 * 20 paths; each of those says why in its tooltip.
 *
 * A button that is not available is `aria-disabled` and coloured faint, never faded and never natively
 * disabled, so its tooltip still shows the reason; the press is ignored in code. One press makes one
 * path: a second press while the first is saving does nothing.
 *
 * New path, above it, starts a draft under the next default name and hands the rest to the drawing strip.
 * It is not available while a draft is open or at the limit of 20 paths, and says why.
 *
 * What this file does not do: draw the strip or the draft (the strip does), name a joined path (the
 * store gives the default name), or show a refusal of the save (a full scenario is stopped before the press).
 */
import { useRef, type ReactElement } from "react";
import { MarkGlyph } from "../marks/glyphs";
import { tip } from "../ui/Tip";
import { usePathSession } from "./path-session";
import { MARK_LIMITS } from "../../lib/marks/types";
import { joinPinned, nextPathName, pinnedInTimeOrder } from "../../lib/marks/select";
import { PATH_WORDS } from "../../lib/tooltip-words/paths";
import { useCaseLookup, useMarksStore } from "../../store/marks";

const BUTTON =
  "flex h-[24px] w-full items-center justify-between px-2 font-mono text-[9px] uppercase tracking-[0.12em] outline-none focus-visible:ring-1 focus-visible:ring-signal";

export function PathButtons(): ReactElement {
  const nodes = useMarksStore((s) => s.nodes);
  const paths = useMarksStore((s) => s.paths);
  const pathCount = paths.length;
  const drawing = usePathSession((s) => s.draft !== null);
  const start = usePathSession((s) => s.start);
  const lookup = useCaseLookup();
  const busy = useRef(false);

  const stops = joinPinned(nodes, lookup);
  const count = stops?.length ?? pinnedInTimeOrder(nodes, lookup).length;
  const newWhy = drawing ? PATH_WORDS.tips.drawingBusy : pathCount >= MARK_LIMITS.pathsPerScenario ? PATH_WORDS.tips.limit : null;
  const why = newWhy ?? (stops === null ? PATH_WORDS.tips.joinUnderTwo : null);

  function begin(): void {
    if (newWhy !== null) return;
    start(nextPathName(paths));
  }

  async function press(): Promise<void> {
    if (why !== null || stops === null || busy.current) return;
    busy.current = true;
    try {
      await useMarksStore.getState().createPath(stops);
    } finally {
      busy.current = false;
    }
  }

  return (
    <div className="flex flex-col gap-1">
      <button
        type="button"
        aria-disabled={newWhy !== null}
        onClick={begin}
        {...tip([newWhy ?? PATH_WORDS.tips.newPath])}
        className={`${BUTTON}${newWhy === null ? " hover:bg-text/10" : ""}`}
        style={{ border: "1px solid var(--hairline)", color: newWhy === null ? "var(--text)" : "var(--text-faint)" }}
      >
        <span className="flex items-center gap-2">
          <MarkGlyph name="lens" />
          <span>{PATH_WORDS.labels.newPath}</span>
        </span>
      </button>
      <button
        type="button"
        aria-disabled={why !== null}
        onClick={() => void press()}
        {...tip([why ?? PATH_WORDS.tips.joinPinned])}
        className={`${BUTTON}${why === null ? " hover:bg-text/10" : ""}`}
        style={{ border: "1px solid var(--hairline)", color: why === null ? "var(--text)" : "var(--text-faint)" }}
      >
        <span>{PATH_WORDS.labels.joinPinned}</span>
        <span className="font-mono text-[10px] tabular-nums tracking-normal">{count}</span>
      </button>
    </div>
  );
}

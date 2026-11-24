// frontend/investigator/src/components/timeline/head/HeadClock.tsx
// The clock as plain words, for the folded bar: the playhead in the clock's own
// form, with the time left, seconds included, in its tooltip. It reads the playhead and nothing
// else; the noun for a node is an argument.
import { tip } from "../../ui/Tip";
import { foldedClockWords } from "../../../lib/tooltip-words/head";
import { remaining, when, when24 } from "../../../lib/time-words";
import { useClockForm } from "../../../store/clock-form";
import { usePlayhead } from "../../../store/playhead";

export interface HeadClockProps {
  /** The latest moment of the case, for the time left. */
  maxTime: number;
  /** The app's word for one node, as the tab's tooltip uses it. */
  noun: string;
}

export function HeadClock({ maxTime, noun }: HeadClockProps) {
  const playhead = usePlayhead((s) => s.playhead);
  const h24 = useClockForm((s) => s.h24);
  return (
    <span
      data-head-clock
      {...tip(foldedClockWords(remaining(maxTime - playhead), noun))}
      className="shrink-0 whitespace-nowrap font-mono text-[10px] text-text"
      style={{ fontVariantNumeric: "tabular-nums" }}
    >
      {h24 ? when24(playhead) : when(playhead)}
    </span>
  );
}

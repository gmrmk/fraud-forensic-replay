/**
 * Your marks: the block of the Notes menu (between "Add a note" and the notes) that lists the records
 * the investigator marked, pinned first, then by the record's time, a record with no time after those
 * with one, a record not in the data last. A row shows the lens, the disposition's glyph in its tone and
 * the pin, then the record's name; its second line holds the disposition word, the Fail category, the
 * note count and Pinned, whichever exist. A press selects the record (the playhead seeks and pauses, as
 * every navigate does) and opens the record's own window; a record with nothing to select (a place, or
 * one not in the data) opens its window alone.
 *
 * The block reads the investigator's marks through `useYourMarks`, and kind names from the manifest; it
 * holds no state of its own and writes nothing. With no marked record it draws nothing at all.
 *
 * What this file does not do: draw the record's window (another builder's), set a mark, or read a clock.
 */
import type { MouseEvent, ReactElement } from "react";
import type { RecordLookup } from "../notes/record-lookup";
import { DispositionGlyph, MARK_INK, MarkGlyph } from "../marks/glyphs";
import { tip } from "../ui/Tip";
import { popoutOpened } from "../../lib/window-focus";
import type { YourMark } from "../../lib/marks/select";
import { recordKey } from "../../lib/marks/types";
import { HEADING, ROW_TIP } from "../../lib/tooltip-words/your-marks";
import { openRecordWindow, useYourMarks } from "../../store/marks";
import { useNavigation } from "../../store/navigation";
import { useSchema } from "../../store/schema";
import { MID, markName, markParts } from "./your-marks";

const ROW =
  "flex h-[30px] w-full flex-col justify-center border border-panel-border-strong px-1.5 text-left hover:bg-text/10 outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-accent";

export function YourMarks({ lookup }: { lookup: RecordLookup }): ReactElement | null {
  const marks = useYourMarks(lookup);
  const nodes = useSchema((s) => s.nodes);

  if (marks.length === 0) return null;

  function press(e: MouseEvent<HTMLButtonElement>, m: YourMark): void {
    // A place has no time and a record not in the data has no match: neither is selected.
    if (m.info !== null && m.info.match.kind !== "place") useNavigation.getState().navigate(m.info.match);
    const id = openRecordWindow(m.record, lookup);
    if (id) popoutOpened(id, e.currentTarget);
  }

  return (
    <div className="flex flex-col gap-1">
      <h3 className="m-0 font-mono text-[9px] font-normal uppercase tracking-[0.14em] text-muted">{HEADING}</h3>
      <ul aria-label={HEADING} className="m-0 flex list-none flex-col gap-0.5 p-0">
        {marks.map((m) => {
          const name = markName(m, nodes);
          const parts = markParts(m);
          const d = m.node?.disposition ?? "none";
          return (
            <li key={recordKey(m.record)}>
              <button type="button" onClick={(e) => press(e, m)} {...tip([ROW_TIP, name, ...parts])} className={ROW}>
                <span className="flex items-center gap-1 font-mono text-[10px] leading-[13px] text-text">
                  <span className="inline-flex shrink-0" style={{ color: MARK_INK }}>
                    <MarkGlyph name="lens" />
                  </span>
                  {d !== "none" ? <DispositionGlyph disposition={d} /> : null}
                  {m.node?.pinned ? (
                    <span className="inline-flex shrink-0" style={{ color: MARK_INK }}>
                      <MarkGlyph name="pin" />
                    </span>
                  ) : null}
                  <span className="min-w-0 truncate">{name}</span>
                </span>
                {parts.length > 0 ? (
                  <span className="truncate font-mono text-[9px] leading-[11px] text-muted">{parts.join(` ${MID} `)}</span>
                ) : null}
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

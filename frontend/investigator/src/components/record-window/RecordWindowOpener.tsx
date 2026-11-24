// frontend/investigator/src/components/record-window/RecordWindowOpener.tsx
// The lens button in the Inspector's header: it opens the selected record's own window (or raises the
// one already open). It shows for every selected record, marked or not, and for no selected note. The
// lens is faint while the record has no window open and in the text colour while it has.
//
// What this file does not do: a press writes nothing to the marks store, moves no playhead and selects
// nothing. It opens the window through `openRecordWindow`, the one opener, with the lookup the
// Inspector can build (the pivot data plus the selected place).
import { linkFromSelected } from "../notes/record-lookup";
import { BUTTON_GLYPH_PX, MarkGlyph } from "../marks/glyphs";
import { tip } from "../ui/Tip";
import { canonicalKind, sameRecord } from "../../lib/marks/types";
import { popoutOpened } from "../../lib/window-focus";
import { OPENER } from "../../lib/tooltip-words/record-window";
import { openRecordWindow } from "../../store/marks";
import { useNotesStore } from "../../store/notes";
import { usePivotStore } from "../../store/pivot";
import { useSelection } from "../../store/selection";
import { inspectorLookup } from "./record-window";

const CLASS =
  "flex h-[18px] w-[18px] items-center justify-center hover:bg-text/5 disabled:opacity-40 outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-accent";

export function RecordWindowOpener() {
  const selected = useSelection((s) => s.selected);
  const scenario = useNotesStore((s) => s.scenario);
  const windows = usePivotStore((s) => s.windows);
  const link = linkFromSelected(selected);
  if (link === null) return null;
  // A fraud transaction is selected as "fraud" and stored as "auth": the record is canonical from here on.
  const record = { kind: canonicalKind(link.kind), id: link.id };
  const open = windows.some((w) => w.kind === "record" && sameRecord(w.record, record));
  return (
    <button
      type="button"
      aria-label={OPENER.name}
      disabled={scenario === null}
      onClick={(e) => {
        const id = openRecordWindow(record, inspectorLookup(selected));
        if (id) popoutOpened(id, e.currentTarget);
      }}
      {...tip([OPENER.tip])}
      className={CLASS}
      style={{ color: open ? "var(--text)" : "var(--text-faint)" }}
    >
      <MarkGlyph name="lens" size={BUTTON_GLYPH_PX} />
    </button>
  );
}

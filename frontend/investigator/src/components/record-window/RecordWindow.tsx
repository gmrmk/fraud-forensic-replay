// frontend/investigator/src/components/record-window/RecordWindow.tsx
// The record's own window: the existing window frame (square, at most 300 px wide, with the foot cue)
// holding, top to bottom, the record's name, the three buttons PASS, FAIL and WAITING, the Fail
// category row while the mark is FAIL, the record's notes as rows with Add a note, and a status line
// for a refused press. The frame's pin button is the record's pin. Its spine, title and dog-ear take the
// colour of the record's kind.
//
// The window reads the record's node and notes from the stores and writes only through the marks
// store's own door (`pressDisposition`, `togglePin`). It holds one piece of state of its own: whether a
// press waits, and the line a refusal left. Limits: a refused pin press shows nothing (the pin keeps
// the state the store holds); the Fail category row (`CategoryList`) keeps its own refusal line.
// It reads no clock and no browser storage; the playhead is read only by `RecordNotes` for a new note.
import { useState } from "react";
import { WindowFrame } from "../pivot/WindowFrame";
import type { RecordLookup } from "../notes/record-lookup";
import { MISSING, PIN, WINDOW_TITLE } from "../../lib/tooltip-words/record-window";
import type { SetDisposition } from "../../lib/marks/types";
import { useRecordNode, useMarksStore } from "../../store/marks";
import type { RecordWindowState } from "../../store/pivot";
import { useSchema } from "../../store/schema";
import { useTheme } from "../../store/theme";
import { CategoryList } from "./CategoryList";
import { DispositionButtons } from "./DispositionButtons";
import { RecordNotes } from "./RecordNotes";
import { PIN_CONTRAST, kindLabelOf, recordAccent, recordColourKind, statusWord, windowInk } from "./record-window";
import { windowKindColours } from "../../lib/window-ink";
import { useStoryInk } from "../../store/kind-ink";

interface Props {
  window: RecordWindowState;
  lookup: RecordLookup;
  /** The projected spot of a tethered window, given by the layer. */
  screenPos?: { x: number; y: number };
  /** The record is ahead of the playhead: the frame dims. */
  dimmed?: boolean;
  onDragTo?: (x: number, y: number) => void;
  /** Unused: a record window has no flag control. Given by the layer with the other props. */
  onToggleFlag?: () => void;
}

export function RecordWindow({ window: w, lookup, screenPos, dimmed, onDragTo }: Props) {
  const record = w.record;
  const info = lookup(record);
  const nodes = useSchema((s) => s.nodes);
  const node = useRecordNode(record);
  const pressDisposition = useMarksStore((s) => s.pressDisposition);
  const togglePin = useMarksStore((s) => s.togglePin);
  const theme = useTheme((s) => s.theme);
  const color = useTheme((s) => s.color);
  const ink = useStoryInk();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  // The pin shown is the node's: the record's pin is the one truth, and the window's own `pinned`
  // (kept equal by the layer) is a copy that only decides which windows a glance may replace.
  const pinned = node?.pinned ?? false;
  const pos = screenPos ?? (w.anchor.type === "screen" ? { x: w.anchor.x, y: w.anchor.y } : { x: 0, y: 0 });
  const kc = windowKindColours(recordColourKind(info, record), theme, color, ink, recordAccent(info, record));
  const accent = kc.line;
  const first = info ? `${kindLabelOf(record.kind, nodes)}: ${info.headline}` : MISSING;

  async function press(d: SetDisposition): Promise<void> {
    setBusy(true);
    setMessage(null);
    const r = await pressDisposition(record, d);
    setBusy(false);
    if (!r.ok) setMessage(statusWord(r.code));
  }

  return (
    <WindowFrame
      id={w.id}
      title={WINDOW_TITLE(record.id)}
      anchorScreen={pos}
      z={w.z}
      accent={accent}
      titleColor={kc.title}
      pinColor={windowInk(accent, theme, color, PIN_CONTRAST)}
      pinned={pinned}
      collapsed={w.collapsed}
      flagged={w.anchor.type === "node"}
      canFlag={false}
      dimmed={dimmed}
      onDragTo={onDragTo}
      onTogglePin={() => void togglePin(record)}
      pinWords={pinned ? PIN.pinned : PIN.unpinned}
      wide
      square
      footCue
    >
      <div className="flex w-[274px] max-w-full flex-col gap-2 pt-1.5 font-mono text-[10px] text-text">
        <div className="break-words leading-[14px]">{first}</div>
        <DispositionButtons value={node?.disposition ?? "none"} busy={busy} onPress={(d) => void press(d)} />
        {node?.disposition === "fail" ? <CategoryList record={record} value={node.category} /> : null}
        <RecordNotes record={record} lookup={lookup} />
        <div role="status" aria-live="polite" className="min-h-[13px] text-[9px] leading-[13px] text-muted">
          {message ?? ""}
        </div>
      </div>
    </WindowFrame>
  );
}

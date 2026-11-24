/**
 * The Inspector's renderer for a selected note (design section 7): the entity rows, read-only,
 * with the button "Edit the note." App registers it with
 * `entityRendererRegistry.set("note", { inspectorBody: noteInspectorBody })` (the next piece);
 * `noteInspectorBody` is in noteInspectorBody.ts, so that this file exports a component only.
 *
 * An entity's `fields` are an unknown record, so every value is checked again before it is drawn:
 * the id, the category, the decision, the link and the body. A value that fails is not drawn.
 */
import { InspectorField } from "../inspector/InspectorField";
import { NoteBody } from "./NoteBody";
import { openSavedNote } from "./open-note";
import { useNotesStore } from "../../store/notes";
import { useClockForm } from "../../store/clock-form";
import { when, when24 } from "../../lib/time-words";
import type { Entity } from "../../lib/entity";
import { noteToEntity } from "../../lib/notes/entity";
import { checkCategoryName } from "../../lib/notes/categories";
import { checkBody, checkLink, isNoteId } from "../../lib/notes/schema";
import { BUTTONS, DECISION, INSPECTOR_ROWS } from "../../lib/tooltip-words/notes";
import { tip } from "../ui/Tip";

const isDecision = (v: unknown): v is "pass" | "fail" | "none" => v === "pass" || v === "fail" || v === "none";

export function NoteInspector({ entity }: { entity: Entity }) {
  const h24 = useClockForm((s) => s.h24);
  const id = isNoteId(entity.id) ? entity.id : null;
  // The note as the store holds it now: an edit saved in the note's window shows here at once. The copy in the
  // selection is drawn only when the note is no longer in the store.
  const live = useNotesStore((s) => (id === null ? undefined : s.notes.find((n) => n.id === id)));
  const exists = live !== undefined;
  const shown = live ? noteToEntity(live, () => null) : entity;
  const f = shown.fields;
  const category = checkCategoryName(f.category);
  const decision = isDecision(f.decision) ? f.decision : null;
  const link = f.link_kind === null && f.link_id === null ? null : checkLink({ kind: f.link_kind, id: f.link_id });
  const body = checkBody(f.body);
  const timestamp = Number.isSafeInteger(shown.timestamp) ? shown.timestamp : null;

  return (
    <div data-note-inspector className="flex flex-col gap-1.5 font-mono text-[10px] text-text">
      <div className="text-[9px] uppercase tracking-[0.16em] text-muted">{INSPECTOR_ROWS.title}</div>
      {category.ok ? <InspectorField label={INSPECTOR_ROWS.category} field="category" value={category.value} /> : null}
      {/* D6: a linked note shares its record's mark, so only a note with no record shows a PASS or FAIL of its own. */}
      {decision && link === null ? <InspectorField label={INSPECTOR_ROWS.decision} field="decision" value={DECISION.choices[decision].name} /> : null}
      {timestamp !== null ? <InspectorField label={INSPECTOR_ROWS.time} field="timestamp" value={(h24 ? when24 : when)(timestamp)} /> : null}
      {link && link.ok && link.value ? <InspectorField label={INSPECTOR_ROWS.link} field="link_id" value={`${link.value.kind}: ${link.value.id}`} /> : null}
      {body.ok && body.value.content.length > 0 ? (
        <div>
          <div className="mb-0.5 text-[9px] uppercase tracking-[0.16em] text-muted">{INSPECTOR_ROWS.body}</div>
          <div className="[&_p]:my-0 [&_ul]:my-0.5 [&_ul]:list-disc [&_ul]:pl-4 [&_ol]:my-0.5 [&_ol]:list-decimal [&_ol]:pl-4 [&_blockquote]:my-0.5 [&_blockquote]:border-l-2 [&_blockquote]:border-panel-border-strong [&_blockquote]:pl-2 [&_blockquote]:text-muted">
            <NoteBody body={body.value} />
          </div>
        </div>
      ) : null}
      <button
        type="button"
        disabled={!exists}
        {...tip([BUTTONS.edit])}
        onClick={() => {
          const note = useNotesStore.getState().notes.find((n) => n.id === id);
          if (note) openSavedNote(note, null);
        }}
        className="h-6 self-start rounded-sm border border-panel-border-strong px-2 font-mono text-[9px] uppercase tracking-[0.14em] text-text outline-none hover:bg-text/10 focus-visible:ring-1 focus-visible:ring-signal disabled:opacity-40"
      >
        {BUTTONS.edit}
      </button>
    </div>
  );
}


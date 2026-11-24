/**
 * The page's wiring of notes, in one hook (App.tsx calls it and holds no other notes logic):
 *  1. the transport is chosen by the build and given to the store;
 *  2. the scenario's notes, then its marks (nodes, paths, Fail categories), load once the scenario is known,
 *     and then the PASS or FAIL that notes saved moves to their records;
 *  3. the Inspector gets its read-only renderer for the kind "note";
 *  4. on the static site, the page asks before it unloads while notes or marks are not in a file.
 * The effects run in this order, so the backing is set before the first load.
 */
import { useEffect } from "react";
import { startNotesTransport } from "./session";
import { armUnloadPrompt, marksOf } from "./unsaved";
import { noteInspectorBody } from "../../components/notes/noteInspectorBody";
import { IS_STATIC_BUILD } from "../build-flags";
import { entityRendererRegistry } from "../entity";
import { useMarksStore } from "../../store/marks";
import { useNotesStore } from "../../store/notes";
import { useSchema } from "../../store/schema";

export function useNotesBoot(): void {
  const scenarioId = useSchema((s) => s.scenarioId);

  useEffect(() => {
    startNotesTransport(IS_STATIC_BUILD);
    return armUnloadPrompt({
      isStatic: IS_STATIC_BUILD,
      getNotes: () => useNotesStore.getState().notes,
      getMarks: () => marksOf(useMarksStore.getState()),
    });
  }, []);

  useEffect(() => {
    if (scenarioId === null) return;
    // The notes, then the marks of the same story; when both answered, the PASS or FAIL that notes saved
    // before moves to their records (D6). The move runs on every load: a record it already handled is
    // settled, so it writes that record no more.
    void (async () => {
      const notes = await useNotesStore.getState().load(scenarioId);
      const marks = await useMarksStore.getState().load(scenarioId);
      if (notes.ok && marks.ok) await useMarksStore.getState().moveSavedMarks(useNotesStore.getState().notes);
    })();
  }, [scenarioId]);

  useEffect(() => {
    entityRendererRegistry.set("note", { inspectorBody: noteInspectorBody });
    return () => void entityRendererRegistry.delete("note");
  }, []);
}

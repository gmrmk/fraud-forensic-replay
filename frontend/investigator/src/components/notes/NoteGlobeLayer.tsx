/**
 * The globe layer of marks. The investigator's mark of each marked record is drawn at the record's
 * place by `GlobeMarks` (the ring round the dot and the plate, or the plate alone); a note adds to its
 * record's count and no longer draws a square of its own. A note with no link shows on the Timeline
 * only; a record that is not in the data, or has no place, draws no marker.
 *
 * The layer keeps its name, export and props for its mount in App.tsx (the lookup is the app's, built
 * from the whole case).
 */
import type maplibregl from "maplibre-gl";
import { GlobeMarks } from "../marks/GlobeMarks";
import type { RecordLookup } from "./record-lookup";

export function NoteGlobeLayer({ map, lookup }: { map: maplibregl.Map | null; lookup: RecordLookup }) {
  return <GlobeMarks map={map} lookup={lookup} />;
}

// frontend/investigator/src/components/inspector/SharedValuesSection.tsx
// The last section of a manifest record's Inspector body: one row for each kind that holds other records
// with the same value in a field the record's kind declares pivotable, and one row for each decision that
// names the record as an event. A row says which kind, which field, and how many of those records the
// playhead has reached out of all of them; a press on a value row opens Matches for that field and value,
// and a press on a decision row opens the decision. Which rows exist comes from lib/shared-values.ts;
// this file reads the stores and draws them, and names no field and no kind of a pack.
//
// The section folds through InspectorSection: folded, it keeps its first row's text (kind, field, count).
// It keeps no state of its own and prints no line under a value: each row is one line, so nothing here
// takes a `secondary` prop.
import { useMemo } from "react";
import type { MouseEvent } from "react";
import { InspectorSection } from "./InspectorSection";
import { FieldIcon, KindIcon } from "./LibraryIcon";
import { Eyebrow } from "../ui";
import { tip } from "../ui/Tip";
import { useOnMenu } from "../LayerRow";
import type { Entity } from "../../lib/entity";
import type { PivotContext } from "../../lib/matches";
import { drawCounts } from "../../lib/marks/draw";
import { sharedRows, type SharedRow } from "../../lib/shared-values";
import {
  SHARED_VALUES,
  sharedDecisionWords,
  sharedRowName,
  sharedRowWords,
} from "../../lib/tooltip-words/inspector";
import type { TimeForm } from "../../lib/time-words";
import { useClockForm } from "../../store/clock-form";
import { useStoryInk } from "../../store/kind-ink";
import { useDrawInputs } from "../../store/marks";
import { useMatches } from "../../store/matches";
import { useNavigation } from "../../store/navigation";
import { usePivotData } from "../../store/pivot-data";
import { useSchema } from "../../store/schema";

const ROW_CLASS =
  "flex h-6 w-full items-center gap-2 px-3 text-left transition-colors hover:bg-text/10 focus:outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-accent";

export function SharedValuesSection({ entity }: { entity: Entity }) {
  const nodes = useSchema((s) => s.nodes);
  const transactions = usePivotData((s) => s.transactions);
  const logins = usePivotData((s) => s.logins);
  const accountEvents = usePivotData((s) => s.accountEvents);
  const transfers = usePivotData((s) => s.transfers);
  const entities = usePivotData((s) => s.entities);
  // The one function's inputs (the Layers switches, the playhead, whether its bounds have loaded): the
  // counts below are the Layers menu's, so a figure here agrees with the row there.
  const drawInputs = useDrawInputs();
  const openMatches = useMatches((s) => s.open);
  const navigate = useNavigation((s) => s.navigate);
  const form: TimeForm = useClockForm((s) => s.h24) ? "24h" : "12h";
  const onMenu = useOnMenu();
  const ink = useStoryInk();

  // Places are not matched by any pivot, so the context carries none (the same as the Inspector's other
  // rows that resolve a record).
  const rows = useMemo(() => {
    const context: PivotContext = { transactions, logins, places: [], accountEvents, transfers, entities };
    return sharedRows(entity, nodes, context);
  }, [entity, nodes, transactions, logins, accountEvents, transfers, entities]);

  if (rows.length === 0) return null;

  // A press on a decision selects it, pauses the playhead and flies the camera (navigate), as every other
  // record link does. Inside the Inspector the scroll then returns to the top and focus goes to the panel,
  // since the pressed row leaves with the record it was in; both are read first, while the row is still
  // in them.
  const press = (event: MouseEvent<HTMLButtonElement>, row: SharedRow) => {
    if (row.open.type === "matches") {
      openMatches(row.open.field, row.open.value);
      return;
    }
    const panel = event.currentTarget.closest<HTMLElement>('aside[aria-label="Inspector"]');
    const scroller = event.currentTarget.closest<HTMLElement>("[data-inspector-scroll]");
    navigate(row.open.match);
    if (!panel) return;
    if (scroller) scroller.scrollTop = 0;
    panel.focus();
  };

  // The one place the counts are made: one figure per row (the members the switches show and the playhead
  // has reached), used by the row and by the folded line.
  const counts = rows.map((row) => drawCounts(row.members, drawInputs).reached);
  // The folded line is the first row as its button prints it: kind, field, "reached / total".
  const foldSummary = `${rows[0].kindLabel} ${rows[0].fieldLabel} ${counts[0]} / ${rows[0].members.length}`;

  return (
    <InspectorSection title={SHARED_VALUES} foldSummary={foldSummary}>
      <div className="-mx-3">
        {rows.map((row, i) => {
          const reached = counts[i];
          const total = row.members.length;
          const lines =
            row.open.type === "matches"
              ? sharedRowWords(row.kindLabel, row.fieldLabel, row.value, reached, total)
              : sharedDecisionWords(
                  row.kindLabel,
                  row.fieldLabel,
                  row.value,
                  row.members[0].id,
                  row.members[0].timestamp > 0 ? row.members[0].timestamp : null,
                  form,
                );
          return (
            <button
              type="button"
              key={row.key}
              aria-label={sharedRowName(row.kindLabel, row.fieldLabel, reached, total)}
              {...tip(lines)}
              onClick={(e) => press(e, row)}
              className={ROW_CLASS}
            >
              <KindIcon
                kind={row.kind}
                className="forced-color-adjust-none"
                style={row.palette === "" ? undefined : { color: ink.get(row.kind)?.mark ?? onMenu(row.palette) }}
              />
              <FieldIcon field={row.field} className="text-[color:var(--text-faint-on-inspector)]" />
              <Eyebrow size="xs" tone="text" className="shrink-0">
                {row.kindLabel}
              </Eyebrow>
              <span className="min-w-0 flex-1 truncate font-mono text-[10px] text-[color:var(--text-faint-on-inspector)]">
                {row.fieldLabel}
              </span>
              <span className="shrink-0 font-mono text-[10px] tabular-nums text-muted">
                {reached} / {total}
              </span>
            </button>
          );
        })}
      </div>
    </InspectorSection>
  );
}

/**
 * A decision's notes, read through the node's mapping: the capsule the investigator saw on the map,
 * then who decided and when, in replay time, then the note itself.
 */
import { InspectorField } from "../inspector/InspectorField";
import { VerdictCapsule } from "./VerdictCapsule";
import { decisionOf, statusAddsInformation } from "../../lib/verdicts";
import { formatHoustonDateTime } from "../../lib/houston-day";
import type { Entity } from "../../lib/entity";
import type { ScenarioNode } from "../../lib/scenarios";

const SECTION_LABEL = "font-mono text-[9px] text-[color:var(--text-faint)] tracking-[0.18em] uppercase mt-2";
const At = ({ raw }: { raw: string }) => <span title={raw}>{formatHoustonDateTime(raw)}</span>;

export function NotesBody({ entity, node }: { entity: Entity; node: ScenarioNode }) {
  const d = decisionOf(entity, node);
  if (d) {
    return (
      <div>
        <div className="flex items-center gap-2 mb-1">
          <VerdictCapsule segments={[{ word: d.word, tone: d.tone, count: 1 }]} />
          {statusAddsInformation(d.word, d.status) && (
            <span className="font-mono text-[9px] text-[color:var(--text-faint)] tracking-[0.18em] uppercase">{d.status}</span>
          )}
        </div>
        <InspectorField label="Target" value={d.target} />
        <InspectorField label="Decided by" value={d.actor} />
        <InspectorField label="Decided at" value={<At raw={d.atRaw} />} />
        <div className={SECTION_LABEL}>Note</div>
        <p className="font-mono text-[10px] leading-snug text-[color:var(--text)] whitespace-pre-wrap">{d.note}</p>
      </div>
    );
  }
  return <div className="font-mono text-[10px] text-[color:var(--text-faint)]">This scenario has no notes.</div>;
}

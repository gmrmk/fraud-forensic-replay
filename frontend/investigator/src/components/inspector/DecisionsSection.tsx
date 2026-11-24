import { useDecisionData } from "../../store/decision-data";
import { useSelection } from "../../store/selection";
import { useMatches } from "../../store/matches";
import { usePivotData } from "../../store/pivot-data";
import { DecisionPill } from "../DecisionPill";
import { InspectorSection } from "./InspectorSection";
import type { Decision } from "../../lib/decisions";
import type { SelectedEntity } from "../../types";

/** The selected entity's raw id, for trigger-relevance ordering. */
function selectedEntityId(selected: SelectedEntity | null): string | null {
  if (!selected) return null;
  switch (selected.kind) {
    case "login": return selected.login.id;
    case "place": return selected.place.id;
    case "account_event": return selected.event.id;
    case "transfer": return selected.transfer.id;
    case "entity": return selected.entity.id;
    default: return selected.tx.id;
  }
}

/** The selected entity's session thread, if its kind carries one. */
function selectedSessionId(selected: SelectedEntity | null): string | null {
  if (!selected) return null;
  switch (selected.kind) {
    case "login": return selected.login.session_id;
    case "account_event": return selected.event.session_id;
    case "transfer": return selected.transfer.session_id;
    default: return null;
  }
}

/**
 * DECISIONS - the only decision affordance in the app (user-ratified
 * 2026-06-11: floating globe badges removed). One DecisionPill per
 * playhead-reached rule, with a ×N chip for repeat triggers; click opens the
 * Matches window in rule mode on the group's lead decision.
 *
 * Relevance gate (2026-06-11 triage fix): the section renders only when at
 * least one decision is RELEVANT to the inspected entity - the entity is a
 * trigger, or shares a session thread with one. An ordinary baseline auth no
 * longer leads with the case verdict, so the entity's own detail (the
 * PROFILE CHANGE story) stays first. Relevant pills render full strength;
 * the case's other reached decisions ride along dimmed for context.
 */
export function DecisionsSection() {
  const reached = useDecisionData((s) => s.reached);
  const selected = useSelection((s) => s.selected);
  const openRule = useMatches((s) => s.openRule);
  const logins = usePivotData((s) => s.logins);
  const accountEvents = usePivotData((s) => s.accountEvents);
  const transfers = usePivotData((s) => s.transfers);

  if (reached.length === 0) return null;

  const selectedId = selectedEntityId(selected);
  const sessionId = selectedSessionId(selected);

  const triggerSession = (triggerId: string): string | null =>
    logins.find((l) => l.id === triggerId)?.session_id ??
    accountEvents.find((e) => e.id === triggerId)?.session_id ??
    transfers.find((t) => t.id === triggerId)?.session_id ??
    null;

  const isRelevant = (d: Decision): boolean => {
    if (selectedId && d.triggerEntityIds.includes(selectedId)) return true;
    if (sessionId) return d.triggerEntityIds.some((id) => triggerSession(id) === sessionId);
    return false;
  };

  // No selection (not reachable via Inspector, but safe): show the case's
  // reached decisions. With a selection, gate on relevance.
  if (selectedId && !reached.some(isRelevant)) return null;

  const relevance = (d: Decision) => (isRelevant(d) || !selectedId ? 0 : 1);
  const ordered = [...reached].sort(
    (a, b) => relevance(a) - relevance(b) || b.severity - a.severity,
  );
  const groups = new Map<string, Decision[]>();
  for (const d of ordered) {
    const g = groups.get(d.rule.id);
    if (g) g.push(d);
    else groups.set(d.rule.id, [d]);
  }
  const maxSeverity = (g: Decision[]) => Math.max(...g.map((d) => d.severity));
  const rows = [...groups.values()].sort(
    (a, b) => relevance(a[0]) - relevance(b[0]) || maxSeverity(b) - maxSeverity(a),
  );

  return (
    <InspectorSection title="Decisions" data-eyes="INS-03">
      {/* One chip per line, as the board draws variant B: inline, a rule read as a divider
          between two chips. 10 px apart, the 15.75 px chips sit 25.75 px centre to centre,
          above the 24 px spacing WCAG 2.5.8 allows for a target under 24 px (8 px gave 23.75). */}
      <div className="flex flex-col items-start gap-2.5 py-1">
        {rows.map(([head, ...rest]) => (
          <span key={head.rule.id} className="inline-flex items-center gap-1">
            <DecisionPill
              decision={head}
              emphasized={relevance(head) === 0}
              onClick={() => openRule(head.id)}
            />
            {rest.length > 0 && (
              <span
                className="font-mono tabular-nums"
                style={{ fontSize: 9, color: "var(--text-muted)", letterSpacing: ".05em" }}
              >
                ×{rest.length + 1}
              </span>
            )}
          </span>
        ))}
      </div>
    </InspectorSection>
  );
}

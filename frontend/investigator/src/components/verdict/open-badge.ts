/** Activating a badge, shared by the globe layer and the timeline rail so the two cannot drift:
 *  one decision opens its notes, one queued event opens the rule that queued it, several open the
 *  pile's list, tethered at the pile's spot. */
import { NOTES_VIEW } from "./tone-style";
import { pileLabel, queuedEventId } from "./badge-sources";
import { popoutOpened } from "../../lib/window-focus";
import { usePivotStore } from "../../store/pivot";
import { useMatches } from "../../store/matches";
import { useDecisionData } from "../../store/decision-data";
import type { Decision } from "../../lib/decisions";
import type { Pile } from "../../lib/verdict-piles";
import type { ScenarioNode } from "../../lib/scenarios";

/** The reached rule decision that queued an event. */
export const queuingDecision = (eventId: string): Decision | undefined =>
  useDecisionData.getState().reached.find((r) => queuedEventId(r) === eventId);

export function openBadge(pile: Pile, trigger: HTMLElement, nodes: readonly ScenarioNode[]): void {
  const { openPopout } = usePivotStore.getState();
  const spot = pile.anchor.lngLat;
  const one = pile.members.length === 1 ? pile.members[0] : null;
  if (one && pile.family === "queue") {
    const rule = queuingDecision(one.entity.id);
    if (rule) useMatches.getState().openRule(rule.id);
    return;
  }
  const node = one ? nodes.find((n) => n.kind === one.entity.kind) : undefined;
  const id = one && node
    ? openPopout(one.entity, NOTES_VIEW, spot)
    : openPopout(
        pile.anchor.entity,
        { type: "pile", label: pileLabel(pile), memberIds: pile.members.map((m) => m.entity.id) },
        spot,
      );
  if (id) popoutOpened(id, trigger);
}

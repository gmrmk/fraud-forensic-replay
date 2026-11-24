/** The records piled at one spot, one row each, in the order given (the layers pass time order).
 *  A decision row opens that decision's notes, tethered at the pile's spot; a queued event's row
 *  opens the rule that queued it. */
import { Fragment, type ReactNode } from "react";
import { VerdictCapsule } from "./VerdictCapsule";
import { QueueFlag } from "./QueueFlag";
import { NOTES_VIEW } from "./tone-style";
import { queuedEventId } from "./badge-sources";
import { decisionOf, rawTime } from "../../lib/verdicts";
import { formatHoustonDateTime } from "../../lib/houston-day";
import { popoutOpened } from "../../lib/window-focus";
import { usePivotStore } from "../../store/pivot";
import { useSchema } from "../../store/schema";
import { useMatches } from "../../store/matches";
import { useDecisionData } from "../../store/decision-data";
import type { Entity } from "../../lib/entity";

interface Props {
  memberIds: readonly string[];
  byKind: Record<string, readonly Entity[]>;
  at?: { lng: number; lat: number };
}

interface Row {
  e: Entity;
  badge: ReactNode;
  /** The mark's own text: a decision's word, or the label of the rule that queued the event. */
  mark: string;
  label: string;
  atRaw: string;
  action: string;
  family: "decision" | "queue";
  open: (trigger: HTMLElement) => void;
}

/** The label of a pile whose rows all name the same thing: shown once above the list, and each row
 *  omits it. Needs two or more rows, a non-empty label, and one family (all decisions or all queued
 *  events); otherwise null and every row keeps its own. */
function sharedLabel(rows: readonly Row[]): string | null {
  const [first] = rows;
  const same = rows.length >= 2 && first.label !== "" && rows.every((r) => r.family === first.family && r.label === first.label);
  return same ? first.label : null;
}

/** A pile of queued events, listed under one flag per rule in the order each rule first appears; the
 *  rows keep the given order within a rule and carry no flag of their own (the same long flag in
 *  every row left no room for the event labels). Needs two or more rows, all queued events;
 *  otherwise null and every row keeps its own mark. */
function ruleGroups(rows: readonly Row[]): { rule: string; rows: Row[] }[] | null {
  if (rows.length < 2 || !rows.every((r) => r.family === "queue")) return null;
  const groups = new Map<string, Row[]>();
  for (const r of rows) {
    const g = groups.get(r.mark);
    if (g) g.push(r);
    else groups.set(r.mark, [r]);
  }
  return [...groups].map(([rule, rs]) => ({ rule, rows: rs }));
}

export function PileBody({ memberIds, byKind, at }: Props) {
  const nodes = useSchema((s) => s.nodes);
  const openPopout = usePivotStore((s) => s.openPopout);
  const openRule = useMatches((s) => s.openRule);
  const queued = useDecisionData((s) => s.reached);
  const all = new Map(Object.values(byKind).flat().map((e) => [e.id, e]));
  const rows = memberIds.flatMap((id): Row[] => {
    const e = all.get(id);
    const node = e && nodes.find((n) => n.kind === e.kind);
    if (!e || !node) return [];
    const d = decisionOf(e, node);
    if (d) {
      const badge = <VerdictCapsule segments={[{ word: d.word, tone: d.tone, count: 1 }]} />;
      const open = (trigger: HTMLElement) => {
        const w = openPopout(e, NOTES_VIEW, at);
        if (w) popoutOpened(w, trigger);
      };
      return [{ e, badge, mark: d.word, label: d.target, atRaw: d.atRaw, action: "Open notes", family: "decision", open }];
    }
    const rule = queued.find((r) => queuedEventId(r) === e.id);
    if (!rule) return [];
    const badge = <QueueFlag text={rule.rule.label} />;
    return [{ e, badge, mark: rule.rule.label, label: e.displayMetadata.primaryLabel, atRaw: rawTime(e, node), action: "Open rule", family: "queue", open: () => openRule(rule.id) }];
  });
  const shared = sharedLabel(rows);
  const groups = ruleGroups(rows);
  const list = (items: readonly Row[], withMark: boolean) => (
    <ul className="divide-y divide-panel-border">
      {items.map(({ e, badge, label, atRaw, action, open }) => (
        <li key={e.id}>
          {/* flex-wrap and the label's 3rem floor: a mark too long to leave the label room wraps
              the label to a second line instead of squeezing it to nothing. */}
          <button
            type="button"
            className="flex w-full flex-wrap items-center gap-x-2 gap-y-1 py-1 text-left hover:bg-text/5 focus:outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-accent"
            aria-label={`${action}: ${label}`}
            onClick={(ev) => open(ev.currentTarget)}
          >
            {withMark && badge}
            {shared === null && <span className="min-w-[3rem] flex-1 truncate font-mono text-[10px] text-[color:var(--text)]">{label}</span>}
            <span className="ml-auto shrink-0 font-mono text-[9px] text-[color:var(--text-faint)]" title={atRaw}>{formatHoustonDateTime(atRaw)}</span>
          </button>
        </li>
      ))}
    </ul>
  );
  return (
    <>
      {shared !== null && <div className="font-mono text-[10px] text-[color:var(--text)] truncate py-1">{shared}</div>}
      {groups === null
        ? list(rows, true)
        : groups.map((g) => (
            <Fragment key={g.rule}>
              <div className="py-1"><QueueFlag text={g.rule} /></div>
              {list(g.rows, false)}
            </Fragment>
          ))}
    </>
  );
}

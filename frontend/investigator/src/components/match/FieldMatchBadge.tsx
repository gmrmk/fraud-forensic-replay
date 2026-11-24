/**
 * FieldMatchBadge - a MatchBadge that works out its own count and tone from the
 * loaded data, for callers holding only a (field, value): a decision input tagged
 * with its pivot column, the Inspector's Terminal row.
 *
 * terminal_id is the one cross-card field: once useTerminalRows holds the terminal's
 * rows the count covers every card, not just the focal case. `prefetch` asks for
 * those rows on mount (a decision trace is an explicit open); without it the badge
 * reads whatever is already loaded and the fetch waits for the user to open the matches.
 */
import { useEffect } from "react";
import { MatchBadge } from "./MatchBadge";
import { useTerminalRows } from "./terminal-rows";
import { matchBaseline, relatedEntities, withExtraTransactions } from "../../lib/matches";
import type { MatchableField, PivotContext } from "../../lib/matches";

interface Props {
  field: MatchableField;
  value: string;
  context: PivotContext;
  prefetch?: boolean;
}

export function FieldMatchBadge({ field, value, context, prefetch = false }: Props) {
  const crossCard = field === "terminal_id";
  const extra = useTerminalRows((s) => (crossCard ? s.rows[value] : undefined));
  const load = useTerminalRows((s) => s.load);
  useEffect(() => {
    if (crossCard && prefetch) load(value);
  }, [crossCard, prefetch, value, load]);

  if (value === "") return null; // no terminal / no value is not a group to match
  const ctx = extra ? withExtraTransactions(context, extra) : context;
  return (
    <MatchBadge
      field={field}
      value={value}
      count={relatedEntities(field, value, ctx).length}
      baseline={matchBaseline(field, value, ctx)}
    />
  );
}

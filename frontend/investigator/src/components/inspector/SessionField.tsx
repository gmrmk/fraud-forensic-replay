import { useMemo } from "react";
import { InspectorField } from "./InspectorField";
import { useSessionFilter } from "../../store/session-filter";
import { useMatches } from "../../store/matches";
import { usePivotData } from "../../store/pivot-data";
import { sessionMatchStats } from "../../lib/matches";
import { MatchBadge } from "../match/MatchBadge";

interface Props {
  sessionId: string | null;
}

/**
 * The "Session" inspector row, shared across every behavioral inspector
 * (login / transfer / account_event). One source of truth for the
 * session-thread toggle: the label, the accent styling, the clip-safe focus
 * ring, the aria-pressed semantics, and the store wiring all live here. A new
 * behavioral entity kind with a session_id renders <SessionField sessionId=
 * {e.session_id} /> - one line, not a fourth copy-paste of the button. A null
 * session shows a hyphen and never threads. (Extracted 2026-06-11 from the
 * three inspectors after a review swarm flagged the verbatim triplication.)
 *
 * The session thread is ONE state (user-ratified 2026-06-11): clicking the
 * value or the xN badge opens the Matches window scoped to the thread AND
 * engages the timeline filter together; the window's x clears both. Counts
 * come from usePivotData (App-fed), not props, so the one-line usage
 * contract above survives.
 */
export function SessionField({ sessionId }: Props) {
  const selectedSessionId = useSessionFilter((s) => s.selectedSessionId);
  const openMatches = useMatches((s) => s.open);
  const closeMatches = useMatches((s) => s.close);
  const logins = usePivotData((s) => s.logins);
  const accountEvents = usePivotData((s) => s.accountEvents);
  const transfers = usePivotData((s) => s.transfers);
  const isSessionActive = selectedSessionId === sessionId;

  const stats = useMemo(
    () =>
      sessionId
        ? sessionMatchStats(sessionId, { logins, accountEvents, transfers })
        : { count: 0, baseline: 0 },
    [sessionId, logins, accountEvents, transfers],
  );

  return (
    <InspectorField
      label="Session"
      field="session_id"
      value={
        sessionId ? (
          <>
            <button
              type="button"
              onClick={() =>
                isSessionActive ? closeMatches() : openMatches("session_id", sessionId)
              }
              aria-pressed={isSessionActive}
              aria-label={
                isSessionActive
                  ? `Close session thread ${sessionId}`
                  : `Open session thread ${sessionId}`
              }
              title={
                isSessionActive
                  ? `Close session thread ${sessionId}`
                  : `Open session thread ${sessionId}`
              }
              className={`font-mono transition focus:outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-accent rounded-xs px-0.5 ${
                isSessionActive
                  ? "text-[color:var(--r1-on-inspector)] border border-accent/60 bg-[rgb(var(--r1-rgb)/0.12)]"
                  : "text-text border border-text/20 bg-[rgb(var(--r1-rgb)/0.06)] hover:text-[color:var(--r1-on-inspector)] hover:border-accent/50 hover:bg-[rgb(var(--r1-rgb)/0.12)]"
              }`}
            >
              {sessionId}
            </button>
            <span
              onClickCapture={(e) => {
                // MatchBadge's own onClick unconditionally opens the match
                // window. When this session is ALREADY the active thread,
                // intercept in the capture phase (before MatchBadge's
                // bubble-phase handler runs) so the badge toggles CLOSED
                // instead of re-opening - same one-thread invariant the
                // value button already honors.
                if (isSessionActive) {
                  e.stopPropagation();
                  closeMatches();
                }
              }}
            >
              <MatchBadge
                field="session_id"
                value={sessionId}
                count={stats.count}
                baseline={stats.baseline}
              />
            </span>
          </>
        ) : (
          "-"
        )
      }
    />
  );
}

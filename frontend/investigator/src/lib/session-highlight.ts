/**
 * Session-thread highlight semantics for timeline ticks. Pure: the Timeline
 * maps each tick's session through this and renders ring/dim from the result.
 * A null-session tick can never highlight - under an active filter it dims
 * with everything else, so the selected thread reads as the only lit lane.
 */
export interface SessionTickState {
  highlighted: boolean;
  dimmed: boolean;
}

export function sessionTickState(
  tickSession: string | null,
  selectedSessionId: string | null,
): SessionTickState {
  if (selectedSessionId === null) return { highlighted: false, dimmed: false };
  const highlighted = tickSession !== null && tickSession === selectedSessionId;
  return { highlighted, dimmed: !highlighted };
}

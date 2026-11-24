/**
 * Decisions store - fetches /api/decisions and maps to camelCase Decision[].
 * Decisions ANNOTATE Paths, so a failed fetch never blocks them (Paths still render,
 * spec 9), but it is reported as an error, never as an empty list (D4). The badge +
 * console are pure renderers of this.
 *
 * The bare address is asked for, exactly as the static export keys it.
 */
import { useEffect, useState } from "react";
import { mapDecision, type Decision, type RawDecision } from "../lib/decisions";

const DECISIONS_URL = "/api/decisions";

export async function fetchDecisions(): Promise<Decision[]> {
  const r = await fetch(DECISIONS_URL);
  if (!r.ok) throw new Error(`decisions ${r.status}`);
  const raw = (await r.json()) as RawDecision[];
  return raw.map(mapDecision);
}

/** One stable empty list, so a consumer's effect keyed on `decisions` does not re-run every render. */
const NONE: Decision[] = [];

interface Answer {
  decisions: Decision[];
  error: string | null;
}

/** `loaded` is true once the read has settled, with decisions or with an error: an empty list
 *  before that means "not yet", after it means "none". The opening reads it so a pack whose
 *  rules are still arriving is not opened as a pack with none. */
export function useDecisions(): { decisions: Decision[]; error: string | null; loaded: boolean } {
  const [answer, setAnswer] = useState<Answer | null>(null);
  useEffect(() => {
    let cancelled = false;
    fetchDecisions()
      .then((decisions) => { if (!cancelled) setAnswer({ decisions, error: null }); })
      .catch((e: Error) => { if (!cancelled) setAnswer({ decisions: NONE, error: e.message }); });
    return () => { cancelled = true; };
  }, []);
  return answer !== null
    ? { decisions: answer.decisions, error: answer.error, loaded: true }
    : { decisions: NONE, error: null, loaded: false };
}

import { PLATE, TONE_STYLE } from "./tone-style";
import type { PileSegment } from "../../lib/verdict-piles";

interface Props { segments: readonly PileSegment[]; lit?: boolean; dim?: boolean }

/** A decision's word in its status colour: one segment per word, ×N when a pile counts several.
 *  Variant B of the verdict marks board: a square neutral plate, and on it each word behind a 2 px
 *  rule in its tone, 2 px apart. Lit is a 1 px outline and a 2 px ring in the lead tone; only
 *  opacity transitions. Visual only; the caller wraps it in the button that owns the name and the
 *  action. */
export function VerdictCapsule({ segments, lit = false, dim = false }: Props) {
  const lead = TONE_STYLE[segments[0]?.tone ?? "unknown"];
  return (
    <span
      data-verdict-capsule
      data-lit={lit}
      className="inline-flex items-stretch shrink-0 whitespace-nowrap font-mono text-[9px] leading-none tracking-[0.18em] uppercase font-semibold transition-opacity duration-150 motion-reduce:transition-none"
      style={{
        background: PLATE,
        padding: "3px 0",
        boxShadow: lit ? `0 0 0 1px ${lead.text}, 0 0 0 3px rgb(var(${lead.rgb}) / 0.35)` : undefined,
        opacity: dim ? 0.45 : 1,
      }}
    >
      {segments.map((s, i) => (
        <span
          key={s.word}
          data-tone={s.tone}
          className="flex items-center gap-1"
          style={{
            color: TONE_STYLE[s.tone].text,
            borderLeftWidth: 2,
            borderLeftStyle: "solid",
            borderLeftColor: TONE_STYLE[s.tone].text,
            padding: "0 6px",
            marginLeft: i > 0 ? 2 : undefined,
          }}
        >
          {s.word}
          {s.count > 1 && <span className="tracking-normal text-[color:var(--text-muted)]">×{s.count}</span>}
        </span>
      ))}
    </span>
  );
}

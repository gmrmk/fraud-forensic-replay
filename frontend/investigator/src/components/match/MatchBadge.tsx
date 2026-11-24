/**
 * MatchBadge - renamed from PivotBadge. Click opens the workspace
 * MatchesTable for the field=value pair. Uses useMatches.open
 * instead of the old usePivotStore.openPivot.
 *
 * Color rule (unchanged from PivotBadge):
 *   red  when baseline === 0 && count > 0  (signature anomaly)
 *   red  when count / baseline >= 3.0  (sharp divergence)
 *   cyan otherwise (matches baseline within reason)
 *
 * Look: a plate around the count: a
 * square box, a 1 px line in the tag's own colour at 60 percent, and a fill of
 * that colour at --tag-fill. Red has bold digits and cyan a medium weight, so
 * the difference reads without colour. The plate is a look and nothing more:
 * it adds no text, title or accessible name, and the tone rule below is
 * untouched. Text, line and fill take the on-panel colours
 * (`--alarm-on-panel`, `--r1-on-panel`) set inline: Tailwind's text-signal and
 * text-accent are the raw slots, which fall short of 4.5:1 in the colour-blind
 * and light cells. Stays a bespoke <button> rather than <Badge>: Badge is a
 * non-interactive <span>, and Pill emits data-active, not the data-tone /
 * data-badge / ×count selector contract MatchBadge.test.tsx and the matches
 * workspace rely on. No hit-area pseudo-element: the Inspector's value cell is
 * 19 px tall with overflow hidden, which would clip one.
 */
import { useMatches } from "../../store/matches";
import type { MatchableField } from "../../lib/matches";

interface Props {
  field: MatchableField;
  value: string;
  count: number;
  baseline: number;
}

type Tone = "cyan" | "red";

function tone(count: number, baseline: number): Tone {
  if (baseline === 0) return count > 0 ? "red" : "cyan";
  if (count / baseline >= 3.0) return "red";
  return "cyan";
}

/** The plate around the count: a square box (1 px radius), a 1 px line in the tag's own colour at 60
 *  percent, and a fill of that colour at --tag-fill (theme/tokens.ts tagFillOf, a whole percent per
 *  palette cell). The two colours are the .tag-plate class (index.css: currentColor mixed at 60
 *  percent and at --tag-fill); the box is here. 1 px above and below and 3 px at the sides; the line
 *  height is pinned in px so the box stays 13.5 px tall (9.5 px line, 2 px padding, 2 px border), as
 *  the old 1.5 line was. */
const PLATE: React.CSSProperties = {
  borderWidth: 1,
  borderStyle: "solid",
  borderRadius: 1,
  padding: "1px 3px",
  lineHeight: "9.5px",
};

// Red and cyan share the plate; weight tells them apart without colour.
const TONE_PLATE: Record<Tone, React.CSSProperties> = {
  cyan: { color: "var(--r1-on-panel)", fontWeight: 500, ...PLATE },
  red: { color: "var(--alarm-on-panel)", fontWeight: 700, ...PLATE },
};

export function MatchBadge({ field, value, count, baseline }: Props) {
  const open = useMatches((s) => s.open);
  if (count === 0) return null;
  const t = tone(count, baseline);

  return (
    <button
      type="button"
      data-badge
      data-tone={t}
      onClick={(e) => {
        e.stopPropagation();
        open(field, value);
      }}
      style={TONE_PLATE[t]}
      className="tag-plate inline-block ml-1 font-mono text-[9px] align-middle transition hover:underline underline-offset-2 active:scale-[0.95] motion-reduce:transition-none"
      aria-label={`Open matches for ${field}=${value} (${count} matches)`}
    >
      ×{count}
    </button>
  );
}

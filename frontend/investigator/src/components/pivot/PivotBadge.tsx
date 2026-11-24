import type { CSSProperties, MouseEvent as ReactMouseEvent } from "react";
import { usePivotStore } from "../../store/pivot";
import { nextNonOverlappingPosition } from "../../lib/smart-position";
import { DETAIL_WINDOW_DIMS } from "../../lib/window-dims";
import { chromeToWindowNow } from "../../store/text-size";
import type { EntityMatch, MatchableField } from "../../lib/matches";

interface Props {
  /** The entity of the rail row this badge sits on - a click quick-looks
   *  THIS entity in a glance window without touching the docked selection.
   *  The deep ×N list drill stays in the docked MatchBadge/MatchesTable
   *  flow (spec §3; owner decision 2026-07-02). */
  entity: EntityMatch;
  field: MatchableField;
  value: string;
  count: number;
  baseline: number;
}

type Tone = "cyan" | "red";

/** Red = signature anomaly: a value with no baseline history, or one
 *  spiking to >= 3x its baseline frequency. */
function tone(count: number, baseline: number): Tone {
  if (baseline === 0 && count > 0) return "red";
  if (baseline > 0 && count / baseline >= 3.0) return "red";
  return "cyan";
}

// Inline styles because Tailwind opacity-slash modifiers no-op on hex color
// tokens (see entity-palette.ts docstring).
const TONE_STYLES: Record<Tone, CSSProperties> = {
  cyan: { backgroundColor: "rgba(0, 229, 255, 0.15)" },
  red: { backgroundColor: "rgba(255, 61, 46, 0.20)" },
};

const TONE_TEXT_CLASS: Record<Tone, string> = {
  cyan: "text-accent",
  red: "text-signal",
};

export function PivotBadge({ entity, field, value, count, baseline }: Props) {
  const openGlance = usePivotStore((s) => s.openGlance);

  if (count === 0) return null;

  const t = tone(count, baseline);

  const onClick = (e: ReactMouseEvent<HTMLButtonElement>) => {
    e.stopPropagation();
    const r = e.currentTarget.getBoundingClientRect();
    openGlance(
      entity,
      nextNonOverlappingPosition({
        origin: { x: r.left, y: r.top, width: r.width, height: r.height },
        // The estimates are the chrome's pixels; the placement is in window pixels.
        size: { width: chromeToWindowNow(DETAIL_WINDOW_DIMS.width), height: chromeToWindowNow(DETAIL_WINDOW_DIMS.height) },
        existing: usePivotStore
          .getState()
          .windows.filter((w) => w.anchor.type === "screen")
          .map((w) => ({
            x: (w.anchor as { x: number }).x,
            y: (w.anchor as { y: number }).y,
            width: chromeToWindowNow(DETAIL_WINDOW_DIMS.width),
            height: chromeToWindowNow(DETAIL_WINDOW_DIMS.height),
          })),
        viewport: { x: 0, y: 0, width: window.innerWidth, height: window.innerHeight },
      })
    );
  };

  return (
    <button
      type="button"
      data-badge
      data-tone={t}
      onClick={onClick}
      style={TONE_STYLES[t]}
      className={`inline-block ml-1 px-1 rounded-[2px] font-mono text-[9px] leading-none align-middle ${TONE_TEXT_CLASS[t]}`}
      aria-label={`Preview matches for ${field}=${String(value)} (${count} matches)`}
    >
      ×{count}
    </button>
  );
}

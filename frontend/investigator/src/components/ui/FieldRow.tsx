import type { CSSProperties, ReactNode } from "react";
import { Eyebrow } from "./Eyebrow";

/** Type tier the value renders in. body = inherited body face; mono/display
 *  source their face from the CSS var (the Tailwind font utilities are stale). */
type ValueTier = "body" | "mono" | "display";
/** between = label left / value right on one baseline; stacked = label over value. */
type FieldAlign = "between" | "stacked";

export interface FieldRowProps {
  label: ReactNode;
  value: ReactNode;
  valueTier?: ValueTier;
  /** A css color or var for the value (e.g. var(--alarm) for hot numbers). */
  valueTone?: string;
  /** Optional dim line below the value. */
  secondary?: ReactNode;
  align?: FieldAlign;
}

/** Tier -> the explicit font face. body keeps the inherited body font. */
const TIER_FONT: Record<ValueTier, string | undefined> = {
  body: undefined,
  mono: "var(--mono)",
  display: "var(--display)",
};

/**
 * FieldRow - the label/value pair primitive. A strict superset of the legacy
 * InspectorField (which can later become a thin alias): InspectorField's mono
 * value + dim secondary fall out of valueTier="mono" + secondary, and it adds
 * a body/display tier, an explicit value color, and a stacked layout. Type +
 * geometry only; no entity logic.
 */
export function FieldRow({
  label,
  value,
  valueTier = "body",
  valueTone,
  secondary,
  align = "between",
}: FieldRowProps) {
  const valueStyle: CSSProperties = {};
  const face = TIER_FONT[valueTier];
  if (face) valueStyle.fontFamily = face;
  if (valueTone) valueStyle.color = valueTone;

  const rowClass =
    align === "between"
      ? "flex items-baseline justify-between gap-3"
      : "flex flex-col gap-0.5";
  const valueAlignClass = align === "between" ? "text-right" : "text-left";

  return (
    <div className="py-0.5">
      <div data-align={align} className={rowClass}>
        <Eyebrow size="xs" tone="muted" className="shrink-0">
          {label}
        </Eyebrow>
        <span
          className={`text-[11px] text-text ${valueAlignClass} truncate`}
          style={valueStyle}
        >
          {value}
        </span>
      </div>
      {secondary !== undefined && (
        <div
          className={`text-[9px] tracking-widest text-dim ${
            align === "between" ? "text-right" : "text-left"
          }`}
        >
          {secondary}
        </div>
      )}
    </div>
  );
}

import type { CSSProperties, ReactNode } from "react";

/** Label-tier emphasis -> a fixed set of mode-aware neutral/accent vars. */
type EyebrowTone = "text" | "muted" | "dim" | "accent";
type EyebrowSize = "xs" | "sm";

export interface EyebrowProps {
  children: ReactNode;
  tone?: EyebrowTone;
  size?: EyebrowSize;
  as?: "span" | "div" | "h3" | "h4";
  /** Positioning utilities ONLY (the escape hatch). */
  className?: string;
}

/** Tone -> a fixed theme var (never a per-kind lookup). */
const TONE_COLOR: Record<EyebrowTone, string> = {
  text: "var(--text)",
  muted: "var(--text-muted)",
  dim: "var(--text-faint)",
  accent: "var(--r1)",
};

/** Size -> the Label-tier font size + tracking pairing. */
const SIZE_CLASS: Record<EyebrowSize, string> = {
  xs: "text-[10px] tracking-widest",
  sm: "text-[11px] tracking-wider",
};

/**
 * Eyebrow - the Label type tier (uppercase, tracked, mono numerics aside).
 * Replaces the ~30 ad-hoc "text-[10px] uppercase tracking-widest text-muted"
 * spans. Type + a fixed tone enum only; carries no material, no entity logic.
 */
export function Eyebrow({
  children,
  tone = "muted",
  size = "xs",
  as: Tag = "span",
  className = "",
}: EyebrowProps) {
  // Labels carry weight 600 (over the 500 base) so the tracked uppercase caption
  // tier reads as a deliberate label, not razor-thin small caps (2026-06-18).
  const style: CSSProperties = { color: TONE_COLOR[tone], fontWeight: 600 };
  const classes = [
    "uppercase",
    SIZE_CLASS[size],
    className,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <Tag className={classes} style={style}>
      {children}
    </Tag>
  );
}

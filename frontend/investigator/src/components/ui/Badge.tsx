import type { CSSProperties, ReactNode } from "react";

/** Badge emphasis -> a fixed set of mode-aware theme vars (never per-kind). */
type BadgeTone = "cyan" | "alarm" | "elevated" | "identity" | "muted";

export interface BadgeProps {
  tone?: BadgeTone;
  /** Entity hex/rgb -> inline --panel-accent var. The only entity-color seam. */
  accent?: string;
  children: ReactNode;
}

/** Tone -> a fixed theme var used as the tag's text color. */
const TONE_COLOR: Record<BadgeTone, string> = {
  cyan: "var(--r1)",
  alarm: "var(--alarm)",
  elevated: "var(--r3)",
  identity: "var(--r2)",
  muted: "var(--text-muted)",
};

/**
 * Badge - the count / status tag primitive. Replaces the MatchBadge shell, the
 * KPI tone chips, and the live-dot label. Non-interactive (a <span>); for a
 * clickable tag use Pill. Type + geometry + a fixed tone enum only - entity
 * color arrives via accent (-> --panel-accent).
 */
export function Badge({ tone = "muted", accent, children }: BadgeProps) {
  const style: CSSProperties = { color: TONE_COLOR[tone] };
  if (accent) (style as Record<string, string>)["--panel-accent"] = accent;

  return (
    <span
      className="inline-flex items-center rounded-sm px-1 font-mono text-[9px] leading-none tracking-widest align-middle"
      style={style}
    >
      {children}
    </span>
  );
}

import type { CSSProperties, ReactNode } from "react";
import { FocusButton } from "./FocusButton";

/** Pill emphasis -> a fixed set of mode-aware theme vars (never per-kind). */
type PillTone = "neutral" | "accent" | "alarm" | "elevated" | "identity" | "text";
type PillSize = "xs" | "sm" | "md";

export interface PillProps {
  tone?: PillTone;
  /** Entity hex/rgb -> inline --panel-accent var. The only entity-color seam. */
  accent?: string;
  active?: boolean;
  size?: PillSize;
  onClick?: () => void;
  children: ReactNode;
  // ── a11y passthrough (flyout triggers + radiogroup parents need these) ──
  role?: string;
  "aria-checked"?: boolean;
  "aria-pressed"?: boolean;
  "aria-haspopup"?: boolean | "menu" | "listbox" | "tree" | "grid" | "dialog";
  "aria-expanded"?: boolean;
  "aria-label"?: string;
  tabIndex?: number;
  /** Native hover-tooltip passthrough (mirrors the sibling RibbonSegment). */
  title?: string;
  /** The one tooltip layer's attributes (see `tip` in ./Tip), forwarded to the button only: the
   *  layer reads `data-tip` and `data-tip-accent`; `aria-description` says the same to assistive
   *  technology. A pill given none of them carries none. */
  "data-tip"?: string;
  "data-tip-accent"?: string;
  "aria-description"?: string;
  /** Layout/positioning utilities ONLY (the escape hatch, like Panel) - e.g. a
   *  min-width so a toggling label (PLAY/PAUSE) does not reflow its row. Never color. */
  className?: string;
}

/** Tone -> a fixed theme var used as the chip's text/accent color. */
const TONE_COLOR: Record<PillTone, string> = {
  neutral: "var(--text-muted)",
  accent: "var(--r1)",
  alarm: "var(--alarm)",
  elevated: "var(--r3)",
  identity: "var(--r2)",
  // Full text tier - for primary controls (nav chips) that must clear WCAG AA
  // as small text. The ramp slots (--r0..--r4) are luminance-stepped for globe
  // CVD discriminability, not panel-text legibility, so they are NOT text tones.
  text: "var(--text)",
};

/** Size -> the Label-tier padding + font size pairing. */
const SIZE_CLASS: Record<PillSize, string> = {
  xs: "px-2 py-0.5 text-[9px]",
  sm: "px-2.5 py-0.5 text-[10px]",
  md: "px-3 py-1 text-[11px]",
};

/** Roles that imply the chip is an interactive control even without onClick
 *  (e.g. a radiogroup chip driven entirely by parent key handling). */
const INTERACTIVE_ROLES = new Set(["button", "radio", "checkbox", "tab", "menuitem"]);

/**
 * Pill - the rounded chip primitive. Replaces the DecisionPill chrome, the
 * SpeedChip, and the MatchBadge chip shell. When interactive (an onClick or an
 * interactive role) it renders via FocusButton (a real <button>); otherwise a
 * <span>. Type + geometry + a fixed tone enum only - entity color via accent.
 */
export function Pill({
  tone = "neutral",
  accent,
  active = false,
  size = "sm",
  onClick,
  children,
  role,
  "aria-checked": ariaChecked,
  "aria-pressed": ariaPressed,
  "aria-haspopup": ariaHasPopup,
  "aria-expanded": ariaExpanded,
  "aria-label": ariaLabel,
  tabIndex,
  title,
  "data-tip": dataTip,
  "data-tip-accent": dataTipAccent,
  "aria-description": ariaDescription,
  className: extraClass = "",
}: PillProps) {
  const interactive = Boolean(onClick) || (role !== undefined && INTERACTIVE_ROLES.has(role));

  const style: CSSProperties = { color: TONE_COLOR[tone] };
  if (accent) (style as Record<string, string>)["--panel-accent"] = accent;

  const classes = [
    "inline-flex items-center gap-1.5 whitespace-nowrap rounded-pill font-mono tracking-widest uppercase transition active:scale-[0.97]",
    SIZE_CLASS[size],
    active ? "brightness-125" : "",
    extraClass,
  ]
    .filter(Boolean)
    .join(" ");

  if (interactive) {
    return (
      <FocusButton
        variant="chip"
        onClick={onClick}
        className={classes}
        style={style}
        data-active={active ? "true" : undefined}
        role={role}
        aria-checked={ariaChecked}
        aria-pressed={ariaPressed}
        aria-haspopup={ariaHasPopup}
        aria-expanded={ariaExpanded}
        aria-label={ariaLabel}
        tabIndex={tabIndex}
        title={title}
        data-tip={dataTip}
        data-tip-accent={dataTipAccent}
        aria-description={ariaDescription}
      >
        {children}
      </FocusButton>
    );
  }

  return (
    <span className={classes} style={style} aria-label={ariaLabel} title={title}>
      {children}
    </span>
  );
}

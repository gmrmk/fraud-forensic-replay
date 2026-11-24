import type { CSSProperties, ReactNode } from "react";

/** Surface treatment - maps 1:1 to the index.css material classes. */
type Material = "instrument" | "glass" | "scrim";
/** Shadow depth tier. "ambient" emits no class (the material's base shadow). */
type Elevation = "ambient" | "raised" | "focal";
/** Corner size. OPTIONAL: when omitted, the material's own border-radius
 *  default applies (instrument/glass = lg/24px, scrim = md/14px) and we emit
 *  NO border-radius so we never silently shrink a surface. */
type Radius = "sm" | "md" | "lg";

export interface PanelProps {
  material?: Material;
  elevation?: Elevation;
  radius?: Radius;
  /** Entity hex/rgb -> inline --panel-accent var the element can read. The
   *  ONLY channel for entity color; the primitive never branches on kind. */
  accent?: string;
  /** Accent border on an edge, reading --panel-accent - a per-entity/decision
   *  accent edge without a hand-rolled inline border. */
  accentBorder?: "top" | "left" | "all";
  /** Tinted accent fill: bg + border via color-mix from --panel-accent (an
   *  accent-tinted box, e.g. a decision outcome box). Overrides the material bg. */
  accentFill?: boolean;
  as?: "div" | "section" | "aside";
  role?: string;
  "aria-label"?: string;
  /** -1 lets script focus a landmark panel (a focus fallback) without adding a tab stop. */
  tabIndex?: number;
  /** Test/selector hook. Lets a surface BE the Panel (its positioned bar) instead
   *  of wrapping it in an extra div purely to carry a data-testid. */
  "data-testid"?: string;
  /** Visual-capture anchor for eyes-feature.mjs --select. A channel distinct from
   *  data-testid so per-feature screenshot framing never collides with test selectors. */
  "data-eyes"?: string;
  /** Positioning utilities ONLY (the escape hatch); e.g. absolute/inset/z. */
  className?: string;
  children: ReactNode;
}

/** Elevation -> the .elev-* modifier; "ambient" is the base (no modifier). */
const ELEVATION_CLASS: Record<Elevation, string> = {
  ambient: "",
  raised: "elev-raised",
  focal: "elev-focal",
};

/** Radius prop -> the CSS --radius-* var (NOT the Tailwind radius scale, which
 *  is a different size set). Inline so it overrides the material default. */
const RADIUS_VAR: Record<Radius, string> = {
  sm: "var(--radius-sm)",
  md: "var(--radius-md)",
  lg: "var(--radius-lg)",
};

/** Which materials carry the noise overlay (only instrument has a .grain
 *  contract in index.css; glass is flat matte, scrim has none). */
const HAS_GRAIN: Record<Material, boolean> = {
  instrument: true,
  glass: false,
  scrim: false,
};

/**
 * Panel - the one surface wrapper for the investigator app. Replaces the
 * ~12 hand-rolled "border border-panel-border bg-panel-bg" divs with the lit
 * instrument/glass/scrim material system. It encodes ONLY material + geometry
 * + a11y; entity color arrives solely via `accent` (-> --panel-accent). The
 * Instrument-B reskin then recolors every surface from one place.
 */
export function Panel({
  material = "instrument",
  elevation = "ambient",
  radius,
  accent,
  accentBorder,
  accentFill,
  as: Tag = "div",
  role,
  "aria-label": ariaLabel,
  tabIndex,
  "data-testid": testId,
  "data-eyes": eyesId,
  className = "",
  children,
}: PanelProps) {
  const style: CSSProperties = {};
  if (radius) style.borderRadius = RADIUS_VAR[radius];
  if (accent) (style as Record<string, string>)["--panel-accent"] = accent;

  // accentFill / accentBorder emit classes whose recipes (color-mix tint + the
  // var(--panel-accent) borders) live in index.css beside the material classes -
  // the primitive only toggles the class; the visual recipe stays in CSS.
  const classes = [
    material,
    ELEVATION_CLASS[elevation],
    accentFill ? "accent-fill" : "",
    accentBorder ? `accent-border-${accentBorder}` : "",
    className,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <Tag className={classes} style={style} role={role} aria-label={ariaLabel} tabIndex={tabIndex} data-testid={testId} data-eyes={eyesId}>
      {HAS_GRAIN[material] && <span className="grain" aria-hidden="true" />}
      {children}
    </Tag>
  );
}

import type { ReactNode } from "react";

export interface RibbonSegmentProps {
  /** Click handler - present for navigable/actionable segments (crumbs, rules). */
  onClick?: () => void;
  /** Per-kind accent hex (from the entity palette). Drives the leading dot and,
   *  when active, the label color + a bottom-edge underline. */
  accentHex?: string;
  /** The current/open segment (e.g. the rule whose Matches is open, or the last crumb). */
  active?: boolean;
  /** Not relevant to the current context - rendered at reduced emphasis. */
  dimmed?: boolean;
  /** First segment in the strip skips the leading hairline divider. */
  first?: boolean;
  title?: string;
  /** a11y: set "page"/"step" for the current breadcrumb crumb. */
  ariaCurrent?: boolean | "page" | "step";
  children: ReactNode;
}

/** One clickable segment of a Ribbon - hairline-divided, mono, with an optional
 *  per-kind accent dot, an active (current/open) state, and a dimmed
 *  (not-relevant) state. Flat panel idiom, matching its parent Ribbon (outside
 *  the Instrument-B material pass by design). */
export function RibbonSegment({
  onClick,
  accentHex,
  active = false,
  dimmed = false,
  first = false,
  title,
  ariaCurrent,
  children,
}: RibbonSegmentProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      aria-pressed={onClick ? active : undefined}
      aria-current={ariaCurrent}
      className={[
        "h-full px-3 flex items-center gap-2 font-mono text-[10px] tracking-widest whitespace-nowrap transition",
        first ? "" : "border-l border-panel-border",
        active ? "bg-accent/15 text-text" : "text-muted hover:bg-accent/5 hover:text-text",
        dimmed ? "opacity-50" : "opacity-100",
        "focus:outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-accent",
      ].join(" ")}
      style={active && accentHex ? { boxShadow: `inset 0 -2px 0 0 ${accentHex}` } : undefined}
    >
      {accentHex && (
        <span
          aria-hidden="true"
          className="w-1.5 h-1.5 rounded-full flex-shrink-0"
          style={{ backgroundColor: accentHex }}
        />
      )}
      <span className="truncate" style={active && accentHex ? { color: accentHex } : undefined}>
        {children}
      </span>
    </button>
  );
}

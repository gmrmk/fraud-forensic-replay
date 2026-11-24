import type { ReactNode } from "react";

export interface RibbonProps {
  /** Accessible group label (e.g. "Breadcrumb", "Rules"). */
  label: string;
  /** Optional fixed leading cell - a label tab like the TickerBar "NOW" cell. */
  leading?: ReactNode;
  /** Optional fixed trailing cell. */
  trailing?: ReactNode;
  /** The hairline-divided segment row (RibbonSegment children). */
  children: ReactNode;
  /** Positioning utilities ONLY (the escape hatch); e.g. absolute/top/z for placement. */
  className?: string;
}

/** A horizontal ribbon-strip primitive: an optional fixed leading cell, a
 *  hairline-divided segment row (RibbonSegment children) that scrolls
 *  horizontally on overflow so the strip never wraps, and an optional trailing
 *  cell. Flat panel material (bg-panel-bg + hairline) - it sits outside the
 *  Instrument-B material pass by design (the TickerBar, formerly a sibling of
 *  this family, now renders its own <Panel material="instrument"> shell
 *  directly). The shared idiom for breadcrumb / Inspector RULES style ribbons. */
export function Ribbon({ label, leading, trailing, children, className = "" }: RibbonProps) {
  return (
    <div
      role="group"
      aria-label={label}
      className={`flex items-stretch h-9 bg-panel-bg border border-panel-border overflow-hidden ${className}`}
    >
      {leading}
      <div className="flex-1 min-w-0 flex items-stretch overflow-x-auto">{children}</div>
      {trailing}
    </div>
  );
}

// frontend/investigator/src/components/timeline/head/HeadRail.tsx
// The rail the tab rides: a strip above the track, as wide as the plot. A press on
// it seeks and scrubs as a press on the track does, through the handler its owner hands in. It is
// a size container, so the tab can place itself in percent of the rail's width with no read of it.
import type { MouseEvent, ReactNode } from "react";
import { HEAD_RAIL } from "../../../lib/bar-metrics";

export interface HeadRailProps {
  /** Px from the bar's left edge to the plot (the name column). */
  inset: number;
  onMouseDown: (e: MouseEvent<HTMLDivElement>) => void;
  children: ReactNode;
}

export function HeadRail({ inset, onMouseDown, children }: HeadRailProps) {
  return (
    <div
      data-head-rail
      className="relative cursor-pointer select-none"
      style={{ height: HEAD_RAIL, marginLeft: inset, containerType: "inline-size" }}
      onMouseDown={onMouseDown}
    >
      {children}
    </div>
  );
}

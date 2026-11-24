/**
 * TimelineProjectorContext - the ms<->% projector the TimelineShell builds for
 * its active domain, exposed to deep children (event dots, TransferPathOverlay,
 * the tooltip) that would otherwise have to prop-drill it through the data layer.
 *
 * The shell provides it AND passes the same projector to its render-prop child,
 * so a layer can read it either way. null when no shell wraps the tree.
 */
import { createContext, useContext } from "react";
import type { TimelineProjector } from "../../lib/timeline-projector";

export const TimelineProjectorContext = createContext<TimelineProjector | null>(null);

/** Read the shell's projector. Throws if used outside a TimelineShell, so a
 *  miswired layer fails loudly instead of silently mis-projecting. */
export function useTimelineProjector(): TimelineProjector {
  const projector = useContext(TimelineProjectorContext);
  if (!projector) {
    throw new Error("useTimelineProjector must be used within a TimelineShell");
  }
  return projector;
}

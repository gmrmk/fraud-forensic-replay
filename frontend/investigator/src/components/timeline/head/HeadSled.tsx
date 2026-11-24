// frontend/investigator/src/components/timeline/head/HeadSled.tsx
// The line and the veil of one plot. It fills its
// positioned parent, takes no pointer, and is a function of the playhead alone: it is placed by a
// transform, so a tick changes no layout, and paused nothing moves. The line cannot cross a
// lane's header, so each plot draws its own piece at the same x.
import { usePlayhead } from "../../../store/playhead";
import { headEdge, type BucketGrid } from "../../../lib/head-edge";
import type { TimelineProjector } from "../../../lib/timeline-projector";

/** The line: the theme's text colour, from its token. */
const LINE = "rgb(var(--text-rgb))";
/** The veil: the bar's own surface colour at half strength, so what it covers reads as the same
 *  thing, fainter. */
const VEIL = "rgb(var(--glass-tint) / 0.5)";

/** The sled's place: at the playhead, or parked at the edge it has passed. */
function sledX(at: number): string {
  if (at >= 100) return "translateX(calc(100% - 1px))";
  return `translateX(${Math.max(0, at)}%)`;
}

export interface HeadSledProps {
  project: TimelineProjector;
  /** The grid of each lane the pack draws; the veil starts at the latest bucket end over them,
   *  and at the playhead when there is none. */
  grids: readonly BucketGrid[];
  /** Px from the box's left edge to the plot (a rows block carries a name column). */
  left?: number;
  /** Px by which the line runs on under the box, to meet the next plot. */
  bleed?: number;
}

export function HeadSled({ project, grids, left = 0, bleed = 0 }: HeadSledProps) {
  const playhead = usePlayhead((s) => s.playhead);
  const at = project.pct(playhead);
  const veilAt = project.pct(headEdge(playhead, grids));
  const inside = at >= 0 && at <= 100;
  return (
    <div
      data-head-sled
      aria-hidden="true"
      style={{ position: "absolute", top: 0, bottom: -bleed, left, right: 0, overflow: "hidden", pointerEvents: "none", zIndex: 5 }}
    >
      {/* The veil has a sled of its own: it moves only when the hour changes. */}
      <div style={{ position: "absolute", top: 0, bottom: 0, left: 0, width: "100%", transform: sledX(veilAt) }}>
        {/* Past the window's end there is nothing after the edge to veil. A veil that starts at the
            line leaves the line's own pixel clear. */}
        <div
          data-head-veil
          style={{ position: "absolute", top: 0, bottom: 0, left: veilAt === at ? 1 : 0, right: 0, backgroundColor: VEIL, visibility: veilAt >= 100 ? "hidden" : "visible" }}
        />
      </div>
      <div style={{ position: "absolute", top: 0, bottom: 0, left: 0, width: "100%", transform: sledX(at) }}>
        <div data-head-line style={{ position: "absolute", top: 0, bottom: 0, left: 0, width: 1, backgroundColor: LINE, visibility: inside ? "visible" : "hidden" }} />
      </div>
    </div>
  );
}

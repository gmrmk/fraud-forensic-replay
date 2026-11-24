import { kindPathSegments } from "../../lib/timeline-story";
import { useLayers } from "../../store/layers";
import { kindRgbVar } from "../../lib/entity-palette";
import type { Transfer } from "../../types";

interface Props {
  transfers: Transfer[];
  minTime: number;
  span: number;
  /** The transfer lane's vertical position (percent), from the Timeline's
   *  lane layout; undefined when the scenario carries no transfer lane. */
  laneTop: number | undefined;
}

/**
 * Transfer path - connective tissue through the money-movement lane.
 * Transfers are coordless by design (a wire goes to a payee id, not a place),
 * so their path lives in the time dimension, not on the globe. Segment
 * severity follows its RIGHT endpoint: the line brightens INTO a fraud wire
 * and stays dim across baseline Tamsinmere transfers. Toggled from the PATHS panel
 * (pathKinds.transfer); renders under the event dots.
 */
export function TransferPathOverlay({ transfers, minTime, span, laneTop }: Props) {
  const show = useLayers((s) => s.pathKinds.transfer ?? false);
  if (!show || span <= 0 || laneTop === undefined) return null;

  const segments = kindPathSegments(
    transfers.map((t) => ({ ts: Date.parse(t.timestamp), severe: t.is_fraud === 1 })),
    minTime,
    span,
  );

  return (
    <>
      {segments.map((seg, i) => (
        <div
          key={`transfer-path-${i}`}
          aria-hidden="true"
          data-testid="transfer-path-segment"
          data-severe={seg.severe}
          className="absolute pointer-events-none"
          style={{
            left: `${seg.fromPct}%`,
            width: `${Math.max(seg.toPct - seg.fromPct, 0.15)}%`,
            top: `${laneTop}%`,
            height: 2,
            transform: "translateY(-50%)",
            background: seg.severe
              ? "rgb(var(--alarm-rgb) / 0.85)"
              : `rgb(var(${kindRgbVar("transfer")}) / 0.3)`,
            boxShadow: seg.severe ? "0 0 6px rgb(var(--alarm-rgb) / 0.45)" : "none",
            zIndex: 2,
          }}
        />
      ))}
    </>
  );
}

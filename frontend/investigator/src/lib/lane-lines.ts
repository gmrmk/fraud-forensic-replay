// frontend/investigator/src/lib/lane-lines.ts
// The model of a lane's lines. A lane opens into a line for
// each value of one more field (the manifest's `lanes[].depth.split`), each line drawn on the
// lane's own top and step, so the lines add up to the lane's bar in every hour. Pure: the field,
// its label and the kinds all arrive as arguments, and nothing here reads a store, a grouping, a
// solo or a clock. A solo narrows the lines because the caller hands in the soloed row's entities
// and the lane built from them, as the lane itself is.
import { DEPTH_MAX_LINES } from "./bar-metrics";
import type { Entity } from "./entity";
import { LANE_PLOT_PX, buildDeclaredLane, type LaneDeclaration, type LaneModel } from "./timeline-lanes";

/** One line's height: the plot and a gap of 3 px below it. */
export const LANE_LINE_PX = LANE_PLOT_PX + 3;

/** One line of an open lane: the field's value, and the lane model of the rows that carry it. */
export interface LaneLine {
  /** The value of the split field, as text. It is the line's React key and its name. */
  key: string;
  /** The line's name: the value, whole and unchanged (the screen may cut it). */
  name: string;
  /** The sum of the line's bars over the case, which orders the lines. */
  total: number;
  /** The line's bars. Its id is the lane's id and the value, so no figure or plot of a line shares
   *  an id with the lane; its name is the line's name. */
  lane: LaneModel;
}

/** The value of `field` as a line's key: a non-empty string or a finite number as text; else null. */
function splitValue(entity: Entity, field: string): string | null {
  const value = entity.fields[field];
  if (typeof value === "string") return value.trim() === "" ? null : value;
  return typeof value === "number" && Number.isFinite(value) ? String(value) : null;
}

/**
 * The lines of `parent`, the lane drawn from `entities` by `decl`. Each line is the lane model of the
 * rows of one value, on `parent`'s top and step, busiest first by the sum of its bars over the case
 * (a tie by name). A row with no value in `field` is in no line, so for those rows the lines fall short
 * of the lane (SHORTCUT: no "other" line takes them; the backend's drift test holds a value on every
 * row of the pack that declares a split). A value whose rows give no usable bar has no line.
 */
export function buildLaneLines(
  entities: readonly Entity[],
  decl: LaneDeclaration,
  field: string,
  parent: LaneModel,
): LaneLine[] {
  const groups = new Map<string, Entity[]>();
  for (const e of entities) {
    if (!decl.kinds.includes(e.kind)) continue;
    const key = splitValue(e, field);
    if (key === null) continue;
    const group = groups.get(key);
    if (group) group.push(e);
    else groups.set(key, [e]);
  }
  const lines: LaneLine[] = [];
  for (const [key, rows] of groups) {
    const lane = buildDeclaredLane(rows, { ...decl, id: `${decl.id}/${key}` }, LANE_PLOT_PX, parent.scale.top);
    if (!lane) continue;
    const total = lane.bars.reduce((sum, b) => sum + b.value, 0);
    // The step is the lane's own, as the lane's number at the line, the bar widths and the veil read it.
    lines.push({ key, name: key, total, lane: { ...lane, nodeLabel: key, step: parent.step > 0 ? parent.step : lane.step } });
  }
  return lines.sort((a, b) => b.total - a.total || a.name.localeCompare(b.name));
}

/** The height the open block of lines takes: one step for each line it shows, at most DEPTH_MAX_LINES,
 *  and nothing while the lines are closed. The rows' list takes this as its `depthPx`. */
export function laneLinesPx(count: number, open: boolean): number {
  return open ? Math.min(Math.max(0, count), DEPTH_MAX_LINES) * LANE_LINE_PX : 0;
}

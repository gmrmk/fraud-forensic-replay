/**
 * The words of a stop plate, for the globe's plates and the Timeline's alike: the tooltip's lines and
 * the button's accessible name (the first two lines joined by a full stop). A plate for one stop reads
 * its place in the path, its record (the manifest's label for its kind, then its headline) and its time;
 * a plate that stands for several stops at one place reads the stops it stands for, then one numbered
 * line each (eight at most, then how many more).
 *
 * What this file does not do: it reads no store (the clock's form comes in as `h24`), draws nothing and
 * words no conclusion; every word is built in `lib/tooltip-words/paths`, the record's own, or a time.
 */
import type { PathStopView } from "../../lib/marks/select";
import type { ScenarioNode } from "../../lib/scenarios";
import { moreStops, stopLine, stopTitle, timeLine } from "../../lib/tooltip-words/paths";
import { when, when24 } from "../../lib/time-words";
import { stopWords } from "./path-lookup";

export interface PlateWords {
  /** The tooltip, one line each: a name first, then values. */
  lines: string[];
  /** The accessible name. */
  name: string;
}

/** How many stops of a merged plate its tooltip lists. */
const LISTED = 8;

export function plateWords(
  nums: readonly number[],
  total: number,
  pathName: string,
  stops: readonly PathStopView[],
  nodes: readonly ScenarioNode[],
  h24: boolean,
): PlateWords {
  const title = stopTitle(nums, total, pathName);
  const lines = [title];
  if (stops.length === 1) {
    lines.push(stopWords(stops[0], nodes));
    const time = stops[0].info === null ? null : stops[0].info.time;
    if (time !== null) lines.push(timeLine((h24 ? when24 : when)(time)));
  } else {
    for (const s of stops.slice(0, LISTED)) lines.push(stopLine(s.n, stopWords(s, nodes)));
    if (stops.length > LISTED) lines.push(moreStops(stops.length - LISTED));
  }
  return { lines, name: lines.slice(0, 2).join(". ") };
}

/**
 * The words of a stop plate, shared by the globe's plates and the Timeline's: the tooltip's lines and the
 * accessible name (its first two lines joined by a full stop).
 */
import { describe, expect, it } from "vitest";
import { plateWords } from "./plate-words";
import type { PathStopView } from "../../lib/marks/select";
import type { ScenarioNode } from "../../lib/scenarios";
import { infoOf } from "../../lib/notes/test-fixtures";
import { when, when24 } from "../../lib/time-words";

const NODES: ScenarioNode[] = [{ kind: "signin", label: "Sign-in", palette: "#00ff00", source: "json" }];
const T = Date.parse("2026-05-21T14:00:00Z");

const stop = (n: number, headline: string, time: number | null = T): PathStopView => {
  const info = infoOf({ headline, time, draw: { kind: "signin", id: `r${n}`, timestamp: time ?? 0, fields: {} } });
  return { record: { kind: "signin", id: `r${n}` }, n, info, shown: true, onGlobe: true, onTimeline: time !== null };
};

describe("plateWords", () => {
  it("words one stop: its place in the path, its record in the manifest's words, then its time", () => {
    const w = plateWords([2], 4, "Path 1", [stop(2, "192.0.2.7")], NODES, false);
    expect(w.lines).toEqual(["Stop 2 of 4, Path 1", "Sign-in: 192.0.2.7", `Time: ${when(T)}`]);
  });

  it("words the time in 24 hour form when the clock is", () => {
    const w = plateWords([2], 4, "Path 1", [stop(2, "192.0.2.7")], NODES, true);
    expect(w.lines[2]).toBe(`Time: ${when24(T)}`);
  });

  it("leaves the time line out for a record with no time", () => {
    const w = plateWords([1], 2, "Path 1", [stop(1, "192.0.2.7", null)], NODES, false);
    expect(w.lines).toEqual(["Stop 1 of 2, Path 1", "Sign-in: 192.0.2.7"]);
  });

  it("names the plate by its first two lines joined by a full stop", () => {
    const w = plateWords([2], 4, "Path 1", [stop(2, "192.0.2.7")], NODES, false);
    expect(w.name).toBe("Stop 2 of 4, Path 1. Sign-in: 192.0.2.7");
  });

  it("words a merged plate: the stops it stands for, then one numbered line each", () => {
    const w = plateWords([1, 3], 4, "Path 1", [stop(1, "192.0.2.7"), stop(3, "192.0.2.8")], NODES, false);
    expect(w.lines).toEqual(["Stops 1 and 3 of 4, Path 1", "1 Sign-in: 192.0.2.7", "3 Sign-in: 192.0.2.8"]);
    expect(w.name).toBe("Stops 1 and 3 of 4, Path 1. 1 Sign-in: 192.0.2.7");
  });

  it("lists at most eight stops of a merged plate, then how many more", () => {
    const stops = Array.from({ length: 11 }, (_, i) => stop(i + 1, `h${i + 1}`));
    const w = plateWords(stops.map((s) => s.n), 11, "Path 1", stops, NODES, false);
    expect(w.lines).toHaveLength(1 + 8 + 1);
    expect(w.lines[w.lines.length - 1]).toBe("+3 more");
  });
});

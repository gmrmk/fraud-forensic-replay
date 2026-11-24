import { describe, it, expect, beforeEach } from "vitest";
import { renderHook } from "@testing-library/react";
import { useCaseDayCells } from "./case-day-cells";
import { usePlayhead } from "../store/playhead";
import { useSchema } from "../store/schema";
import type { Entity } from "./entity";
import type { ScenarioNode } from "./scenarios";

// The day band counts the records the track draws as dots: the card story's lists and, for a story
// of its own kinds, the manifest kinds the track draws as dots. A kind drawn as bars (a magnitude)
// and a decision kind the manifest places on the map are not dots, so the band does not count them.

const DAY_1 = Date.parse("2026-05-20T12:00:00-05:00");
const DAY_2 = Date.parse("2026-05-21T12:00:00-05:00");
const WINDOW_MIN = Date.parse("2026-05-20T00:00:00-05:00");
const WINDOW_MAX = Date.parse("2026-05-22T00:00:00-05:00");

const generic = (kind: string, extra: Partial<ScenarioNode> = {}): ScenarioNode => ({
  kind,
  label: kind,
  palette: "#66ccff",
  source: "json",
  timestamp: "timestamp",
  primary: "${id}",
  secondary: "${id}",
  coords: { lat: "lat", lng: "lng" },
  ...extra,
});
const NODES: ScenarioNode[] = [
  generic("signin"),
  generic("usage_day", { magnitude: "requests", coords: undefined }),
  generic("decision", { decision: { status: "status" } as unknown as ScenarioNode["decision"] }),
];

const entity = (id: string, kind: string, timestamp: number): Entity => ({
  id,
  kind,
  timestamp,
  coords: null,
  fields: { id },
  displayMetadata: { primaryLabel: id, secondaryLabel: id, paletteKind: kind, pivotableFields: [] },
});

beforeEach(() => {
  usePlayhead.setState({ windowMin: WINDOW_MIN, windowMax: WINDOW_MAX });
  useSchema.getState().setActive("day-band-test", NODES);
});

describe("useCaseDayCells with a story of its own kinds", () => {
  it("counts each dot kind's records on the day they landed", () => {
    const entities = [entity("s1", "signin", DAY_1), entity("s2", "signin", DAY_1), entity("s3", "signin", DAY_2)];
    const { result } = renderHook(() => useCaseDayCells([], [], [], [], entities));
    expect(result.current.map((c) => c.count)).toEqual([2, 1]);
  });

  it("does not count a magnitude kind, a placed decision kind or a record with no time", () => {
    const entities = [
      entity("s1", "signin", DAY_1),
      entity("u1", "usage_day", DAY_2),
      entity("d1", "decision", DAY_2),
      entity("o1", "signin", 0),
    ];
    const { result } = renderHook(() => useCaseDayCells([], [], [], [], entities));
    expect(result.current.map((c) => c.count)).toEqual([1, 0]);
  });
});

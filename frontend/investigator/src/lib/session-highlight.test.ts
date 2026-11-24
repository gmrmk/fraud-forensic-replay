/**
 * Session-thread highlight semantics for timeline ticks: with no active
 * filter every tick is neutral; with an active filter the matching session
 * highlights and EVERYTHING else dims - including null-session ticks, which
 * can never highlight. Pure function; the Timeline owns the rendering.
 */
import { describe, expect, it } from "vitest";
import { sessionTickState } from "./session-highlight";

describe("sessionTickState", () => {
  it("returns neutral for a session tick when no filter is active", () => {
    expect(sessionTickState("sess-a", null)).toEqual({
      highlighted: false,
      dimmed: false,
    });
  });

  it("returns neutral for a null-session tick when no filter is active", () => {
    expect(sessionTickState(null, null)).toEqual({
      highlighted: false,
      dimmed: false,
    });
  });

  it("highlights the tick whose session matches the active filter", () => {
    expect(sessionTickState("sess-a", "sess-a")).toEqual({
      highlighted: true,
      dimmed: false,
    });
  });

  it("dims a tick from a different session while a filter is active", () => {
    expect(sessionTickState("sess-b", "sess-a")).toEqual({
      highlighted: false,
      dimmed: true,
    });
  });

  it("dims a null-session tick while a filter is active - never highlights it", () => {
    expect(sessionTickState(null, "sess-a")).toEqual({
      highlighted: false,
      dimmed: true,
    });
  });
});

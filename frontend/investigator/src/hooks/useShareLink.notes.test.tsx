/**
 * A note's id and text never enter the address bar. A selected note is a selection like any
 * other, so the hook would write its id to `sel`; the writer drops a note id. The test DOM
 * ignores history.replaceState, so the address is the last one the hook asked for.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, act } from "@testing-library/react";
import { useShareLink } from "./useShareLink";
import { parseShareLink } from "../lib/share-link";
import { usePlayhead } from "../store/playhead";
import { useSelection } from "../store/selection";
import { useSchema } from "../store/schema";
import { useTheme } from "../store/theme";
import { useTrackBy } from "../store/track-by";
import { useSolo } from "../store/solo";
import { noteToEntity } from "../lib/notes/entity";
import { bodyOf, makeNote } from "../lib/notes/test-fixtures";
import type { BootFocusRows } from "../lib/boot-focus";

const T0 = Date.parse("2026-06-08T00:00:00Z");
const NONE: BootFocusRows = { transactions: [], logins: [], accountEvents: [], transfers: [], entities: [] };
const NOTE = makeNote({ body: bodyOf("Words that must stay out of the address."), time: T0 + 3_600_000 });

function Probe() {
  useShareLink({ rows: NONE, map: null, link: {} });
  return null;
}
const address = (): string | null => {
  const call = vi.mocked(window.history.replaceState).mock.calls.at(-1);
  return call ? String(call[2]) : null;
};
const settle = () => act(() => void vi.advanceTimersByTime(400));

beforeEach(() => {
  vi.useFakeTimers();
  vi.spyOn(window.history, "replaceState");
  usePlayhead.setState({ minTime: T0, maxTime: T0 + 24 * 3_600_000, windowMin: T0, windowMax: T0 + 24 * 3_600_000, playhead: T0, isPlaying: false, isScrubbing: false, markA: null, markB: null, opening: null });
  useSelection.setState({ selected: null });
  useSchema.setState({ nodes: [], scenarioId: "card-fraud", rows: undefined, fields: undefined });
  useTheme.setState({ theme: "dark", color: "neon" });
  useTrackBy.setState({ by: null });
  useSolo.setState({ solo: null });
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe("the address bar and a selected note", () => {
  it("selecting a note writes the address without its id or any of its text", () => {
    render(<Probe />);
    settle();
    act(() => useSelection.setState({ selected: { kind: "entity", entity: noteToEntity(NOTE, () => null) } }));
    settle();
    const a = address();
    expect(a).not.toBeNull();
    expect(a).not.toContain("note-");
    expect(a).not.toContain(NOTE.id);
    expect(a).not.toMatch(/Words|stay|address/);
    expect(decodeURIComponent(a ?? "")).not.toContain("sel=");
    expect(parseShareLink(a ?? "").sel).toBeUndefined();
    expect(parseShareLink(a ?? "").scenario).toBe("card-fraud");
  });

  it("a record that is not a note is still written to sel", () => {
    render(<Probe />);
    act(() =>
      useSelection.setState({
        selected: { kind: "entity", entity: { id: "stop-1", kind: "stop", timestamp: T0, coords: null, fields: {}, displayMetadata: { primaryLabel: "S", secondaryLabel: "", paletteKind: "stop", pivotableFields: [] } } },
      }),
    );
    settle();
    expect(parseShareLink(address() ?? "").sel).toBe("stop-1");
  });
});

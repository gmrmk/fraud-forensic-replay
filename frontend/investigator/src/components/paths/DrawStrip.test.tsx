/**
 * The drawing strip (G6): its frame and chips (T29), Add stop (T30), Done, Cancel and a refused save
 * (T31) and the focus (T32). The path session, the marks store, the selection and the pivot data are the
 * real stores; the case lookup finds real entities through the pivot data. A slow or refused save is made
 * by replacing the marks store's own createPath with a function that answers it, never by mocking the
 * whole store.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { DrawStrip, stripLayout, type ChipIn, type StripRoom } from "./DrawStrip";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import drawStripSource from "./DrawStrip.tsx?raw";
import appSource from "../../App.tsx?raw";
import inspectorSource from "../Inspector.tsx?raw";
import narrativeSource from "../NarrativeLog.tsx?raw";
import { usePathSession } from "./path-session";
import { NOTE_TIME, SCENARIO } from "../notes/test-support";
import { resetNotesTransport, startNotesTransport } from "../../lib/notes-io/session";
import { resetUnsaved } from "../../lib/notes-io/unsaved";
import type { Entity } from "../../lib/entity";
import type { CustomPath, RecordRef } from "../../lib/marks/types";
import type { ScenarioNode } from "../../lib/scenarios";
import { fail, type Check } from "../../lib/notes/types";
import { PATH_WORDS, chipTip, hiddenChips } from "../../lib/tooltip-words/paths";
import { useMarksStore } from "../../store/marks";
import { useNotesStore } from "../../store/notes";
import { usePivotData } from "../../store/pivot-data";
import { usePlayhead } from "../../store/playhead";
import { useSchema } from "../../store/schema";
import { useSelection } from "../../store/selection";
import type { Transaction } from "../../types";

const TIMES_SIGN = String.fromCodePoint(0xd7);
// The stylesheet is read from disk: the test runner draws no CSS, so its ?raw import comes back empty.
const cssSource = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), "../../index.css"), "utf8");

const entity = (id: string, name: string, i: number): Entity => ({
  id,
  kind: "stop",
  timestamp: i < 0 ? 0 : NOTE_TIME + i * 60_000,
  coords: { lat: 29.76, lng: -95.37 },
  fields: {},
  displayMetadata: { primaryLabel: name, secondaryLabel: "", paletteKind: "stop", pivotableFields: [] },
});

/** Eight timed records, rec-1 the earliest, and one record with no time. */
const TIMED: Entity[] = Array.from({ length: 8 }, (_, i) => entity(`rec-${i + 1}`, `Stop ${i + 1} name`, i));
const UNTIMED = entity("rec-none", "Untimed name", -1);
const SCHEMA_NODE: ScenarioNode = { kind: "stop", label: "Stop", palette: "stop", source: "stop" };
const FRAUD_TX = { id: "tx-1", is_fraud: 1, timestamp: "2026-04-27T12:00:00Z", merchant_name: "Corner Cafe" } as unknown as Transaction;

const ref = (n: number): RecordRef => ({ kind: "stop", id: `rec-${n}` });
const REAL_CREATE_PATH = useMarksStore.getState().createPath;
const playheadAtStart = usePlayhead.getState();

function draw(name: string, ...stops: RecordRef[]): void {
  act(() => {
    usePathSession.getState().start(name);
    for (const s of stops) usePathSession.getState().addStop(s);
  });
}
const select = (e: Entity) => act(() => useSelection.getState().selectEntity(e));

beforeEach(async () => {
  useMarksStore.setState({ createPath: REAL_CREATE_PATH });
  resetNotesTransport();
  resetUnsaved();
  useNotesStore.getState().setBacking(null);
  useNotesStore.getState().clear();
  useMarksStore.getState().setBacking(null);
  useMarksStore.getState().clear();
  usePathSession.setState({ draft: null, hidden: [], chosen: null });
  useSelection.setState({ selected: null });
  useSchema.setState({ nodes: [SCHEMA_NODE] });
  usePivotData.setState({ entities: [...TIMED, UNTIMED], transactions: [FRAUD_TX] });
  startNotesTransport(true);
  await useNotesStore.getState().load(SCENARIO);
  await useMarksStore.getState().load(SCENARIO);
});

afterEach(() => {
  usePivotData.setState({ entities: [], transactions: [] });
  useSchema.setState({ nodes: [] });
  useSelection.setState({ selected: null });
  usePlayhead.setState(playheadAtStart);
});

const strip = (name: string) => screen.getByRole("group", { name });
const button = (name: string | RegExp) => screen.getByRole("button", { name });

describe("DrawStrip: frame and chips (T29)", () => {
  it("renders nothing with no draft", () => {
    const { container } = render(<DrawStrip returnFocus={() => {}} />);
    expect(container.firstChild).toBeNull();
  });

  it("with a draft of no stop, is a group named for the path with the lens, the name and three buttons", () => {
    draw("Path 3");
    render(<DrawStrip returnFocus={() => {}} />);
    const group = strip("Drawing Path 3");
    expect(group.querySelector('svg[data-glyph="lens"]')).not.toBeNull();
    expect(within(group).getByText("Path 3")).toBeTruthy();
    for (const label of ["Add stop", "Done", "Cancel"]) expect(within(group).getByRole("button", { name: label }), label).toBeTruthy();
    expect(group.querySelectorAll("[data-chip]")).toHaveLength(0);
  });

  it("shows each stop as a chip with its number, its headline and a remove button, and the remove drops that stop", () => {
    draw("Path 1", ref(1), ref(2));
    render(<DrawStrip returnFocus={() => {}} />);
    const chips = [...strip("Drawing Path 1").querySelectorAll<HTMLElement>("[data-chip]")];
    expect(chips.map((c) => c.textContent)).toEqual([`1Stop 1 name${TIMES_SIGN}`, `2Stop 2 name${TIMES_SIGN}`]);
    expect(chips[1].getAttribute("data-tip")).toBe(chipTip(2, "Stop: Stop 2 name").join("\n"));
    const remove = button("Remove stop 2");
    expect(remove.getAttribute("data-tip")).toBe(PATH_WORDS.tips.removeStop);
    fireEvent.click(remove);
    expect(usePathSession.getState().draft?.stops).toEqual([ref(1)]);
  });

  it("past four stops shows +N for the stops it leaves out, with them in its tooltip, then the last three chips", () => {
    draw("Path 1", ...[1, 2, 3, 4, 5, 6].map(ref));
    render(<DrawStrip returnFocus={() => {}} />);
    const group = strip("Drawing Path 1");
    const more = within(group).getByText("+3");
    expect(more.getAttribute("data-tip")).toBe(hiddenChips(["Stop: Stop 1 name", "Stop: Stop 2 name", "Stop: Stop 3 name"]).join("\n"));
    const chips = [...group.querySelectorAll<HTMLElement>("[data-chip]")];
    expect(chips.map((c) => c.getAttribute("data-chip"))).toEqual(["4", "5", "6"]);
    // The remove button of a chip drops its own stop by its place in the whole list, not in the three shown.
    fireEvent.click(button("Remove stop 5"));
    expect(usePathSession.getState().draft?.stops.map((s) => s.id)).toEqual(["rec-1", "rec-2", "rec-3", "rec-4", "rec-6"]);
  });

  it("at four stops shows four chips and no +N", () => {
    draw("Path 1", ...[1, 2, 3, 4].map(ref));
    render(<DrawStrip returnFocus={() => {}} />);
    expect(strip("Drawing Path 1").querySelectorAll("[data-chip]")).toHaveLength(4);
    expect(screen.queryByText(/^\+\d+$/)).toBeNull();
  });

  it("a stop whose record is not in the data reads Record not found on its chip", () => {
    draw("Path 1", { kind: "stop", id: "rec-gone" });
    render(<DrawStrip returnFocus={() => {}} />);
    expect(screen.getByText(PATH_WORDS.labels.recordNotFound)).toBeTruthy();
  });

  it("the box is square and at most 560 px wide, with no type size above 10 px and no fade", () => {
    draw("Path 1", ...[1, 2, 3, 4, 5].map(ref));
    const { container } = render(<DrawStrip returnFocus={() => {}} />);
    const group = strip("Drawing Path 1");
    expect(group.className).toContain("max-w-[560px]");
    const panel = group.querySelector<HTMLElement>(".instrument");
    expect(panel).not.toBeNull();
    expect(panel?.classList.contains("!rounded-none")).toBe(true);
    expect(panel?.style.borderRadius ?? "").toBe("");
    const all = [...container.querySelectorAll<HTMLElement>("*")];
    const rounded = all.filter((el) => [...el.classList].some((c) => /^rounded(-|$)/.test(c)));
    expect(rounded).toEqual([]);
    const sizes = all.flatMap((el) => [...el.classList].map((c) => /^text-\[(\d+)px\]$/.exec(c)?.[1]).filter((s): s is string => s !== undefined));
    expect(sizes.length).toBeGreaterThan(0);
    for (const s of sizes) expect(Number(s)).toBeLessThanOrEqual(10);
    expect(all.filter((el) => el.style.fontSize !== "" || el.style.opacity !== "")).toEqual([]);
    expect(all.filter((el) => [...el.classList].some((c) => /(^|:)opacity-/.test(c)))).toEqual([]);
  });
});

describe("DrawStrip: Add stop (T30)", () => {
  const add = () => button("Add stop");

  it("is disabled with Select a record first when nothing is selected, and a press adds nothing", () => {
    draw("Path 1");
    render(<DrawStrip returnFocus={() => {}} />);
    expect(add().getAttribute("aria-disabled")).toBe("true");
    expect(add().getAttribute("data-tip")).toBe(PATH_WORDS.tips.noSelection);
    fireEvent.click(add());
    expect(usePathSession.getState().draft?.stops).toEqual([]);
  });

  it("is disabled with This record has no time for a record with no time", () => {
    draw("Path 1");
    select(UNTIMED);
    render(<DrawStrip returnFocus={() => {}} />);
    expect(add().getAttribute("aria-disabled")).toBe("true");
    expect(add().getAttribute("data-tip")).toBe(PATH_WORDS.tips.noTime);
    fireEvent.click(add());
    expect(usePathSession.getState().draft?.stops).toEqual([]);
  });

  it("is disabled with This record has no time for a record the data does not hold", () => {
    draw("Path 1");
    select(entity("rec-elsewhere", "Elsewhere", 3));
    render(<DrawStrip returnFocus={() => {}} />);
    expect(add().getAttribute("data-tip")).toBe(PATH_WORDS.tips.noTime);
  });

  it("is disabled with This record is a stop already for a record in the draft", () => {
    draw("Path 1", ref(1));
    select(TIMED[0]);
    render(<DrawStrip returnFocus={() => {}} />);
    expect(add().getAttribute("aria-disabled")).toBe("true");
    expect(add().getAttribute("data-tip")).toBe(PATH_WORDS.tips.alreadyStop);
    fireEvent.click(add());
    expect(usePathSession.getState().draft?.stops).toEqual([ref(1)]);
  });

  it("is disabled with This path has 50 stops at 50", () => {
    draw("Path 1", ...Array.from({ length: 50 }, (_, i) => ({ kind: "stop", id: `other-${i}` })));
    select(TIMED[0]);
    render(<DrawStrip returnFocus={() => {}} />);
    expect(add().getAttribute("aria-disabled")).toBe("true");
    expect(add().getAttribute("data-tip")).toBe(PATH_WORDS.tips.fullPath);
    fireEvent.click(add());
    expect(usePathSession.getState().draft?.stops).toHaveLength(50);
  });

  it("enabled, names the record on a second tooltip line, and a press adds it as the next stop", () => {
    draw("Path 1", ref(2));
    select(TIMED[0]);
    render(<DrawStrip returnFocus={() => {}} />);
    expect(add().getAttribute("aria-disabled")).toBe("false");
    expect(add().getAttribute("data-tip")).toBe(`${PATH_WORDS.tips.addStop}\nStop: Stop 1 name`);
    fireEvent.click(add());
    expect(usePathSession.getState().draft?.stops).toEqual([ref(2), ref(1)]);
    // Once added, the same record is a stop already.
    expect(add().getAttribute("data-tip")).toBe(PATH_WORDS.tips.alreadyStop);
  });

  it("adds a fraud authorization with its kind made canonical", () => {
    draw("Path 1");
    act(() => useSelection.getState().selectTransaction(FRAUD_TX));
    render(<DrawStrip returnFocus={() => {}} />);
    fireEvent.click(add());
    expect(usePathSession.getState().draft?.stops).toEqual([{ kind: "auth", id: "tx-1" }]);
  });

  it("a press changes neither the playhead nor the selection", () => {
    usePlayhead.setState({ playhead: NOTE_TIME + 5 });
    draw("Path 1");
    select(TIMED[3]);
    const selected = useSelection.getState().selected;
    render(<DrawStrip returnFocus={() => {}} />);
    fireEvent.click(add());
    expect(usePathSession.getState().draft?.stops).toEqual([ref(4)]);
    expect(usePlayhead.getState().playhead).toBe(NOTE_TIME + 5);
    expect(useSelection.getState().selected).toBe(selected);
  });

  it("follows the selection: a later selection changes what the button offers", () => {
    draw("Path 1");
    render(<DrawStrip returnFocus={() => {}} />);
    expect(add().getAttribute("data-tip")).toBe(PATH_WORDS.tips.noSelection);
    select(TIMED[2]);
    expect(add().getAttribute("data-tip")).toBe(`${PATH_WORDS.tips.addStop}\nStop: Stop 3 name`);
  });
});

describe("DrawStrip: Done, Cancel and a refused save (T31)", () => {
  const done = () => button("Done");
  const cancel = () => button("Cancel");

  it("Done is disabled with A path needs two stops under two, and a press saves nothing", () => {
    const spy = vi.fn(REAL_CREATE_PATH);
    useMarksStore.setState({ createPath: spy });
    draw("Path 1", ref(1));
    render(<DrawStrip returnFocus={() => {}} />);
    expect(done().getAttribute("aria-disabled")).toBe("true");
    expect(done().getAttribute("data-tip")).toBe(PATH_WORDS.tips.needsTwo);
    fireEvent.click(done());
    expect(spy).not.toHaveBeenCalled();
  });

  it("Done at two stops saves the path once under its name, the strip goes, and the focus goes back once", async () => {
    const spy = vi.fn(REAL_CREATE_PATH);
    useMarksStore.setState({ createPath: spy });
    const returnFocus = vi.fn();
    draw("Path 7", ref(1), ref(2));
    render(<DrawStrip returnFocus={returnFocus} />);
    expect(done().getAttribute("aria-disabled")).toBe("false");
    expect(done().getAttribute("data-tip")).toBe(PATH_WORDS.tips.done);
    await act(async () => {
      fireEvent.click(done());
    });
    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy).toHaveBeenCalledWith([ref(1), ref(2)], "Path 7");
    expect(useMarksStore.getState().paths.map((p) => p.name)).toEqual(["Path 7"]);
    expect(screen.queryByRole("group")).toBeNull();
    expect(returnFocus).toHaveBeenCalledTimes(1);
  });

  it("a refusal for a full scenario keeps the strip and Done, shows Not saved with the limit sentence, and returns no focus", async () => {
    useMarksStore.setState({ createPath: async () => fail("limit_reached", "path") });
    const returnFocus = vi.fn();
    draw("Path 1", ref(1), ref(2));
    render(<DrawStrip returnFocus={returnFocus} />);
    await act(async () => {
      fireEvent.click(done());
    });
    const note = screen.getByText(PATH_WORDS.labels.notSaved);
    expect(note.getAttribute("data-tip")).toBe(PATH_WORDS.tips.limit);
    expect(done().getAttribute("aria-disabled")).toBe("false");
    expect(usePathSession.getState().draft?.stops).toHaveLength(2);
    expect(returnFocus).not.toHaveBeenCalled();
  });

  it("any other refusal shows Not saved with The path is not saved", async () => {
    useMarksStore.setState({ createPath: async () => fail("backing_failed", "path") });
    draw("Path 1", ref(1), ref(2));
    render(<DrawStrip returnFocus={() => {}} />);
    await act(async () => {
      fireEvent.click(done());
    });
    expect(screen.getByText(PATH_WORDS.labels.notSaved).getAttribute("data-tip")).toBe(PATH_WORDS.tips.notSavedPath);
  });

  it("no Not saved shows before a refusal", () => {
    draw("Path 1", ref(1), ref(2));
    render(<DrawStrip returnFocus={() => {}} />);
    expect(screen.queryByText(PATH_WORDS.labels.notSaved)).toBeNull();
  });

  it("while the save runs the three buttons are disabled and a second press saves nothing more", async () => {
    let release: (c: Check<CustomPath>) => void = () => {};
    const spy = vi.fn(
      (_stops: RecordRef[], _name?: string) =>
        new Promise<Check<CustomPath>>((resolve) => {
          release = resolve;
        }),
    );
    useMarksStore.setState({ createPath: spy });
    select(TIMED[4]);
    draw("Path 1", ref(1), ref(2));
    render(<DrawStrip returnFocus={() => {}} />);
    fireEvent.click(done());
    fireEvent.click(done());
    expect(spy).toHaveBeenCalledTimes(1);
    for (const name of ["Add stop", "Done", "Cancel"]) expect(button(name).getAttribute("aria-disabled"), name).toBe("true");
    fireEvent.click(button("Add stop"));
    fireEvent.click(cancel());
    expect(usePathSession.getState().draft?.stops).toHaveLength(2);
    expect(usePathSession.getState().draft?.asking).toBe(false);
    await act(async () => {
      release(fail("backing_failed", "path"));
    });
    expect(done().getAttribute("aria-disabled")).toBe("false");
  });

  it("Cancel with no stop ends the draft at once and returns the focus once", () => {
    const returnFocus = vi.fn();
    draw("Path 1");
    render(<DrawStrip returnFocus={returnFocus} />);
    expect(cancel().getAttribute("data-tip")).toBe(PATH_WORDS.tips.cancel);
    fireEvent.click(cancel());
    expect(usePathSession.getState().draft).toBeNull();
    expect(screen.queryByRole("group")).toBeNull();
    expect(returnFocus).toHaveBeenCalledTimes(1);
  });

  it("Cancel with stops asks Discard or Keep drawing in place of the three buttons", () => {
    draw("Path 1", ref(1));
    render(<DrawStrip returnFocus={() => {}} />);
    fireEvent.click(cancel());
    expect(usePathSession.getState().draft?.asking).toBe(true);
    for (const name of ["Add stop", "Done", "Cancel"]) expect(screen.queryByRole("button", { name }), name).toBeNull();
    expect(button("Discard").getAttribute("data-tip")).toBe(PATH_WORDS.tips.discard);
    expect(button("Keep drawing").getAttribute("data-tip")).toBe(PATH_WORDS.tips.keepDrawing);
  });

  it("Keep drawing goes back to the three buttons with the stops kept, and returns no focus to the Paths button", () => {
    const returnFocus = vi.fn();
    draw("Path 1", ref(1), ref(2));
    render(<DrawStrip returnFocus={returnFocus} />);
    fireEvent.click(cancel());
    fireEvent.click(button("Keep drawing"));
    expect(usePathSession.getState().draft?.asking).toBe(false);
    expect(usePathSession.getState().draft?.stops).toHaveLength(2);
    expect(button("Done")).toBeTruthy();
    expect(returnFocus).not.toHaveBeenCalled();
  });

  it("Discard drops the draft and its stops, the strip goes and the focus goes back once", () => {
    const returnFocus = vi.fn();
    draw("Path 1", ref(1), ref(2));
    render(<DrawStrip returnFocus={returnFocus} />);
    fireEvent.click(cancel());
    fireEvent.click(button("Discard"));
    expect(usePathSession.getState().draft).toBeNull();
    expect(screen.queryByRole("group")).toBeNull();
    expect(returnFocus).toHaveBeenCalledTimes(1);
  });
});

describe("DrawStrip: focus (T32)", () => {
  it("the group takes the focus when the draft opens", () => {
    render(<DrawStrip returnFocus={() => {}} />);
    draw("Path 1");
    const group = strip("Drawing Path 1");
    expect(group.getAttribute("tabindex")).toBe("-1");
    expect(document.activeElement).toBe(group);
  });

  it("the group takes the focus when it mounts with a draft already open", () => {
    draw("Path 2", ref(1));
    render(<DrawStrip returnFocus={() => {}} />);
    expect(document.activeElement).toBe(strip("Drawing Path 2"));
  });

  it("while the strip asks Discard or Keep drawing the focus is on Keep drawing, and back on Cancel after it", () => {
    draw("Path 1", ref(1));
    render(<DrawStrip returnFocus={() => {}} />);
    fireEvent.click(button("Cancel"));
    expect(document.activeElement).toBe(button("Keep drawing"));
    fireEvent.click(button("Keep drawing"));
    expect(document.activeElement).toBe(button("Cancel"));
  });
});

/*
 * The strip's place and chip words at narrow windows (R5, D1, D2, F3-2). happy-dom lays nothing out, so the
 * page's reading is given as the `room` prop and the pure rule `stripLayout` is called with the readings each
 * window size gives, in the menu group's own px (0 is its left edge).
 */
const ROOM_1024: StripRoom = { left: 134.2, right: 510.2, centre: 253.1, titleRight: -11, parts: 236.91, name: 42.65 };
const ROOM_1280: StripRoom = { left: -78.9, right: 553.1, centre: 253.1, titleRight: -11, parts: 236.91, name: 42.65 };
const ROOM_1440: StripRoom = { left: -158.9, right: 633.1, centre: 253.1, titleRight: -58, parts: 236.91, name: 42.65 };
const chip = (n: number, chars: number): ChipIn => ({ n, chars });
/** Chips from number `from` to number `to`, each of `chars` characters (17 characters is a natural 96 px). */
const run = (from: number, to: number, chars = 17): ChipIn[] => Array.from({ length: to - from + 1 }, (_, i) => chip(from + i, chars));
const NO_WORDS = (n: number): null[] => Array.from({ length: n }, () => null);

describe("stripLayout (T9, test 23)", () => {
  it("at 1024 by 768 with the Inspector open: two stops keep the name and show numbers", () => {
    expect(stripLayout(ROOM_1024, run(1, 2), 0)).toEqual({ name: true, words: NO_WORDS(2), place: { side: "left", left: 134.2 } });
  });

  it("at 1024 by 768 the name gives way from three stops, and the chips stay numbers", () => {
    expect(stripLayout(ROOM_1024, run(1, 3), 0)).toEqual({ name: false, words: NO_WORDS(3), place: { side: "left", left: 134.2 } });
  });

  it("at 1024 by 768 with four stops the strip is anchored at the Inspector's clearance and reaches left", () => {
    expect(stripLayout(ROOM_1024, run(1, 4), 0)).toEqual({ name: false, words: NO_WORDS(4), place: { side: "right", right: -4 } });
  });

  it("at 1024 by 768 six stops show +3 (a lead of 16.65 px) and chips 4 to 6 as numbers", () => {
    expect(stripLayout(ROOM_1024, run(4, 6), 16.65)).toEqual({ name: false, words: NO_WORDS(3), place: { side: "left", left: 134.2 } });
  });

  it("at 1280 by 800 four stops cut the last two chips to 56 px and drop the first two to numbers, left-anchored at the title card", () => {
    // limit 555.1, cap 120.74, four shown give 26.19, three give 36.25, two give 56.37 (floored to 56).
    expect(stripLayout(ROOM_1280, run(1, 4), 0)).toEqual({ name: true, words: [null, null, 56, 56], place: { side: "left", left: -3 } });
  });

  it("at 1280 by 800 two stops are both cut to 94 px", () => {
    // S is 188.14 against 192, so the level is 94.07.
    expect(stripLayout(ROOM_1280, run(1, 2), 0)).toEqual({ name: true, words: [94, 94], place: { side: "left", left: -3 } });
  });

  it("at 1440 by 900 four stops cut the last two chips to 58 px and stay centred", () => {
    // limit 560, cap 125.64, S 117.64, level 58.82; the width 559.36 centred runs -26.58 to 532.78.
    expect(stripLayout(ROOM_1440, run(1, 4), 0)).toEqual({ name: true, words: [null, null, 58, 58], place: { side: "centre" } });
  });

  it("at 1440 by 900 two stops keep their words whole and stay centred", () => {
    // cap 201.04, S 193.04 against 192.
    expect(stripLayout(ROOM_1440, run(1, 2), 0)).toEqual({ name: true, words: ["whole", "whole"], place: { side: "centre" } });
  });
});

describe("stripLayout: the chip rule (T9, test 24)", () => {
  /** One chip's cap is right - 182.7: parts 100, the name's slot 48 and one chip's floor 33.7, less the rounding px. */
  const R_ = (right: number): StripRoom => ({ left: 0, right, centre: right / 2, titleRight: null, parts: 100, name: 40 });
  const wordsAt = (right: number, chips: ChipIn[], lead = 0) => stripLayout(R_(right), chips, lead).words;

  it("a chip shows words from 51 px, the room of 8 characters, and not from 50.8", () => {
    expect(wordsAt(238, [chip(1, 20)])).toEqual([51]);
    expect(wordsAt(237.5, [chip(1, 20)])).toEqual([null]);
  });

  it("a chip whose room reaches its natural width is whole, and a shorter room cuts it", () => {
    expect(wordsAt(400, [chip(1, 10)])).toEqual(["whole"]);
    expect(wordsAt(245, [chip(1, 10)])).toEqual([58]);
  });

  it("a short chip takes what it needs and the rest goes to the longer one", () => {
    // S is 92.1; chip 1's 31.625 is whole and the level is 60.475.
    expect(wordsAt(320.5, [chip(1, 5), chip(2, 20)])).toEqual(["whole", 60]);
  });

  it("a chip with no characters shows no words", () => {
    expect(wordsAt(400, [chip(1, 0)])).toEqual([null]);
  });

  it("two-digit numbers take more room: three of them with +9 do not fit at step 2 at 1024", () => {
    // The floors are 142.85, and step 2 needs 379.76 against the limit of 375.
    expect(stripLayout(ROOM_1024, [chip(10, 17), chip(11, 17), chip(12, 17)], 16.65)).toEqual({
      name: false,
      words: NO_WORDS(3),
      place: { side: "right", right: -4 },
    });
  });

  it("with Not saved showing (parts 305.86) four stops at 1024 take the right-anchored place", () => {
    expect(stripLayout({ ...ROOM_1024, parts: 305.86 }, run(1, 4), 0)).toEqual({ name: false, words: NO_WORDS(4), place: { side: "right", right: -4 } });
  });

  it("once the name has given way, a chip that can show 8 characters shows them (F3-2)", () => {
    // A name of 120 px at the 1024 room, two chips of 17 characters. The limit is 375. Step 1 needs
    // 236.91 + 128 + 71.4 = 436.31, so the name gives way. Step 2: parts and floors are 308.31, within 375.
    // cap2 = 375 - 236.91 - 71.4 = 66.69. S = 66.69 - 2 x 4 = 58.69, level 29.345 under 51, so chip 1 drops.
    // One shown: S = 62.69, natural 96, so the level is 62.69, floored to 62.
    expect(stripLayout({ ...ROOM_1024, name: 120 }, run(1, 2), 0)).toEqual({ name: false, words: [null, 62], place: { side: "left", left: 134.2 } });
  });
});

describe("DrawStrip: the strip at a room (T10, tests 25 to 31)", () => {
  const nameBoxOf = (group: HTMLElement): HTMLElement => within(group).getByText("Path 1").parentElement as HTMLElement;
  const chipsOf = (group: HTMLElement): HTMLElement[] => [...group.querySelectorAll<HTMLElement>("[data-chip]")];
  const wordsSpanOf = (c: HTMLElement): HTMLElement | null => c.querySelector<HTMLElement>("span.truncate");

  it("25: four stops at 1024 hide the name, show numbers only and anchor the right edge", () => {
    draw("Path 1", ...[1, 2, 3, 4].map(ref));
    render(<DrawStrip returnFocus={() => {}} room={ROOM_1024} />);
    const group = strip("Drawing Path 1");
    const nameBox = nameBoxOf(group);
    expect(nameBox.style.maxWidth).toBe("0px");
    expect(nameBox.style.marginRight).toBe("-8px");
    expect(nameBox.style.visibility).toBe("hidden");
    const chips = chipsOf(group);
    expect(chips.map((c) => c.textContent)).toEqual([1, 2, 3, 4].map((n) => `${n}${TIMES_SIGN}`));
    chips.forEach((c, k) => {
      expect(wordsSpanOf(c)).toBeNull();
      expect(c.getAttribute("data-tip")).toBe(chipTip(k + 1, `Stop: Stop ${k + 1} name`).join("\n"));
    });
    for (const c of ["absolute", "top-full", "mt-2", "max-w-[560px]"]) expect(group.className, c).toContain(c);
    expect(group.className).not.toContain("left-1/2");
    expect(group.className).not.toContain("-translate-x-1/2");
    expect(group.style.right).toBe("-4px");
    expect(group.style.left).toBe("");
  });

  it("26: four stops at 1280 keep the name, drop chips 1 and 2 to numbers and cut chips 3 and 4 to 56 px", () => {
    draw("Path 1", ...[1, 2, 3, 4].map(ref));
    render(<DrawStrip returnFocus={() => {}} room={ROOM_1280} />);
    const group = strip("Drawing Path 1");
    expect(nameBoxOf(group).getAttribute("style")).toBeNull();
    const chips = chipsOf(group);
    expect(chips.map((c) => c.textContent)).toEqual([`1${TIMES_SIGN}`, `2${TIMES_SIGN}`, `3Stop 3 name${TIMES_SIGN}`, `4Stop 4 name${TIMES_SIGN}`]);
    expect(wordsSpanOf(chips[2])?.style.maxWidth).toBe("56px");
    expect(wordsSpanOf(chips[3])?.style.maxWidth).toBe("56px");
    expect(group.style.left).toBe("-3px");
  });

  it("27: two stops at 1440 keep their words whole and the strip centred", () => {
    draw("Path 1", ref(1), ref(2));
    render(<DrawStrip returnFocus={() => {}} room={ROOM_1440} />);
    const group = strip("Drawing Path 1");
    const chips = chipsOf(group);
    expect(chips.map((c) => wordsSpanOf(c)?.textContent)).toEqual(["Stop 1 name", "Stop 2 name"]);
    expect(chips.map((c) => wordsSpanOf(c)?.style.maxWidth)).toEqual(["", ""]);
    expect(group.className).toContain("left-1/2");
    expect(group.className).toContain("-translate-x-1/2");
    expect(group.style.left).toBe("");
    expect(group.style.right).toBe("");
  });

  it("28: six stops at 1024 show +3 with its tooltip, chips 4 to 6 as numbers and the name hidden", () => {
    draw("Path 1", ...[1, 2, 3, 4, 5, 6].map(ref));
    render(<DrawStrip returnFocus={() => {}} room={ROOM_1024} />);
    const group = strip("Drawing Path 1");
    expect(within(group).getByText("+3").getAttribute("data-tip")).toBe(
      hiddenChips(["Stop: Stop 1 name", "Stop: Stop 2 name", "Stop: Stop 3 name"]).join("\n"),
    );
    const chips = chipsOf(group);
    expect(chips.map((c) => c.getAttribute("data-chip"))).toEqual(["4", "5", "6"]);
    expect(chips.map((c) => c.textContent)).toEqual([4, 5, 6].map((n) => `${n}${TIMES_SIGN}`));
    expect(nameBoxOf(group).style.visibility).toBe("hidden");
    expect(group.style.left).toBe("134.2px");
  });

  it("29: without a room the strip is today's: a band before the group, centred, the name and the words as they are", () => {
    draw("Path 1", ref(1), ref(2));
    render(<DrawStrip returnFocus={() => {}} />);
    const group = strip("Drawing Path 1");
    const band = group.previousElementSibling as HTMLElement;
    expect(band.tagName).toBe("DIV");
    expect(band.classList.contains("path-strip-band")).toBe(true);
    expect(band.hasAttribute("data-path-strip-band")).toBe(true);
    expect(band.getAttribute("aria-hidden")).toBe("true");
    expect(group.className).toContain("left-1/2");
    expect(group.className).toContain("-translate-x-1/2");
    expect(nameBoxOf(group).getAttribute("style")).toBeNull();
    expect(chipsOf(group).map((c) => c.textContent)).toEqual([`1Stop 1 name${TIMES_SIGN}`, `2Stop 2 name${TIMES_SIGN}`]);
  });

  it("30: every button, in both button sets, keeps its width and its words on one line", () => {
    draw("Path 1", ref(1), ref(2));
    render(<DrawStrip returnFocus={() => {}} />);
    const group = strip("Drawing Path 1");
    for (const name of ["Add stop", "Done", "Cancel"]) {
      const c = within(group).getByRole("button", { name }).className;
      expect(c, name).toContain("shrink-0");
      expect(c, name).toContain("whitespace-nowrap");
    }
    fireEvent.click(button("Cancel"));
    for (const name of ["Discard", "Keep drawing"]) {
      const c = within(group).getByRole("button", { name }).className;
      expect(c, name).toContain("shrink-0");
      expect(c, name).toContain("whitespace-nowrap");
    }
  });

  it("31: the strip has its own tooltip, the words of its accessible name, on its row and not on the focused group", () => {
    draw("Path 1", ref(1), ref(2));
    render(<DrawStrip returnFocus={() => {}} />);
    const group = strip("Drawing Path 1");
    expect(within(group).getByText("Path 1").closest("[data-tip]")?.getAttribute("data-tip")).toBe("Drawing Path 1");
    expect(group.hasAttribute("data-tip")).toBe(false);
  });

  it("31: the tooltip stays when the name has given way, and the group is still named for the path", () => {
    draw("Path 1", ...[1, 2, 3, 4].map(ref));
    render(<DrawStrip returnFocus={() => {}} room={ROOM_1024} />);
    const gaveWay = strip("Drawing Path 1");
    expect(nameBoxOf(gaveWay).style.visibility).toBe("hidden");
    expect(within(gaveWay).getByText("Path 1").closest("[data-tip]")?.getAttribute("data-tip")).toBe("Drawing Path 1");
    expect(gaveWay.hasAttribute("data-tip")).toBe(false);
  });
});

describe("DrawStrip: the band and the sources (T8 and T10, test 32)", () => {
  /** A rule of the stylesheet from its selector to its first closing brace. */
  const ruleOf = (selector: string): string => {
    const at = cssSource.indexOf(selector);
    expect(at, `${selector} is in index.css`).toBeGreaterThan(-1);
    return cssSource.slice(at, cssSource.indexOf("}", at) + 1);
  };

  it("index.css holds the band's base rule: the window divided by the text step, the Inspector's reserve, the panel's 288 px, boxed and unpainted", () => {
    const rule = ruleOf("\n.path-strip-band {");
    for (const part of [
      "calc(100vw / var(--ts))",
      "var(--reserve)",
      "min(var(--reserve), 8px)",
      "288px",
      "top: 100%",
      "height: 0",
      "visibility: hidden",
      "pointer-events: none",
    ]) {
      expect(rule, part).toContain(part);
    }
  });

  it("the band's base rule holds no type size", () => {
    expect(ruleOf("\n.path-strip-band {")).not.toContain("font-size");
  });

  it("index.css has the band's two other rules:the Narrative panel folded (44 px) and not drawn (0), told by its toggle's label", () => {
    const folded = ruleOf(':root:has(button[aria-label="Open the narrative"]) .path-strip-band {');
    expect(folded).toContain("44px");
    expect(folded).not.toContain("288px");
    const none = ruleOf(':root:not(:has(button[aria-label$="the narrative"])) .path-strip-band {');
    expect(none).toContain("calc(0px - var(--strip-at))");
    expect(none).not.toContain("288px");
  });

  it("the twins the band reads stay where its numbers expect them", () => {
    expect(narrativeSource).toContain("left-3");
    expect(narrativeSource).toContain("w-[288px]");
    expect(narrativeSource).toContain("244px");
    expect(narrativeSource).toContain('"Open the narrative"');
    expect(narrativeSource).toContain('"Fold the narrative"');
    expect(inspectorSource).toContain("w-80");
    expect(appSource).toContain("col-start-1");
    expect(appSource).toContain("top-row-menu");
  });

  it("the strip reads the page through a ResizeObserver and never on a frame", () => {
    expect(drawStripSource).toContain("new ResizeObserver(");
    expect(drawStripSource).not.toContain("requestAnimationFrame");
  });
});

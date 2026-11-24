/**
 * Your paths, the block of the Paths menu that lists the investigator's saved paths: the rows (T21), the
 * details of a row (T22), Rename (T23) and Remove (T24). Paths are made through the real marks store and
 * the memory backing; records are entities the real case lookup finds through the pivot data. A refusal is
 * made by replacing one store action with a function that answers it, never by a mock of the whole store.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { YourPaths } from "./YourPaths";
import { usePathSession } from "./path-session";
import { NOTE_TIME, SCENARIO } from "../notes/test-support";
import { resetNotesTransport, startNotesTransport } from "../../lib/notes-io/session";
import { resetUnsaved } from "../../lib/notes-io/unsaved";
import type { Entity } from "../../lib/entity";
import type { CustomPath, RecordRef } from "../../lib/marks/types";
import type { ScenarioNode } from "../../lib/scenarios";
import { fail, type Check } from "../../lib/notes/types";
import { PATH_WORDS, rowTip } from "../../lib/tooltip-words/paths";
import { TipLayer, showTipAt } from "../ui/Tip";
import { useLayers } from "../../store/layers";
import { useMarksStore } from "../../store/marks";
import { useNotesStore } from "../../store/notes";
import { usePivotData } from "../../store/pivot-data";
import { useSchema } from "../../store/schema";

const entity = (id: string, name: string, i: number, placed: boolean): Entity => ({
  id,
  kind: "stop",
  timestamp: NOTE_TIME + i * 60_000,
  coords: placed ? { lat: 29.76, lng: -95.37 } : null,
  fields: {},
  displayMetadata: { primaryLabel: name, secondaryLabel: "", paletteKind: "stop", pivotableFields: [] },
});

/** Twelve records: the first four placed, the fifth with no place, then seven more placed. */
const ENTITIES: Entity[] = Array.from({ length: 12 }, (_, i) => entity(`rec-${i + 1}`, `Stop ${i + 1} name`, i, i !== 4));
const SCHEMA_NODE: ScenarioNode = { kind: "stop", label: "Stop", palette: "stop", source: "stop" };
const ref = (n: number): RecordRef => ({ kind: "stop", id: `rec-${n}` });
const refs = (...ns: number[]): RecordRef[] => ns.map(ref);

async function makePath(stops: RecordRef[], name?: string): Promise<CustomPath> {
  const made = await act(async () => useMarksStore.getState().createPath(stops, name));
  if (!made.ok) throw new Error(`seed refused: ${made.code}`);
  return made.value;
}

/** Two saved paths: Path 1 of four stops, Path 2 of two. */
async function seedTwo(): Promise<{ one: CustomPath; two: CustomPath }> {
  const one = await makePath(refs(1, 2, 3, 4), "Path 1");
  const two = await makePath(refs(5, 6), "Path 2");
  return { one, two };
}

// The store actions a test replaces with a spy or a refusal, kept here so each test starts with the real ones.
const REAL_MARKS = {
  createPath: useMarksStore.getState().createPath,
  updatePath: useMarksStore.getState().updatePath,
  removePath: useMarksStore.getState().removePath,
};
const REAL_FORGET = usePathSession.getState().forget;

beforeEach(async () => {
  useMarksStore.setState(REAL_MARKS);
  usePathSession.setState({ forget: REAL_FORGET });
  resetNotesTransport();
  resetUnsaved();
  useNotesStore.getState().setBacking(null);
  useNotesStore.getState().clear();
  useMarksStore.getState().setBacking(null);
  useMarksStore.getState().clear();
  usePathSession.setState({ draft: null, hidden: [], chosen: null });
  usePivotData.setState({ entities: ENTITIES });
  useSchema.setState({ nodes: [SCHEMA_NODE] });
  startNotesTransport(true);
  await useNotesStore.getState().load(SCENARIO);
  await useMarksStore.getState().load(SCENARIO);
});

afterEach(() => {
  useLayers.setState({ hiddenKinds: [] });
  usePivotData.setState({ entities: [] });
  useSchema.setState({ nodes: [] });
});

const switchOf = (name: string) => screen.getByRole("button", { name });

describe("YourPaths rows (T21)", () => {
  it("draws nothing when the scenario holds no saved path", () => {
    const { container } = render(<YourPaths />);
    expect(container.innerHTML).toBe("");
  });

  it("heads the rows with the lens and Your paths, and the heading says what it is", async () => {
    await seedTwo();
    render(<YourPaths />);
    const heading = screen.getByRole("heading", { name: "Your paths" });
    const box = heading.parentElement as HTMLElement;
    expect(box.querySelector('[data-glyph="lens"]')).not.toBeNull();
    expect(box.getAttribute("data-tip")).toBe("Paths you made.");
  });

  it("draws one pressed-state switch for each path, in seq order, named for the path", async () => {
    await seedTwo();
    render(<YourPaths />);
    const names = screen.getAllByRole("button").filter((b) => b.hasAttribute("aria-pressed"));
    expect(names.map((b) => b.getAttribute("aria-label"))).toEqual(["Path 1, your path", "Path 2, your path"]);
    expect(names.every((b) => b.getAttribute("aria-pressed") === "true")).toBe(true);
  });

  it("shows each path's stop count, read aloud as stops, and a details chevron named for the path", async () => {
    await seedTwo();
    render(<YourPaths />);
    const one = switchOf("Path 1, your path");
    const two = switchOf("Path 2, your path");
    expect(one.textContent).toContain("4");
    expect(one.textContent).toContain("4 stops");
    expect(two.textContent).toContain("2 stops");
    expect(screen.getByRole("button", { name: "Path 1 details" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Path 2 details" })).toBeTruthy();
  });

  it("a press on a switch hides that path for this visit, and a second press shows it again", async () => {
    const { one } = await seedTwo();
    render(<YourPaths />);
    fireEvent.click(switchOf("Path 1, your path"));
    expect(usePathSession.getState().hidden).toEqual([one.id]);
    expect(switchOf("Path 1, your path").getAttribute("aria-pressed")).toBe("false");
    expect(switchOf("Path 2, your path").getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(switchOf("Path 1, your path"));
    expect(usePathSession.getState().hidden).toEqual([]);
  });

  it("the pointer or the focus on a row chooses that path, and leaving it or blurring chooses none", async () => {
    const { one, two } = await seedTwo();
    render(<YourPaths />);
    const row = switchOf("Path 1, your path").closest("[data-tip]") as HTMLElement;
    fireEvent.pointerEnter(row);
    expect(usePathSession.getState().chosen).toBe(one.id);
    fireEvent.pointerLeave(row);
    expect(usePathSession.getState().chosen).toBeNull();
    fireEvent.focus(switchOf("Path 2, your path"));
    expect(usePathSession.getState().chosen).toBe(two.id);
    fireEvent.blur(switchOf("Path 2, your path"), { relatedTarget: document.body });
    expect(usePathSession.getState().chosen).toBeNull();
  });

  it("a menu that closes while the pointer is on a row leaves no path chosen", async () => {
    const { one } = await seedTwo();
    const { unmount } = render(<YourPaths />);
    fireEvent.pointerEnter(switchOf("Path 1, your path").closest("[data-tip]") as HTMLElement);
    expect(usePathSession.getState().chosen).toBe(one.id);
    unmount();
    expect(usePathSession.getState().chosen).toBeNull();
  });

  it("a row's tooltip says what the path is and where it is drawn, and drops the second line for a path switched off", async () => {
    await seedTwo();
    render(<YourPaths />);
    const tipOf = (name: string) => (switchOf(name).closest("[data-tip]") as HTMLElement).getAttribute("data-tip");
    expect(tipOf("Path 1, your path")).toBe(rowTip(4, "globe").join("\n"));
    fireEvent.click(switchOf("Path 1, your path"));
    expect(tipOf("Path 1, your path")).toBe(rowTip(4, null).join("\n"));
  });

  it("a path whose every stop is hidden by a layer switch reads as drawn on neither surface", async () => {
    await makePath(refs(1, 2), "Path 1");
    render(<YourPaths />);
    act(() => useLayers.setState({ hiddenKinds: ["stop"] }));
    const row = switchOf("Path 1, your path").closest("[data-tip]") as HTMLElement;
    expect(row.getAttribute("data-tip")).toBe(rowTip(2, null).join("\n"));
  });
});

describe("YourPaths details (T22)", () => {
  function openOne(): HTMLElement {
    fireEvent.click(screen.getByRole("button", { name: "Path 1 details" }));
    const id = screen.getByRole("button", { name: "Path 1 details" }).getAttribute("aria-controls") as string;
    return document.getElementById(id) as HTMLElement;
  }

  it("is folded at first and opens on the chevron", async () => {
    await seedTwo();
    render(<YourPaths />);
    const chevron = screen.getByRole("button", { name: "Path 1 details" });
    expect(chevron.getAttribute("aria-expanded")).toBe("false");
    expect(screen.queryByRole("button", { name: "Rename" })).toBeNull();
    const region = openOne();
    expect(chevron.getAttribute("aria-expanded")).toBe("true");
    expect(region).toBeTruthy();
  });

  it("lists the stops one line each: the number, the kind's label and the record's headline", async () => {
    await seedTwo();
    render(<YourPaths />);
    const region = openOne();
    const lines = [...region.querySelectorAll("li")];
    expect(lines).toHaveLength(4);
    expect(lines[0].textContent).toContain("1");
    expect(lines[0].textContent).toContain("Stop: Stop 1 name");
    expect(lines[3].textContent).toContain("4");
    expect(lines[3].textContent).toContain("Stop: Stop 4 name");
    // The whole line is in the title, for a line that is cut.
    expect((lines[1].querySelector("[title]") as HTMLElement).getAttribute("title")).toBe("2 Stop: Stop 2 name");
    expect((lines[1].querySelector("[title]") as HTMLElement).className).toContain("truncate");
  });

  it("reads Record not found in the faint tone for a stop whose record is not in the data, the others in the muted tone", async () => {
    await makePath([ref(1), { kind: "stop", id: "rec-gone" }], "Path 1");
    render(<YourPaths />);
    const region = openOne();
    const lines = [...region.querySelectorAll("li")];
    const words = (li: Element) => li.querySelector("[title]") as HTMLElement;
    expect(words(lines[1]).textContent).toBe("Record not found");
    expect(words(lines[1]).style.color).toBe("var(--text-faint)");
    expect(words(lines[0]).style.color).toBe("var(--text-muted)");
  });

  it("lists the first eight stops of a longer path and counts the rest", async () => {
    await makePath(refs(1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12), "Path 1");
    render(<YourPaths />);
    const region = openOne();
    expect(region.querySelectorAll("li")).toHaveLength(8);
    expect(within(region).getByText("+4 more")).toBeTruthy();
  });

  it("is indented as the Layers details are, and nothing in it is faded by opacity", async () => {
    await seedTwo();
    render(<YourPaths />);
    const region = openOne();
    for (const c of ["pb-2.5", "pl-[17px]", "pr-8"]) expect(region.classList.contains(c), c).toBe(true);
    const faded = [...region.querySelectorAll<HTMLElement>("*")].filter(
      (el) => [...el.classList].some((c) => /(^|:)opacity-/.test(c)) || el.style.opacity !== "",
    );
    expect(faded).toEqual([]);
  });
});

describe("YourPaths Rename (T23)", () => {
  async function openRename(): Promise<CustomPath> {
    const { one } = await seedTwo();
    render(<YourPaths />);
    fireEvent.click(screen.getByRole("button", { name: "Path 1 details" }));
    fireEvent.click(screen.getByRole("button", { name: "Rename" }));
    return one;
  }
  const field = () => screen.getByRole("textbox", { name: "Path name" }) as HTMLInputElement;
  const type = (v: string) => fireEvent.change(field(), { target: { value: v } });
  const save = () => screen.getByRole("button", { name: "Save" });

  it("Rename turns the name into a field named Path name that holds the name, with Save and Cancel in place of the two buttons", async () => {
    await openRename();
    expect(field().value).toBe("Path 1");
    expect(field().getAttribute("data-tip")).toBe(PATH_WORDS.tips.pathName);
    expect(document.activeElement).toBe(field());
    expect(save()).toBeTruthy();
    expect(screen.getByRole("button", { name: "Cancel" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Rename" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Remove" })).toBeNull();
  });

  it("Save is disabled with an empty field, and the tooltip says why", async () => {
    await openRename();
    type("   ");
    expect(save().getAttribute("aria-disabled")).toBe("true");
    expect(save().getAttribute("data-tip")).toBe(PATH_WORDS.tips.nameEmpty);
    expect(save().style.color).toBe("var(--text-faint)");
  });

  it("Save is disabled for another path's name in other case, and a path may keep its own name", async () => {
    await openRename();
    type("pATh 2");
    expect(save().getAttribute("aria-disabled")).toBe("true");
    expect(save().getAttribute("data-tip")).toBe(PATH_WORDS.tips.nameTaken);
    type("PATH 1");
    expect(save().getAttribute("aria-disabled")).toBe("false");
    expect(save().getAttribute("data-tip")).toBe(PATH_WORDS.tips.save);
  });

  it("Enter saves through updatePath with the name made NFC and trimmed and the stops kept, and the row shows the new name", async () => {
    const one = await openRename();
    const real = useMarksStore.getState().updatePath;
    const spy = vi.fn(real);
    useMarksStore.setState({ updatePath: spy });
    // "Cafe" and a combining acute accent, padded: NFC makes it one letter, trim drops the padding.
    type(`  Caf${String.fromCodePoint(0x65, 0x301)}  `);
    await act(async () => {
      fireEvent.keyDown(field(), { key: "Enter" });
    });
    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy).toHaveBeenCalledWith(one.id, { name: `Caf${String.fromCodePoint(0xe9)}`, stops: one.stops });
    expect(useMarksStore.getState().paths[0].name).toBe(`Caf${String.fromCodePoint(0xe9)}`);
    expect(screen.queryByRole("textbox", { name: "Path name" })).toBeNull();
    expect(screen.getByRole("button", { name: `Caf${String.fromCodePoint(0xe9)}, your path` })).toBeTruthy();
  });

  it("a save clears the chosen path: the field leaves with the focus in it, so no blur reaches the row", async () => {
    const one = await openRename();
    fireEvent.focus(field());
    expect(usePathSession.getState().chosen).toBe(one.id);
    type("Renamed");
    await act(async () => {
      fireEvent.keyDown(field(), { key: "Enter" });
    });
    expect(usePathSession.getState().chosen).toBeNull();
  });

  it("Enter does nothing while Save is disabled", async () => {
    await openRename();
    const spy = vi.fn(useMarksStore.getState().updatePath);
    useMarksStore.setState({ updatePath: spy });
    type("");
    await act(async () => {
      fireEvent.keyDown(field(), { key: "Enter" });
    });
    expect(spy).not.toHaveBeenCalled();
    expect(field()).toBeTruthy();
  });

  it("a refusal keeps the field and shows Not saved, its tooltip naming the reason", async () => {
    await openRename();
    const cases: [Parameters<typeof fail>[0], string][] = [
      ["card_number", PATH_WORDS.tips.cardNumber],
      ["too_long", PATH_WORDS.tips.nameTooLong],
      ["backing_failed", PATH_WORDS.tips.nameOther],
    ];
    for (const [code, words] of cases) {
      useMarksStore.setState({ updatePath: async (): Promise<Check<CustomPath>> => fail(code, "name") });
      type("Another");
      await act(async () => {
        fireEvent.click(save());
      });
      const line = screen.getByText("Not saved");
      expect(line.closest("[data-tip]")?.getAttribute("data-tip"), code).toBe(words);
      expect(field().value).toBe("Another");
    }
  });

  it("Cancel restores the row with the old name and puts the focus back on Rename", async () => {
    await openRename();
    type("Changed");
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.queryByRole("textbox", { name: "Path name" })).toBeNull();
    expect(screen.getByRole("button", { name: "Path 1, your path" })).toBeTruthy();
    expect(useMarksStore.getState().paths[0].name).toBe("Path 1");
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Rename" }));
  });
});

// The tooltip layer reads a control's words once, on the pointer's arrival. Save takes the place Rename stood,
// so a pointer that rests there meets Save with no new arrival, and its words must follow the field at once.
describe("YourPaths Save's tooltip follows the field (R4)", () => {
  async function openRename(): Promise<void> {
    await seedTwo();
    render(
      <>
        <YourPaths />
        <TipLayer />
      </>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Path 1 details" }));
    fireEvent.click(screen.getByRole("button", { name: "Rename" }));
    // The stores load on real timers above; the tooltip's delays run on these.
    vi.useFakeTimers();
  }
  const field = () => screen.getByRole("textbox", { name: "Path name" }) as HTMLInputElement;
  const type = (v: string) => fireEvent.change(field(), { target: { value: v } });
  const save = () => screen.getByRole("button", { name: "Save" });
  const said = (): string | null => screen.queryByRole("tooltip")?.textContent ?? null;
  const settle = () =>
    act(() => {
      vi.advanceTimersByTime(300);
    });

  afterEach(() => {
    act(() => showTipAt(null));
    vi.useRealTimers();
  });

  it("with the pointer resting on Save, emptying the field shows the reason at once, with no pointer event", async () => {
    await openRename();
    fireEvent.pointerOver(save());
    settle();
    expect(said()).toBe(PATH_WORDS.tips.save);
    type("");
    expect(said()).toBe(PATH_WORDS.tips.nameEmpty);
  });

  it("with the pointer on Save, another path's name and then a free name each show their words", async () => {
    await openRename();
    fireEvent.pointerOver(save());
    settle();
    type("pATh 2");
    expect(said()).toBe(PATH_WORDS.tips.nameTaken);
    type("A free name");
    expect(said()).toBe(PATH_WORDS.tips.save);
  });

  it("with the pointer never on Save, emptying the field opens no tooltip", async () => {
    await openRename();
    type("");
    settle();
    expect(screen.queryByRole("tooltip")).toBeNull();
  });

  it("with the pointer gone from Save, a later change opens no tooltip", async () => {
    await openRename();
    fireEvent.pointerOver(save());
    settle();
    fireEvent.pointerOut(save(), { relatedTarget: document.body });
    act(() => showTipAt(null));
    type("");
    settle();
    expect(screen.queryByRole("tooltip")).toBeNull();
  });

  it("after Cancel and Rename again, the pointer is not taken to be on the new Save", async () => {
    await openRename();
    fireEvent.pointerOver(save());
    settle();
    // A press takes an open tooltip away (the layer hides on pointer down), as a real press would.
    fireEvent.pointerDown(screen.getByRole("button", { name: "Cancel" }));
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    fireEvent.pointerDown(screen.getByRole("button", { name: "Rename" }));
    fireEvent.click(screen.getByRole("button", { name: "Rename" }));
    type("");
    settle();
    expect(screen.queryByRole("tooltip")).toBeNull();
  });
});

describe("YourPaths Remove (T24)", () => {
  async function openDetails(): Promise<CustomPath> {
    const { one } = await seedTwo();
    render(<YourPaths />);
    fireEvent.click(screen.getByRole("button", { name: "Path 1 details" }));
    return one;
  }

  it("Remove asks Remove this path? with Remove and Keep in place of the two buttons", async () => {
    await openDetails();
    fireEvent.click(screen.getByRole("button", { name: "Remove" }));
    expect(screen.getByText("Remove this path?")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Remove" }).getAttribute("data-tip")).toBe(PATH_WORDS.tips.removeConfirm);
    expect(screen.getByRole("button", { name: "Keep" }).getAttribute("data-tip")).toBe(PATH_WORDS.tips.keep);
    expect(screen.queryByRole("button", { name: "Rename" })).toBeNull();
  });

  it("the question stands on its own line, before the buttons, and not in their row", async () => {
    await openDetails();
    fireEvent.click(screen.getByRole("button", { name: "Remove" }));
    const q = screen.getByText("Remove this path?");
    const confirm = screen.getByRole("button", { name: "Remove" });
    expect(q.parentElement).not.toBe(confirm.parentElement);
    expect(q.compareDocumentPosition(confirm) & Node.DOCUMENT_POSITION_FOLLOWING).not.toBe(0);
    expect(confirm.parentElement?.contains(screen.getByRole("button", { name: "Keep" }))).toBe(true);
  });

  it("the second Remove removes the path from the store, then the session forgets it, and the row goes", async () => {
    const one = await openDetails();
    fireEvent.click(switchOf("Path 1, your path"));
    expect(usePathSession.getState().hidden).toEqual([one.id]);
    const forget = vi.fn(usePathSession.getState().forget);
    usePathSession.setState({ forget });
    const removed = vi.fn(useMarksStore.getState().removePath);
    useMarksStore.setState({ removePath: removed });
    fireEvent.click(screen.getByRole("button", { name: "Remove" }));
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Remove" }));
    });
    expect(removed).toHaveBeenCalledWith(one.id);
    expect(forget).toHaveBeenCalledWith(one.id);
    expect(removed.mock.invocationCallOrder[0]).toBeLessThan(forget.mock.invocationCallOrder[0]);
    expect(useMarksStore.getState().paths.map((p) => p.name)).toEqual(["Path 2"]);
    expect(usePathSession.getState().hidden).toEqual([]);
    expect(screen.queryByRole("button", { name: "Path 1, your path" })).toBeNull();
  });

  it("after a confirmed Remove the focus goes to the menu's dialog, not to the page", async () => {
    await seedTwo();
    render(
      <div role="dialog" aria-label="Paths" tabIndex={-1}>
        <YourPaths />
      </div>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Path 1 details" }));
    fireEvent.click(screen.getByRole("button", { name: "Remove" }));
    const confirm = screen.getByRole("button", { name: "Remove" });
    act(() => confirm.focus());
    await act(async () => {
      fireEvent.click(confirm);
    });
    expect(screen.queryByRole("button", { name: "Path 1, your path" })).toBeNull();
    expect(document.activeElement).toBe(screen.getByRole("dialog", { name: "Paths" }));
  });

  it("Keep puts the two buttons back and removes nothing", async () => {
    await openDetails();
    const removed = vi.fn(useMarksStore.getState().removePath);
    useMarksStore.setState({ removePath: removed });
    fireEvent.click(screen.getByRole("button", { name: "Remove" }));
    fireEvent.click(screen.getByRole("button", { name: "Keep" }));
    expect(removed).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Rename" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Remove" })).toBeTruthy();
    expect(screen.queryByText("Remove this path?")).toBeNull();
  });

  it("a refusal keeps the question and shows Not removed with its tooltip, and the session forgets nothing", async () => {
    const one = await openDetails();
    const forget = vi.fn(usePathSession.getState().forget);
    usePathSession.setState({ forget });
    useMarksStore.setState({ removePath: async (): Promise<Check<string>> => fail("backing_failed", "path") });
    fireEvent.click(screen.getByRole("button", { name: "Remove" }));
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Remove" }));
    });
    expect(screen.getByText("Remove this path?")).toBeTruthy();
    expect(screen.getByText("Not removed").closest("[data-tip]")?.getAttribute("data-tip")).toBe(PATH_WORDS.tips.notRemoved);
    expect(forget).not.toHaveBeenCalled();
    expect(useMarksStore.getState().paths.some((p) => p.id === one.id)).toBe(true);
  });
});

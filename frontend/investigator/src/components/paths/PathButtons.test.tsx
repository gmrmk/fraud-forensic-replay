/**
 * The buttons at the foot of the Paths menu: Join pinned (G5, T25) and New path (G6, T33). Pins are made
 * through the real marks store and the memory backing, records are entities
 * the real case lookup finds through the pivot data, and a slow or counted press is made by wrapping the
 * store's own createPath, never by mocking the store.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { PathButtons } from "./PathButtons";
import { usePathSession } from "./path-session";
import { NOTE_TIME, SCENARIO } from "../notes/test-support";
import { resetNotesTransport, startNotesTransport } from "../../lib/notes-io/session";
import { resetUnsaved } from "../../lib/notes-io/unsaved";
import type { Entity } from "../../lib/entity";
import type { CustomPath, RecordRef } from "../../lib/marks/types";
import { fail, type Check } from "../../lib/notes/types";
import { PATH_WORDS } from "../../lib/tooltip-words/paths";
import { useMarksStore } from "../../store/marks";
import { useNotesStore } from "../../store/notes";
import { usePivotData } from "../../store/pivot-data";
import { usePivotStore } from "../../store/pivot";

const entity = (id: string, i: number): Entity => ({
  id,
  kind: "stop",
  timestamp: NOTE_TIME + i * 60_000,
  coords: { lat: 29.76, lng: -95.37 },
  fields: {},
  displayMetadata: { primaryLabel: `Stop ${i + 1} name`, secondaryLabel: "", paletteKind: "stop", pivotableFields: [] },
});

/** Five timed records, rec-1 the earliest. */
const ENTITIES: Entity[] = Array.from({ length: 5 }, (_, i) => entity(`rec-${i + 1}`, i));
const ref = (n: number): RecordRef => ({ kind: "stop", id: `rec-${n}` });

async function pin(...ns: number[]): Promise<void> {
  for (const n of ns) await act(async () => void (await useMarksStore.getState().togglePin(ref(n))));
}

// The store action a test replaces with a spy or a pending promise, kept so each test starts with the real one.
const REAL_CREATE_PATH = useMarksStore.getState().createPath;

beforeEach(async () => {
  useMarksStore.setState({ createPath: REAL_CREATE_PATH });
  resetNotesTransport();
  resetUnsaved();
  useNotesStore.getState().setBacking(null);
  useNotesStore.getState().clear();
  useMarksStore.getState().setBacking(null);
  useMarksStore.getState().clear();
  usePivotStore.setState({ windows: [], nextZ: 20 });
  usePathSession.setState({ draft: null, hidden: [], chosen: null });
  usePivotData.setState({ entities: ENTITIES });
  startNotesTransport(true);
  await useNotesStore.getState().load(SCENARIO);
  await useMarksStore.getState().load(SCENARIO);
});

afterEach(() => {
  usePivotData.setState({ entities: [] });
});

const join = () => screen.getByRole("button", { name: /^Join pinned/ });

describe("PathButtons: Join pinned (T25)", () => {
  it("is a button named Join pinned with the number of stops a press makes at its right", async () => {
    await pin(3, 1, 2);
    render(<PathButtons />);
    expect(join().textContent).toContain("Join pinned");
    expect(join().textContent).toContain("3");
    expect(join().getAttribute("aria-pressed")).toBeNull();
    expect(join().getAttribute("data-tip")).toBe(PATH_WORDS.tips.joinPinned);
  });

  it("counts only pinned records that are in the data and have a time, and shows the count under two too", async () => {
    await pin(1);
    await act(async () => void (await useMarksStore.getState().togglePin({ kind: "stop", id: "rec-gone" })));
    render(<PathButtons />);
    expect(join().textContent).toContain("1");
    expect(join().textContent).not.toContain("2");
  });

  it("shows 0 with nothing pinned", () => {
    render(<PathButtons />);
    expect(join().textContent).toContain("0");
  });

  it("is disabled under two pinned records, says why, and a press makes no path", async () => {
    await pin(1);
    const spy = vi.fn(useMarksStore.getState().createPath);
    useMarksStore.setState({ createPath: spy });
    render(<PathButtons />);
    expect(join().getAttribute("aria-disabled")).toBe("true");
    expect(join().getAttribute("data-tip")).toBe(PATH_WORDS.tips.joinUnderTwo);
    await act(async () => {
      fireEvent.click(join());
    });
    expect(spy).not.toHaveBeenCalled();
  });

  it("is disabled while a draft is open, with the drawing sentence", async () => {
    await pin(1, 2);
    usePathSession.getState().start("Path 1");
    render(<PathButtons />);
    expect(join().getAttribute("aria-disabled")).toBe("true");
    expect(join().getAttribute("data-tip")).toBe(PATH_WORDS.tips.drawingBusy);
  });

  it("is disabled at 20 paths, with the limit sentence", async () => {
    await pin(1, 2);
    for (let i = 0; i < 20; i++) {
      await act(async () => void (await useMarksStore.getState().createPath([ref(1), ref(2)], `Made ${i + 1}`)));
    }
    expect(useMarksStore.getState().paths).toHaveLength(20);
    render(<PathButtons />);
    expect(join().getAttribute("aria-disabled")).toBe("true");
    expect(join().getAttribute("data-tip")).toBe(PATH_WORDS.tips.limit);
  });

  it("a press calls createPath once with the pinned records in time order, and the path is a copy", async () => {
    await pin(3, 1, 2);
    const spy = vi.fn(useMarksStore.getState().createPath);
    useMarksStore.setState({ createPath: spy });
    render(<PathButtons />);
    expect(join().getAttribute("aria-disabled")).toBe("false");
    await act(async () => {
      fireEvent.click(join());
    });
    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy).toHaveBeenCalledWith([ref(1), ref(2), ref(3)]);
    const [made] = useMarksStore.getState().paths;
    expect(made.name).toBe("Path 1");
    expect(made.stops).toEqual([ref(1), ref(2), ref(3)]);
    // A later unpin does not change the saved path.
    await pin(1);
    expect(useMarksStore.getState().paths[0].stops).toEqual([ref(1), ref(2), ref(3)]);
  });

  it("a second press while the first is still being saved makes no second path", async () => {
    await pin(1, 2);
    let release: (c: Check<CustomPath>) => void = () => {};
    const spy = vi.fn(
      (_stops: RecordRef[], _name?: string) =>
        new Promise<Check<CustomPath>>((resolve) => {
          release = resolve;
        }),
    );
    useMarksStore.setState({ createPath: spy });
    render(<PathButtons />);
    fireEvent.click(join());
    fireEvent.click(join());
    expect(spy).toHaveBeenCalledTimes(1);
    await act(async () => {
      release(fail("backing_failed", "path"));
    });
    // Once the answer is in, the button works again.
    fireEvent.click(join());
    expect(spy).toHaveBeenCalledTimes(2);
  });

  it("colours the disabled state faint and never fades any element by opacity", async () => {
    const { container } = render(<PathButtons />);
    expect(join().style.color).toBe("var(--text-faint)");
    const faded = [...container.querySelectorAll<HTMLElement>("*")].filter(
      (el) => [...el.classList].some((c) => /(^|:)opacity-/.test(c)) || el.style.opacity !== "",
    );
    expect(faded.map((el) => el.outerHTML.slice(0, 80))).toEqual([]);
    expect(container.querySelector("[disabled]")).toBeNull();
  });

  it("colours the enabled state in the text tone", async () => {
    await pin(1, 2);
    render(<PathButtons />);
    expect(join().style.color).toBe("var(--text)");
  });
});

const newPath = () => screen.getByRole("button", { name: "New path" });

describe("PathButtons: New path (T33)", () => {
  it("is a button named New path with the lens before the words, above Join pinned, and a tooltip", () => {
    render(<PathButtons />);
    expect(newPath().querySelector('svg[data-glyph="lens"]')).not.toBeNull();
    expect(newPath().textContent).toBe("New path");
    expect(newPath().getAttribute("aria-pressed")).toBeNull();
    expect(newPath().getAttribute("data-tip")).toBe(PATH_WORDS.tips.newPath);
    expect(newPath().compareDocumentPosition(join()) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("a press starts a draft under the default name, Path 1 with no saved path", () => {
    render(<PathButtons />);
    expect(newPath().getAttribute("aria-disabled")).toBe("false");
    fireEvent.click(newPath());
    expect(usePathSession.getState().draft).toEqual({ name: "Path 1", stops: [], asking: false, saving: false, refused: null });
  });

  it("the default name follows the saved paths", async () => {
    await act(async () => void (await useMarksStore.getState().createPath([ref(1), ref(2)], "Path 4")));
    render(<PathButtons />);
    fireEvent.click(newPath());
    expect(usePathSession.getState().draft?.name).toBe("Path 5");
  });

  it("is disabled while a draft is open, with the drawing sentence, and a press changes nothing", () => {
    usePathSession.getState().start("Path 1");
    render(<PathButtons />);
    expect(newPath().getAttribute("aria-disabled")).toBe("true");
    expect(newPath().getAttribute("data-tip")).toBe(PATH_WORDS.tips.drawingBusy);
    expect(newPath().style.color).toBe("var(--text-faint)");
    fireEvent.click(newPath());
    expect(usePathSession.getState().draft?.name).toBe("Path 1");
  });

  it("is disabled at 20 paths, with the limit sentence, and a press starts no draft", async () => {
    for (let i = 0; i < 20; i++) {
      await act(async () => void (await useMarksStore.getState().createPath([ref(1), ref(2)], `Made ${i + 1}`)));
    }
    render(<PathButtons />);
    expect(newPath().getAttribute("aria-disabled")).toBe("true");
    expect(newPath().getAttribute("data-tip")).toBe(PATH_WORDS.tips.limit);
    fireEvent.click(newPath());
    expect(usePathSession.getState().draft).toBeNull();
  });

  it("the enabled button is in the text tone, and neither button is faded", () => {
    const { container } = render(<PathButtons />);
    expect(newPath().style.color).toBe("var(--text)");
    const faded = [...container.querySelectorAll<HTMLElement>("*")].filter(
      (el) => [...el.classList].some((c) => /(^|:)opacity-/.test(c)) || el.style.opacity !== "",
    );
    expect(faded).toEqual([]);
    expect(container.querySelector("[disabled]")).toBeNull();
  });
});

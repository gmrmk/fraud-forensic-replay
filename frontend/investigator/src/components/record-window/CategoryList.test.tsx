// The Fail category list of the record's own window: the trigger, the one list of the story's failing
// words, the typed names and the typing row. It mounts the component on its own with the marks store on
// the memory backing; it does not test the window around it (RecordWindow.test.tsx does) and sends
// nothing to a server or to browser storage.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { CategoryList } from "./CategoryList";
import { SCENARIO } from "../notes/test-support";
import { manifestRowToEntity } from "../../lib/adapters/manifest-row";
import { VISA, VISA_GROUPED } from "../../lib/notes/test-fixtures";
import { resetNotesTransport, startNotesTransport } from "../../lib/notes-io/session";
import type { MarksBacking } from "../../lib/notes-io/transport";
import { CATEGORY_ADD, CATEGORY_FIELD_BUTTONS } from "../../lib/tooltip-words/notes";
import {
  ADD_TIP,
  CANCEL_TIP,
  CHOSEN_TIP,
  FAIL_CATEGORY,
  FIELD_TIP,
  NONE_CHOSEN,
  STATUS,
  STORY_WORD_TIP,
  TYPED_TIP,
  TYPE_ROW,
} from "../../lib/tooltip-words/record-window";
import { verdictNode } from "../../lib/verdict-fixtures";
import { useMarksStore, useRecordNode } from "../../store/marks";
import { usePivotData } from "../../store/pivot-data";
import { useSchema } from "../../store/schema";

const REC = { kind: "stop", id: "rec-1" };

const decision = (id: string, state: string, finding: string, when: string) =>
  manifestRowToEntity(verdictNode, { id, state, finding, memo: "m", who: "analyst", subject: "S", acct: "a1", worked: "ev-7", when, y: 1, x: 2 });

/** The list as the window mounts it: the value is the record's own node. */
function Harness() {
  const node = useRecordNode(REC);
  return <CategoryList record={REC} value={node?.category ?? null} />;
}

const storyFails = () => [
  decision("d1", "FAIL", "ATO", "2026-06-09T09:00:00-05:00"),
  decision("d2", "PASS", "PASSED", "2026-06-09T09:30:00-05:00"),
  decision("d3", "FAIL", "FRAUD", "2026-06-09T10:00:00-05:00"),
];

const trigger = () => screen.getByRole("button", { name: /^Fail category/ });
const nodeOf = () => useMarksStore.getState().nodes.find((n) => n.record.id === REC.id) ?? null;
const rowNames = () => within(screen.getByRole("list")).getAllByRole("button").map((b) => b.getAttribute("aria-label") ?? b.textContent);

beforeEach(async () => {
  resetNotesTransport();
  useSchema.setState({ nodes: [verdictNode] });
  usePivotData.setState({ transactions: [], logins: [], accountEvents: [], transfers: [], entities: storyFails() });
  useMarksStore.getState().clear();
  startNotesTransport(true);
  await useMarksStore.getState().load(SCENARIO);
  await useMarksStore.getState().pressDisposition(REC, "fail");
  await useMarksStore.getState().addFailCategory("Shared key");
});

afterEach(() => {
  vi.restoreAllMocks();
  usePivotData.setState({ entities: [] });
  useSchema.setState({ nodes: [] });
});

describe("CategoryList: the trigger and the one list", () => {
  it("the trigger is named Fail category and its value, shows a dash with no category, and starts folded", () => {
    render(<Harness />);
    const t = screen.getByRole("button", { name: `${FAIL_CATEGORY.name} ${NONE_CHOSEN}` });
    expect(NONE_CHOSEN).toBe("-");
    expect(t).toHaveAttribute("aria-expanded", "false");
    expect(t).toHaveAttribute("data-tip", FAIL_CATEGORY.tip);
    expect(screen.queryByRole("list")).toBeNull();
  });

  it("a press unfolds the story's failing words in time order, then the typed ones, then Type a category", () => {
    render(<Harness />);
    fireEvent.click(trigger());
    expect(trigger()).toHaveAttribute("aria-expanded", "true");
    expect(rowNames()).toEqual(["ATO", "FRAUD", "Shared key", TYPE_ROW.name]);
  });

  it("the list is in the window's flow, never an overlay, and scrolls after eight rows", () => {
    render(<Harness />);
    fireEvent.click(trigger());
    const list = screen.getByRole("list");
    const cls = list.getAttribute("class") ?? "";
    expect(cls).toContain("max-h-[176px]");
    expect(cls).toContain("overflow-y-auto");
    expect(cls).not.toContain("absolute");
    expect(trigger().getAttribute("aria-controls")).toBe(list.id);
  });

  it("a press on a row stores the category, folds the list, returns focus to the trigger and shows the value", async () => {
    render(<Harness />);
    fireEvent.click(trigger());
    fireEvent.click(screen.getByRole("button", { name: "FRAUD" }));
    await waitFor(() => expect(nodeOf()?.category).toBe("FRAUD"));
    await waitFor(() => expect(screen.queryByRole("list")).toBeNull());
    expect(screen.getByRole("button", { name: `${FAIL_CATEGORY.name} FRAUD` })).toBeInTheDocument();
    expect(document.activeElement).toBe(trigger());
  });

  it("the chosen row is pressed with a check before its word; a press on it clears the category", async () => {
    await useMarksStore.getState().setCategory(REC, "FRAUD");
    render(<Harness />);
    fireEvent.click(trigger());
    const chosen = screen.getByRole("button", { name: "FRAUD" });
    expect(chosen).toHaveAttribute("aria-pressed", "true");
    expect(chosen.querySelector("svg")).not.toBeNull();
    expect(screen.getByRole("button", { name: "ATO" })).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByRole("button", { name: "ATO" }).querySelector("svg")).toBeNull();
    fireEvent.click(chosen);
    await waitFor(() => expect(nodeOf()?.category).toBeNull());
    await waitFor(() => expect(screen.queryByRole("list")).toBeNull());
    expect(screen.getByRole("button", { name: `${FAIL_CATEGORY.name} ${NONE_CHOSEN}` })).toBeInTheDocument();
  });

  it("each row's tooltip says where it came from; the chosen row's says how to clear it", async () => {
    await useMarksStore.getState().setCategory(REC, "FRAUD");
    render(<Harness />);
    fireEvent.click(trigger());
    expect(screen.getByRole("button", { name: "ATO" })).toHaveAttribute("data-tip", STORY_WORD_TIP);
    expect(screen.getByRole("button", { name: "FRAUD" })).toHaveAttribute("data-tip", CHOSEN_TIP);
    expect(screen.getByRole("button", { name: "Shared key" })).toHaveAttribute("data-tip", TYPED_TIP);
    expect(screen.getByRole("button", { name: TYPE_ROW.name })).toHaveAttribute("data-tip", TYPE_ROW.tip);
  });

  it("a story word the investigator also typed is one row, drawn as the story's word", async () => {
    await useMarksStore.getState().addFailCategory("ato");
    render(<Harness />);
    fireEvent.click(trigger());
    expect(rowNames()).toEqual(["ATO", "FRAUD", "Shared key", TYPE_ROW.name]);
    expect(screen.getByRole("button", { name: "ATO" })).toHaveAttribute("data-tip", STORY_WORD_TIP);
  });

  it("a story with no failed decision unfolds to Type a category alone, after the typed names", async () => {
    usePivotData.setState({ entities: [] });
    render(<Harness />);
    fireEvent.click(trigger());
    expect(rowNames()).toEqual(["Shared key", TYPE_ROW.name]);
    // And with nothing typed either, the one row is the typing row.
    act(() => useMarksStore.setState({ failCategories: [] }));
    expect(rowNames()).toEqual([TYPE_ROW.name]);
  });

  it("Escape on the open list leaves it open", () => {
    render(<Harness />);
    fireEvent.click(trigger());
    fireEvent.keyDown(screen.getByRole("list"), { key: "Escape" });
    fireEvent.keyDown(trigger(), { key: "Escape" });
    expect(screen.getByRole("list")).toBeInTheDocument();
    expect(trigger()).toHaveAttribute("aria-expanded", "true");
  });

  it("a press on the trigger again folds the list", () => {
    render(<Harness />);
    fireEvent.click(trigger());
    fireEvent.click(trigger());
    expect(screen.queryByRole("list")).toBeNull();
  });

  it("a refused press shows one line and keeps the list open", async () => {
    const marks = useMarksStore.getState().backing as MarksBacking;
    useMarksStore.getState().setBacking({
      ...marks,
      putNode: async () => {
        throw new Error("down");
      },
    });
    render(<Harness />);
    fireEvent.click(trigger());
    fireEvent.click(screen.getByRole("button", { name: "ATO" }));
    const line = await screen.findByRole("status");
    expect(line.textContent).toBe(STATUS.backingFailed);
    expect(screen.getByRole("list")).toBeInTheDocument();
    expect(nodeOf()?.category).toBeNull();
  });

  it("with no line to show there is no status element at all", () => {
    render(<Harness />);
    fireEvent.click(trigger());
    expect(screen.queryByRole("status")).toBeNull();
  });
});

describe("CategoryList: the typing row", () => {
  const open = () => {
    render(<Harness />);
    fireEvent.click(trigger());
    fireEvent.click(screen.getByRole("button", { name: TYPE_ROW.name }));
  };
  const field = () => screen.getByRole("textbox", { name: CATEGORY_ADD.field });
  const type = (v: string) => fireEvent.change(field(), { target: { value: v } });
  const addButton = () => screen.getByRole("button", { name: CATEGORY_FIELD_BUTTONS.add });

  it("Type a category replaces the list with a field and the two buttons, outside any form", () => {
    open();
    expect(screen.queryByRole("list")).toBeNull();
    expect(field()).toHaveAttribute("autocomplete", "off");
    expect(field()).toHaveAttribute("spellcheck", "false");
    expect(field().closest("form")).toBeNull();
    expect(field()).toHaveAttribute("data-tip", FIELD_TIP);
    expect(addButton()).toHaveAttribute("data-tip", ADD_TIP);
    expect(screen.getByRole("button", { name: CATEGORY_FIELD_BUTTONS.cancel })).toHaveAttribute("data-tip", CANCEL_TIP);
    expect(document.activeElement).toBe(field());
  });

  it("no part of the row has a rounded corner", () => {
    const { container } = render(<Harness />);
    fireEvent.click(trigger());
    const all = () => Array.from(container.querySelectorAll("*")).map((el) => el.getAttribute("class") ?? "");
    expect(all().some((c) => c.includes("rounded"))).toBe(false);
    fireEvent.click(screen.getByRole("button", { name: TYPE_ROW.name }));
    expect(all().some((c) => c.includes("rounded"))).toBe(false);
  });

  it("a card number is refused before anything is sent, in either form", () => {
    const marks = useMarksStore.getState().backing as MarksBacking;
    const sent = vi.spyOn(marks, "addFailCategory");
    open();
    for (const v of [VISA, VISA_GROUPED]) {
      type(v);
      expect(screen.getByRole("status").textContent).toBe(CATEGORY_ADD.card);
      expect(addButton()).toBeDisabled();
      fireEvent.click(addButton());
      // The disabled button proves nothing about the guard itself: Enter reaches it too.
      fireEvent.keyDown(field(), { key: "Enter" });
    }
    expect(sent).not.toHaveBeenCalled();
    expect(useMarksStore.getState().failCategories).toEqual(["Shared key"]);
  });

  it("a second Enter while the first Add waits sends the name once", async () => {
    const marks = useMarksStore.getState().backing as MarksBacking;
    let release: () => void = () => {};
    const gate = new Promise<void>((r) => (release = r));
    const calls: string[] = [];
    useMarksStore.getState().setBacking({
      ...marks,
      addFailCategory: async (n) => {
        calls.push(n);
        await gate;
        return marks.addFailCategory(n);
      },
    });
    open();
    type("Lead");
    fireEvent.keyDown(field(), { key: "Enter" });
    fireEvent.keyDown(field(), { key: "Enter" });
    await act(async () => release());
    await waitFor(() => expect(nodeOf()?.category).toBe("Lead"));
    expect(calls).toEqual(["Lead"]);
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("a name of 25 characters shows the too-long line and sends nothing", () => {
    open();
    type("x".repeat(25));
    expect(screen.getByRole("status").textContent).toBe(CATEGORY_ADD.tooLong);
    expect(addButton()).toBeDisabled();
    type("x".repeat(24));
    expect(screen.queryByRole("status")).toBeNull();
    expect(addButton()).toBeEnabled();
  });

  it("a name the shown list holds, ignoring case, is refused: a story word and a typed one", () => {
    open();
    type("fraud");
    expect(screen.getByRole("status").textContent).toBe(CATEGORY_ADD.exists);
    type("SHARED KEY");
    expect(screen.getByRole("status").textContent).toBe(CATEGORY_ADD.exists);
    expect(addButton()).toBeDisabled();
  });

  it("Add stores the name in the shared list and as the record's category, and the field goes", async () => {
    open();
    type("  Lead  ");
    fireEvent.click(addButton());
    await waitFor(() => expect(nodeOf()?.category).toBe("Lead"));
    expect(useMarksStore.getState().failCategories).toEqual(["Shared key", "Lead"]);
    expect(screen.queryByRole("textbox")).toBeNull();
    expect(screen.queryByRole("list")).toBeNull();
    expect(screen.getByRole("button", { name: `${FAIL_CATEGORY.name} Lead` })).toBeInTheDocument();
    expect(document.activeElement).toBe(trigger());
  });

  it("Enter in the field adds the name", async () => {
    open();
    type("Lead");
    fireEvent.keyDown(field(), { key: "Enter" });
    await waitFor(() => expect(nodeOf()?.category).toBe("Lead"));
  });

  it("Cancel closes the field and brings the list back as it was", () => {
    open();
    type("Lead");
    fireEvent.click(screen.getByRole("button", { name: CATEGORY_FIELD_BUTTONS.cancel }));
    expect(screen.queryByRole("textbox")).toBeNull();
    expect(rowNames()).toEqual(["ATO", "FRAUD", "Shared key", TYPE_ROW.name]);
    expect(useMarksStore.getState().failCategories).toEqual(["Shared key"]);
    // A second open starts with an empty field.
    fireEvent.click(screen.getByRole("button", { name: TYPE_ROW.name }));
    expect(field()).toHaveValue("");
  });

  it("a refusal of the store shows its line: the limit has its own words, a dead backend the status words", async () => {
    const marks = useMarksStore.getState().backing as MarksBacking;
    useMarksStore.getState().setBacking({
      ...marks,
      addFailCategory: async () => {
        throw new Error("down");
      },
    });
    open();
    type("Lead");
    fireEvent.click(addButton());
    expect((await screen.findByRole("status")).textContent).toBe(STATUS.backingFailed);
    expect(screen.getByRole("textbox")).toBeInTheDocument();

    act(() => {
      useMarksStore.setState({ failCategories: Array.from({ length: 100 }, (_, i) => `Name ${i}`) });
      useMarksStore.getState().setBacking(marks);
    });
    type("Lead two");
    fireEvent.click(addButton());
    await waitFor(() => expect(screen.getByRole("status").textContent).toBe(STATUS.categoryLimit));
  });

  it("the typing row is unavailable until a story is loaded", () => {
    render(<Harness />);
    fireEvent.click(trigger());
    act(() => useMarksStore.setState({ scenario: null }));
    const row = screen.getByRole("button", { name: TYPE_ROW.name });
    expect(row).toBeDisabled();
    fireEvent.click(row);
    expect(screen.queryByRole("textbox")).toBeNull();
  });
});

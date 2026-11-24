import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { RecordWindow } from "./RecordWindow";
import { MID, TITLE_CONTRAST, recordAccent, windowInk } from "./record-window";
import { COLOR_MODES, THEMES } from "../../theme/axes";
import { lookupFromContext, type RecordLookup } from "../notes/record-lookup";
import { CONTEXT, NOTE_TIME, SCENARIO } from "../notes/test-support";
import { bodyOf, makeNote } from "../../lib/notes/test-fixtures";
import { RECORD_WINDOW_DIMS } from "../../lib/window-dims";
import { PIN, STATUS, WINDOW_TITLE, MISSING } from "../../lib/tooltip-words/record-window";
import { resetNotesTransport, startNotesTransport } from "../../lib/notes-io/session";
import type { ScenarioNode } from "../../lib/scenarios";
import type { MarksBacking } from "../../lib/notes-io/transport";
import { useMarksStore } from "../../store/marks";
import { useNotesStore } from "../../store/notes";
import { usePivotStore, type RecordWindowState } from "../../store/pivot";
import { useSchema } from "../../store/schema";
import { useTheme } from "../../store/theme";

const REC = { kind: "stop", id: "rec-1" };
const GONE = { kind: "stop", id: "rec-404" };
const lookup: RecordLookup = lookupFromContext(CONTEXT);
const STOP_NODE = { kind: "stop", label: "Stop", palette: "accent", source: "stops" } as ScenarioNode;

function windowFor(record = REC): RecordWindowState {
  const id = usePivotStore.getState().openRecord(record, { lngLat: null, pinned: false, at: { x: 100, y: 100 } });
  return usePivotStore.getState().windows.find((w) => w.id === id) as RecordWindowState;
}

function show(record = REC, over: Partial<Parameters<typeof RecordWindow>[0]> = {}) {
  const w = windowFor(record);
  return render(<RecordWindow window={w} lookup={lookup} {...over} />);
}

function nodeOf(record = REC) {
  return useMarksStore.getState().nodes.find((n) => n.record.id === record.id) ?? null;
}

beforeEach(async () => {
  resetNotesTransport();
  usePivotStore.setState({ windows: [], nextZ: 20 });
  useSchema.setState({ nodes: [STOP_NODE] });
  useMarksStore.getState().clear();
  useNotesStore.setState({ scenario: null, notes: [] });
  startNotesTransport(true);
  await useNotesStore.getState().load(SCENARIO);
  await useMarksStore.getState().load(SCENARIO);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("RecordWindow: the frame and its first line", () => {
  it("is a dialog named with the record's id and Your mark", () => {
    show();
    expect(screen.getByRole("dialog", { name: WINDOW_TITLE("rec-1") })).toBeInTheDocument();
    expect(WINDOW_TITLE("rec-1")).toBe(`rec-1 ${MID} Your mark`);
  });

  it("is the 300 px wide, square frame: no element has the 14 px corner", () => {
    const { container } = show();
    expect(RECORD_WINDOW_DIMS.width).toBe(300);
    // Class names are read off each element: the bracket form is not safe in a selector string.
    const classes = Array.from(container.querySelectorAll("*")).map((el) => el.getAttribute("class") ?? "");
    expect(classes.some((c) => c.includes("max-w-[300px]"))).toBe(true);
    expect(classes.some((c) => c.includes("rounded-[14px]"))).toBe(false);
    expect(container.querySelector("[data-foot-cue]")).not.toBeNull();
  });

  it("draws the title and the lit pin in the kind's colour fitted to the header, in light and in dark", async () => {
    const saved = { theme: useTheme.getState().theme, color: useTheme.getState().color };
    useSchema.setState({ nodes: [{ ...STOP_NODE, palette: "#f5a623" }] });
    // WCAG contrast of an `rgb(r, g, b)` colour on an 8-bit surface, with the formula written out.
    const lum = (c: number[]) => {
      const [r, g, b] = c.map((v) => (v / 255 <= 0.03928 ? v / 255 / 12.92 : ((v / 255 + 0.055) / 1.055) ** 2.4));
      return 0.2126 * r + 0.7152 * g + 0.0722 * b;
    };
    const on = (css: string, surface: number[]) => {
      // The style reads back as rgb(r, g, b) or as the #rrggbb that was set.
      const parts = css.startsWith("#") ? [1, 3, 5].map((i) => parseInt(css.slice(i, i + 2), 16)) : (css.match(/\d+/g) ?? []).map(Number);
      const [hi, lo] = [lum(parts), lum(surface)].sort((a, b) => b - a);
      return (hi + 0.05) / (lo + 0.05);
    };
    for (const [theme, header] of [["light", [228, 233, 241]], ["dark", [20, 25, 34]]] as const) {
      useTheme.setState({ theme, color: "neon" });
      usePivotStore.setState({ windows: [], nextZ: 20 });
      const view = show();
      // The second pass finds the record still pinned from the first.
      const unpinned = screen.queryByRole("button", { name: PIN.unpinned.name });
      if (unpinned) fireEvent.click(unpinned);
      const pin = await screen.findByRole("button", { name: PIN.pinned.name });
      const title = screen.getByText(WINDOW_TITLE("rec-1"));
      expect(on(title.style.color, [...header])).toBeGreaterThanOrEqual(4.5);
      expect(on(pin.style.color, [...header])).toBeGreaterThanOrEqual(3);
      view.unmount();
      await useMarksStore.getState().load(SCENARIO);
    }
    useTheme.setState(saved);
  });

  it("the first line reads the kind's label, a colon and the record's headline, whole", () => {
    show();
    expect(screen.getByText("Stop: Corner Store")).toBeInTheDocument();
  });

  it("a kind the story's manifest does not hold prints the kind itself", () => {
    useSchema.setState({ nodes: [] });
    show();
    expect(screen.getByText("stop: Corner Store")).toBeInTheDocument();
  });

  it("has no flag control", () => {
    show();
    expect(screen.queryByRole("button", { name: /flag/i })).toBeNull();
  });

  it("a record not in the data: the first line says so, the title keeps its id, and the buttons still work", async () => {
    show(GONE);
    expect(screen.getByText(MISSING)).toBeInTheDocument();
    expect(screen.getByRole("dialog", { name: WINDOW_TITLE("rec-404") })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "FAIL" }));
    await waitFor(() => expect(nodeOf(GONE)?.disposition).toBe("fail"));
  });

  it("the dim the layer passes reaches the frame", () => {
    show(REC, { dimmed: true });
    expect(screen.getByRole("dialog").style.opacity).toBe("0.45");
  });

  it("a screen window sits where the layer or its anchor says", () => {
    show();
    expect(screen.getByRole("dialog").style.left).toBe("100px");
    expect(screen.getByRole("dialog").style.top).toBe("100px");
  });
});

describe("RecordWindow: the buttons, the pin and the status line", () => {
  it("a press on FAIL stores the disposition and FAIL shows pressed; a second press clears it", async () => {
    show();
    fireEvent.click(screen.getByRole("button", { name: "FAIL" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "FAIL" })).toHaveAttribute("aria-pressed", "true"));
    expect(nodeOf()?.disposition).toBe("fail");
    expect(screen.getByRole("button", { name: "PASS" })).toHaveAttribute("aria-pressed", "false");
    fireEvent.click(screen.getByRole("button", { name: "FAIL" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "FAIL" })).toHaveAttribute("aria-pressed", "false"));
    expect(nodeOf()?.disposition).toBe("none");
  });

  it("every button is disabled while a press waits for its answer", async () => {
    const marks = useMarksStore.getState().backing as MarksBacking;
    let release: () => void = () => {};
    const gate = new Promise<void>((r) => (release = r));
    useMarksStore.getState().setBacking({
      ...marks,
      putNode: async (n, ifUnsettled) => {
        await gate;
        return marks.putNode(n, ifUnsettled);
      },
    });
    show();
    fireEvent.click(screen.getByRole("button", { name: "PASS" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "WAITING" })).toBeDisabled());
    expect(screen.getByRole("button", { name: "FAIL" })).toBeDisabled();
    await act(async () => release());
    await waitFor(() => expect(screen.getByRole("button", { name: "WAITING" })).toBeEnabled());
    expect(screen.getByRole("button", { name: "PASS" })).toHaveAttribute("aria-pressed", "true");
  });

  it("the frame's pin is the record's pin: it stores the pin, pins the window, draws the dog-ear and turns to Unpin", async () => {
    const { container } = show();
    expect(container.querySelector("span.absolute.top-0.right-0")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: PIN.unpinned.name }));
    await waitFor(() => expect(nodeOf()?.pinned).toBe(true));
    expect(usePivotStore.getState().windows.find((w) => w.kind === "record")?.pinned).toBe(true);
    const unpin = await screen.findByRole("button", { name: PIN.pinned.name });
    expect(unpin).toHaveAttribute("title", PIN.pinned.tip);
    expect(container.querySelector("span.absolute.top-0.right-0")).not.toBeNull();
    fireEvent.click(unpin);
    await waitFor(() => expect(nodeOf()?.pinned).toBe(false));
    expect(screen.getByRole("button", { name: PIN.unpinned.name })).toHaveAttribute("title", PIN.unpinned.tip);
  });

  it("a backing that throws shows one line in the status line and FAIL is not pressed; nothing goes to browser storage", async () => {
    const setItem = vi.spyOn(Storage.prototype, "setItem");
    const marks = useMarksStore.getState().backing as MarksBacking;
    useMarksStore.getState().setBacking({
      ...marks,
      putNode: async () => {
        throw new Error("down");
      },
    });
    show();
    fireEvent.click(screen.getByRole("button", { name: "FAIL" }));
    const status = await screen.findByRole("status");
    await waitFor(() => expect(status.textContent).toBe(STATUS.backingFailed));
    expect(screen.getByRole("button", { name: "FAIL" })).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByRole("button", { name: "FAIL" })).toBeEnabled();
    expect(setItem).not.toHaveBeenCalled();
  });

  it("a good press after a refusal clears the status line", async () => {
    const marks = useMarksStore.getState().backing as MarksBacking;
    let fail = true;
    useMarksStore.getState().setBacking({
      ...marks,
      putNode: async (n, ifUnsettled) => {
        if (fail) throw new Error("down");
        return marks.putNode(n, ifUnsettled);
      },
    });
    show();
    fireEvent.click(screen.getByRole("button", { name: "PASS" }));
    await waitFor(() => expect(screen.getByRole("status").textContent).toBe(STATUS.backingFailed));
    fail = false;
    fireEvent.click(screen.getByRole("button", { name: "PASS" }));
    await waitFor(() => expect(screen.getByRole("status").textContent).toBe(""));
  });

  it("holds the record's notes as rows with Add a note under the buttons", async () => {
    useNotesStore.setState({
      scenario: SCENARIO,
      notes: [makeNote({ id: `note-${"b".repeat(32)}`, time: NOTE_TIME, link: REC, body: bodyOf("Seen at the terminal."), seq: 1 })],
    });
    show();
    expect(screen.getByText("Seen at the terminal.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Add a note on this record." })).toBeInTheDocument();
    expect(screen.getByRole("status").textContent).toBe("");
  });

  it("the Fail category row shows only while FAIL is held, and a press off FAIL hides it and clears the category", async () => {
    const row = () => screen.queryByRole("button", { name: /^Fail category/ });
    show();
    expect(row()).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "PASS" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "PASS" })).toHaveAttribute("aria-pressed", "true"));
    expect(row()).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "WAITING" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "WAITING" })).toHaveAttribute("aria-pressed", "true"));
    expect(row()).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "FAIL" }));
    const trigger = await screen.findByRole("button", { name: /^Fail category/ });
    // The row sits between the three buttons and the notes' Add a note.
    const waiting = screen.getByRole("button", { name: "WAITING" });
    const addNote = screen.getByRole("button", { name: "Add a note on this record." });
    expect(waiting.compareDocumentPosition(trigger) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(trigger.compareDocumentPosition(addNote) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    await useMarksStore.getState().setCategory(REC, "Lead");
    await waitFor(() => expect(screen.getByRole("button", { name: "Fail category Lead" })).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: "PASS" }));
    await waitFor(() => expect(row()).toBeNull());
    expect(nodeOf()?.category).toBeNull();
    expect(nodeOf()?.disposition).toBe("pass");
  });

  it("a category typed in the window is stored on the record's node and in the shared list", async () => {
    show();
    fireEvent.click(screen.getByRole("button", { name: "FAIL" }));
    fireEvent.click(await screen.findByRole("button", { name: /^Fail category/ }));
    fireEvent.click(screen.getByRole("button", { name: "Type a category" }));
    fireEvent.change(screen.getByRole("textbox", { name: "Category name" }), { target: { value: "Lead" } });
    fireEvent.click(screen.getByRole("button", { name: "Add" }));
    await waitFor(() => expect(nodeOf()?.category).toBe("Lead"));
    expect(useMarksStore.getState().failCategories).toEqual(["Lead"]);
  });

  it("a press stores a fraud kind as auth and the window finds it again", async () => {
    show({ kind: "fraud", id: "rec-1" });
    fireEvent.click(screen.getByRole("button", { name: "PASS" }));
    await waitFor(() => expect(useMarksStore.getState().nodes[0]?.record.kind).toBe("auth"));
  });
});

// Test 4.5 (theme follow, C4.T5): the frame's line and the title of a story's own kind are the
// resolver's mark and text ink for the live theme and colour mode, in one mount; a kind that has a
// palette slot keeps the line and the title fit it had. The manifest is the real one.
describe("RecordWindow: a story's own kind follows the theme and the colour mode", () => {
  const manifests = Object.values(
    import.meta.glob<string>("../../../../../backend/scenarios/*.scenario.json", { query: "?raw", import: "default", eager: true }),
  ).map((raw) => JSON.parse(raw) as { id: string; nodes: ScenarioNode[] });
  const platform = manifests.find((m) => m.id === "platform-access")?.nodes ?? [];
  const saved = { theme: useTheme.getState().theme, color: useTheme.getState().color };
  afterEach(() => useTheme.setState(saved));

  // A style value reads back as the #rrggbb that was set or as rgb(r, g, b).
  const hexOf = (css: string): string => {
    if (css.startsWith("#")) return css.toLowerCase();
    const m = css.match(/\d+/g);
    if (!m || m.length < 3) return css;
    return `#${m.slice(0, 3).map((n) => Number(n).toString(16).padStart(2, "0")).join("")}`;
  };
  const frame = () => screen.getByRole("dialog");
  const titleOf = (id: string) => screen.getByText(WINDOW_TITLE(id));

  it("a platform-access key_event takes the drawn mark and text, and follows a live switch", () => {
    useSchema.setState({ nodes: platform });
    useTheme.setState({ theme: "light", color: "neon" });
    show({ kind: "key_event", id: "ke-1" });
    expect(hexOf(frame().style.outlineColor)).toBe("#8e4aff");
    expect(hexOf(titleOf("ke-1").style.color)).toBe("#6508ff");
    act(() => useTheme.setState({ theme: "light", color: "monochrome" }));
    expect(hexOf(frame().style.outlineColor)).toBe("#434343");
    expect(hexOf(titleOf("ke-1").style.color)).toBe("#434343");
    act(() => useTheme.setState({ theme: "dark", color: "neon" }));
    expect(hexOf(frame().style.outlineColor)).toBe("#c4a1ff");
    expect(hexOf(titleOf("ke-1").style.color)).toBe("#c4a1ff");
  });

  it.each(["auth", "login", "place", "account_event", "transfer"])(
    "PIN: a %s record keeps the line and the title fit of its kind in every theme and mode",
    (kind) => {
      useSchema.setState({ nodes: platform });
      for (const theme of THEMES) {
        for (const color of COLOR_MODES) {
          useTheme.setState({ theme, color });
          usePivotStore.setState({ windows: [], nextZ: 20 });
          const view = show({ kind, id: `slot-${kind}` });
          // The store keeps the record's own kind (a fraud transaction is stored as auth).
          const record = (usePivotStore.getState().windows[0] as RecordWindowState).record;
          const accent = recordAccent(null, record);
          expect(hexOf(frame().style.outlineColor), `${theme} ${color}`).toBe(accent.toLowerCase());
          expect(hexOf(titleOf(record.id).style.color), `${theme} ${color}`).toBe(
            windowInk(accent, theme, color, TITLE_CONTRAST).toLowerCase(),
          );
          view.unmount();
        }
      }
    },
  );
});

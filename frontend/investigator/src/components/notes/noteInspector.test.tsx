/**
 * The Inspector's renderer for a selected note: the entity rows of design section 7, read-only,
 * with the button "Edit the note." Everything it draws is checked again, since an entity's
 * fields are an unknown record.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { noteInspectorBody } from "./noteInspectorBody";
import { InspectorSection } from "../inspector/InspectorSection";
import { noteToEntity } from "../../lib/notes/entity";
import { usePivotStore } from "../../store/pivot";
import { useNotesStore } from "../../store/notes";
import { when } from "../../lib/time-words";
import { bodyOf, doc, makeNote, para, text } from "../../lib/notes/test-fixtures";

const note = makeNote({
  id: "note-dddddddddddddddddddddddddddddd01",
  category: "Question",
  decision: "fail",
  link: { kind: "stop", id: "rec-1" },
  body: doc(para(text("Seen at the ", "bold"), text("terminal.")), { type: "bullet_list", content: [{ type: "list_item", content: [para(text("item"))] }] }),
});
const entity = noteToEntity(note, () => ({ lat: 1, lng: 2 }));

describe("noteInspector", () => {
  beforeEach(() => {
    usePivotStore.setState({ windows: [], nextZ: 20 });
    useNotesStore.setState({ notes: [note], scenario: note.scenario });
  });

  it("draws the rows of the design with their words, and the body through the read-only renderer", () => {
    const { container } = render(<>{noteInspectorBody(entity)}</>);
    for (const label of ["Your note", "Category", "Time", "Linked record", "Note"]) {
      expect(screen.getAllByText(label).length, label).toBeGreaterThan(0);
    }
    expect(screen.getByText("Question")).toBeTruthy();
    // D6: this note is linked (its stored decision is "fail"), so it shows no PASS or FAIL of its own.
    expect(screen.queryByText("PASS or FAIL")).toBeNull();
    expect(screen.queryByText("FAIL")).toBeNull();
    expect(screen.getByText(when(note.time))).toBeTruthy();
    expect(screen.getByText("stop: rec-1")).toBeTruthy();
    expect(container.querySelector("strong")?.textContent).toBe("Seen at the ");
    expect(container.querySelector("ul li")?.textContent).toBe("item");
  });

  it("D6: a note with no record keeps its PASS or FAIL row, and a linked note with a PASS shows none", () => {
    const free = noteToEntity(makeNote({ decision: "fail", link: null }), () => null);
    const first = render(<>{noteInspectorBody(free)}</>);
    expect(screen.getByText("PASS or FAIL")).toBeTruthy();
    expect(screen.getByText("FAIL")).toBeTruthy();
    expect(screen.queryByText("Linked record")).toBeNull();
    first.unmount();
    const linkedPass = noteToEntity(makeNote({ decision: "pass", link: { kind: "stop", id: "rec-1" } }), () => null);
    render(<>{noteInspectorBody(linkedPass)}</>);
    expect(screen.queryByText("PASS or FAIL")).toBeNull();
    expect(screen.queryByText("PASS")).toBeNull();
    expect(screen.getByText("Linked record")).toBeTruthy();
  });

  it("is read-only: no input, no text area, nothing editable", () => {
    const { container } = render(<>{noteInspectorBody(entity)}</>);
    expect(container.querySelector("input, textarea, select, [contenteditable]")).toBeNull();
  });

  it("the button Edit the note. opens the note's window", () => {
    render(<>{noteInspectorBody(entity)}</>);
    fireEvent.click(screen.getByRole("button", { name: "Edit the note." }));
    const w = usePivotStore.getState().windows;
    expect(w).toHaveLength(1);
    expect(w[0].kind === "note" && w[0].noteId).toBe(note.id);
  });

  it("an entity whose fields do not pass the checks draws no body and no unchecked value", () => {
    // The copy in a selection is drawn only for a note that is not in the store, so this entity names one that is not.
    const bad = {
      ...entity,
      id: "note-dddddddddddddddddddddddddddddd99",
      fields: { ...entity.fields, body: { v: 1, content: [{ type: "script" }] }, category: "<img src=x onerror=boom()>", decision: "maybe" },
    };
    const { container } = render(<>{noteInspectorBody(bad)}</>);
    expect(container.innerHTML).not.toContain("boom");
    expect(container.querySelector("img, script")).toBeNull();
    expect(container.querySelector("ul, blockquote, p")).toBeNull();
  });

  it("a plain body draws its paragraph", () => {
    const e = noteToEntity(makeNote({ body: bodyOf("Plain note.") }), () => null);
    const { container } = render(<>{noteInspectorBody(e)}</>);
    expect(container.querySelector("p")?.textContent).toBe("Plain note.");
  });

  it("draws the note as the store holds it now: an update of the selected note changes its text and category with no new selection", () => {
    const first = makeNote({ id: "note-eeeeeeeeeeeeeeeeeeeeeeeeeeeeee01", category: "Question", body: bodyOf("Text before the edit.") });
    useNotesStore.setState({ notes: [first], scenario: first.scenario });
    const selected = noteToEntity(first, () => null);
    const { container } = render(<>{noteInspectorBody(selected)}</>);
    expect(container.querySelector("p")?.textContent).toBe("Text before the edit.");
    expect(screen.getByText("Question")).toBeTruthy();

    act(() => {
      useNotesStore.setState({ notes: [{ ...first, category: "Pattern", body: bodyOf("Text after the edit.") }] });
    });
    expect(container.querySelector("p")?.textContent).toBe("Text after the edit.");
    expect(screen.getByText("Pattern")).toBeTruthy();
    expect(screen.queryByText("Question")).toBeNull();
    expect(container.textContent).not.toContain("Text before the edit.");
  });

  it("draws the decision of the stored note too: a note with no record shows the PASS or FAIL it was saved with", () => {
    const first = makeNote({ id: "note-eeeeeeeeeeeeeeeeeeeeeeeeeeeeee02", decision: "none", link: null });
    useNotesStore.setState({ notes: [first], scenario: first.scenario });
    render(<>{noteInspectorBody(noteToEntity(first, () => null))}</>);
    expect(screen.queryByText("FAIL")).toBeNull();
    act(() => {
      useNotesStore.setState({ notes: [{ ...first, decision: "fail" }] });
    });
    expect(screen.getByText("FAIL")).toBeTruthy();
  });

  it("a note no longer in the store draws from the copy held in the selection, with the button off", () => {
    const gone = makeNote({ id: "note-eeeeeeeeeeeeeeeeeeeeeeeeeeeeee03", category: "Question", body: bodyOf("Kept in the selection.") });
    useNotesStore.setState({ notes: [gone], scenario: gone.scenario });
    const { container } = render(<>{noteInspectorBody(noteToEntity(gone, () => null))}</>);
    act(() => {
      useNotesStore.setState({ notes: [] });
    });
    expect(container.querySelector("p")?.textContent).toBe("Kept in the selection.");
    expect(screen.getByText("Question")).toBeTruthy();
    expect((screen.getByRole("button", { name: "Edit the note." }) as HTMLButtonElement).disabled).toBe(true);
  });

  // Ship list entry 30: a note's rows start with the library icon of their field, and the Note heading
  // of the body draws none.
  it("each row starts with its icon, and the Note heading draws none", () => {
    const iconOf = (label: string) =>
      ((screen.getByText(label).parentElement as HTMLElement).firstElementChild as Element).getAttribute("class") ?? "";
    const free = makeNote({ id: "note-eeeeeeeeeeeeeeeeeeeeeeeeeeeeee04", category: "Question", decision: "fail", link: null, body: bodyOf("Seen.") });
    useNotesStore.setState({ notes: [free], scenario: free.scenario });
    const first = render(<>{noteInspectorBody(noteToEntity(free, () => null))}</>);
    expect(iconOf("Category")).toContain("lucide-shapes");
    expect(iconOf("PASS or FAIL")).toContain("lucide-scale");
    expect(iconOf("Time")).toContain("lucide-clock");
    const heading = screen.getByText("Note");
    expect(heading.querySelector("svg")).toBeNull();
    first.unmount();
    useNotesStore.setState({ notes: [note], scenario: note.scenario });
    render(<>{noteInspectorBody(entity)}</>);
    expect(iconOf("Linked record")).toContain("lucide-link");
  });

  // The visual pass after the icons: the body sits inside the side padding an Authorization's sections give
  // theirs, so the icons and values do not touch the panel's edge.
  it("the note's body sits inside the same side padding as an Inspector section's body", () => {
    const section = render(<InspectorSection title="Geo">marker</InspectorSection>);
    const sectionBody = screen.getByText("marker");
    const padding = (sectionBody.className.match(/(?:^|\s)(px-\d+)(?=\s|$)/) ?? [])[1];
    expect(padding, "the section body's side padding class").toBeTruthy();
    section.unmount();
    const { container } = render(<>{noteInspectorBody(entity)}</>);
    const inner = container.querySelector("[data-note-inspector]") as HTMLElement;
    expect(inner).not.toBeNull();
    const outer = inner.parentElement as HTMLElement;
    expect(outer.classList.contains(padding as string)).toBe(true);
    expect(outer.parentElement).toBe(container);
  });
});

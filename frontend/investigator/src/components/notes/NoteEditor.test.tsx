/**
 * The editor view's element. The browser's spell check is off on it: a browser may send what is
 * typed in a spell-checked field to a spell service, and a card number typed there would leave the
 * page before the guard has judged it (safety review of 2026-11-19, backlog item 1).
 */
import { describe, it, expect, afterEach } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { NoteEditor } from "./NoteEditor";
import type { EditorHandle } from "./editor-snapshot";

afterEach(cleanup);

function mount() {
  const handleRef: { current: EditorHandle | null } = { current: null };
  render(
    <NoteEditor
      initialBody={{ v: 1, content: [{ type: "paragraph" }] }}
      handleRef={handleRef}
      onChange={() => undefined}
      onRefuse={() => undefined}
      onSave={() => undefined}
      onBlur={() => undefined}
    />,
  );
  return screen.getByRole("textbox", { name: "Note text" });
}

describe("NoteEditor", () => {
  it("turns the browser's spell check off on the editor's element", () => {
    expect(mount().getAttribute("spellcheck")).toBe("false");
  });

  it("keeps the role, the multiline flag and the name the window's tests rely on", () => {
    const box = mount();
    expect(box.getAttribute("role")).toBe("textbox");
    expect(box.getAttribute("aria-multiline")).toBe("true");
    expect(box.getAttribute("contenteditable")).toBe("true");
  });
});

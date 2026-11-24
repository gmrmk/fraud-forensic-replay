import { afterEach, describe, it, expect } from "vitest";
import { focusAfterHidden, noteOpenedFrom, popoutOpened, returnFocus, returnNoteFocus, takeInitialFocus } from "./window-focus";

// The maps are module level, so every case uses ids of its own.
const attached: HTMLElement[] = [];
function button(): HTMLButtonElement {
  const el = document.createElement("button");
  document.body.appendChild(el);
  attached.push(el);
  return el;
}
afterEach(() => {
  for (const el of attached.splice(0)) el.remove();
});

describe("window focus", () => {
  it("an initial-focus request is taken once", () => {
    popoutOpened("w1", document.createElement("button"));
    expect(takeInitialFocus("w1")).toBe(true);
    expect(takeInitialFocus("w1")).toBe(false);
  });

  it("close returns focus to an opener still on screen", () => {
    const btn = button();
    popoutOpened("w2", btn);
    returnFocus("w2");
    expect(document.activeElement).toBe(btn);
  });

  it("an opener that left the page is ignored", () => {
    const btn = document.createElement("button"); // never attached
    popoutOpened("w3", btn);
    expect(() => returnFocus("w3")).not.toThrow();
    expect(document.activeElement).not.toBe(btn);
  });
});

describe("window focus: a popout opened with no opener (a globe dot)", () => {
  it("still takes its first focus, and its close falls back to the Inspector", () => {
    const aside = document.createElement("aside");
    aside.setAttribute("aria-label", "Inspector");
    aside.tabIndex = -1;
    document.body.appendChild(aside);
    attached.push(aside);
    popoutOpened("n1", null);
    expect(takeInitialFocus("n1")).toBe(true);
    popoutOpened("n2", null);
    returnFocus("n2");
    expect(document.activeElement).toBe(aside);
  });

  it("a popout opened with an element behaves as it did", () => {
    const btn = button();
    popoutOpened("n3", btn);
    expect(takeInitialFocus("n3")).toBe(true);
    popoutOpened("n4", btn);
    returnFocus("n4");
    expect(document.activeElement).toBe(btn);
  });
});

describe("window focus: a note window's opener", () => {
  it("files no focus request, so the editor keeps the caret", () => {
    noteOpenedFrom("note1", button());
    expect(takeInitialFocus("note1")).toBe(false);
  });

  it("the window's own close returns focus to the opener, and a second return does nothing", () => {
    const opener = button();
    const other = button();
    noteOpenedFrom("note2", opener);
    other.focus();
    returnNoteFocus("note2");
    expect(document.activeElement).toBe(opener);
    other.focus();
    returnNoteFocus("note2");
    expect(document.activeElement).toBe(other);
  });

  it("the frame's x consumes the first opener, and returnNoteFocus still reaches it after", () => {
    const opener = button();
    const other = button();
    noteOpenedFrom("note3", opener);
    returnFocus("note3");
    expect(document.activeElement).toBe(opener);
    other.focus();
    returnNoteFocus("note3");
    expect(document.activeElement).toBe(opener);
  });

  it("an opener that left the page sends focus to the Inspector aside", () => {
    const aside = document.createElement("aside");
    aside.setAttribute("aria-label", "Inspector");
    aside.tabIndex = -1;
    document.body.appendChild(aside);
    attached.push(aside);
    const opener = button();
    noteOpenedFrom("note4", opener);
    opener.remove();
    returnNoteFocus("note4");
    expect(document.activeElement).toBe(aside);
    returnNoteFocus("note4"); // forgotten: nothing more happens
  });

  it("a window with no opener kept moves no focus", () => {
    const other = button();
    other.focus();
    noteOpenedFrom("note5", null);
    returnNoteFocus("note5");
    expect(document.activeElement).toBe(other);
    returnNoteFocus("never-opened");
    expect(document.activeElement).toBe(other);
  });

  it("after a Save closes the window, focusAfterHidden of the same id still finds no stale entry", () => {
    const opener = button();
    const other = button();
    noteOpenedFrom("note6", opener);
    returnNoteFocus("note6");
    other.focus();
    focusAfterHidden("note6");
    expect(document.activeElement).not.toBe(opener);
  });
});

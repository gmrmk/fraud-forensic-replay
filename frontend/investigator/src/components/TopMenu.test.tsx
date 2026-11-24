import { describe, it, expect, vi } from "vitest";
import { act, render, screen, fireEvent } from "@testing-library/react";
import { TopMenu } from "./TopMenu";

// The top-bar menu button: a trigger drawn as a glass Pill, and a dialog that opens
// under it, closes on a press outside or when focus leaves it, takes focus on open, and
// ignores Escape.

function Child() {
  return (
    <button type="button" data-testid="child">
      child row
    </button>
  );
}

function renderOne(width: "wide" | "narrow" = "wide") {
  render(
    <>
      <button type="button" data-testid="elsewhere">
        elsewhere
      </button>
      <TopMenu label="Layers" width={width}>
        <Child />
      </TopMenu>
    </>,
  );
  return screen.getByRole("button", { name: "Layers" });
}

describe("TopMenu", () => {
  it("is closed at rest: no dialog, and the trigger says so", () => {
    const trigger = renderOne();
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(trigger.getAttribute("aria-expanded")).toBe("false");
    expect(trigger.getAttribute("aria-haspopup")).toBe("dialog");
  });

  it("a click opens a dialog named by the label, shows the children and takes focus", () => {
    const trigger = renderOne();
    fireEvent.click(trigger);
    const dialog = screen.getByRole("dialog", { name: "Layers" });
    expect(screen.getByTestId("child")).toBeTruthy();
    expect(trigger.getAttribute("aria-expanded")).toBe("true");
    expect(document.activeElement).toBe(dialog);
  });

  it("a second click closes it", () => {
    const trigger = renderOne();
    fireEvent.click(trigger);
    fireEvent.click(trigger);
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(trigger.getAttribute("aria-expanded")).toBe("false");
  });

  it("a press outside closes it", () => {
    const trigger = renderOne();
    fireEvent.click(trigger);
    fireEvent.pointerDown(screen.getByTestId("elsewhere"));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(trigger.getAttribute("aria-expanded")).toBe("false");
  });

  it("a press on a child inside keeps it open", () => {
    const trigger = renderOne();
    fireEvent.click(trigger);
    // The outside press proves the document handler receives events at all, so the
    // inside press below cannot pass for want of delivery.
    fireEvent.pointerDown(screen.getByTestId("elsewhere"));
    expect(screen.queryByRole("dialog")).toBeNull();

    fireEvent.click(trigger);
    fireEvent.pointerDown(screen.getByTestId("child"));
    expect(screen.queryByRole("dialog")).not.toBeNull();
    fireEvent.pointerDown(trigger);
    expect(screen.queryByRole("dialog")).not.toBeNull();
  });

  it("Escape closes nothing", () => {
    const trigger = renderOne();
    fireEvent.click(trigger);
    const dialog = screen.getByRole("dialog");
    fireEvent.keyDown(document, { key: "Escape" });
    fireEvent.keyDown(dialog, { key: "Escape" });
    expect(screen.queryByRole("dialog")).not.toBeNull();
    expect(trigger.getAttribute("aria-expanded")).toBe("true");
  });

  it("wide gives the panel 256px", () => {
    const wideTrigger = renderOne("wide");
    fireEvent.click(wideTrigger);
    const widePanel = screen.getByRole("dialog").firstElementChild as HTMLElement;
    expect(widePanel.className).toContain("w-[256px]");
    expect(widePanel.className).not.toContain("w-[176px]");
  });

  it("narrow gives the panel 176px", () => {
    const trigger = renderOne("narrow");
    fireEvent.click(trigger);
    const panel = screen.getByRole("dialog").firstElementChild as HTMLElement;
    expect(panel.className).toContain("w-[176px]");
    expect(panel.className).not.toContain("w-[256px]");
  });

  it("underlines the trigger's label while the menu is open, and not when it is closed", () => {
    const trigger = renderOne();
    const label = () => trigger.querySelector("span") as HTMLElement;
    expect(label().textContent).toBe("Layers");
    expect(label().className).toBe("");
    fireEvent.click(trigger);
    expect(label().classList.contains("underline")).toBe(true);
    expect(label().classList.contains("underline-offset-4")).toBe(true);
    fireEvent.click(trigger);
    expect(label().className).toBe("");
  });

  it("draws the trigger's text in the full text tone", () => {
    const trigger = renderOne();
    expect(trigger.style.color).toBe("var(--text)");
  });

  describe("the dialog", () => {
    const open = () => {
      fireEvent.click(renderOne());
      const dialog = screen.getByRole("dialog");
      const panel = dialog.firstElementChild as HTMLElement;
      // The scroller is the Panel's div child (the Panel's first child is its grain span).
      const scroller = Array.from(panel.children).find((el) => el.tagName === "DIV") as HTMLElement;
      return { dialog, panel, scroller };
    };

    it("is the opaque instrument material, with no glass inside it", () => {
      const { dialog, panel } = open();
      expect(panel.classList.contains("instrument")).toBe(true);
      expect(panel.classList.contains("glass")).toBe(false);
      expect(dialog.querySelector(".glass")).toBeNull();
    });

    it("scrolls in an inner div capped to the space above the bottom stack, never on the Panel", () => {
      const { panel, scroller } = open();
      // the cap reads the window's height and the stack's, both divided by the text size (index.css)
      const cap = "max-h-[calc(var(--vh-c)_-_var(--bottom-stack-c)_-_64px)]";
      expect(scroller).toBeTruthy();
      expect(scroller.contains(screen.getByTestId("child"))).toBe(true);
      expect(scroller.classList.contains(cap)).toBe(true);
      expect(scroller.classList.contains("overflow-y-auto")).toBe(true);
      expect(panel.classList.contains(cap)).toBe(false);
      expect(panel.classList.contains("overflow-y-auto")).toBe(false);
    });

    // The foot shade of a menu that scrolls (window N1, D5 a): the scroller carries the existing
    // .foot-cue rule only when the menu asks for it, and none of the other menus changes.
    it("with footCue the scroller carries foot-cue, beside the classes it already holds", () => {
      render(
        <TopMenu label="Notes" width="wide" footCue>
          <Child />
        </TopMenu>,
      );
      fireEvent.click(screen.getByRole("button", { name: "Notes" }));
      const panel = screen.getByRole("dialog").firstElementChild as HTMLElement;
      const scroller = Array.from(panel.children).find((el) => el.tagName === "DIV") as HTMLElement;
      expect(scroller.classList.contains("foot-cue")).toBe(true);
      expect(scroller.classList.contains("overflow-y-auto")).toBe(true);
      expect(panel.classList.contains("foot-cue")).toBe(false);
    });

    it("without footCue the scroller does not carry foot-cue", () => {
      const { scroller } = open();
      expect(scroller.classList.contains("foot-cue")).toBe(false);
    });

    it("sits 8 px under the trigger, flush with its left edge", () => {
      const { dialog } = open();
      for (const c of ["absolute", "left-0", "top-full", "mt-2"]) {
        expect(dialog.classList.contains(c), c).toBe(true);
      }
    });

    it("takes script focus only: tabindex -1", () => {
      const { dialog } = open();
      expect(dialog.getAttribute("tabindex")).toBe("-1");
    });
  });

  it("a press on an outside element that stops its own pointerdown still closes it", () => {
    // The map's verdict badges stop their pointerdown, so a bubbling document listener never
    // hears a press on them; the listener is registered in the capture phase.
    render(
      <>
        <button type="button" data-testid="stopper" onPointerDown={(e) => e.stopPropagation()}>
          stopper
        </button>
        <TopMenu label="Layers" width="wide">
          <Child />
        </TopMenu>
      </>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Layers" }));
    expect(screen.queryByRole("dialog")).not.toBeNull();
    fireEvent.pointerDown(screen.getByTestId("stopper"));
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("the document pointerdown listener is removed when the menu closes", () => {
    const added = vi.spyOn(document, "addEventListener");
    const removed = vi.spyOn(document, "removeEventListener");
    const trigger = renderOne();
    fireEvent.click(trigger);
    const down = added.mock.calls.find((c) => c[0] === "pointerdown");
    expect(down?.[2]).toBe(true);
    fireEvent.click(trigger);
    const up = removed.mock.calls.find((c) => c[0] === "pointerdown");
    expect(up?.[2]).toBe(true);
    expect(up?.[1]).toBe(down?.[1]);
    added.mockRestore();
    removed.mockRestore();
  });

  describe("focus leaving the menu", () => {
    function renderTwoRows() {
      render(
        <>
          <button type="button" data-testid="elsewhere">
            elsewhere
          </button>
          <TopMenu label="Layers" width="wide">
            <button type="button" data-testid="row-a">
              a
            </button>
            <button type="button" data-testid="row-b">
              b
            </button>
          </TopMenu>
        </>,
      );
      const trigger = screen.getByRole("button", { name: "Layers" });
      fireEvent.click(trigger);
      return trigger;
    }

    it("focus moving to an outside button closes it", () => {
      const trigger = renderTwoRows();
      act(() => trigger.focus());
      act(() => screen.getByTestId("elsewhere").focus());
      expect(screen.queryByRole("dialog")).toBeNull();
      expect(trigger.getAttribute("aria-expanded")).toBe("false");
    });

    it("focus moving from the trigger into the dialog keeps it open", () => {
      const trigger = renderTwoRows();
      act(() => trigger.focus());
      act(() => screen.getByRole("dialog").focus());
      expect(screen.queryByRole("dialog")).not.toBeNull();
    });

    it("focus moving between two rows inside keeps it open", () => {
      renderTwoRows();
      act(() => screen.getByTestId("row-a").focus());
      act(() => screen.getByTestId("row-b").focus());
      expect(screen.queryByRole("dialog")).not.toBeNull();
    });

    it("a blur with no related target (the window losing focus) keeps it open", () => {
      renderTwoRows();
      const row = screen.getByTestId("row-a");
      act(() => row.focus());
      fireEvent.blur(row, { relatedTarget: null });
      expect(screen.queryByRole("dialog")).not.toBeNull();
    });

    it("a blur whose related target is outside closes it", () => {
      renderTwoRows();
      const row = screen.getByTestId("row-a");
      fireEvent.blur(row, { relatedTarget: screen.getByTestId("elsewhere") });
      expect(screen.queryByRole("dialog")).toBeNull();
    });
  });

  it("the children are not in the document while closed", () => {
    renderOne();
    expect(screen.queryByTestId("child")).toBeNull();
  });

  it("opening a second menu leaves only the second open", () => {
    render(
      <>
        <TopMenu label="Layers" width="wide">
          <Child />
        </TopMenu>
        <TopMenu label="Paths" width="narrow">
          <span>path row</span>
        </TopMenu>
      </>,
    );
    const first = screen.getByRole("button", { name: "Layers" });
    const second = screen.getByRole("button", { name: "Paths" });
    fireEvent.click(first);
    expect(screen.getAllByRole("dialog")).toHaveLength(1);

    fireEvent.pointerDown(second);
    fireEvent.click(second);

    const dialogs = screen.getAllByRole("dialog");
    expect(dialogs).toHaveLength(1);
    expect(dialogs[0].getAttribute("aria-label")).toBe("Paths");
    expect(first.getAttribute("aria-expanded")).toBe("false");
    expect(second.getAttribute("aria-expanded")).toBe("true");
  });
});

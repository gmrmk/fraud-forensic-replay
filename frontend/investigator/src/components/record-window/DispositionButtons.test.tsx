import { describe, it, expect, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { DispositionButtons } from "./DispositionButtons";
import { DISPOSITION_WORD } from "../../lib/marks/words";
import { GROUP, heldTip, pressTip } from "../../lib/tooltip-words/record-window";

function renderButtons(over: Partial<Parameters<typeof DispositionButtons>[0]> = {}) {
  const onPress = vi.fn();
  render(<DispositionButtons value="none" busy={false} onPress={onPress} {...over} />);
  return onPress;
}

describe("DispositionButtons", () => {
  it("is a group named Your mark with the three buttons PASS, FAIL, WAITING in that order, each with one hidden drawing", () => {
    renderButtons();
    const group = screen.getByRole("group", { name: GROUP.name });
    const buttons = within(group).getAllByRole("button");
    expect(buttons.map((b) => b.textContent)).toEqual(["PASS", "FAIL", "WAITING"]);
    expect(buttons.map((b) => b.getAttribute("aria-label") ?? b.textContent)).toEqual(["PASS", "FAIL", "WAITING"]);
    for (const b of buttons) {
      const svgs = b.querySelectorAll("svg");
      expect(svgs).toHaveLength(1);
      expect(svgs[0].getAttribute("aria-hidden")).toBe("true");
    }
    expect(group.getAttribute("data-tip")).toBe(GROUP.tip);
  });

  it("the held button is pressed, in the text colour with a 2 px rule in its tone; the others are not", () => {
    renderButtons({ value: "fail" });
    expect(screen.getByRole("button", { name: "FAIL" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "PASS" })).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByRole("button", { name: "WAITING" })).toHaveAttribute("aria-pressed", "false");
    const held = screen.getByRole("button", { name: "FAIL" });
    expect(held.style.borderLeftWidth).toBe("2px");
    expect(held.style.borderLeftStyle).toBe("solid");
    expect(held.style.borderLeftColor).toBe("var(--alarm-on-panel)");
    expect(held.style.color).toBe("var(--text)");
    expect(screen.getByRole("button", { name: "PASS" }).style.borderLeftWidth).toBe("");
  });

  it("each tone is its own rule: PASS and WAITING held", () => {
    const { unmount } = render(<DispositionButtons value="pass" busy={false} onPress={() => {}} />);
    expect(screen.getByRole("button", { name: "PASS" }).style.borderLeftColor).toBe("var(--verdict-pass-on-panel)");
    unmount();
    render(<DispositionButtons value="wait" busy={false} onPress={() => {}} />);
    expect(screen.getByRole("button", { name: "WAITING" }).style.borderLeftColor).toBe("var(--verdict-wait-on-panel)");
  });

  it("a press calls onPress with pass, fail or wait", () => {
    const onPress = renderButtons();
    fireEvent.click(screen.getByRole("button", { name: "PASS" }));
    fireEvent.click(screen.getByRole("button", { name: "FAIL" }));
    fireEvent.click(screen.getByRole("button", { name: "WAITING" }));
    expect(onPress.mock.calls.map((c) => c[0])).toEqual(["pass", "fail", "wait"]);
  });

  it("an unheld button's tooltip is pressTip, the held one's is heldTip", () => {
    renderButtons({ value: "pass" });
    expect(screen.getByRole("button", { name: "PASS" }).getAttribute("data-tip")).toBe(heldTip(DISPOSITION_WORD.pass));
    expect(screen.getByRole("button", { name: "FAIL" }).getAttribute("data-tip")).toBe(pressTip(DISPOSITION_WORD.fail));
    expect(screen.getByRole("button", { name: "WAITING" }).getAttribute("data-tip")).toBe(pressTip(DISPOSITION_WORD.wait));
  });

  it("with busy every button is disabled and a press does nothing", () => {
    const onPress = renderButtons({ busy: true });
    for (const b of screen.getAllByRole("button")) expect(b).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "PASS" }));
    expect(onPress).not.toHaveBeenCalled();
  });

  it("every button carries data-disposition, and with no new prop the markup is today's (no aria-disabled, aria-pressed, role button)", () => {
    renderButtons();
    const buttons = screen.getAllByRole("button");
    expect(buttons.map((b) => b.getAttribute("data-disposition"))).toEqual(["pass", "fail", "wait"]);
    for (const b of buttons) {
      expect(b.hasAttribute("aria-disabled")).toBe(false);
      expect(b.hasAttribute("aria-checked")).toBe(false);
      expect(b.hasAttribute("aria-pressed")).toBe(true);
      expect(b.hasAttribute("role")).toBe(false);
      expect(b.hasAttribute("disabled")).toBe(false);
    }
  });

  it("no button is rounded and each is 9 px mono, 22 px tall", () => {
    renderButtons();
    for (const b of screen.getAllByRole("button")) {
      expect(b.className).not.toMatch(/rounded/);
      expect(b.className).toContain("text-[9px]");
      expect(b.className).toContain("h-[22px]");
      expect(b.className).toContain("font-mono");
    }
  });
});

// The menu's use of the same buttons (PLAN-tag-menu 4.7): a lock, menu roles, a busy state that keeps the
// focus, and a refusal's line in one button's tooltip.
describe("DispositionButtons in a menu", () => {
  const buttonsOf = () => screen.getAllByRole("menuitemcheckbox");

  it("lockedTip: every button is aria-disabled, not disabled, tipped with the lock, and a press does nothing", () => {
    const onPress = renderButtons({ value: "pass", lockedTip: "L" });
    for (const b of screen.getAllByRole("button")) {
      expect(b.getAttribute("aria-disabled")).toBe("true");
      expect(b.hasAttribute("disabled")).toBe(false);
      expect(b.getAttribute("data-tip")).toBe("L");
      expect(b.className).toContain("aria-disabled:opacity-40");
      fireEvent.click(b);
    }
    expect(onPress).not.toHaveBeenCalled();
  });

  it("lockedTip: the held button keeps its held style and its pressed state", () => {
    renderButtons({ value: "fail", lockedTip: "L" });
    const held = screen.getByRole("button", { name: "FAIL" });
    expect(held).toHaveAttribute("aria-pressed", "true");
    expect(held.style.borderLeftWidth).toBe("2px");
    expect(held.style.color).toBe("var(--text)");
    expect(screen.getByRole("button", { name: "PASS" }).style.borderLeftWidth).toBe("");
  });

  it("lockedTip: a locked button still takes the focus, so its tooltip can be read", () => {
    renderButtons({ value: "pass", lockedTip: "L" });
    const b = screen.getByRole("button", { name: "WAITING" });
    b.focus();
    expect(document.activeElement).toBe(b);
  });

  it("menuItems: each button is a menuitemcheckbox, checked on the held one, with no aria-pressed", () => {
    renderButtons({ value: "fail", menuItems: true });
    const bs = buttonsOf();
    expect(bs.map((b) => b.textContent)).toEqual(["PASS", "FAIL", "WAITING"]);
    expect(bs.map((b) => b.getAttribute("aria-checked"))).toEqual(["false", "true", "false"]);
    for (const b of bs) {
      expect(b.hasAttribute("aria-pressed")).toBe(false);
      expect(b.hasAttribute("aria-disabled")).toBe(false);
    }
  });

  it("menuItems: a press calls onPress", () => {
    const onPress = renderButtons({ menuItems: true });
    fireEvent.click(screen.getByRole("menuitemcheckbox", { name: "FAIL" }));
    expect(onPress).toHaveBeenCalledWith("fail");
  });

  it("menuItems and busy: every button is aria-disabled, not disabled, keeps its focus, and a press does nothing", () => {
    const onPress = renderButtons({ menuItems: true, busy: true });
    const pressed = screen.getByRole("menuitemcheckbox", { name: "PASS" });
    pressed.focus();
    for (const b of buttonsOf()) {
      expect(b.getAttribute("aria-disabled")).toBe("true");
      expect(b.hasAttribute("disabled")).toBe(false);
      expect(b.className).toContain("aria-disabled:opacity-40");
      fireEvent.click(b);
    }
    expect(onPress).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(pressed);
  });

  it("without menuItems, busy still disables (today's record window)", () => {
    renderButtons({ busy: true });
    for (const b of screen.getAllByRole("button")) {
      expect(b.hasAttribute("disabled")).toBe(true);
      expect(b.hasAttribute("aria-disabled")).toBe(false);
    }
  });

  it("refused: that button's tooltip holds its own tip, then the line; the others are unchanged", () => {
    renderButtons({ value: "none", refused: { d: "fail", line: "R" } });
    expect(screen.getByRole("button", { name: "FAIL" }).getAttribute("data-tip")).toBe(`${pressTip(DISPOSITION_WORD.fail)}\nR`);
    expect(screen.getByRole("button", { name: "PASS" }).getAttribute("data-tip")).toBe(pressTip(DISPOSITION_WORD.pass));
    expect(screen.getByRole("button", { name: "WAITING" }).getAttribute("data-tip")).toBe(pressTip(DISPOSITION_WORD.wait));
  });

  it("refused: null changes nothing", () => {
    renderButtons({ refused: null });
    expect(screen.getByRole("button", { name: "FAIL" }).getAttribute("data-tip")).toBe(pressTip(DISPOSITION_WORD.fail));
  });
});

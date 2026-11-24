import { describe, it, expect } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { CaseBottomStack } from "./CaseBottomStack";

// The stack rises to z-30 through a has-[...] rule that selects a descendant carrying
// [aria-haspopup][aria-expanded=true]. CaseBottomStack.test.tsx pins the class string; this
// pins the other half of the contract: a real child (the playback speed trigger) carries
// exactly those attributes while its menu is open, and not when it is closed.
// happy-dom does no :has() or stacking, so the rule's selector is lifted out of the class
// and run as a plain querySelector against the stack.
function renderStack() {
  const { container } = render(
    <CaseBottomStack
      stackRef={null}
      tickerItems={[]}
      transactions={[]}
      logins={[]}
      accountEvents={[]}
      transfers={[]}
      genericEntities={[]}
      annotations={[]}
    />,
  );
  return container.firstElementChild as HTMLElement;
}

function popupSelector(stack: HTMLElement): string {
  const token = stack.className
    .split(/\s+/)
    .map((c) => /^has-\[(.+)\]:z-30$/.exec(c))
    .find((m) => m !== null);
  expect(token, "a has-[...]:z-30 class on the stack").toBeTruthy();
  return token![1];
}

describe("CaseBottomStack z-30 rule, against its real children", () => {
  // kills Z2 (aria-haspopup removed from the speed trigger); closes G2.
  it("the has-[] selector matches the speed trigger while its menu is open, and nothing while closed", () => {
    const stack = renderStack();
    const selector = popupSelector(stack);
    // The lifted selector must be the contract's selector, not some other one.
    expect(selector).toContain("aria-haspopup");
    expect(selector).toContain("aria-expanded=true");

    const trigger = screen.getByRole("button", { name: /playback speed/i });
    expect(stack.contains(trigger)).toBe(true);
    expect(stack.querySelector(selector), "closed").toBeNull();

    fireEvent.click(trigger);
    expect(screen.queryByRole("radiogroup")).not.toBeNull();
    expect(stack.querySelector(selector), "open").toBe(trigger);
    expect(trigger.getAttribute("aria-haspopup")).toBe("true");

    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.queryByRole("radiogroup")).toBeNull();
    expect(stack.querySelector(selector), "after Escape").toBeNull();
    // Escape returns focus to the one [aria-haspopup] in the flyout (the trigger).
    expect(document.activeElement).toBe(trigger);
  });
});

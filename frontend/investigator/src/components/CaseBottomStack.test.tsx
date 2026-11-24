import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { CaseBottomStack } from "./CaseBottomStack";

// The speed menu lives inside this stack, which is a z-10 sibling of the z-20
// Inspector, so the open menu painted under the Inspector. happy-dom does
// no layout or stacking, so this pins the classes; the stacking itself is
// measured in a browser.
describe("CaseBottomStack stacking", () => {
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

  it("sits at z-10 and rises to z-30 only while a popup trigger inside it is expanded", () => {
    const classes = renderStack().className.split(/\s+/);
    expect(classes).toContain("z-10");
    expect(classes).toContain("has-[[aria-haspopup][aria-expanded=true]]:z-30");
  });
});

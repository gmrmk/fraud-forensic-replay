import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { Ribbon } from "./Ribbon";

describe("Ribbon", () => {
  it("renders as a labeled group containing its children", () => {
    render(
      <Ribbon label="Breadcrumb">
        <span>crumb</span>
      </Ribbon>,
    );
    const group = screen.getByRole("group", { name: "Breadcrumb" });
    expect(group.textContent).toContain("crumb");
  });

  it("renders leading and trailing slots around the children", () => {
    render(
      <Ribbon label="R" leading={<span>L</span>} trailing={<span>T</span>}>
        <span>mid</span>
      </Ribbon>,
    );
    const group = screen.getByRole("group", { name: "R" });
    expect(group.textContent).toContain("L");
    expect(group.textContent).toContain("mid");
    expect(group.textContent).toContain("T");
  });
});

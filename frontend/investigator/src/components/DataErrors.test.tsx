import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { DataErrors } from "./DataErrors";

describe("DataErrors", () => {
  it("renders nothing when there are no errors", () => {
    const { container } = render(<DataErrors errors={[null, null]} />);
    expect(container.firstChild).toBeNull();
  });

  it("renders each present error as a visible alert line", () => {
    render(<DataErrors errors={["boot 500", null, "population heat 503"]} />);
    expect(screen.getByRole("alert").textContent).toContain("boot 500");
    expect(screen.getByText(/population heat 503/)).toBeTruthy();
  });
});

import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { MapCredit } from "./MapCredit";

const HREFS = [
  "https://openfreemap.org",
  "https://www.openmaptiles.org/",
  "https://www.openstreetmap.org/copyright",
];

describe("MapCredit", () => {
  it("renders the three credit links with their hrefs, opening in a new tab", () => {
    const { container } = render(<MapCredit />);
    const links = Array.from(container.querySelectorAll("a"));
    expect(links.map((a) => a.getAttribute("href"))).toEqual(HREFS);
    for (const a of links) expect(a.getAttribute("target")).toBe("_blank");
    expect(container.querySelector("[data-map-credit]")?.textContent).toContain("OpenStreetMap");
  });

  // The credit takes the muted grey, and the copyright mark alone takes the body text colour.
  it("the credit takes text-muted, not text-dim, and the copyright mark takes --text", () => {
    const { container } = render(<MapCredit />);
    const credit = container.querySelector("[data-map-credit]") as HTMLElement;
    expect(credit.classList.contains("text-muted")).toBe(true);
    expect(credit.classList.contains("text-dim")).toBe(false);
    const mark = Array.from(credit.querySelectorAll("span")).find((s) => s.textContent === "©");
    expect(mark, "the span that holds the copyright mark").toBeDefined();
    expect(mark?.className).toContain("text-[color:var(--text)]");
  });
});

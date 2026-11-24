import { describe, it, expect, vi } from "vitest";
import { render } from "@testing-library/react";
import { VerdictCapsule } from "./VerdictCapsule";
import { QueueFlag } from "./QueueFlag";

// happy-dom drops a background holding rgb(var(...) / a), so the real PLATE reads back empty and
// a direct assertion on it would be void. Swapping in a plain colour makes the wiring observable:
// the root's background is whatever the component takes from tone-style.
// A separate file, because vi.mock is file-wide and VerdictCapsule.test.tsx pins the real PLATE.
vi.mock("./tone-style", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./tone-style")>();
  return { ...actual, PLATE: "#102030" };
});

/** What this DOM reads back for a plain colour assigned as a background. */
function reads(colour: string): string {
  const probe = document.createElement("span");
  probe.style.background = colour;
  return probe.style.background;
}

describe("the globe marks' plate is wired to PLATE", () => {
  it("the probe distinguishes the plate from no plate", () => {
    expect(reads("#102030")).not.toBe("");
    expect(reads("#102030")).not.toBe(reads("transparent"));
  });

  // kills Z3 (VerdictCapsule background becomes transparent); closes G6.
  it("VerdictCapsule's root takes PLATE as its background", () => {
    const { container } = render(<VerdictCapsule segments={[{ word: "ATO", tone: "fail", count: 1 }]} />);
    const root = container.querySelector("[data-verdict-capsule]") as HTMLElement;
    expect(root.style.background).toBe(reads("#102030"));
  });

  // kills Z4 (QueueFlag drops its background); closes G6.
  it("QueueFlag's root takes PLATE as its background and keeps its padding", () => {
    const { container } = render(<QueueFlag text="velocity" />);
    const root = container.querySelector("[data-queue-flag]") as HTMLElement;
    expect(root.style.background).toBe(reads("#102030"));
    expect(root.style.padding).toBe("3px 0px");
  });
});

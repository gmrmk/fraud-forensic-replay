// happy-dom drops a background holding rgb(var(...) / a), so the real PLATE reads back empty and a test
// that expects it passes or fails for nothing. This file replaces PLATE with a plain colour and asks
// that the plate's background is the one the verdict marks use (the same file split as
// components/verdict/VerdictCapsule.plate.test.tsx: vi.mock is file-wide).
import { describe, expect, it, vi } from "vitest";
import { render } from "@testing-library/react";
import { StopPlate } from "./StopPlate";

vi.mock("../verdict/tone-style", async (orig) => ({ ...(await orig<object>()), PLATE: "#102030" }));

describe("the stop plate is wired to the globe marks' plate ground", () => {
  it("takes PLATE as its background on both surfaces", () => {
    for (const size of ["globe", "timeline"] as const) {
      const { container, unmount } = render(<StopPlate label="1" lens={false} size={size} />);
      expect((container.firstElementChild as HTMLElement).style.background).toMatch(/#102030|rgb\(16, 32, 48\)/);
      unmount();
    }
  });
});

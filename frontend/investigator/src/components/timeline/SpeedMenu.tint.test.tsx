import { describe, it, expect, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { SpeedMenu } from "./SpeedMenu";
import { usePlayhead } from "../../store/playhead";
import { COLOR_MODES, THEMES } from "../../theme/axes";
import { compositeOver, contrastRatio } from "../../theme/legibility";
import { resolvePalette } from "../../theme/resolve";
import { hexToRgb01 } from "../../theme/to-rgb";

// SpeedMenu.test.tsx proves the on-panel accent reaches 4.5:1 on a 10 percent tint, with the 0.1
// written into the test as a literal. That proves the tokens, not the component: a heavier tint
// on the selected row would leave it green. Here the alpha is read from the row's own class.
beforeEach(() => {
  usePlayhead.setState({ playhead: 5_000, minTime: 0, maxTime: 10_000, isPlaying: false, playbackRate: 1, isScrubbing: false });
});

function selectedRowTint(): number {
  render(<SpeedMenu />);
  const active = screen.getAllByRole("radio").filter((r) => r.getAttribute("aria-checked") === "true");
  expect(active).toHaveLength(1);
  const tints = [...active[0].classList].map((c) => /^bg-accent\/(\d+)$/.exec(c)).filter((m) => m !== null);
  expect(tints, "one bg-accent/N tint on the selected row").toHaveLength(1);
  return Number(tints[0]![1]) / 100;
}

describe("SpeedMenu selected-row tint", () => {
  // kills Z8 (bg-accent/10 becomes bg-accent/40); closes G8.
  it("is no heavier than the 10 percent the contrast proof assumes", () => {
    expect(selectedRowTint()).toBeLessThanOrEqual(0.1);
  });

  it("the on-panel accent reaches 4.5:1 over the tint the component actually draws, in every theme and colour mode", () => {
    const alpha = selectedRowTint();
    const triplet = (t: string): [number, number, number] => {
      const [r, g, b] = t.split(/\s+/).map((n) => parseInt(n, 10) / 255);
      return [r, g, b];
    };
    let cells = 0;
    const failures: string[] = [];
    for (const theme of THEMES) {
      for (const color of COLOR_MODES) {
        const p = resolvePalette(theme, color);
        const bg = compositeOver(hexToRgb01(p.ramp.r1), alpha, triplet(p.material.panelBase));
        const c = contrastRatio(hexToRgb01(p.onPanel.r1), bg);
        cells += 1;
        if (c < 4.5) failures.push(`${theme}.${color} = ${c.toFixed(2)}:1`);
      }
    }
    expect(cells).toBe(THEMES.length * COLOR_MODES.length);
    expect(failures).toEqual([]);
  });
});

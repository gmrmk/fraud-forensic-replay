import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { VerdictCapsule } from "./VerdictCapsule";
import { QueueFlag } from "./QueueFlag";
import { PLATE, PLATE_ALPHA, TONE_STYLE } from "./tone-style";
import { COLOR_MODES, THEMES } from "../../theme/axes";
import { compositeOver, contrastRatio } from "../../theme/legibility";
import { resolvePalette } from "../../theme/resolve";
import { hexToRgb01 } from "../../theme/to-rgb";

const root = (c: HTMLElement) => c.querySelector("[data-verdict-capsule]") as HTMLElement;
const segments = (c: HTMLElement) => [...c.querySelectorAll("[data-tone]")] as HTMLElement[];

describe("TONE_STYLE literals", () => {
  // The segment tests above compare against TONE_STYLE itself, so any table passes them. These
  // literals pin the table, and a rendered segment is read against the literal as well.
  it("pins every tone's text colour and triplet, and the capsule draws them", () => {
    expect(TONE_STYLE).toEqual({
      fail: { text: "var(--alarm-on-panel)", rgb: "--alarm-rgb" },
      pass: { text: "var(--verdict-pass-on-panel)", rgb: "--verdict-pass-rgb" },
      wait: { text: "var(--verdict-wait-on-panel)", rgb: "--verdict-wait-rgb" },
      queue: { text: "var(--verdict-queue-on-panel)", rgb: "--verdict-queue-rgb" },
      unknown: { text: "var(--text-muted)", rgb: "--text-faint-rgb" },
    });
    const { container } = render(
      <VerdictCapsule
        segments={[
          { word: "HOLD", tone: "wait", count: 1 },
          { word: "NOTED", tone: "unknown", count: 1 },
        ]}
      />,
    );
    const [wait, unknown] = segments(container);
    expect(wait.style.color).toBe("var(--verdict-wait-on-panel)");
    expect(wait.style.borderLeftColor).toBe("var(--verdict-wait-on-panel)");
    expect(unknown.style.color).toBe("var(--text-muted)");
    expect(unknown.style.borderLeftColor).toBe("var(--text-muted)");
  });
});

describe("VerdictCapsule", () => {
  it("renders the word in its tone", () => {
    render(<VerdictCapsule segments={[{ word: "ATO", tone: "fail", count: 1 }]} />);
    expect(screen.getByText("ATO")).toHaveAttribute("data-tone", "fail");
    expect(screen.queryByText(/×/)).toBeNull();
  });

  it("a pile counts its word", () => {
    render(<VerdictCapsule segments={[{ word: "ATO", tone: "fail", count: 12 }]} />);
    expect(screen.getByText("×12")).toBeInTheDocument();
  });

  it("two words render two segments in the given order", () => {
    const { container } = render(
      <VerdictCapsule segments={[{ word: "ATO", tone: "fail", count: 1 }, { word: "PASSED", tone: "pass", count: 1 }]} />,
    );
    expect([...container.querySelectorAll("[data-tone]")].map((s) => s.getAttribute("data-tone"))).toEqual(["fail", "pass"]);
  });

  it("dims and lights through its root", () => {
    const { container, rerender } = render(<VerdictCapsule segments={[{ word: "ATO", tone: "fail", count: 1 }]} dim />);
    expect(root(container).style.opacity).toBe("0.45");
    rerender(<VerdictCapsule segments={[{ word: "ATO", tone: "fail", count: 1 }]} lit />);
    expect(root(container).dataset.lit).toBe("true");
    expect(root(container).style.opacity).toBe("1");
  });

  it("is a square plate: it never shrinks and has no radius and no overflow clip", () => {
    const { container } = render(<VerdictCapsule segments={[{ word: "ATO", tone: "fail", count: 1 }]} />);
    const r = root(container);
    expect(r.classList.contains("shrink-0")).toBe(true);
    expect(r.classList.contains("rounded-full")).toBe(false);
    expect(r.classList.contains("overflow-hidden")).toBe(false);
    expect(r.style.borderRadius).toBe("");
    expect(r.style.padding).toBe("3px 0px");
    // That the plate has no border is checked in frames, not here: happy-dom drops a border
    // shorthand holding rgb(var(...) / a), so the old border read "" too (mutant C8, 2026-11-15).
  });

  it("draws each segment as a 2 px solid rule and its word in the tone's text colour", () => {
    const { container } = render(
      <VerdictCapsule segments={[{ word: "ATO", tone: "fail", count: 1 }, { word: "PASSED", tone: "pass", count: 1 }]} />,
    );
    const [first, second] = segments(container);
    for (const [seg, tone] of [[first, "fail"], [second, "pass"]] as const) {
      expect(seg.style.borderLeftWidth).toBe("2px");
      expect(seg.style.borderLeftStyle).toBe("solid");
      expect(seg.style.borderLeftColor).toBe(TONE_STYLE[tone].text);
      expect(seg.style.color).toBe(TONE_STYLE[tone].text);
      expect(seg.style.padding).toBe("0px 6px");
    }
    expect(first.style.marginLeft).toBe("");
    expect(second.style.marginLeft).toBe("2px");
  });

  it("lights with a 1 px outline and a 2 px ring in the lead tone, and unlit has no shadow", () => {
    const segs = [{ word: "ATO", tone: "fail" as const, count: 1 }];
    const { container, rerender } = render(<VerdictCapsule segments={segs} lit />);
    expect(root(container).style.boxShadow).toBe(
      "0 0 0 1px var(--alarm-on-panel), 0 0 0 3px rgb(var(--alarm-rgb) / 0.35)",
    );
    rerender(<VerdictCapsule segments={segs} />);
    expect(root(container).style.boxShadow).toBe("");
  });

  it("takes the lit outline and ring from the first segment's tone", () => {
    const { container, rerender } = render(<VerdictCapsule segments={[{ word: "PASSED", tone: "pass", count: 1 }]} lit />);
    expect(root(container).style.boxShadow).toBe(
      "0 0 0 1px var(--verdict-pass-on-panel), 0 0 0 3px rgb(var(--verdict-pass-rgb) / 0.35)",
    );
    rerender(
      <VerdictCapsule segments={[{ word: "ATO", tone: "fail", count: 1 }, { word: "PASSED", tone: "pass", count: 1 }]} lit />,
    );
    expect(root(container).style.boxShadow).toBe(
      "0 0 0 1px var(--alarm-on-panel), 0 0 0 3px rgb(var(--alarm-rgb) / 0.35)",
    );
  });

  it("transitions only opacity, over 150 ms, and honours reduced motion", () => {
    const { container } = render(<VerdictCapsule segments={[{ word: "ATO", tone: "fail", count: 1 }]} />);
    const cls = root(container).classList;
    expect(cls.contains("transition-opacity")).toBe(true);
    expect(cls.contains("duration-150")).toBe(true);
    expect(cls.contains("motion-reduce:transition-none")).toBe(true);
  });

  it("keeps its words on one line", () => {
    const { container } = render(<VerdictCapsule segments={[{ word: "KEY TAKEOVER", tone: "fail", count: 1 }]} />);
    expect(root(container).classList.contains("whitespace-nowrap")).toBe(true);
  });

  it("the plate is the theme background at 0.9", () => {
    expect(PLATE_ALPHA).toBe(0.9);
    expect(PLATE).toBe("rgb(var(--bg-rgb) / 0.9)");
  });
});

describe("QueueFlag", () => {
  it("renders the flag text with a dotted rule and no pole", () => {
    const { container } = render(<QueueFlag text="rule-x" />);
    const text = screen.getByText("rule-x");
    expect(container.querySelector("[data-flag-pole]")).toBeNull();
    // Dotted, not dashed: rendered 2026-11-15, a 2 px dashed rule 9 px tall is one dash and looks
    // solid, so the queued flag lost its difference from a decided mark where colour cannot help.
    expect(text.style.borderLeftStyle).toBe("dotted");
    expect(text.style.borderLeftWidth).toBe("2px");
    expect(text.style.borderLeftColor).toBe("var(--verdict-queue-on-panel)");
    expect(text.style.color).toBe("var(--verdict-queue-on-panel)");
    expect(text.style.padding).toBe("0px 6px");
    const flagRoot = container.querySelector("[data-queue-flag]") as HTMLElement;
    expect(flagRoot.style.padding).toBe("3px 0px");
    expect(flagRoot.classList.contains("whitespace-nowrap")).toBe(true);
    expect([...container.querySelectorAll<HTMLElement>("*")].some((el) => el.style.clipPath !== "")).toBe(false);
    expect((container.querySelector("[data-queue-flag]") as HTMLElement).classList.contains("shrink-0")).toBe(true);
  });

  it("a pile counts its entries", () => {
    render(<QueueFlag text="rule-x" count={12} />);
    expect(screen.getByText("rule-x ×12")).toBeInTheDocument();
  });
});

describe("the plate's contrast", () => {
  type Rgb = [number, number, number];
  const BASEMAP = {
    dark: ["#0E131C", "#10233A"],
    light: ["#F8F4F0", "#9EBDFF"],
  } as const;
  const backdropsFor = (theme: (typeof THEMES)[number]): Rgb[] => [
    [0, 0, 0],
    [128 / 255, 128 / 255, 128 / 255],
    [1, 1, 1],
    ...BASEMAP[theme].map(hexToRgb01),
  ];

  it("keeps every word and the ×N count at 4.5:1 on the plate over every backdrop, in every theme and colour mode", () => {
    let min = Infinity;
    let cells = 0;
    for (const theme of THEMES) {
      for (const color of COLOR_MODES) {
        const p = resolvePalette(theme, color);
        const words = [p.onPanel.alarm, p.onPanel.pass, p.onPanel.wait, p.onPanel.queue, p.neutral.textMuted];
        for (const backdrop of backdropsFor(theme)) {
          const plate = compositeOver(hexToRgb01(p.neutral.bg), PLATE_ALPHA, backdrop);
          for (const hex of words) {
            const ratio = contrastRatio(hexToRgb01(hex), plate);
            min = Math.min(min, ratio);
            cells += 1;
            expect(ratio, `${theme}/${color} ${hex} over ${backdrop.join(",")}`).toBeGreaterThanOrEqual(4.5);
          }
        }
      }
    }
    // The loops ran over every cell (5 words, 5 backdrops), so the minimum below is a real minimum
    // and not the Infinity of an empty walk.
    expect(cells).toBe(THEMES.length * COLOR_MODES.length * 5 * 5);
    expect(Number.isFinite(min)).toBe(true);
    expect(min).toBeGreaterThanOrEqual(4.5);
  });
});

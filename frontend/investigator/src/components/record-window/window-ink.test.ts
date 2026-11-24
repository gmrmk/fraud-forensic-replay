/**
 * The record window's title and lit pin are painted in the colour of the record's kind, fitted to the
 * window's header in each theme: a text to 4.5 to 1, the pin (a control's mark) to 3 to 1. The ratios
 * are computed here with the WCAG relative luminance formula, not with the app's own helper.
 */
import { readdirSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { useTheme } from "../../store/theme";
import { windowKindColours } from "../../lib/window-ink";
import { storyInk } from "../../theme/kind-ink";
import type { ScenarioNode } from "../../lib/scenarios";
import { useOnMenu } from "../LayerRow";
import { PIN_CONTRAST, TITLE_CONTRAST, windowInk } from "./record-window";

type Rgb = [number, number, number];

const lum = ([r, g, b]: Rgb): number => {
  const c = [r, g, b].map((v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
};
const ratio = (a: Rgb, b: Rgb): number => {
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};
const rgbOf = (hex: string): Rgb => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)) as Rgb;

// The surfaces the title and the pin sit on, in 8-bit channels: the panel (--panel-base) and the
// header over it (--panel-floor at 0.85, which is rgb(228, 233, 241) in light).
const SURFACES: Record<"light" | "dark", Rgb[]> = {
  light: [[235, 239, 245], [228, 233, 241]],
  dark: [[20, 25, 34], [15, 19, 26]],
};

const SCENARIOS = resolve(dirname(fileURLToPath(import.meta.url)), "../../../../../backend/scenarios");
const KIND_COLOURS: string[] = [
  ...new Set(
    readdirSync(SCENARIOS)
      .filter((f) => f.endsWith(".scenario.json"))
      .flatMap((f) => [...readFileSync(resolve(SCENARIOS, f), "utf8").matchAll(/"palette":\s*"(#[0-9a-fA-F]{6})"/g)])
      .map((m) => m[1].toLowerCase()),
  ),
];

describe("the record window's ink", () => {
  it("reads the kind colours of the stories' manifests", () => {
    expect(KIND_COLOURS.length).toBeGreaterThan(10);
    expect(KIND_COLOURS).toContain("#f5a623");
    expect(KIND_COLOURS).toContain("#c4a1ff");
  });

  it("the targets are 4.5 for the title and 3 for the pin", () => {
    expect(TITLE_CONTRAST).toBe(4.5);
    expect(PIN_CONTRAST).toBe(3);
  });

  describe.each(["light", "dark"] as const)("in the %s theme", (theme) => {
    it.each(KIND_COLOURS)("the title in %s reaches 4.5 to 1 on the panel and on the header", (hex) => {
      const ink = windowInk(hex, theme, "neon", TITLE_CONTRAST);
      for (const surface of SURFACES[theme]) expect(ratio(rgbOf(ink), surface)).toBeGreaterThanOrEqual(4.5);
    });

    it.each(KIND_COLOURS)("the lit pin in %s reaches 3 to 1 on the panel and on the header", (hex) => {
      const ink = windowInk(hex, theme, "neon", PIN_CONTRAST);
      for (const surface of SURFACES[theme]) expect(ratio(rgbOf(ink), surface)).toBeGreaterThanOrEqual(3);
    });
  });

  it("keeps the hue: a colour that already clears keeps its value, a failing one is stepped", () => {
    expect(windowInk("#f5a623", "dark", "neon", TITLE_CONTRAST)).toBe("#f5a623");
    expect(windowInk("#f5a623", "light", "neon", TITLE_CONTRAST)).not.toBe("#f5a623");
  });

  it("passes a value that is not #rrggbb through unchanged", () => {
    expect(windowInk("var(--r1)", "light", "neon", TITLE_CONTRAST)).toBe("var(--r1)");
  });
});

describe("the Layers menu and the Shared values dots keep their colours (useOnMenu, neon)", () => {
  // Values taken from the fit before this change.
  const BEFORE: Record<"dark" | "light", Record<string, string>> = {
    dark: {
      "#f5a623": "#f5a623",
      "#c4a1ff": "#c4a1ff",
      "#7ee787": "#7ee787",
      "#ff3d2e": "#ff3d2e",
      "#00e5ff": "#00e5ff",
      "#ffa657": "#ffa657",
      "#4da3ff": "#4da3ff",
    },
    light: {
      "#f5a623": "#be7a09",
      "#c4a1ff": "#a169ff",
      "#7ee787": "#1e9f29",
      "#ff3d2e": "#ff3d2e",
      "#00e5ff": "#0097a8",
      "#ffa657": "#dc6700",
      "#4da3ff": "#1586ff",
    },
  };
  it.each(["dark", "light"] as const)("%s", (theme) => {
    const saved = { theme: useTheme.getState().theme, color: useTheme.getState().color };
    useTheme.setState({ theme, color: "neon" });
    const { result } = renderHook(() => useOnMenu());
    for (const [declared, expected] of Object.entries(BEFORE[theme])) expect(result.current(declared)).toBe(expected);
    useTheme.setState(saved);
  });
});

// Test 4.4 (theme follow, C4.T3): a story's own kind takes the resolver's mark and text ink for the line
// and the title; any other kind (a kind that has a palette slot, or one the story does not hold) keeps
// the line it was given and today's fit of the title. The manifest is the real one.
describe("windowKindColours", () => {
  const manifests = Object.values(
    import.meta.glob<string>("../../../../../backend/scenarios/*.scenario.json", { query: "?raw", import: "default", eager: true }),
  ).map((raw) => JSON.parse(raw) as { id: string; nodes: ScenarioNode[] });
  const nodesOf = (id: string): ScenarioNode[] => {
    const found = manifests.find((m) => m.id === id);
    if (!found) throw new Error(`no scenario file with id ${id}`);
    return found.nodes;
  };
  const platform = nodesOf("platform-access");

  it("key_event of platform-access in light neon is the drawn mark and text ink", () => {
    const ink = storyInk(platform, "light", "neon");
    expect(windowKindColours("key_event", "light", "neon", ink, "#c4a1ff")).toEqual({ line: "#8e4aff", title: "#6508ff" });
  });

  it("key_event in dark neon keeps the manifest colour for both", () => {
    const ink = storyInk(platform, "dark", "neon");
    expect(windowKindColours("key_event", "dark", "neon", ink, "#c4a1ff")).toEqual({ line: "#c4a1ff", title: "#c4a1ff" });
  });

  it("key_event in light deuteranopia is the drawn pair", () => {
    const ink = storyInk(platform, "light", "deuteranopia");
    expect(windowKindColours("key_event", "light", "deuteranopia", ink, "#c4a1ff")).toEqual({ line: "#55627c", title: "#4d5870" });
  });

  it.each([
    ["dark", "neon"],
    ["dark", "deuteranopia"],
    ["light", "neon"],
    ["light", "monochrome"],
  ] as const)("a kind that has a palette slot keeps its line and today's title fit (%s %s)", (theme, color) => {
    const ink = storyInk(nodesOf("card-fraud"), theme, color);
    for (const [kind, fallback] of [["auth", "#00e5ff"], ["fraud", "#ff3d2e"], ["login", "#ff5ce8"], ["place", "#808080"]] as const) {
      expect(windowKindColours(kind, theme, color, ink, fallback)).toEqual({
        line: fallback,
        title: windowInk(fallback, theme, color, TITLE_CONTRAST),
      });
    }
  });

  it("an unknown kind gives the fallback line and today's title fit", () => {
    const ink = storyInk(platform, "light", "neon");
    expect(windowKindColours("no_such_kind", "light", "neon", ink, "#ffb347")).toEqual({
      line: "#ffb347",
      title: windowInk("#ffb347", "light", "neon", TITLE_CONTRAST),
    });
  });
});

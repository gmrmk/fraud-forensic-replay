// Test C6.1 (theme follow): the ticker's dot and label fall back to the colour of a story's own kind in
// the live theme and colour mode, and to the manifest colour where the resolver holds no entry (dark
// neon carries it unchanged; a kind that has a palette slot is never in the resolver).
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { act, render } from "@testing-library/react";
import { TickerBar } from "./TickerBar";
import { buildTickerStream } from "../lib/ticker-stream";
import type { ScenarioNode } from "../lib/scenarios";
import { storyInk } from "../theme/kind-ink";
import { usePlayhead } from "../store/playhead";
import { useSchema } from "../store/schema";
import { useTheme } from "../store/theme";

const STOP_TS = "2026-05-26T08:00:00-05:00";
// A kind the story declares itself (no palette slot), and one that has a slot (login).
const stopNode = {
  kind: "stop",
  label: "Stop",
  palette: "#f5a623",
  source: "stops",
  timestamp: "timestamp",
  primary: "${name}",
  secondary: "${town}",
} as ScenarioNode;
const loginNode = { ...stopNode, kind: "login", label: "Login", palette: "#ff5ce8" } as ScenarioNode;
const ROW = { id: "r1", timestamp: STOP_TS, name: "Corner Store", town: "Houston" };

const saved = { theme: useTheme.getState().theme, color: useTheme.getState().color };

function fallbackOf(nodes: ScenarioNode[], kind: string): { dot: string; label: string } {
  useSchema.setState({ nodes });
  usePlayhead.setState({ playhead: Date.parse(STOP_TS) });
  const node = nodes.find((n) => n.kind === kind) as ScenarioNode;
  const { container, unmount } = render(<TickerBar items={buildTickerStream({ [kind]: [ROW] }, [node])} />);
  const dot = container.querySelector('[data-testid="ticker-kind-dot"]') as HTMLElement;
  const label = container.querySelector(".ticker-kind-label") as HTMLElement;
  const out = {
    dot: dot.style.getPropertyValue("--kind-fallback"),
    label: label.style.getPropertyValue("--kind-fallback"),
  };
  unmount();
  return out;
}

beforeEach(() => useSchema.setState({ nodes: [] }));
afterEach(() => {
  useTheme.setState(saved);
  useSchema.setState({ nodes: [] });
});

describe("TickerBar: the fallback colour follows the theme and the colour mode", () => {
  it("in light neon a story's own kind reads the resolver's mark, for the dot and the label", () => {
    useTheme.setState({ theme: "light", color: "neon" });
    const mark = storyInk([stopNode, loginNode], "light", "neon").get("stop")?.mark as string;
    expect(mark).not.toBe("#f5a623"); // light steps the declared colour: the test cannot pass by accident
    const got = fallbackOf([stopNode, loginNode], "stop");
    expect(got.dot).toBe(mark);
    expect(got.label).toBe(mark);
  });

  it("in dark neon it is the manifest colour, as today", () => {
    useTheme.setState({ theme: "dark", color: "neon" });
    const got = fallbackOf([stopNode, loginNode], "stop");
    expect(got.dot).toBe("#f5a623");
    expect(got.label).toBe("#f5a623");
  });

  it("a live switch moves the fallback of the mounted ticker", () => {
    useTheme.setState({ theme: "dark", color: "neon" });
    useSchema.setState({ nodes: [stopNode, loginNode] });
    usePlayhead.setState({ playhead: Date.parse(STOP_TS) });
    const { container } = render(<TickerBar items={buildTickerStream({ stop: [ROW] }, [stopNode])} />);
    const dot = () => container.querySelector('[data-testid="ticker-kind-dot"]') as HTMLElement;
    expect(dot().style.getPropertyValue("--kind-fallback")).toBe("#f5a623");
    act(() => useTheme.setState({ theme: "light", color: "monochrome" }));
    const mark = storyInk([stopNode, loginNode], "light", "monochrome").get("stop")?.mark as string;
    expect(dot().style.getPropertyValue("--kind-fallback")).toBe(mark);
  });

  it("a kind that has a palette slot keeps its manifest colour in every state", () => {
    for (const [theme, color] of [["light", "neon"], ["dark", "monochrome"], ["light", "deuteranopia"]] as const) {
      useTheme.setState({ theme, color });
      const got = fallbackOf([stopNode, loginNode], "login");
      expect(got.dot, `${theme} ${color}`).toBe("#ff5ce8");
      expect(got.label, `${theme} ${color}`).toBe("#ff5ce8");
    }
  });
});

/**
 * The hook that gives every surface the colours of a story's own kinds follows the
 * theme and the colour mode live, in one mount, and equals the pure resolver for a fresh state.
 */
import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import type { ScenarioNode } from "../lib/scenarios";
import type { ColorMode, Theme } from "../theme/axes";
import { storyInk } from "../theme/kind-ink";
import { storyInkNow, useStoryInk } from "./kind-ink";
import { useSchema } from "./schema";
import { useTheme } from "./theme";

const rawManifests = import.meta.glob<string>("../../../../backend/scenarios/*.scenario.json", {
  query: "?raw",
  import: "default",
  eager: true,
});
const manifests = Object.values(rawManifests).map((raw) => JSON.parse(raw) as { id: string; nodes: ScenarioNode[] });
const nodesOf = (id: string): ScenarioNode[] => {
  const found = manifests.find((m) => m.id === id);
  if (!found) throw new Error(`no scenario file with id ${id} under backend/scenarios`);
  return found.nodes;
};

const entries = (m: ReadonlyMap<string, { mark: string; text: string }>) => Array.from(m, ([k, v]) => [k, v.mark, v.text]);

function put(theme: Theme, color: ColorMode): void {
  act(() => {
    useTheme.getState().setTheme(theme);
    useTheme.getState().setColor(color);
  });
}

describe("useStoryInk and storyInkNow", () => {
  const platform = nodesOf("platform-access");

  beforeEach(() => {
    useSchema.setState({ nodes: platform });
    put("dark", "neon");
  });

  it("follows a live theme and colour switch in one mount, each state equal to a fresh resolve", () => {
    const { result } = renderHook(() => useStoryInk());
    expect(result.current.get("org")?.mark).toBe("#4da3ff");
    expect(entries(result.current)).toEqual(entries(storyInk(platform, "dark", "neon")));

    act(() => useTheme.getState().setTheme("light"));
    expect(result.current.get("org")?.mark).toBe("#0072eb");
    expect(entries(result.current)).toEqual(entries(storyInk(platform, "light", "neon")));

    act(() => useTheme.getState().setColor("deuteranopia"));
    expect(result.current.get("org")?.mark).toBe("#0048ad");
    expect(entries(result.current)).toEqual(entries(storyInk(platform, "light", "deuteranopia")));

    act(() => useTheme.getState().setTheme("dark"));
    expect(result.current.get("org")?.mark).toBe("#61a3ff");
    expect(entries(result.current)).toEqual(entries(storyInk(platform, "dark", "deuteranopia")));
  });

  it("storyInkNow reads the stores as they are, outside a render, and equals the hook's value", () => {
    const { result } = renderHook(() => useStoryInk());
    for (const [theme, color] of [["light", "neon"], ["dark", "monochrome"], ["light", "rainbow"]] as const) {
      put(theme, color);
      expect(storyInkNow()).toBe(result.current);
      expect(entries(storyInkNow())).toEqual(entries(storyInk(platform, theme, color)));
    }
  });

  it("holds its identity when nothing it reads has changed, and follows a new manifest", () => {
    const { result, rerender } = renderHook(() => useStoryInk());
    const first = result.current;
    rerender();
    expect(result.current).toBe(first);

    act(() => useSchema.setState({ nodes: nodesOf("card-fraud") }));
    expect([...result.current.keys()]).toEqual(["decision"]);
    expect(result.current).not.toBe(first);

    act(() => useSchema.setState({ nodes: [] }));
    expect(result.current.size).toBe(0);
  });
});

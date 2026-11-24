// Test C6.2 (theme follow): the matches window's row colour (a story's own kind's label) and its header
// (the tint, the divider and the shadow of the kind that opened it) take the colour of a story's own kind
// in the live theme and colour mode. Dark neon keeps the manifest colour; a kind that has a palette slot
// keeps the colours it has today.
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { act, render, screen } from "@testing-library/react";
import { MatchesTable } from "./MatchesTable";
import { useMatches } from "../../store/matches";
import { useSchema } from "../../store/schema";
import { useTheme } from "../../store/theme";
import { storyInk } from "../../theme/kind-ink";
import { hexToRgba } from "../../theme/to-rgb";
import { paletteForKind } from "../../lib/entity-palette";
import type { Entity } from "../../lib/entity";
import type { PivotContext } from "../../lib/matches";
import type { ScenarioNode } from "../../lib/scenarios";

const stopNode = { kind: "stop", label: "Stop", palette: "#f5a623", source: "stops" } as ScenarioNode;
const otherNode = { kind: "depot", label: "Depot", palette: "#4fa1fd", source: "depots" } as ScenarioNode;
const NODES = [stopNode, otherNode];

const stopEntity: Entity = {
  id: "s-1",
  kind: "stop",
  timestamp: 0,
  coords: { lat: 29.76, lng: -95.37 },
  fields: { zone: "z9" },
  displayMetadata: { primaryLabel: "Corner Store", secondaryLabel: "Houston", paletteKind: "stop", pivotableFields: ["zone"] },
};
const context: PivotContext = { transactions: [], logins: [], places: [], entities: [stopEntity] };

const saved = { theme: useTheme.getState().theme, color: useTheme.getState().color };
beforeEach(() => {
  useSchema.setState({ nodes: NODES });
  useMatches.setState({ active: { mode: "field", field: "zone", value: "z9", parentKind: "stop" } });
});
afterEach(() => {
  useTheme.setState(saved);
  useSchema.setState({ nodes: [] });
  useMatches.setState({ active: null });
});

// A style value reads back as the #rrggbb that was set or as rgb(r, g, b).
const hexOf = (css: string): string => {
  if (css.startsWith("#")) return css.toLowerCase();
  const m = css.match(/\d+/g) ?? [];
  return `#${m.slice(0, 3).map((n) => Number(n).toString(16).padStart(2, "0")).join("")}`;
};
const headerOf = (c: HTMLElement) => c.querySelector('[role="region"] > div') as HTMLElement;
const region = (c: HTMLElement) => c.querySelector('[role="region"]') as HTMLElement;

describe("MatchesTable: a story's own kind follows the theme and the colour mode", () => {
  it("in light neon the row label and the header take the resolver's mark", () => {
    useTheme.setState({ theme: "light", color: "neon" });
    const mark = storyInk(NODES, "light", "neon").get("stop")?.mark as string;
    expect(mark).not.toBe("#f5a623"); // light steps the declared colour: the test cannot pass by accident
    const { container } = render(<MatchesTable context={context} />);
    expect(hexOf(screen.getByText("STOP").style.color)).toBe(mark);
    expect(headerOf(container).style.backgroundColor).toBe(hexToRgba(mark, 0.05));
    expect(headerOf(container).style.borderBottomColor).toBe(hexToRgba(mark, 0.2));
    expect(region(container).getAttribute("style")).toContain(`${mark}1a`);
  });

  it("in dark neon they are the manifest colour, as today", () => {
    useTheme.setState({ theme: "dark", color: "neon" });
    // The manifest colour at the same two tints (0.20 and 0.2 are one colour).
    const { container } = render(<MatchesTable context={context} />);
    expect(hexOf(screen.getByText("STOP").style.color)).toBe("#f5a623");
    expect(headerOf(container).style.backgroundColor).toBe(hexToRgba("#f5a623", 0.05));
    expect(headerOf(container).style.borderBottomColor).toBe(hexToRgba("#f5a623", 0.2));
    expect(region(container).getAttribute("style")).toContain("#f5a6231a");
  });

  it("a live switch moves the mounted window", () => {
    useTheme.setState({ theme: "dark", color: "neon" });
    const { container } = render(<MatchesTable context={context} />);
    expect(hexOf(screen.getByText("STOP").style.color)).toBe("#f5a623");
    act(() => useTheme.setState({ theme: "light", color: "monochrome" }));
    const mark = storyInk(NODES, "light", "monochrome").get("stop")?.mark as string;
    expect(hexOf(screen.getByText("STOP").style.color)).toBe(mark);
    expect(headerOf(container).style.backgroundColor).toBe(hexToRgba(mark, 0.05));
  });

  it("a kind that has a palette slot keeps the header it has today, in every state", () => {
    useMatches.setState({ active: { mode: "field", field: "zone", value: "z9", parentKind: "login" } });
    const today = paletteForKind("login");
    for (const [theme, color] of [["light", "neon"], ["dark", "monochrome"], ["light", "deuteranopia"]] as const) {
      useTheme.setState({ theme, color });
      const { container, unmount } = render(<MatchesTable context={context} />);
      expect(headerOf(container).style.backgroundColor, `${theme} ${color}`).toBe(today.headerBgRgba);
      expect(headerOf(container).style.borderBottomColor, `${theme} ${color}`).toBe(today.headerDividerRgba);
      unmount();
    }
  });
});

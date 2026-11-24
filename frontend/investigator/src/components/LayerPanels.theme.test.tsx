import { afterEach, describe, expect, it } from "vitest";
import { act, render, screen, within } from "@testing-library/react";
import { LayerPanels } from "./LayerPanels";
import { useLayers } from "../store/layers";
import { useSchema } from "../store/schema";
import { usePlayhead } from "../store/playhead";
import { useTheme } from "../store/theme";
import { contrastRatio } from "../theme/legibility";
import { storyInk } from "../theme/kind-ink";
import { manifestRowToEntity } from "../lib/adapters/manifest-row";
import type { Entity } from "../lib/entity";
import type { ColorMode } from "../theme/axes";
import type { ScenarioNode } from "../lib/scenarios";
import { resolvePalette } from "../theme/resolve";
import { hexToRgb01 } from "../theme/to-rgb";

// The theme toggle lives in the gear menu, so the theme can change while the Layers menu stays
// mounted. LayerPanels.test.tsx remounts per theme cell, so a stale memo (the stepped colour
// computed for the first theme) was invisible there.
const saved = { theme: useTheme.getState().theme, color: useTheme.getState().color };

afterEach(() => {
  useTheme.setState(saved);
  useSchema.setState({ nodes: [] });
  useLayers.setState({ pathKinds: { fraud: true, auth: false, login: false, transfer: false } });
});

const surfaceOf = (theme: "dark" | "light"): [number, number, number] =>
  resolvePalette(theme, "rainbow")
    .material.panelBase.split(/\s+/)
    .map((n) => Number(n) / 255) as [number, number, number];

const rgbOf = (css: string): [number, number, number] => {
  const hex = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(css);
  const m = hex ?? /rgba?\((\d+),\s*(\d+),\s*(\d+)/.exec(css);
  if (!m) throw new Error(`unparsed colour ${css}`);
  return [1, 2, 3].map((i) => (hex ? parseInt(m[i], 16) : Number(m[i])) / 255) as [number, number, number];
};

describe("LayerPanels dots re-step when the theme changes under a mounted menu", () => {
  it("a pack-declared #7ee787 key dot is stepped for the light menu without a remount", () => {
    useTheme.setState({ theme: "dark", color: "rainbow" });
    useSchema.setState({
      nodes: [{ kind: "console_signin", label: "Console sign-in", palette: "#7ee787", source: "sql", coords: null, timestamp: "at", primary: "${id}" }],
    });
    usePlayhead.setState({ playhead: 250, minTime: 100, maxTime: 400 });
    const entity = {
      id: "c1", kind: "console_signin", timestamp: 100, coords: null, fields: {},
      displayMetadata: { primaryLabel: "c1", secondaryLabel: "", paletteKind: "console_signin", pivotableFields: [] },
    };
    render(
      <LayerPanels
        transactions={[]} logins={[]} places={[]} transfers={[]}
        visibleTransactions={[]} visibleLogins={[]} loadError={null}
        genericByKind={{ console_signin: [entity] }}
      />,
    );
    // A kind with a record is a switch: its colour is the filled square of its row.
    const dot = () =>
      screen.getByText("Console sign-in").closest("button")!.querySelector("span[aria-hidden]") as HTMLElement;

    const darkDot = rgbOf(dot().style.backgroundColor);
    // The kind is a story's own kind, so its square is the resolver's mark for the live theme and mode.
    const markIn = (theme: "dark" | "light") => storyInk(useSchema.getState().nodes, theme, "rainbow").get("console_signin")!.mark;
    const wantDark = hexToRgb01(markIn("dark"));
    const wantLight = hexToRgb01(markIn("light"));
    // Precondition: the two themes want visibly different dots, or the test could not tell them apart.
    expect(Math.max(...wantDark.map((v, i) => Math.abs(v - wantLight[i])))).toBeGreaterThan(0.1);
    wantDark.forEach((v, i) => expect(darkDot[i]).toBeCloseTo(v, 1));

    act(() => useTheme.setState({ theme: "light", color: "rainbow" }));
    const lightDot = rgbOf(dot().style.backgroundColor);
    wantLight.forEach((v, i) => expect(lightDot[i]).toBeCloseTo(v, 1));
    expect(contrastRatio(lightDot, surfaceOf("light"))).toBeGreaterThanOrEqual(3);

    // And back: the memo follows the theme both ways.
    act(() => useTheme.setState({ theme: "dark", color: "rainbow" }));
    const backDot = rgbOf(dot().style.backgroundColor);
    wantDark.forEach((v, i) => expect(backDot[i]).toBeCloseTo(v, 1));
  });
});

// Test 4.1 (theme follow, C4.T1): the Layers squares of a story's own kinds are the resolver's marks,
// exactly, in the six drawn states, with one mount switched through them and with a fresh mount in each
// state. The manifest is the real one; the marks are the designer's tables (platform-access: org,
// console_signin, key_event, usage, decision).
describe("LayerPanels squares of a story's own kinds follow the theme and the colour mode", () => {
  const DRAWN_MARKS: Record<string, string[]> = {
    "dark neon": ["#4da3ff", "#7ee787", "#c4a1ff", "#f5a623", "#ff6b6b"],
    "light neon": ["#0072eb", "#198522", "#8e4aff", "#a16707", "#ea0000"],
    "dark deuteranopia": ["#61a3ff", "#e8d978", "#6b8bb3", "#d6bd24", "#ff6b35"],
    "light deuteranopia": ["#0048ad", "#29250a", "#55627c", "#413b10", "#c9221a"],
    "dark monochrome": ["#737373", "#d4d4d4", "#8f8f8f", "#b0b0b0", "#ffffff"],
    "light monochrome": ["#2a2a2a", "#757575", "#434343", "#5c5c5c", "#000000"],
  };
  const platform = (
    Object.values(
      import.meta.glob<string>("../../../../backend/scenarios/*.scenario.json", { query: "?raw", import: "default", eager: true }),
    ).map((raw) => JSON.parse(raw) as { id: string; nodes: ScenarioNode[] }).find((m) => m.id === "platform-access") as {
      nodes: ScenarioNode[];
    }
  ).nodes;
  const genericByKind: Record<string, Entity[]> = Object.fromEntries(
    platform.map((n) => [n.kind, [manifestRowToEntity(n, { id: `${n.kind}-1`, [n.timestamp as string]: "2026-06-08T10:30:00Z" })]]),
  );
  const hexOf = (css: string): string => {
    if (css.startsWith("#")) return css.toLowerCase();
    const m = css.match(/\d+/g) ?? [];
    return `#${m.slice(0, 3).map((n) => Number(n).toString(16).padStart(2, "0")).join("")}`;
  };
  const mount = () =>
    render(
      <LayerPanels
        transactions={[]} logins={[]} places={[]} transfers={[]}
        visibleTransactions={[]} visibleLogins={[]} loadError={null}
        genericByKind={genericByKind}
      />,
    );
  const squares = (view: HTMLElement) =>
    platform.map((n) => {
      const row = within(view).getByText(n.label).closest("button") as HTMLElement;
      return hexOf((row.querySelector("span[aria-hidden]") as HTMLElement).style.backgroundColor);
    });
  const put = (theme: "dark" | "light", color: ColorMode) => act(() => useTheme.setState({ theme, color }));

  it("one mount switched through the six drawn states equals the drawn marks and a fresh mount", () => {
    useSchema.setState({ nodes: platform });
    usePlayhead.setState({ playhead: Date.parse("2026-06-08T12:00:00Z"), minTime: Date.parse("2026-06-08T09:00:00Z"), maxTime: Date.parse("2026-06-08T14:00:00Z") });
    useTheme.setState({ theme: "dark", color: "neon" });
    const live = mount();
    const states: [string, "dark" | "light", ColorMode][] = [
      ["dark neon", "dark", "neon"], ["light neon", "light", "neon"],
      ["light deuteranopia", "light", "deuteranopia"], ["dark deuteranopia", "dark", "deuteranopia"],
      ["dark monochrome", "dark", "monochrome"], ["light monochrome", "light", "monochrome"],
    ];
    for (const [name, theme, color] of states) {
      put(theme, color);
      const seen = squares(live.container);
      expect(seen, `live ${name}`).toEqual(DRAWN_MARKS[name]);
      // A second mount, made after the state is set, is the fresh load of the same state.
      const fresh = mount();
      expect(squares(fresh.container), `fresh ${name}`).toEqual(seen);
      fresh.unmount();
    }
  });

  it("a kind with no record (a key row) takes the drawn mark in light neon", () => {
    useSchema.setState({ nodes: platform });
    usePlayhead.setState({ playhead: 250, minTime: 100, maxTime: 400 });
    useTheme.setState({ theme: "light", color: "neon" });
    const { container } = render(
      <LayerPanels
        transactions={[]} logins={[]} places={[]} transfers={[]}
        visibleTransactions={[]} visibleLogins={[]} loadError={null}
        genericByKind={{}}
      />,
    );
    const key = (label: string) =>
      hexOf((container.querySelector(`span[title="${label}"] span[aria-hidden]`) as HTMLElement).style.backgroundColor);
    expect(platform.map((n) => key(n.label))).toEqual(DRAWN_MARKS["light neon"]);
  });

  it("the value rows of a story's own kind carry the kind's drawn mark in light neon", () => {
    const keyEvent = platform.find((n) => n.kind === "key_event") as ScenarioNode;
    const filtered: ScenarioNode = { ...keyEvent, filter: { field: "state", label: "State" } };
    const rowOf = (id: string, state: string) =>
      manifestRowToEntity(filtered, { id, state, [filtered.timestamp as string]: "2026-06-08T10:30:00Z" });
    useSchema.setState({ nodes: platform.map((n) => (n.kind === "key_event" ? filtered : n)) });
    usePlayhead.setState({ playhead: Date.parse("2026-06-08T12:00:00Z"), minTime: Date.parse("2026-06-08T09:00:00Z"), maxTime: Date.parse("2026-06-08T14:00:00Z") });
    useTheme.setState({ theme: "light", color: "neon" });
    const { container } = render(
      <LayerPanels
        transactions={[]} logins={[]} places={[]} transfers={[]}
        visibleTransactions={[]} visibleLogins={[]} loadError={null}
        genericByKind={{ key_event: [rowOf("k1", "created"), rowOf("k2", "revoked")] }}
      />,
    );
    act(() => screen.getByRole("button", { name: `${filtered.label} details` }).click());
    const region = container.querySelector(`[id$="-k-key_event"]`) as HTMLElement;
    const values = [...region.querySelectorAll("button[aria-pressed]")].map((b) =>
      hexOf((b.querySelector("span[aria-hidden]") as HTMLElement).style.backgroundColor),
    );
    expect(values).toEqual(["#8e4aff", "#8e4aff"]);
  });
});

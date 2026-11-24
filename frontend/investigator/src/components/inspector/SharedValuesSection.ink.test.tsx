// Test c6b (theme follow): the coloured mark at the start of a Shared values row takes the colour of a
// story's own kind from the resolver (theme/kind-ink.ts) in the live theme and colour mode, and keeps what
// it drew before for a kind that has a palette slot. It is a sibling of SharedValuesSection.test.tsx,
// which it does not touch.
// PINS (green on the code before the change): dark neon draws the manifest colour; a kind that has a
// palette slot (the card story's login) draws what onMenu gives it in every one of the 12 cells.
// The manifests are the real ones. It does not pin drawn pixels: it reads the colour set on the mark.
// A row's mark is the kind's icon: the first svg inside the row's button (its `color` style is read).
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { act, render, renderHook } from "@testing-library/react";
import { SharedValuesSection } from "./SharedValuesSection";
import { useOnMenu } from "../LayerRow";
import { manifestRowToEntity } from "../../lib/adapters/manifest-row";
import { loginToEntity } from "../../lib/adapters/ffr-seed";
import type { Entity } from "../../lib/entity";
import type { ScenarioNode } from "../../lib/scenarios";
import type { LoginEvent } from "../../types";
import { storyInk } from "../../theme/kind-ink";
import { COLOR_MODES, THEMES } from "../../theme/axes";
import { usePivotData } from "../../store/pivot-data";
import { usePlayhead } from "../../store/playhead";
import { useSchema } from "../../store/schema";
import { useTheme } from "../../store/theme";

const manifests = Object.values(
  import.meta.glob<string>("../../../../../backend/scenarios/*.scenario.json", { query: "?raw", import: "default", eager: true }),
).map((raw) => JSON.parse(raw) as { id: string; nodes: ScenarioNode[] });
const platform = manifests.find((m) => m.id === "platform-access")?.nodes ?? [];
const cardFraud = manifests.find((m) => m.id === "card-fraud")?.nodes ?? [];
const nodeOf = (nodes: ScenarioNode[], kind: string) => nodes.find((n) => n.kind === kind) as ScenarioNode;

const T = "2026-06-08T10:00:00Z";
const make = (kind: string, row: Record<string, unknown>): Entity => manifestRowToEntity(nodeOf(platform, kind), row);
// One organisation shared by a sign-in (the record), another sign-in and a key event: two rows, one for
// each of the story's own kinds.
const SIGNIN = make("console_signin", { id: "cs-1", timestamp: T, org_id: "org-1" });
const STORY_ENTITIES: Entity[] = [
  SIGNIN,
  make("console_signin", { id: "cs-2", timestamp: T, org_id: "org-1" }),
  make("key_event", { id: "ke-1", timestamp: T, org_id: "org-1" }),
];

// A login that shares a network with another login: one row of a kind that has a palette slot.
const login = (id: string): LoginEvent =>
  ({ id, timestamp: T, ip_asn: "AS64500", device_fp: "dev", outcome: "success", ip_type: "residential", ip_lat: 0, ip_lng: 0 }) as unknown as LoginEvent;
const LOGIN = login("lg-1");

const saved = { theme: useTheme.getState().theme, color: useTheme.getState().color };
beforeEach(() => usePlayhead.setState({ playhead: Date.parse(T) + 3_600_000, minTime: Date.parse(T) - 3_600_000, maxTime: Date.parse(T) + 7_200_000 }));
afterEach(() => {
  useTheme.setState(saved);
  useSchema.setState({ nodes: [] });
  usePivotData.setState({ logins: [], entities: [] });
});

// A style value reads back as the #rrggbb that was set or as rgb(r, g, b).
const hexOf = (css: string): string => {
  if (css.startsWith("#")) return css.toLowerCase();
  const m = css.match(/\d+/g);
  if (!m || m.length < 3) return css;
  return `#${m.slice(0, 3).map((n) => Number(n).toString(16).padStart(2, "0")).join("")}`;
};
// The mark of the row that opens with `kindLabel`.
function markOf(container: HTMLElement, kindLabel: string): string {
  const row = Array.from(container.querySelectorAll("button")).find((b) => b.textContent?.startsWith(kindLabel));
  if (!row) throw new Error(`no row for ${kindLabel}`);
  const mark = row.querySelector<SVGElement>("svg");
  if (!mark) throw new Error(`no mark in the row for ${kindLabel}`);
  return hexOf(mark.style.color);
}

function showStory() {
  useSchema.setState({ nodes: platform });
  usePivotData.setState({ transactions: [], logins: [], accountEvents: [], transfers: [], entities: STORY_ENTITIES });
  return render(<SharedValuesSection entity={SIGNIN} />);
}
function showLogin() {
  useSchema.setState({ nodes: cardFraud });
  usePivotData.setState({ transactions: [], logins: [LOGIN, login("lg-2")], accountEvents: [], transfers: [], entities: [] });
  return render(<SharedValuesSection entity={loginToEntity(LOGIN)} />);
}

describe("SharedValuesSection: the mark of a row follows the theme and the colour mode", () => {
  it("in light neon a story's own kinds read the resolver's mark", () => {
    useTheme.setState({ theme: "light", color: "neon" });
    const ink = storyInk(platform, "light", "neon");
    expect(ink.get("console_signin")?.mark).toBe("#198522");
    expect(ink.get("key_event")?.mark).toBe("#8e4aff");
    const { container } = showStory();
    expect(markOf(container, "Console sign-in")).toBe("#198522");
    expect(markOf(container, "API key event")).toBe("#8e4aff");
  });

  it("in light monochrome a story's own kinds read the resolver's mark of that state", () => {
    useTheme.setState({ theme: "light", color: "monochrome" });
    const ink = storyInk(platform, "light", "monochrome");
    const { container } = showStory();
    expect(markOf(container, "Console sign-in")).toBe(ink.get("console_signin")?.mark);
    expect(markOf(container, "API key event")).toBe(ink.get("key_event")?.mark);
    // The state moves them off the manifest colour, so the test cannot pass by accident.
    expect(markOf(container, "Console sign-in")).not.toBe("#7ee787");
  });

  it("a live switch moves the marks of the mounted section", () => {
    useTheme.setState({ theme: "dark", color: "neon" });
    const { container } = showStory();
    act(() => useTheme.setState({ theme: "light", color: "monochrome" }));
    expect(markOf(container, "API key event")).toBe(storyInk(platform, "light", "monochrome").get("key_event")?.mark);
  });

  it("PIN: in dark neon a story's own kinds draw the manifest colour", () => {
    useTheme.setState({ theme: "dark", color: "neon" });
    const { container } = showStory();
    expect(markOf(container, "Console sign-in")).toBe("#7ee787");
    expect(markOf(container, "API key event")).toBe("#c4a1ff");
  });

  it("PIN: a kind that has a palette slot draws what onMenu gives its colour, in every one of the 12 cells", () => {
    for (const theme of THEMES) {
      for (const color of COLOR_MODES) {
        useTheme.setState({ theme, color });
        const onMenu = renderHook(() => useOnMenu()).result.current;
        const { container, unmount } = showLogin();
        expect(markOf(container, "Login"), `${theme} ${color}`).toBe(hexOf(onMenu("#ff5ce8")));
        unmount();
      }
    }
  });
});

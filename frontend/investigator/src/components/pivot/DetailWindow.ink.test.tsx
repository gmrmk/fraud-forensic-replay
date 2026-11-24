// Test 4.6 (theme follow, C4.T6): a detail window and its pop-out take the frame line and the title of a
// story's own kind from the resolver (mark for the line, text ink for the title) in the live theme and
// colour mode, in one mount. It is a sibling of DetailWindow.test.tsx, which it does not touch.
// PINS (green on the code before the change): dark neon keeps today's line and title; a kind that has a
// palette slot keeps its line and its title fit in all 12 cells; a pile keeps the muted text colour; a
// decision keeps its verdict tone. The manifest is the real one. It does not pin the drawn pixels.
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { act, render, screen } from "@testing-library/react";
import { DetailWindow } from "./DetailWindow";
import { paletteForKind } from "../../lib/entity-palette";
import { windowInk, TITLE_CONTRAST } from "../../lib/window-ink";
import { manifestRowToEntity } from "../../lib/adapters/manifest-row";
import { verdictNode } from "../../lib/verdict-fixtures";
import { usePivotStore } from "../../store/pivot";
import { useSchema } from "../../store/schema";
import { useTheme } from "../../store/theme";
import { COLOR_MODES, THEMES } from "../../theme/axes";
import type { Entity } from "../../lib/entity";
import type { ScenarioNode } from "../../lib/scenarios";
import type { Transaction } from "../../types";

const manifests = Object.values(
  import.meta.glob<string>("../../../../../backend/scenarios/*.scenario.json", { query: "?raw", import: "default", eager: true }),
).map((raw) => JSON.parse(raw) as { id: string; nodes: ScenarioNode[] });
const platform = manifests.find((m) => m.id === "platform-access")?.nodes ?? [];
const cardFraud = manifests.find((m) => m.id === "card-fraud")?.nodes ?? [];

const keyEvent: Entity = {
  id: "ke-1", kind: "key_event", timestamp: 0, coords: { lat: 52.37, lng: 4.9 },
  fields: { id: "ke-1" },
  displayMetadata: { primaryLabel: "Key created", secondaryLabel: "", paletteKind: "key_event", pivotableFields: [] },
};
const SECTION = { type: "section", sectionId: "any", label: "Section" } as const;

const saved = { theme: useTheme.getState().theme, color: useTheme.getState().color };
beforeEach(() => {
  usePivotStore.setState({ windows: [], nextZ: 20 });
  useSchema.setState({ nodes: platform });
});
afterEach(() => {
  useTheme.setState(saved);
  useSchema.setState({ nodes: [] });
});

// A style value reads back as the #rrggbb that was set or as rgb(r, g, b).
const hexOf = (css: string): string => {
  if (css.startsWith("#")) return css.toLowerCase();
  const m = css.match(/\d+/g);
  if (!m || m.length < 3) return css;
  return `#${m.slice(0, 3).map((n) => Number(n).toString(16).padStart(2, "0")).join("")}`;
};
const frame = () => screen.getByRole("dialog");
const header = () => frame().querySelector("span.uppercase") as HTMLElement;
const lineOf = () => hexOf(frame().style.outlineColor);
const titleOf = () => hexOf(header().style.color);

function windowOf() {
  const w = usePivotStore.getState().windows[0];
  if (w.kind !== "detail") throw new Error("expected detail window");
  return w;
}
const showGlance = (entity: Entity) => {
  usePivotStore.getState().openGlance({ kind: "entity", entity }, { x: 10, y: 10 });
  return render(<DetailWindow window={windowOf()} />);
};
const showPopout = (entity: Entity, view: Parameters<ReturnType<typeof usePivotStore.getState>["openPopout"]>[1] = SECTION) => {
  usePivotStore.getState().openPopout(entity, view);
  return render(<DetailWindow window={windowOf()} byKind={{}} />);
};

describe("DetailWindow: a story's own kind follows the theme and the colour mode", () => {
  it("a platform-access key_event detail window takes the drawn mark and text, and follows a live switch", () => {
    useTheme.setState({ theme: "light", color: "neon" });
    showGlance(keyEvent);
    expect(lineOf()).toBe("#8e4aff");
    expect(titleOf()).toBe("#6508ff");
    act(() => useTheme.setState({ theme: "light", color: "monochrome" }));
    expect(lineOf()).toBe("#434343");
    expect(titleOf()).toBe("#434343");
  });

  it("its pop-out takes the drawn mark and text, and follows a live switch", () => {
    useTheme.setState({ theme: "light", color: "neon" });
    showPopout(keyEvent);
    expect(lineOf()).toBe("#8e4aff");
    expect(titleOf()).toBe("#6508ff");
    act(() => useTheme.setState({ theme: "light", color: "monochrome" }));
    expect(lineOf()).toBe("#434343");
    expect(titleOf()).toBe("#434343");
  });

  it("PIN: in dark neon the line and the title are what they are today", () => {
    useTheme.setState({ theme: "dark", color: "neon" });
    showGlance(keyEvent);
    expect(lineOf()).toBe("#c4a1ff");
    expect(titleOf()).toBe(windowInk("#c4a1ff", "dark", "neon", TITLE_CONTRAST).toLowerCase());
  });
});

describe("DetailWindow: a kind that has a palette slot keeps today's line and title", () => {
  const tx = {
    id: "t1", amount: 12.5, merchant_name: "Mall", merchant_country: "NG", risk_score: 9,
    auth_source: "card_present", merchant_lat: 6.4, merchant_lng: 3.4, is_fraud: 0,
  } as Transaction;
  const accountEvent: Entity = {
    ...keyEvent, id: "ae-1", kind: "account_event",
    displayMetadata: { ...keyEvent.displayMetadata, primaryLabel: "Email change", paletteKind: "account_event" },
  };

  const cells = THEMES.flatMap((theme) => COLOR_MODES.map((color) => [theme, color] as const));
  const cases: [string, () => ReturnType<typeof render>, string][] = [
    ["auth", () => { usePivotStore.getState().openGlance({ kind: "auth", tx }, { x: 10, y: 10 }); return render(<DetailWindow window={windowOf()} />); }, "auth"],
    ["fraud", () => { usePivotStore.getState().openGlance({ kind: "fraud", tx }, { x: 10, y: 10 }); return render(<DetailWindow window={windowOf()} />); }, "fraud"],
    ["account_event", () => showGlance(accountEvent), "account_event"],
  ];
  it.each(cases)("PIN: a %s window keeps its line and its title fit in every theme and mode", (_n, open, kind) => {
    useSchema.setState({ nodes: cardFraud });
    const hex = paletteForKind(kind).hex;
    for (const [theme, color] of cells) {
      useTheme.setState({ theme, color });
      usePivotStore.setState({ windows: [], nextZ: 20 });
      const view = open();
      expect(lineOf(), `${theme} ${color}`).toBe(hex.toLowerCase());
      expect(titleOf(), `${theme} ${color}`).toBe(windowInk(hex, theme, color, TITLE_CONTRAST).toLowerCase());
      view.unmount();
    }
  });
});

describe("DetailWindow: a pile and a decision keep their own colour", () => {
  const decision = manifestRowToEntity(verdictNode, {
    id: "d2", state: "PASS", finding: "PASSED", memo: "Her own laptop.", who: "investigator",
    subject: "Priya, Houston, TX", acct: "a2", when: "2026-05-25T11:45:00-05:00", y: 29.7, x: -95.4,
  });
  beforeEach(() => useSchema.setState({ nodes: [verdictNode] }));

  it("PIN: a pile popout keeps the muted text colour in light neon", () => {
    useTheme.setState({ theme: "light", color: "neon" });
    showPopout(decision, { type: "pile", label: "1 decision here", memberIds: ["d2"] });
    expect(frame().style.outlineColor).toBe("var(--text-muted)");
    expect(header().style.color).toBe("var(--text-muted)");
  });

  it("PIN: a decision's notes window keeps its verdict tone in light neon", () => {
    useTheme.setState({ theme: "light", color: "neon" });
    showPopout(decision, { type: "notes", label: "Notes" });
    expect(frame().style.outlineColor).toBe("var(--verdict-pass-on-panel)");
    expect(header().style.color).toBe("var(--verdict-pass-on-panel)");
  });
});

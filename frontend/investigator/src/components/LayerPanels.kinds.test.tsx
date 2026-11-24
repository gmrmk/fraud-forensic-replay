/**
 * The Layers menu's manifest kinds (group M): every kind with records is a switch that counts reached
 * over all by the one function; a kind that declares a filter opens into one switch per value, indented,
 * counted the same way, with the mixed square while a value is off; a long list is cut with a more row;
 * every switch and chevron carries its tooltip. The state is set as the other menu tests set it: the
 * schema, the playhead and the layers store; nothing is selected, so "off reads 0 of N" holds.
 */
import { describe, it, expect, afterEach, beforeEach } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";
import type { ComponentProps } from "react";
import { LayerPanels } from "./LayerPanels";
import type { Entity } from "../lib/entity";
import { manifestRowToEntity } from "../lib/adapters/manifest-row";
import type { ScenarioNode } from "../lib/scenarios";
import { verdictNode } from "../lib/verdict-fixtures";
import { kindSwitchWords, moreWords, valueSwitchWords, valuesFoldWords } from "../lib/tooltip-words/layers";
import { useLayers } from "../store/layers";
import { usePivotData } from "../store/pivot-data";
import { usePlayhead } from "../store/playhead";
import { useSchema } from "../store/schema";
import { useSelection } from "../store/selection";
import { useSolo } from "../store/solo";
import { useTheme } from "../store/theme";
import { COLOR_MODES, THEMES } from "../theme/axes";
import type { LoginEvent, Place, Transaction } from "../types";

type Props = ComponentProps<typeof LayerPanels>;

const NO_DATA: Props = {
  transactions: [],
  logins: [],
  places: [],
  transfers: [],
  visibleTransactions: [],
  visibleLogins: [],
  loadError: null,
};

const T = Date.parse("2026-05-12T10:00:00Z");
const MIN = 60_000;
const at = (i: number) => new Date(T + i * MIN).toISOString();

const node = (kind: string, label: string, palette: string, extra: Partial<ScenarioNode> = {}): ScenarioNode => ({
  kind, label, palette, source: "sql", coords: null, timestamp: "at", primary: "${id}", ...extra,
});
const SIGN = node("sign", "Sign-in", "#ff9bd2", { filter: { field: "net", label: "Network type" }, pivotable: ["net"] });
const RESET = node("reset", "Limit reset", "#7ee787");
const EMPTY = node("empty", "Empty kind", "#ffb347");
const VERDICT: ScenarioNode = { ...verdictNode, filter: { field: "state", label: "Status" } };

const rows = (n: ScenarioNode, list: Record<string, unknown>[]): Entity[] => list.map((r) => manifestRowToEntity(n, r));
// Six sign-ins by network type, then four resets, then three decisions, one a minute from T.
const SIGNS = rows(SIGN, [
  { id: "s0", at: at(0), net: "corporate" },
  { id: "s1", at: at(1), net: "corporate" },
  { id: "s2", at: at(2), net: "education" },
  { id: "s3", at: at(3), net: "corporate" },
  { id: "s4", at: at(4), net: "education" },
  { id: "s5", at: at(5) },
]);
const RESETS = rows(RESET, [0, 1, 2, 3].map((i) => ({ id: `r${i}`, at: at(i) })));
// Each decision works one sign-in: d0 and d2 work corporate ones, d1 an education one.
const DECISIONS = rows(VERDICT, [
  { id: "d0", when: at(0), state: "FAIL", worked: "s1" },
  { id: "d1", when: at(1), state: "PASS", worked: "s2" },
  { id: "d2", when: at(2), state: "WAITING", worked: "s3" },
]);

const BY_KIND = { sign: SIGNS, reset: RESETS, empty: [], verdict_export: DECISIONS };

function renderMenu(over: Partial<Props> = {}) {
  return render(<LayerPanels {...NO_DATA} genericByKind={BY_KIND} {...over} />);
}

const switches = () =>
  screen.getAllByRole("button").filter((b) => b.hasAttribute("aria-pressed")) as HTMLButtonElement[];
const toggle = (label: string) => {
  const found = switches().find((b) => b.textContent?.startsWith(label));
  if (!found) throw new Error(`no switch starting ${label}`);
  return found;
};
const square = (button: HTMLElement) => button.querySelector("span[aria-hidden], svg") as HTMLElement;
const chevron = (label: string) => screen.getByRole("button", { name: `${label} details` });
const region = (label: string) =>
  document.getElementById(chevron(label).getAttribute("aria-controls") as string) as HTMLElement;
const inRegion = (r: HTMLElement) =>
  [...r.querySelectorAll("button")].filter((b) => b.hasAttribute("aria-pressed")) as HTMLButtonElement[];

beforeEach(() => {
  useSchema.setState({ nodes: [SIGN, RESET, EMPTY, VERDICT] });
  // The playhead sits a minute and a half in: two sign-ins, two resets and two decisions are reached.
  usePlayhead.setState({ playhead: T + 1.5 * MIN, minTime: T, maxTime: T + 10 * MIN });
  useSelection.setState({ selected: null });
});

afterEach(() => {
  useSchema.setState({ nodes: [] });
  usePlayhead.setState({ minTime: 0, maxTime: 0, playhead: 0 });
  useLayers.setState({ showAuths: true, showLogins: true, hiddenKinds: [], hiddenValues: {} });
  useSolo.setState({ solo: null });
  usePivotData.setState({ entities: [] });
});

describe("LayerPanels: a row alone narrows a kind's reached count and leaves its total whole", () => {
  it("counts only the records the solo keeps, and a kind it keeps none of stays a switch", () => {
    // The corporate row is alone: it keeps s0 and s1 (reached) and s3 (ahead of the playhead), and no reset.
    usePivotData.setState({ entities: [...SIGNS, ...RESETS, ...DECISIONS] });
    useSolo.setState({ solo: { field: "net", value: "corporate" } });
    // The kept records are the ones App hands the menu: the decisions do not hold the soloed field.
    renderMenu({ soloEntities: [SIGNS[0], SIGNS[1], SIGNS[3]] });
    expect(toggle("Sign-in").textContent).toContain("2 / 6");
    expect(toggle("Limit reset").textContent).toContain("0 / 4");
    // A decision counts as the map draws its capsule, by the sign-in it works: d0 is reached, d2 is ahead.
    expect(toggle("Verdict").textContent).toContain("1 / 3");
  });
});

describe("LayerPanels: a kind with records is a switch (B1, B7)", () => {
  it("draws each kind that has a record as a switch with reached over total, and a kind with none as a key row", () => {
    renderMenu();
    expect(toggle("Sign-in").textContent).toContain("2 / 6");
    expect(toggle("Limit reset").textContent).toContain("2 / 4");
    expect(toggle("Verdict").textContent).toContain("2 / 3");
    // Sign-in, Limit reset, Verdict (Empty kind is no switch), then Time zones.
    expect(switches().map((b) => b.getAttribute("aria-pressed"))).toEqual(["true", "true", "true", "false"]);
    // Empty kind has no record: today's key row, with no button.
    const key = screen.getByText("Empty kind").closest("div.h-\\[26px\\]") as HTMLElement;
    expect(key.closest("button")).toBeNull();
    expect(within(key).queryByRole("button")).toBeNull();
    expect(key.textContent).toContain("0 / 0");
    expect(switches().some((b) => b.textContent?.startsWith("Empty kind"))).toBe(false);
  });

  it("switches a kind off with a press: it is listed in hiddenKinds, reads off and reads 0 of its total", () => {
    renderMenu();
    fireEvent.click(toggle("Limit reset"));
    expect(useLayers.getState().hiddenKinds).toEqual(["reset"]);
    const row = toggle("Limit reset");
    expect(row.getAttribute("aria-pressed")).toBe("false");
    expect(row.textContent).toContain("0 / 4");
    expect(row.querySelector("span.border-dim")).not.toBeNull();
    // Another kind is not touched.
    expect(toggle("Sign-in").textContent).toContain("2 / 6");
    fireEvent.click(toggle("Limit reset"));
    expect(useLayers.getState().hiddenKinds).toEqual([]);
    expect(toggle("Limit reset").textContent).toContain("2 / 4");
  });

  it("gives the square the kind's colour, stepped for the menu", () => {
    renderMenu();
    const on = square(toggle("Limit reset"));
    expect(on.style.backgroundColor).not.toBe("");
    expect(on.className).not.toContain("rounded-full");
  });
});

describe("LayerPanels: a kind opens into its values (B2, B4, B5)", () => {
  it("carries the chevron only on a kind that declares a filter, folded at first", () => {
    renderMenu();
    expect(chevron("Sign-in").getAttribute("aria-expanded")).toBe("false");
    expect(chevron("Verdict").getAttribute("aria-expanded")).toBe("false");
    expect(screen.queryByRole("button", { name: "Limit reset details" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Empty kind details" })).toBeNull();
    expect(screen.queryByText("corporate")).toBeNull();
  });

  it("lists one switch per value by total then value, as the data holds it, an empty one as a dash, each reached over total", () => {
    renderMenu();
    fireEvent.click(chevron("Sign-in"));
    const r = region("Sign-in");
    expect(r.classList.contains("pl-[17px]")).toBe(true);
    const values = inRegion(r);
    expect(values.map((b) => b.textContent)).toEqual(["corporate2 / 32 of 3", "education0 / 20 of 2", "-0 / 10 of 1"]);
    for (const label of ["corporate", "education", "-"]) {
      const el = within(r).getByText(label);
      expect(el.classList.contains("uppercase"), label).toBe(false);
      expect(el.className, label).not.toContain("tracking-");
    }
    expect(chevron("Sign-in").getAttribute("aria-expanded")).toBe("true");
  });

  it("flips one value with a press: it is listed in hiddenValues, and the kind reads the mixed square", () => {
    renderMenu();
    fireEvent.click(chevron("Sign-in"));
    expect(toggle("Sign-in").textContent).toContain("2 / 6");
    // The corporate value is the first row; its two reached sign-ins leave the kind's count.
    fireEvent.click(inRegion(region("Sign-in"))[0]);
    expect(useLayers.getState().hiddenValues).toEqual({ sign: ["corporate"] });
    expect(inRegion(region("Sign-in"))[0].getAttribute("aria-pressed")).toBe("false");
    const kind = toggle("Sign-in");
    expect(kind.getAttribute("aria-pressed")).toBe("mixed");
    expect(kind.querySelector("svg")).not.toBeNull();
    expect(kind.querySelectorAll("svg rect")).toHaveLength(2);
    // The label keeps the text tone.
    expect(within(kind).getByText("Sign-in").style.color).toBe("var(--text)");
    expect(kind.textContent).toContain("0 / 6");
  });

  it("reads every value off while its kind is off, and a value press turns the kind on with that value on", () => {
    renderMenu();
    fireEvent.click(chevron("Sign-in"));
    fireEvent.click(toggle("Sign-in"));
    expect(useLayers.getState().hiddenKinds).toEqual(["sign"]);
    expect(inRegion(region("Sign-in")).map((b) => b.getAttribute("aria-pressed"))).toEqual(["false", "false", "false"]);
    expect(toggle("Sign-in").getAttribute("aria-pressed")).toBe("false");
    fireEvent.click(inRegion(region("Sign-in"))[0]);
    expect(useLayers.getState().hiddenKinds).toEqual([]);
    expect(useLayers.getState().hiddenValues).toEqual({});
    expect(inRegion(region("Sign-in")).map((b) => b.getAttribute("aria-pressed"))).toEqual(["true", "true", "true"]);
  });

  it("turns a hidden value on when its kind is off and the press names that value", () => {
    useLayers.setState({ hiddenKinds: ["sign"], hiddenValues: { sign: ["education"] } });
    renderMenu();
    fireEvent.click(chevron("Sign-in"));
    fireEvent.click(inRegion(region("Sign-in"))[1]);
    expect(useLayers.getState().hiddenKinds).toEqual([]);
    expect(useLayers.getState().hiddenValues).toEqual({});
  });

  it("keeps a kind named like an inherited key working", () => {
    const odd = node("constructor", "Constructor", "#ffb347", { filter: { field: "net", label: "Network type" } });
    useSchema.setState({ nodes: [odd] });
    renderMenu({ genericByKind: { constructor: rows(odd, [{ id: "c0", at: at(0), net: "a" }]) } });
    fireEvent.click(chevron("Constructor"));
    fireEvent.click(inRegion(region("Constructor"))[0]);
    expect(useLayers.getState().hiddenValues).toEqual({ constructor: ["a"] });
    expect(toggle("Constructor").getAttribute("aria-pressed")).toBe("mixed");
  });
});

describe("LayerPanels: a decision kind's values take their tone's colour (B6)", () => {
  it("draws FAIL, PASS and WAITING in the alarm, pass and wait tones, and an ordinary kind's values in the kind's colour", () => {
    renderMenu();
    fireEvent.click(chevron("Verdict"));
    fireEvent.click(chevron("Sign-in"));
    const squares = (label: string) => inRegion(region(label)).map((b) => square(b).style.backgroundColor);
    expect(squares("Verdict")).toEqual(["var(--alarm-on-panel)", "var(--verdict-pass-on-panel)", "var(--verdict-wait-on-panel)"]);
    const kindColour = square(toggle("Sign-in")).style.backgroundColor;
    expect(kindColour).not.toBe("");
    expect(squares("Sign-in")).toEqual([kindColour, kindColour, kindColour]);
  });

  it("reads an unknown status word in the unknown tone", () => {
    const odd = rows(VERDICT, [{ id: "d9", when: at(0), state: "REVIEW" }]);
    renderMenu({ genericByKind: { ...BY_KIND, verdict_export: odd } });
    fireEvent.click(chevron("Verdict"));
    expect(square(inRegion(region("Verdict"))[0]).style.backgroundColor).toBe("var(--text-muted)");
  });
});

describe("LayerPanels: a long value list is cut (B3)", () => {
  const MANY = node("many", "Many", "#ffb347", { filter: { field: "net", label: "Network type" } });
  const name = (i: number) => `v${String(i).padStart(2, "0")}`;
  const manyRows = rows(MANY, Array.from({ length: 12 }, (_, i) => ({ id: `m${i}`, at: at(0), net: name(i + 1) })));

  it("shows seven values and a more row, which lists the rest in place and moves the focus to the eighth", () => {
    useSchema.setState({ nodes: [MANY] });
    renderMenu({ genericByKind: { many: manyRows } });
    fireEvent.click(chevron("Many"));
    const r = region("Many");
    expect(inRegion(r)).toHaveLength(7);
    const more = within(r).getByRole("button", { name: /^5 more/ });
    expect(more.getAttribute("data-tip")).toBe(moreWords(5).join("\n"));
    expect(more.hasAttribute("aria-pressed")).toBe(false);
    fireEvent.click(more);
    const all = inRegion(region("Many"));
    expect(all).toHaveLength(12);
    expect(within(region("Many")).queryByRole("button", { name: /more/ })).toBeNull();
    expect(document.activeElement).toBe(all[7]);
    expect(all[7].textContent).toContain(name(8));
  });

  it("shows all eight when there are no more than eight", () => {
    useSchema.setState({ nodes: [MANY] });
    renderMenu({ genericByKind: { many: manyRows.slice(0, 8) } });
    fireEvent.click(chevron("Many"));
    expect(inRegion(region("Many"))).toHaveLength(8);
    expect(within(region("Many")).queryByRole("button", { name: /more/ })).toBeNull();
  });

  it("does not move the focus when another kind's list is opened", () => {
    useSchema.setState({ nodes: [MANY, SIGN] });
    renderMenu({ genericByKind: { many: manyRows, sign: SIGNS } });
    fireEvent.click(chevron("Many"));
    fireEvent.click(within(region("Many")).getByRole("button", { name: /^5 more/ }));
    const before = document.activeElement;
    fireEvent.click(chevron("Sign-in"));
    expect(document.activeElement).toBe(before);
  });
});

describe("LayerPanels: every kind switch explains itself (B15)", () => {
  it("carries the kind, value, chevron and more tooltips from the words module", () => {
    renderMenu();
    expect(toggle("Sign-in").getAttribute("data-tip")).toBe(kindSwitchWords("Sign-in").join("\n"));
    expect(toggle("Limit reset").getAttribute("data-tip")).toBe(kindSwitchWords("Limit reset").join("\n"));
    expect(chevron("Sign-in").getAttribute("data-tip")).toBe(valuesFoldWords("Sign-in", "Network type", false).join("\n"));
    fireEvent.click(chevron("Sign-in"));
    expect(chevron("Sign-in").getAttribute("data-tip")).toBe(valuesFoldWords("Sign-in", "Network type", true).join("\n"));
    const [corporate, , none] = inRegion(region("Sign-in"));
    expect(corporate.getAttribute("data-tip")).toBe(valueSwitchWords("Sign-in", "Network type", "corporate").join("\n"));
    expect(none.getAttribute("data-tip")).toBe(valueSwitchWords("Sign-in", "Network type", "").join("\n"));
  });

  it("gives Authorizations and Logins the kind words", () => {
    renderMenu({
      transactions: [{ is_fraud: 0 } as unknown as Transaction],
      logins: [{ outcome: "success" } as unknown as LoginEvent],
    });
    expect(toggle("Authorizations").getAttribute("data-tip")).toBe(kindSwitchWords("Authorizations").join("\n"));
    expect(toggle("Logins").getAttribute("data-tip")).toBe(kindSwitchWords("Logins").join("\n"));
  });
});

describe("LayerPanels: the count column and the type of the kind rows", () => {
  it("holds the chevron slot on every row without a chevron once a kind is listed", () => {
    const { container } = renderMenu();
    // Limit reset, Empty kind and Time zones carry the slot; Sign-in and Verdict carry the chevron.
    expect(container.querySelectorAll("span.w-6[aria-hidden]")).toHaveLength(3);
    expect(toggle("Limit reset").nextElementSibling?.className).toContain("w-6");
    expect(screen.getByText("Empty kind").closest("div.h-\\[26px\\]")?.nextElementSibling?.className).toContain("w-6");
    expect(toggle("Time zones").nextElementSibling?.className).toContain("w-6");
  });

  it("keeps the value rows' own slot too, so the counts end at one edge", () => {
    renderMenu();
    fireEvent.click(chevron("Sign-in"));
    for (const b of inRegion(region("Sign-in"))) expect(b.nextElementSibling?.className).toContain("w-6");
  });

  it("fades nothing: no element of the menu carries an opacity class or style", () => {
    // The off and mixed states are set before the render, so the walk reads them.
    useLayers.setState({ hiddenKinds: ["reset"], hiddenValues: { sign: ["education"] } });
    const { container } = renderMenu();
    fireEvent.click(chevron("Sign-in"));
    expect(toggle("Limit reset").getAttribute("aria-pressed")).toBe("false");
    expect(toggle("Sign-in").getAttribute("aria-pressed")).toBe("mixed");
    const faded = [...container.querySelectorAll<HTMLElement>("*")].filter(
      (el) => [...el.classList].some((c) => /(^|:)opacity-/.test(c)) || el.style.opacity !== "",
    );
    expect(faded.map((el) => el.outerHTML.slice(0, 80))).toEqual([]);
  });

  it("sets no value label larger than 10 px", () => {
    renderMenu();
    fireEvent.click(chevron("Sign-in"));
    fireEvent.click(chevron("Verdict"));
    const sizes: number[] = [];
    for (const label of ["Sign-in", "Verdict"]) {
      for (const el of region(label).querySelectorAll<HTMLElement>("*")) {
        for (const c of el.classList) {
          const m = /^text-\[(\d+)px\]$/.exec(c);
          if (m) sizes.push(Number(m[1]));
        }
      }
    }
    expect(sizes.length).toBeGreaterThan(0);
    expect(Math.max(...sizes)).toBeLessThanOrEqual(10);
  });
});

// Test 4.2 (theme follow, C4.T1): the card story's rows that have a palette slot keep what they draw
// today in every theme and colour mode (a CSS variable of the slot), and its one own kind, Decision,
// takes the resolver's mark. The manifest is the real one; the marks are the designer's table.
describe("LayerPanels: the card story's squares", () => {
  const cardNodes = (
    Object.values(
      import.meta.glob<string>("../../../../backend/scenarios/*.scenario.json", { query: "?raw", import: "default", eager: true }),
    ).map((raw) => JSON.parse(raw) as { id: string; nodes: ScenarioNode[] }).find((m) => m.id === "card-fraud") as {
      nodes: ScenarioNode[];
    }
  ).nodes;
  const decisionNode = cardNodes.find((n) => n.kind === "decision") as ScenarioNode;
  const decisions = rows(decisionNode, [{ id: "dd-1", decided_at: at(0), status: "FAIL" }]);
  const saved = { theme: useTheme.getState().theme, color: useTheme.getState().color };
  afterEach(() => useTheme.setState(saved));
  const hexOf = (css: string): string => {
    if (css.startsWith("#")) return css.toLowerCase();
    const m = css.match(/\d+/g) ?? [];
    return `#${m.slice(0, 3).map((n) => Number(n).toString(16).padStart(2, "0")).join("")}`;
  };
  const mountCard = () => {
    useSchema.setState({ nodes: cardNodes });
    return render(
      <LayerPanels
        {...NO_DATA}
        transactions={[{ is_fraud: 0 } as unknown as Transaction]}
        logins={[{ outcome: "success" } as unknown as LoginEvent]}
        places={[{} as unknown as Place]}
        genericByKind={{ decision: decisions }}
      />,
    );
  };

  it("PIN: the authorization, login and places squares are their slot variables in every theme and mode", () => {
    // An off switch is a ring with no fill, so Places is turned on for this read and back off after it.
    useLayers.setState({ showPlaces: true });
    for (const theme of THEMES) {
      for (const color of COLOR_MODES) {
        useTheme.setState({ theme, color });
        const view = mountCard();
        expect(square(toggle("Authorizations")).style.backgroundColor, `${theme} ${color}`).toBe("var(--r1-on-panel)");
        expect(square(toggle("Logins")).style.backgroundColor, `${theme} ${color}`).toBe("var(--r2-on-panel)");
        expect(square(toggle("Places")).style.backgroundColor, `${theme} ${color}`).toBe("var(--text-muted)");
        view.unmount();
      }
    }
    useLayers.setState({ showPlaces: false });
  });

  it.each([
    ["dark", "neon", "#ff6b6b"],
    ["light", "neon", "#ea0000"],
    ["dark", "deuteranopia", "#ff6b35"],
    ["dark", "monochrome", "#ffffff"],
  ] as const)("the Decision square is the drawn mark in %s %s", (theme, color, mark) => {
    useTheme.setState({ theme, color });
    mountCard();
    expect(hexOf(square(toggle("Decision")).style.backgroundColor)).toBe(mark);
  });
});

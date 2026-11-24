/**
 * The Layers menu's Dispositions row (group N2): drawn first while the marks store holds a story, off at
 * first, with the lens, the label and `touched / all`; a hairline under it; disabled while it is off and
 * nothing is touched; its chevron opens six facet switches in a fixed order, each with its own count,
 * glyph and tooltip, that show their own state whatever the Yours switch says; the mixed square while Yours
 * is on and a facet is off. The counts read the investigator's state only. State is set as the model's
 * own hook tests set it: the marks and notes stores, the pivot data, the layers store and the playhead.
 */
import { describe, it, expect, afterEach, beforeEach } from "vitest";
import { render, screen, fireEvent, within, act } from "@testing-library/react";
import type { ComponentProps } from "react";
import { LayerPanels } from "./LayerPanels";
import type { Entity } from "../lib/entity";
import { FACET_LABEL, facetWords, yoursFoldWords, yoursWords } from "../lib/tooltip-words/layers";
import { YOURS_FACETS, type YoursFacet } from "../lib/marks/types";
import { makeNode, makeNote, makePath } from "../lib/notes/test-fixtures";
import { useLayers } from "../store/layers";
import { useMarksStore } from "../store/marks";
import { useNotesStore } from "../store/notes";
import { usePivotData } from "../store/pivot-data";
import { usePlayhead } from "../store/playhead";
import { useSchema } from "../store/schema";
import { useSelection } from "../store/selection";
import type { LoginEvent, Transaction } from "../types";

type Props = ComponentProps<typeof LayerPanels>;

const SCENARIO = "card-fraud";
const T = Date.parse("2026-05-12T10:00:00Z");
const MIN = 60_000;
const at = (i: number) => new Date(T + i * MIN).toISOString();

const tx = (id: string, i: number, isFraud: number): Transaction => ({ id, timestamp: at(i), is_fraud: isFraud }) as unknown as Transaction;
const login = (id: string, i: number): LoginEvent => ({ id, timestamp: at(i), outcome: "success" }) as unknown as LoginEvent;
const entity = (id: string, i: number): Entity => ({ kind: "sign", id, timestamp: T + i * MIN, fields: {} }) as unknown as Entity;

// Six records: three transactions, two logins, one manifest entity.
const TRANSACTIONS = [tx("a1", 0, 0), tx("a2", 1, 0), tx("f1", 2, 1)];
const LOGINS = [login("l1", 3), login("l2", 4)];
const ENTITIES = [entity("e1", 5)];

const NO_DATA: Props = {
  transactions: TRANSACTIONS,
  logins: LOGINS,
  places: [],
  transfers: [],
  visibleTransactions: TRANSACTIONS,
  visibleLogins: LOGINS,
  loadError: null,
};

/**
 * What the investigator did, by record: a1 pinned and noted; f1 FAIL and in a path (a fraud transaction,
 * stored as an auth node); l1 PASS; e1 WAITING and pinned; l2 noted only. So pinned 2, PASS 1, FAIL 1,
 * WAITING 1, noted 2, in a path 2 (f1 and l1), and five of the six records touched.
 */
function holdWork() {
  useMarksStore.setState({
    scenario: SCENARIO,
    nodes: [
      makeNode({ record: { kind: "auth", id: "a1" }, pinned: true }),
      makeNode({ record: { kind: "auth", id: "f1" }, disposition: "fail", category: "Mule" }),
      makeNode({ record: { kind: "login", id: "l1" }, disposition: "pass" }),
      makeNode({ record: { kind: "sign", id: "e1" }, disposition: "wait", pinned: true }),
    ],
    paths: [makePath({ stops: [{ kind: "auth", id: "f1" }, { kind: "login", id: "l1" }] })],
  });
  useNotesStore.setState({
    scenario: SCENARIO,
    notes: [
      makeNote({ link: { kind: "auth", id: "a1" } }),
      makeNote({ id: "note-" + "b".repeat(32), seq: 2, link: { kind: "login", id: "l2" } }),
    ],
  });
}

function holdNothing() {
  useMarksStore.setState({ scenario: SCENARIO, nodes: [], paths: [] });
  useNotesStore.setState({ scenario: SCENARIO, notes: [] });
}

const renderMenu = (over: Partial<Props> = {}) => render(<LayerPanels {...NO_DATA} {...over} />);

const switches = () => screen.getAllByRole("button").filter((b) => b.hasAttribute("aria-pressed")) as HTMLButtonElement[];
const toggle = (label: string) => {
  const found = switches().find((b) => b.textContent?.startsWith(label));
  if (!found) throw new Error(`no switch starting ${label}`);
  return found;
};
const yours = () => toggle("Dispositions");
const yoursChevron = () => screen.getByRole("button", { name: "Dispositions details" });
const facetRegion = () => document.getElementById(yoursChevron().getAttribute("aria-controls") as string) as HTMLElement;
const facetRows = () => [...facetRegion().querySelectorAll("button")].filter((b) => b.hasAttribute("aria-pressed")) as HTMLButtonElement[];
const facetRow = (f: YoursFacet) => facetRows()[YOURS_FACETS.indexOf(f)];
/** The square of a row: the first thing in its label span. */
const square = (button: HTMLElement) => (button.firstElementChild as HTMLElement).firstElementChild as HTMLElement;
const count = (button: HTMLElement) => button.querySelector("span.font-mono")?.textContent;

beforeEach(() => {
  useMarksStore.getState().clear();
  useNotesStore.getState().clear();
  usePivotData.setState({ transactions: TRANSACTIONS, logins: LOGINS, accountEvents: [], transfers: [], entities: ENTITIES });
  useSchema.setState({ scenarioId: null, nodes: [] });
  usePlayhead.setState({ playhead: T + 2 * MIN, minTime: T, maxTime: T + 10 * MIN });
  useSelection.setState({ selected: null });
});

afterEach(() => {
  useMarksStore.getState().clear();
  useNotesStore.getState().clear();
  usePivotData.setState({ transactions: [], logins: [], accountEvents: [], transfers: [], entities: [] });
  usePlayhead.setState({ playhead: 0, minTime: 0, maxTime: 0 });
  useLayers.setState({
    showAuths: true,
    showLogins: true,
    hiddenKinds: [],
    hiddenValues: {},
    yoursOn: false,
    yoursFacets: { pinned: true, pass: true, fail: true, wait: true, noted: true, inPath: true },
  });
});

describe("the Dispositions row: drawn while a story is held (B21)", () => {
  it("is not drawn with no story in the marks store: the menu is today's", () => {
    renderMenu();
    expect(switches().some((b) => b.textContent?.startsWith("Dispositions"))).toBe(false);
    expect(switches()[0].textContent).toContain("Authorizations");
    expect(screen.queryByRole("button", { name: "Dispositions details" })).toBeNull();
  });

  it("is the first switch of the menu, off, with the lens, the label and touched over all", () => {
    holdWork();
    renderMenu();
    expect(switches()[0]).toBe(yours());
    expect(yours().getAttribute("aria-pressed")).toBe("false");
    expect(useLayers.getState().yoursOn).toBe(false);
    expect(yours().querySelector('svg[data-glyph="lens"]')).not.toBeNull();
    expect(count(yours())).toBe("5 / 6");
    expect(yours().textContent).toContain("Dispositions");
  });

  it("holds a hairline under it, folded and open", () => {
    holdWork();
    renderMenu();
    const row = yours().parentElement as HTMLElement;
    expect((row.nextElementSibling as HTMLElement).style.borderTop).toContain("var(--hairline)");
    fireEvent.click(yoursChevron());
    expect(row.nextElementSibling).toBe(facetRegion());
    expect((facetRegion().nextElementSibling as HTMLElement).style.borderTop).toContain("var(--hairline)");
  });

  it("draws its square in the investigator's ink, not a kind's colour", () => {
    holdWork();
    useLayers.setState({ yoursOn: true });
    renderMenu();
    expect(square(yours()).style.backgroundColor).toBe("var(--text)");
  });

  it("carries the tooltip of the switch and of its chevron, from the words module", () => {
    holdWork();
    renderMenu();
    expect(yours().getAttribute("data-tip")).toBe(yoursWords(5, false).join("\n"));
    expect(yoursChevron().getAttribute("data-tip")).toBe(yoursFoldWords(false).join("\n"));
    fireEvent.click(yoursChevron());
    expect(yoursChevron().getAttribute("data-tip")).toBe(yoursFoldWords(true).join("\n"));
  });
});

describe("the Dispositions row: nothing touched yet (B25)", () => {
  it("is disabled while off: a press does nothing, the label is faint, the tooltip says nothing is held", () => {
    holdNothing();
    renderMenu();
    expect(count(yours())).toBe("0 / 6");
    expect(yours().getAttribute("aria-disabled")).toBe("true");
    expect(yours().hasAttribute("disabled")).toBe(false);
    expect(yours().getAttribute("data-tip")).toBe(yoursWords(0, false).join("\n"));
    expect(yours().textContent).toContain("Dispositions");
    fireEvent.click(yours());
    expect(useLayers.getState().yoursOn).toBe(false);
    expect(yours().getAttribute("aria-pressed")).toBe("false");
    expect(within(yours()).getByText("Dispositions").style.color).toBe("var(--text-faint)");
  });

  it("stays focusable", () => {
    holdNothing();
    renderMenu();
    yours().focus();
    expect(document.activeElement).toBe(yours());
  });

  it("is not disabled while it is on, so it can always be switched off", () => {
    holdNothing();
    useLayers.setState({ yoursOn: true });
    renderMenu();
    expect(yours().hasAttribute("aria-disabled")).toBe(false);
    fireEvent.click(yours());
    expect(useLayers.getState().yoursOn).toBe(false);
  });

  it("switches on with a press once something is touched", () => {
    holdWork();
    renderMenu();
    expect(yours().hasAttribute("aria-disabled")).toBe(false);
    fireEvent.click(yours());
    expect(useLayers.getState().yoursOn).toBe(true);
    expect(yours().getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(yours());
    expect(useLayers.getState().yoursOn).toBe(false);
  });
});

describe("the Dispositions row opens into six facet switches (B23)", () => {
  it("is folded at first and opens in the order Pinned, PASS, FAIL, WAITING, Noted, In a path", () => {
    holdWork();
    renderMenu();
    expect(yoursChevron().getAttribute("aria-expanded")).toBe("false");
    expect(document.getElementById(yoursChevron().getAttribute("aria-controls") ?? "none")).toBeNull();
    fireEvent.click(yoursChevron());
    expect(yoursChevron().getAttribute("aria-expanded")).toBe("true");
    expect(facetRows()).toHaveLength(6);
    expect(facetRows().map((b) => b.textContent?.replace(/\d+$/, ""))).toEqual(["Pinned", "PASS", "FAIL", "WAITING", "Noted", "In a path"]);
  });

  it("is indented 17 px, like a kind's value list", () => {
    holdWork();
    renderMenu();
    fireEvent.click(yoursChevron());
    expect(facetRegion().className).toContain("pl-[17px]");
  });

  it("counts each facet over the case's records", () => {
    holdWork();
    renderMenu();
    fireEvent.click(yoursChevron());
    expect(facetRows().map(count)).toEqual(["2", "1", "1", "1", "2", "2"]);
    // The spoken count is the number itself: a facet count has no total to read it against.
    expect(facetRow("noted").querySelector(".sr-only")?.textContent).toBe("2");
  });

  it("carries each facet's tooltip", () => {
    holdWork();
    renderMenu();
    fireEvent.click(yoursChevron());
    for (const f of YOURS_FACETS) {
      expect(facetRow(f).getAttribute("data-tip")).toBe(facetWords(f).join("\n"));
      expect(facetRow(f).textContent).toContain(FACET_LABEL[f]);
    }
  });

  it("draws the pin on Pinned, the disposition glyph on PASS, FAIL and WAITING, an empty slot on Noted and In a path", () => {
    holdWork();
    renderMenu();
    fireEvent.click(yoursChevron());
    const glyphOf = (f: YoursFacet) => facetRow(f).querySelector("svg[data-glyph]")?.getAttribute("data-glyph") ?? null;
    expect(glyphOf("pinned")).toBe("pin");
    expect(glyphOf("pass")).toBe("check");
    expect(glyphOf("fail")).toBe("cross");
    expect(glyphOf("wait")).toBe("hourglass");
    for (const f of ["noted", "inPath"] as const) {
      // The 9 px slot is there, so the labels line up, and it holds no drawing.
      const slot = facetRow(f).querySelector<HTMLElement>("span.h-\\[9px\\][aria-hidden]");
      expect(slot).not.toBeNull();
      expect(slot?.querySelector("svg")).toBeNull();
    }
    for (const f of YOURS_FACETS) {
      const slot = facetRow(f).querySelector<HTMLElement>("span.h-\\[9px\\][aria-hidden]");
      expect(slot?.className).toContain("w-[9px]");
    }
  });

  it("draws every facet's square in the investigator's ink, so the FAIL facet does not look like the data's FAIL value", () => {
    holdWork();
    renderMenu();
    fireEvent.click(yoursChevron());
    for (const f of YOURS_FACETS) expect(square(facetRow(f)).style.backgroundColor, f).toBe("var(--text)");
  });

  it("keeps the count column: each facet row holds the chevron's slot", () => {
    holdWork();
    renderMenu();
    fireEvent.click(yoursChevron());
    for (const b of facetRows()) expect(b.nextElementSibling?.className).toContain("w-6");
  });

  it("shows each facet's own state whatever Dispositions says: a press flips it, filled when on, a ring when off", () => {
    holdWork();
    renderMenu();
    fireEvent.click(yoursChevron());
    for (const yoursOn of [false, true]) {
      act(() => useLayers.setState({ yoursOn }));
      expect(facetRow("fail").getAttribute("aria-pressed")).toBe("true");
      // On is the filled square (no ring); off is the ring.
      expect(square(facetRow("fail")).className).not.toContain("border-dim");
      fireEvent.click(facetRow("fail"));
      expect(useLayers.getState().yoursFacets.fail).toBe(false);
      expect(facetRow("fail").getAttribute("aria-pressed")).toBe("false");
      expect(square(facetRow("fail")).className).toContain("border-dim");
      // The other five are as they were.
      for (const f of YOURS_FACETS.filter((x) => x !== "fail")) expect(useLayers.getState().yoursFacets[f]).toBe(true);
      fireEvent.click(facetRow("fail"));
      expect(useLayers.getState().yoursFacets.fail).toBe(true);
      expect(facetRow("fail").getAttribute("aria-pressed")).toBe("true");
    }
  });
});

describe("the Dispositions row: the mixed square (B24)", () => {
  it("is the mixed svg with aria-pressed mixed while Yours is on and a facet is off", () => {
    holdWork();
    useLayers.setState({ yoursOn: true });
    renderMenu();
    expect(yours().getAttribute("aria-pressed")).toBe("true");
    act(() => useLayers.getState().toggleFacet("pinned"));
    expect(yours().getAttribute("aria-pressed")).toBe("mixed");
    expect(square(yours()).tagName.toLowerCase()).toBe("svg");
    expect(square(yours()).querySelectorAll("rect")).toHaveLength(2);
  });

  it("is not mixed while Yours is off, whatever the facets say", () => {
    holdWork();
    useLayers.setState({ yoursOn: false });
    renderMenu();
    act(() => useLayers.getState().toggleFacet("pinned"));
    expect(yours().getAttribute("aria-pressed")).toBe("false");
    expect(square(yours()).tagName.toLowerCase()).toBe("span");
  });
});

describe("the Dispositions counts read the investigator's state only (B26)", () => {
  it("holds still while the playhead moves and while the Authorizations and Logins switches go off", () => {
    holdWork();
    renderMenu();
    fireEvent.click(yoursChevron());
    const before = [count(yours()), ...facetRows().map(count)];
    expect(before).toEqual(["5 / 6", "2", "1", "1", "1", "2", "2"]);
    act(() => usePlayhead.setState({ playhead: T }));
    expect([count(yours()), ...facetRows().map(count)]).toEqual(before);
    act(() => usePlayhead.setState({ playhead: T + 9 * MIN }));
    expect([count(yours()), ...facetRows().map(count)]).toEqual(before);
    act(() => useLayers.setState({ showAuths: false, showLogins: false }));
    expect([count(yours()), ...facetRows().map(count)]).toEqual(before);
    act(() => useLayers.setState({ hiddenKinds: ["sign"] }));
    expect([count(yours()), ...facetRows().map(count)]).toEqual(before);
  });

  it("follows the investigator's own work: a new pin changes the counts", () => {
    holdWork();
    renderMenu();
    expect(count(yours())).toBe("5 / 6");
    act(() =>
      useMarksStore.setState((s) => ({ nodes: [...s.nodes, makeNode({ record: { kind: "auth", id: "a2" }, pinned: true })] })),
    );
    expect(count(yours())).toBe("6 / 6");
  });

  it("counts no place: the six are the case's five lists", () => {
    holdWork();
    renderMenu({ places: [{ id: "p1" } as never, { id: "p2" } as never] });
    expect(count(yours())).toBe("5 / 6");
  });
});

describe("the Dispositions row keeps the owner's type rules", () => {
  it("sets no text larger than 10 px, fades nothing and rounds no box", () => {
    holdWork();
    useLayers.setState({ yoursOn: true, yoursFacets: { pinned: false, pass: true, fail: true, wait: true, noted: true, inPath: true } });
    renderMenu();
    fireEvent.click(yoursChevron());
    const parts = [yours().parentElement as HTMLElement, facetRegion()];
    const sizes: number[] = [];
    for (const part of parts) {
      for (const el of [part, ...part.querySelectorAll<HTMLElement>("*")]) {
        for (const c of el.classList) {
          const m = /^text-\[(\d+)px\]$/.exec(c);
          if (m) sizes.push(Number(m[1]));
          expect(c, "no pill").not.toMatch(/^rounded-(full|lg|xl|2xl|3xl)$/);
          expect(c, "no fade").not.toMatch(/(^|:)opacity-/);
        }
        expect(el.style.opacity).toBe("");
        expect(el.style.fontSize).toBe("");
      }
    }
    expect(sizes.length).toBeGreaterThan(0);
    expect(Math.max(...sizes)).toBeLessThanOrEqual(10);
  });

  it("names the row by its label and its chevron by Dispositions details", () => {
    holdWork();
    const { container } = renderMenu();
    expect(within(container).getByRole("button", { name: "Dispositions details" })).toBeTruthy();
    expect(yours().textContent).toContain("Dispositions");
  });
});

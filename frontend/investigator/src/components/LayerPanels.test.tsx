import { describe, it, expect, afterEach } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";
import type { ComponentProps } from "react";
import { LayerPanels } from "./LayerPanels";
import type { LoginEvent, Place, Transaction, Transfer } from "../types";
import { cardLine } from "../lib/case-summary";
import { useLayers } from "../store/layers";
import { useSchema } from "../store/schema";
import { usePlayhead } from "../store/playhead";
import { useTheme } from "../store/theme";
import { COLOR_MODES, THEMES, type ColorMode, type Theme } from "../theme/axes";
import { contrastRatio } from "../theme/legibility";
import { resolvePalette } from "../theme/resolve";
import { hexToRgb01 } from "../theme/to-rgb";

/**
 * The Layers menu body: the switch rows for Authorizations, Places and Logins (the first and last
 * with folded details), a key row per pack-declared kind, and the Time zones switch. It sits in
 * the Layers menu's opaque surface and carries no panel shell. The path switches are PathPanel's
 * (PathPanel.test.tsx).
 */
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

function renderPanels(over: Partial<Props> = {}) {
  return render(<LayerPanels {...NO_DATA} {...over} />);
}

// A card case: one authorization, one login, one place, so every card-era surface has data to show.
const CARD_CASE: Partial<Props> = {
  transactions: [{ is_fraud: 0 } as unknown as Transaction],
  logins: [{ outcome: "success" } as unknown as LoginEvent],
  places: [{} as unknown as Place],
};

// A layer switch is the button that carries a pressed state. A row with a count is named by its
// label and count together, so a row is found by the label its text starts with.
const switches = () =>
  screen.getAllByRole("button").filter((b) => b.hasAttribute("aria-pressed")) as HTMLButtonElement[];
const toggle = (label: string) => {
  const found = switches().find((b) => b.textContent?.startsWith(label));
  if (!found) throw new Error(`no switch starting ${label}`);
  return found;
};
const swatch = (button: HTMLElement) => button.querySelector("span[aria-hidden]") as HTMLElement;
const unfold = (label: string) => fireEvent.click(screen.getByRole("button", { name: `${label} details` }));

const RESET = {
  showAuths: true,
  showLogins: true,
  showPlaces: false,
  showTimezone: false,
  hiddenKinds: [],
  hiddenValues: {},
  pathKinds: { fraud: true, auth: false, login: false, transfer: false },
};

describe("LayerPanels", () => {
  afterEach(() => {
    useLayers.setState(RESET);
  });

  it("keeps an off layer's text at full strength: no fade on any row", () => {
    // At 0.9 the on-panel counts fell to 4.12:1 on the opaque menu; the ring square and
    // aria-pressed say "off".
    useLayers.setState({ showAuths: false, showLogins: false, showPlaces: false, showTimezone: false });
    const { container } = renderPanels(CARD_CASE);
    const faded = [...container.querySelectorAll<HTMLElement>("*")].filter(
      (el) => [...el.classList].some((c) => /(^|:)opacity-/.test(c)) || el.style.opacity !== "",
    );
    expect(faded.map((el) => el.outerHTML.slice(0, 80))).toEqual([]);
    // The walk ran over the real rows: Authorizations, Places, Logins and Time zones.
    expect(switches()).toHaveLength(4);
    expect(switches().every((b) => b.getAttribute("aria-pressed") === "false")).toBe(true);
  });

  it("draws an on layer's square in its on-panel colour", () => {
    useLayers.setState({ showPlaces: true });
    renderPanels(CARD_CASE);
    expect(swatch(toggle("Authorizations")).style.backgroundColor).toBe("var(--r1-on-panel)");
    expect(swatch(toggle("Logins")).style.backgroundColor).toBe("var(--r2-on-panel)");
    expect(swatch(toggle("Places")).style.backgroundColor).toBe("var(--text-muted)");
  });

  it("draws every switch's square filled when its layer is on and as a ring when it is off", () => {
    // In monochrome the Authorizations and Logins fills sat within 1.23:1 of the dim grey in
    // luminance, so the state rides on shape: a fill, or a ring in the dim token.
    const isRing = (el: HTMLElement) =>
      el.classList.contains("border") &&
      el.classList.contains("border-dim") &&
      el.style.backgroundColor === "";
    const isFilled = (el: HTMLElement) => !el.classList.contains("border") && el.style.backgroundColor !== "";
    const labels = ["Authorizations", "Logins", "Places", "Time zones"];

    useLayers.setState({ showAuths: true, showLogins: true, showPlaces: true, showTimezone: true });
    const { unmount } = renderPanels(CARD_CASE);
    labels.forEach((l) => expect(isFilled(swatch(toggle(l))), `on ${l}`).toBe(true));
    unmount();

    useLayers.setState({ showAuths: false, showLogins: false, showPlaces: false, showTimezone: false });
    renderPanels(CARD_CASE);
    labels.forEach((l) => expect(isRing(swatch(toggle(l))), `off ${l}`).toBe(true));
  });

  it("renders its rows with no panel shell and no gap utility", () => {
    const { container } = renderPanels(CARD_CASE);
    // The menu is the one surface: no instrument, glass or grain inside the component.
    expect(container.querySelector(".instrument")).toBeNull();
    expect(container.querySelector(".glass")).toBeNull();
    expect(container.querySelector(".grain")).toBeNull();
    for (const name of ["Authorizations", "Logins", "Places · Context", "Time zones"]) {
      expect(screen.getByText(name), name).toBeTruthy();
    }
    // The wrapper no longer positions itself over the map.
    const wrapper = container.firstElementChild as HTMLElement;
    expect(wrapper.classList.contains("flex")).toBe(true);
    expect(wrapper.classList.contains("flex-col")).toBe(true);
    for (const c of ["absolute", "top-3", "right-3", "z-10", "w-60", "gap-3"]) {
      expect(wrapper.classList.contains(c), c).toBe(false);
    }
  });

  it("shows no Places row without places", () => {
    renderPanels({ transactions: [{ is_fraud: 0 } as unknown as Transaction] });
    expect(screen.queryByText("Places · Context")).toBeNull();
  });

  it("does not name the Places API in its Places line", () => {
    useLayers.setState({ showPlaces: true });
    const { container } = renderPanels(CARD_CASE);
    expect(container.textContent).toContain("Memorial · 8km radius");
    expect(container.textContent).not.toContain("Places API");
  });

  it("shows the Places line only while Places is on", () => {
    useLayers.setState({ showPlaces: false });
    const { container } = renderPanels(CARD_CASE);
    expect(container.textContent).not.toContain("Memorial · 8km radius");
  });

  it("keeps every switch's name, pressed state and visible-of-total count, and each press writes its own layer", () => {
    useLayers.setState({ showAuths: true, showLogins: false, showPlaces: true });
    renderPanels({
      transactions: [{ is_fraud: 1 }, { is_fraud: 0 }, { is_fraud: 0 }] as unknown as Transaction[],
      logins: [{ outcome: "success" }, { outcome: "failed" }] as unknown as LoginEvent[],
      places: [{}, {}] as unknown as Place[],
      visibleTransactions: [{ is_fraud: 0 }] as unknown as Transaction[],
      visibleLogins: [{ outcome: "success" }] as unknown as LoginEvent[],
    });
    const cases: Array<[string, string, boolean]> = [
      ["Authorizations", "Authorizations 1 of 3", true],
      ["Places", "Places · Context 2", true],
      ["Logins", "Logins 1 of 2", false],
    ];
    for (const [label, name, pressed] of cases) {
      const button = toggle(label);
      expect(screen.getByRole("button", { name }), name).toBe(button);
      expect(button.getAttribute("aria-pressed"), name).toBe(String(pressed));
    }
    fireEvent.click(toggle("Logins"));
    expect(useLayers.getState().showLogins).toBe(true);
    fireEvent.click(toggle("Authorizations"));
    expect(useLayers.getState().showAuths).toBe(false);
    fireEvent.click(toggle("Places"));
    expect(useLayers.getState().showPlaces).toBe(false);
  });

  it("reads each count in the muted tone, with only ERR in the alarm tone", () => {
    renderPanels({
      transactions: [{ is_fraud: 0 }, { is_fraud: 0 }, { is_fraud: 0 }] as unknown as Transaction[],
      logins: [{ outcome: "success" }, { outcome: "failed" }] as unknown as LoginEvent[],
      places: [{}] as unknown as Place[],
      visibleTransactions: [{ is_fraud: 0 }, { is_fraud: 0 }] as unknown as Transaction[],
      visibleLogins: [{ outcome: "success" }] as unknown as LoginEvent[],
    });
    expect(screen.getByText("2 / 3").style.color).toBe("var(--text-muted)");
    expect(screen.getByText("1 / 2").style.color).toBe("var(--text-muted)");
  });

  it("reads a switch's label in the text tone when on and the muted tone when off", () => {
    useLayers.setState({ showAuths: true, showLogins: false });
    renderPanels(CARD_CASE);
    expect(screen.getByText("Authorizations").style.color).toBe("var(--text)");
    expect(screen.getByText("Logins").style.color).toBe("var(--text-muted)");
    expect(screen.getByText("Authorizations").className).toContain("uppercase");
    expect(screen.getByText("Authorizations").className).not.toContain("font-mono");
  });

  it("colors an ERR count in the alarm tone and keeps the Authorizations row on a load failure", () => {
    renderPanels({ loadError: "network" });
    const err = screen.getByText("ERR");
    expect(err.style.color).toBe("var(--alarm-on-panel)");
    expect(toggle("Authorizations").textContent).toContain("ERR");
  });

  it("speaks a load error as words in the Authorizations name, not the letters ERR", () => {
    renderPanels({ loadError: "network" });
    expect(toggle("Authorizations").getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByRole("button", { name: /^Authorizations load error$/ })).toBe(toggle("Authorizations"));
  });

  it("shows no card-era row for a pack without that data, and keeps Time zones", () => {
    renderPanels();
    for (const name of ["Authorizations", "Logins", "Places · Context"]) expect(screen.queryByText(name)).toBeNull();
    expect(screen.queryByRole("button", { name: /details/i })).toBeNull();
    expect(switches().map((b) => b.textContent)).toEqual(["Time zones"]);
  });

  describe("folded details", () => {
    const fixtures: Partial<Props> = {
      transactions: [{ is_fraud: 0, category: "gas", card_id: "c1" } as unknown as Transaction],
      visibleTransactions: [{ is_fraud: 0, category: "gas", card_id: "c1" } as unknown as Transaction],
      logins: [{ outcome: "failed", device_fp: "d1" }] as unknown as LoginEvent[],
      visibleLogins: [{ outcome: "failed", device_fp: "d1" }] as unknown as LoginEvent[],
    };

    const regionOf = (label: string) =>
      document.getElementById(
        screen.getByRole("button", { name: `${label} details` }).getAttribute("aria-controls") as string,
      ) as HTMLElement;

    it("are folded at first: no card line, no merchant table, no device line", () => {
      renderPanels(fixtures);
      expect(screen.queryByText(cardLine(fixtures.transactions as Transaction[]))).toBeNull();
      expect(screen.queryByText("5541 · Service Stn")).toBeNull();
      expect(screen.queryByText("1 device · 1 event")).toBeNull();
      expect(screen.getByRole("button", { name: "Authorizations details" }).getAttribute("aria-expanded")).toBe("false");
      expect(screen.getByRole("button", { name: "Logins details" }).getAttribute("aria-expanded")).toBe("false");
    });

    it("unfold and fold from their chevrons, each on its own", () => {
      renderPanels(fixtures);
      unfold("Authorizations");
      expect(screen.getByText(cardLine(fixtures.transactions as Transaction[]))).toBeTruthy();
      expect(screen.getByText("5541 · Service Stn")).toBeTruthy();
      expect(screen.queryByText("1 device · 1 event")).toBeNull();
      const fold = screen.getByRole("button", { name: "Authorizations details" });
      expect(fold.getAttribute("aria-expanded")).toBe("true");
      // The chevron names the region it opens.
      const region = regionOf("Authorizations");
      expect(region).not.toBeNull();
      expect(region.contains(screen.getByText("5541 · Service Stn"))).toBe(true);
      unfold("Logins");
      expect(screen.getByText("1 device · 1 event")).toBeTruthy();
      unfold("Authorizations");
      expect(screen.queryByText("5541 · Service Stn")).toBeNull();
      expect(screen.getByText("1 device · 1 event")).toBeTruthy();
      // Folded again, the chevron names no region: the attribute is gone, not dangling.
      expect(fold.hasAttribute("aria-controls")).toBe(false);
    });

    it("do not switch the layer when their chevron is pressed", () => {
      renderPanels(fixtures);
      unfold("Authorizations");
      expect(useLayers.getState().showAuths).toBe(true);
    });

    it("list every merchant category of the case, in a table with no scroll box of its own", () => {
      // Twelve categories, more than nine; the menu's own scroller (TopMenu) handles a tall menu.
      const cats = Array.from({ length: 12 }, (_, i) => `cat${String(i).padStart(2, "0")}`);
      const many = cats.map((category) => ({ is_fraud: 0, category, card_id: "c1" }) as unknown as Transaction);
      const { container } = renderPanels({ transactions: many, visibleTransactions: many });
      unfold("Authorizations");
      const region = regionOf("Authorizations");
      for (const c of cats) expect(within(region).getByText(c), c).toBeTruthy();
      // The wrapper keeps its top margin and carries no scroll, focus stop or landmark.
      const wrapper = within(region).getByText("cat00").closest("div.mt-1") as HTMLElement;
      expect(wrapper).not.toBeNull();
      expect(wrapper.contains(within(region).getByText("cat11"))).toBe(true);
      expect(container.querySelector(".overflow-y-auto")).toBeNull();
      expect(container.querySelector("[class*='max-h-']")).toBeNull();
      expect(container.querySelector("[role='region']")).toBeNull();
      expect(container.querySelector("[tabindex]")).toBeNull();
    });

    it("indent the region under the label, clear of the chevron column, with room below", () => {
      renderPanels(fixtures);
      unfold("Authorizations");
      // pr-8 is 32 px: the 24 px chevron column, its 2 px gap and the button's 6 px, so a detail
      // value ends under the row counts.
      for (const c of ["pb-2.5", "pl-[17px]", "pr-8"]) {
        expect(regionOf("Authorizations").classList.contains(c), c).toBe(true);
      }
      unfold("Logins");
      for (const c of ["pb-2.5", "pl-[17px]", "pr-8"]) {
        expect(regionOf("Logins").classList.contains(c), c).toBe(true);
      }
    });

    it("draw the card line and the device line in the muted tone at 11px", () => {
      renderPanels(fixtures);
      unfold("Authorizations");
      unfold("Logins");
      const lines = [
        screen.getByText(cardLine(fixtures.transactions as Transaction[])),
        screen.getByText("1 device · 1 event"),
      ];
      for (const line of lines) {
        expect(line.classList.contains("text-muted"), line.textContent ?? "").toBe(true);
        expect(line.classList.contains("text-text"), line.textContent ?? "").toBe(false);
        expect(line.classList.contains("text-[11px]"), line.textContent ?? "").toBe(true);
      }
    });

    it("show the case's span under the card line", () => {
      usePlayhead.setState({ minTime: 0, maxTime: 3_600_000 });
      renderPanels(fixtures);
      unfold("Authorizations");
      expect(screen.getByText("1h 0m")).toBeTruthy();
      usePlayhead.setState({ minTime: 0, maxTime: 0 });
    });

    it("color a login-outcome count by severity via the on-panel alarm channel", () => {
      renderPanels(fixtures);
      unfold("Logins");
      const region = document.getElementById(
        screen.getByRole("button", { name: "Logins details" }).getAttribute("aria-controls") as string,
      ) as HTMLElement;
      expect(within(region).getByText("1").style.color).toBe("var(--alarm-on-panel)");
    });

    it("color each outcome tone from its on-panel slot", () => {
      const logins = [
        { outcome: "success" },
        { outcome: "success" },
        { outcome: "success" },
        { outcome: "challenge_required" },
        { outcome: "challenge_required" },
        { outcome: "failed" },
      ] as unknown as LoginEvent[];
      renderPanels({ logins, visibleLogins: logins });
      unfold("Logins");
      expect(screen.getByText("3").style.color).toBe("var(--r2-on-panel)");
      expect(screen.getByText("2").style.color).toBe("var(--r3-on-panel)");
      expect(screen.getByText("1").style.color).toBe("var(--alarm-on-panel)");
    });
  });

  it("is a row of buttons for Authorizations and Logins, with a pressed state each", () => {
    renderPanels(CARD_CASE);
    expect(toggle("Authorizations").tagName).toBe("BUTTON");
    expect(toggle("Logins").tagName).toBe("BUTTON");
  });

  describe("Time zones", () => {
    it("is the last row and switches showTimezone", () => {
      renderPanels(CARD_CASE);
      const all = switches();
      expect(all[all.length - 1].textContent).toBe("Time zones");
      expect(all[all.length - 1].getAttribute("aria-pressed")).toBe("false");
      fireEvent.click(all[all.length - 1]);
      expect(useLayers.getState().showTimezone).toBe(true);
      expect(toggle("Time zones").getAttribute("aria-pressed")).toBe("true");
    });

    it("carries a neutral square, no count and no chevron", () => {
      useLayers.setState({ showTimezone: true });
      renderPanels(CARD_CASE);
      const row = toggle("Time zones");
      expect(swatch(row).style.backgroundColor).toBe("var(--text-muted)");
      expect(row.querySelector(".tabular-nums")).toBeNull();
      expect(screen.queryByRole("button", { name: "Time zones details" })).toBeNull();
    });

    it("always shows its note and credit link, on or off, with or without card data", () => {
      for (const on of [false, true]) {
        useLayers.setState({ showTimezone: on });
        const { unmount } = renderPanels();
        expect(screen.getByText("Day/night · standard UTC offsets, no DST")).toBeTruthy();
        const link = screen.getByRole("link", { name: /^treyerl\/timezones · MIT/ });
        expect(link.getAttribute("href")).toBe("https://github.com/treyerl/timezones");
        expect(link.getAttribute("target")).toBe("_blank");
        expect(link.getAttribute("rel")).toBe("noreferrer");
        expect(link.className).not.toContain("outline-none");
        expect(link.className).not.toContain("ring");
        unmount();
      }
    });

    it("draws its credit link underlined and says it opens in a new tab", () => {
      renderPanels();
      const link = screen.getByRole("link", { name: /^treyerl\/timezones · MIT/ });
      expect(link.classList.contains("underline")).toBe(true);
      expect(link.classList.contains("text-dim")).toBe(true);
      const hint = link.querySelector("span.sr-only") as HTMLElement;
      expect(hint.textContent).toBe(" (opens in a new tab)");
      expect(link.textContent).toBe("treyerl/timezones · MIT (opens in a new tab)");
      expect(screen.getByRole("link", { name: "treyerl/timezones · MIT (opens in a new tab)" })).toBe(link);
    });

    it("describes its switch by the note under it", () => {
      renderPanels(CARD_CASE);
      const note = screen.getByText("Day/night · standard UTC offsets, no DST");
      expect(note.id).not.toBe("");
      expect(toggle("Time zones").getAttribute("aria-describedby")).toBe(note.id);
      // No other row carries a description.
      for (const label of ["Authorizations", "Logins", "Places"]) {
        expect(toggle(label).hasAttribute("aria-describedby"), label).toBe(false);
      }
    });

    it("sits under a hairline when a row is above it", () => {
      const { container } = renderPanels(CARD_CASE);
      const rule = [...container.querySelectorAll<HTMLElement>("div.my-1\\.5")].find(
        (el) => el.style.borderTop !== "",
      );
      expect(rule).toBeTruthy();
      expect(rule!.style.borderTop).toContain("var(--hairline)");
      expect(rule!.nextElementSibling?.textContent).toContain("Time zones");
    });

    describe("hairline", () => {
      const rules = (container: HTMLElement) =>
        [...container.querySelectorAll<HTMLElement>("div")].filter((el) => el.style.borderTop !== "");
      const node = { kind: "shipment", label: "Shipment", palette: "#ffb347", source: "sql", coords: null, timestamp: "at", primary: "${id}" };

      afterEach(() => useSchema.setState({ nodes: [] }));

      it("is not drawn when nothing sits above Time zones", () => {
        const { container } = renderPanels();
        expect(rules(container)).toHaveLength(0);
        expect(switches().map((b) => b.textContent)).toEqual(["Time zones"]);
      });

      it("is drawn for each kind of row above it: authorizations, places, logins, a pack kind", () => {
        const cases: Array<[string, Partial<Props>]> = [
          ["a load error", { loadError: "network" }],
          ["transactions", { transactions: [{ is_fraud: 0 } as unknown as Transaction] }],
          ["places", { places: [{} as unknown as Place] }],
          ["logins", { logins: [{ outcome: "success" } as unknown as LoginEvent] }],
        ];
        for (const [name, over] of cases) {
          const { container, unmount } = renderPanels(over);
          expect(rules(container), name).toHaveLength(1);
          unmount();
        }
        useSchema.setState({ nodes: [node] });
        const { container } = renderPanels({ genericByKind: { shipment: [] } });
        expect(rules(container), "a pack kind").toHaveLength(1);
      });
    });
  });

  it("renders no Paths heading and no path toggle", () => {
    useLayers.setState({ pathKinds: { fraud: true, auth: true, login: true, transfer: true, shipment: true } });
    renderPanels({
      transactions: [{ is_fraud: 1 }] as unknown as Transaction[],
      logins: [{ outcome: "success" }] as unknown as LoginEvent[],
      transfers: [{} as unknown as Transfer],
    });
    expect(screen.queryByText(/^paths$/i)).toBeNull();
    expect(screen.queryByRole("button", { name: / path$/i })).toBeNull();
    expect(screen.queryByText(/fraud path/i)).toBeNull();
    // Each count reads twice in the text: the visible form, then the spoken one.
    expect(switches().map((b) => b.textContent)).toEqual([
      "Authorizations0 / 10 of 1",
      "Logins0 / 10 of 1",
      "Time zones",
    ]);
  });

  describe("count column", () => {
    it("holds a spare chevron slot on every row without details when the menu has a row with details", () => {
      const node = (kind: string) => ({
        kind, label: kind, palette: "#7ee787", source: "sql", coords: null, timestamp: "at", primary: "${id}",
      });
      useSchema.setState({ nodes: [node("shipment")] });
      try {
        const { container } = renderPanels({
          ...CARD_CASE,
          genericByKind: { shipment: [] },
        });
        // Authorizations and Logins carry a chevron; Places, the key row and Time zones carry a slot.
        expect(container.querySelectorAll("span.w-6[aria-hidden]")).toHaveLength(3);
        for (const label of ["Places", "Time zones"]) {
          expect(toggle(label).nextElementSibling?.className).toContain("w-6");
        }
      } finally {
        useSchema.setState({ nodes: [] });
      }
    });

    describe("with only one of the two chevron rows", () => {
      const node = (kind: string) => ({
        kind, label: kind, palette: "#7ee787", source: "sql", coords: null, timestamp: "at", primary: "${id}",
      });
      afterEach(() => useSchema.setState({ nodes: [] }));

      it("logins only (no transactions, no load error): Places, key rows and Time zones hold the slot", () => {
        useSchema.setState({ nodes: [node("shipment")] });
        const { container } = renderPanels({
          logins: [{ outcome: "success" } as unknown as LoginEvent],
          places: [{}] as unknown as Place[],
          genericByKind: { shipment: [] },
        });
        expect(screen.queryByRole("button", { name: "Authorizations details" })).toBeNull();
        // Logins carries the chevron; the other three rows carry a slot.
        expect(container.querySelectorAll("span.w-6[aria-hidden]")).toHaveLength(3);
        for (const label of ["Places", "Time zones"]) {
          expect(toggle(label).nextElementSibling?.className, label).toContain("w-6");
        }
        expect(screen.getByText("shipment").closest("div.h-\\[26px\\]")?.nextElementSibling?.className).toContain("w-6");
      });

      it("a load error only (no transactions, no logins): the same rows hold the slot", () => {
        useSchema.setState({ nodes: [node("shipment")] });
        const { container } = renderPanels({
          loadError: "network",
          places: [{}] as unknown as Place[],
          genericByKind: { shipment: [] },
        });
        expect(screen.queryByRole("button", { name: "Logins details" })).toBeNull();
        expect(container.querySelectorAll("span.w-6[aria-hidden]")).toHaveLength(3);
        for (const label of ["Places", "Time zones"]) {
          expect(toggle(label).nextElementSibling?.className, label).toContain("w-6");
        }
        expect(screen.getByText("shipment").closest("div.h-\\[26px\\]")?.nextElementSibling?.className).toContain("w-6");
      });
    });

    it("holds no slot in a pack with neither Authorizations nor Logins", () => {
      const { container } = renderPanels({ places: [{}] as unknown as Place[] });
      expect(screen.getByText("Places · Context")).toBeTruthy();
      expect(container.querySelectorAll("span.w-6")).toHaveLength(0);
    });
  });
});

describe("LayerPanels - generic kinds (B8)", () => {
  const node = (kind: string, label: string, palette: string) => ({
    kind, label, palette, source: "sql", coords: null, timestamp: "at", primary: "${id}",
  });
  const mk = (id: string, kind: string, ts: number) => ({
    id, kind, timestamp: ts, coords: null, fields: {},
    displayMetadata: { primaryLabel: id, secondaryLabel: "", paletteKind: kind, pivotableFields: [] },
  });

  afterEach(() => {
    useSchema.setState({ nodes: [] });
    useLayers.setState(RESET);
  });

  it("renders a key row per declared generic kind with visible / total at the playhead", () => {
    useSchema.setState({ nodes: [node("shipment", "Shipment", "#ffb347"), node("refund", "Refund", "#ff5c5c")] });
    usePlayhead.setState({ playhead: 250, minTime: 100, maxTime: 400 });
    renderPanels({
      genericByKind: {
        shipment: [mk("t1", "shipment", 100), mk("t2", "shipment", 200), mk("t3", "shipment", 300)],
        refund: [mk("r1", "refund", 400)],
      },
    });
    // Each count is read from that kind's own row, and the other kind's is absent from it.
    const shipment = screen.getByText("Shipment").parentElement!.parentElement!.parentElement!;
    const refund = screen.getByText("Refund").parentElement!.parentElement!.parentElement!;
    expect(shipment).not.toBe(refund);
    expect(shipment).toHaveTextContent("Shipment2 / 3");
    expect(shipment).not.toHaveTextContent("Refund");
    expect(refund).toHaveTextContent("Refund0 / 1");
    expect(refund).not.toHaveTextContent("Shipment");
  });

  it("draws a generic kind with a record as a switch, and one with no record as a key row", () => {
    useSchema.setState({ nodes: [node("shipment", "Shipment", "#ffb347"), node("refund", "Refund", "#ff5c5c")] });
    renderPanels({ genericByKind: { shipment: [mk("t1", "shipment", 100)], refund: [] } });
    // The kind with a record is a switch with a pressed state and its count.
    expect(toggle("Shipment").getAttribute("aria-pressed")).toBe("true");
    expect(toggle("Shipment").textContent).toContain("1 / 1");
    expect(switches().map((b) => b.textContent?.slice(0, 8))).toEqual(["Shipment", "Time zon"]);
    // The kind with none keeps today's key row: no button, a round dot.
    const row = screen.getByText("Refund").closest("div.h-\\[26px\\]") as HTMLElement;
    expect(row).not.toBeNull();
    expect(row.closest("button")).toBeNull();
    expect(within(row).queryByRole("button")).toBeNull();
    expect(row.querySelector("span.rounded-full")).not.toBeNull();
    expect(row.textContent).toContain("0 / 0");
  });

  // The Layers menu's surface is the instrument panel, rgb(var(--panel-base)) (index.css).
  const surfaceOf = (theme: Theme, color: ColorMode): [number, number, number] =>
    resolvePalette(theme, color).material.panelBase.split(/\s+/).map((n) => Number(n) / 255) as [number, number, number];
  const rgbOf = (css: string): [number, number, number] => {
    const hex = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(css);
    const m = hex ?? /rgba?\((\d+),\s*(\d+),\s*(\d+)/.exec(css);
    if (!m) throw new Error(`unparsed colour ${css}`);
    return [1, 2, 3].map((i) => (hex ? parseInt(m[i], 16) : Number(m[i])) / 255) as [number, number, number];
  };
  const savedTheme = { theme: useTheme.getState().theme, color: useTheme.getState().color };

  it("draws each declared kind's dot at 3:1 or more on the menu, in every theme and colour mode", () => {
    // The platform pack's #7ee787 drew at 1.33:1 and #f5a623 at 1.76:1 on the light menu.
    const failures: string[] = [];
    try {
      for (const theme of THEMES) {
        for (const color of COLOR_MODES) {
          useTheme.setState({ theme, color });
          useSchema.setState({
            nodes: [node("console_signin", "Console sign-in", "#7ee787"), node("usage", "Token usage", "#f5a623")],
          });
          const { unmount } = renderPanels({
            genericByKind: { console_signin: [mk("c1", "console_signin", 100)], usage: [mk("u1", "usage", 100)] },
          });
          // A kind with a record is a switch: its colour is the filled square of its row.
          const dots = ["Console sign-in", "Token usage"].map((label) => swatch(toggle(label)));
          for (const d of dots) {
            const c = contrastRatio(rgbOf(d.style.backgroundColor), surfaceOf(theme, color));
            if (c < 3) failures.push(`${theme}.${color} ${d.style.backgroundColor} ${c.toFixed(2)}:1`);
          }
          unmount();
        }
      }
    } finally {
      useTheme.setState(savedTheme);
    }
    expect(failures).toEqual([]);
  });

  it("passes a declared colour it cannot read (not #rrggbb) through unchanged", () => {
    useTheme.setState({ theme: "light", color: "neon" });
    useSchema.setState({ nodes: [node("refund", "Refund", "rebeccapurple")] });
    try {
      renderPanels({ genericByKind: { refund: [mk("r1", "refund", 100)] } });
      const dot = swatch(toggle("Refund"));
      expect(dot.style.backgroundColor).toBe("rebeccapurple");
    } finally {
      useTheme.setState(savedTheme);
    }
  });

  it("renders no key row for a pack that declares none (card-fraud)", () => {
    useSchema.setState({ nodes: [] });
    const { container } = renderPanels(CARD_CASE);
    expect(screen.queryByText("Shipment")).toBeNull();
    expect(container.querySelector("span.rounded-full")).toBeNull();
  });
});

describe("layer row contrast (tokens, all themes and colour modes)", () => {
  const triplet = (t: string): [number, number, number] => {
    const [r, g, b] = t.split(/\s+/).map((n) => parseInt(n, 10) / 255);
    return [r, g, b];
  };

  it("each on-panel colour the layer rows use reaches 4.5:1 on the menu's opaque surface", () => {
    const failures: string[] = [];
    let min = Infinity;
    for (const theme of THEMES) {
      for (const color of COLOR_MODES) {
        const p = resolvePalette(theme, color);
        const surface = triplet(p.material.panelBase);
        for (const slot of ["r1", "r2", "r3", "alarm"] as const) {
          const c = contrastRatio(hexToRgb01(p.onPanel[slot]), surface);
          min = Math.min(min, c);
          if (c < 4.5) failures.push(`${theme}.${color}.${slot} = ${c.toFixed(2)}:1`);
        }
      }
    }
    expect(failures).toEqual([]);
    // Measured on the built site: at least 4.96 in every cell.
    expect(min).toBeGreaterThanOrEqual(4.9);
  });
});

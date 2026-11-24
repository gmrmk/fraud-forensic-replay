import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it, expect, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { Inspector } from "./Inspector";
import { useSelection } from "../store/selection";
import { useNotesStore } from "../store/notes";
import { OPENER } from "../lib/tooltip-words/record-window";
import { entityRendererRegistry } from "../lib/entity";
import type { Place } from "../types";

/**
 * The Inspector shell is the single lit surface for the
 * panel - a raised Instrument material, not a hand-rolled border/bg div.
 *
 * The investigator renderers register in App's mount effect (App.tsx), so this
 * isolated unit registers a stub `place` body to focus the assertion on the
 * SHELL material (the Panel wrapper), not the body.
 */
const place: Place = {
  id: "place_test_1",
  name: "Montrose Market",
  category: "grocery_or_supermarket",
  lat: 29.7433,
  lng: -95.3909,
};

describe("Inspector shell", () => {
  beforeEach(() => {
    useSelection.setState({ selected: null });
    entityRendererRegistry.set("place", {
      inspectorBody: () => <div>place body</div>,
    });
  });

  it("renders nothing when no entity is selected", () => {
    const { container } = render(<Inspector />);
    expect(container.firstChild).toBeNull();
  });

  it("renders the shell as a raised Instrument panel when an entity is selected", () => {
    useSelection.setState({ selected: { kind: "place", place } });
    const { container } = render(<Inspector />);
    // Discover by the stable semantic landmark, then assert the Instrument-B
    // material adoption (the Panel-elevation contract Panel.test owns is the
    // class source; here we only prove the shell adopted raised instrument).
    const shell = container.querySelector('aside[aria-label="Inspector"]');
    expect(shell).not.toBeNull();
    expect(shell?.className).toContain("instrument");
    expect(shell?.className).toContain("elev-raised");
  });

  it("ends where its content ends: capped by the space above the bottom stack, not anchored to it", () => {
    useSelection.setState({ selected: { kind: "place", place } });
    const { container } = render(<Inspector />);
    const shell = container.querySelector<HTMLElement>('aside[aria-label="Inspector"]')!;
    const classes = shell.className.split(/\s+/);
    expect(classes).toContain("top-3");
    // The window's height and the bottom stack go through the text-size scale (--vh-c,
    // --bottom-stack-c); at 100 percent they equal 100vh and --bottom-stack-h. The 19 px is the
    // 12 px top offset and a 7 px gap.
    expect(classes).toContain("max-h-[calc(var(--vh-c)_-_var(--bottom-stack-c)_-_19px)]");
    expect(classes.some((c) => c.startsWith("bottom-"))).toBe(false);
  });

  it("clears the stack before the observer first fires: --bottom-stack-h defaults to 173px on the root", () => {
    // The cap used to carry this default as a var() fallback; --bottom-stack-c has none, so the
    // default lives in the stylesheet. The two divided forms are pinned in text-size.crossings.test.tsx.
    const css = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), "..", "index.css"), "utf8");
    expect(css).toMatch(/--bottom-stack-h:[\s]*173px\s*;/);
  });

  it("scrolls its body inside the shell, shrinkable below its content", () => {
    useSelection.setState({ selected: { kind: "place", place } });
    const { container } = render(<Inspector />);
    const body = screen.getByText("place body").parentElement!;
    expect(container.querySelector('aside[aria-label="Inspector"]')!.contains(body)).toBe(true);
    const classes = body.className.split(/\s+/);
    expect(classes).toContain("min-h-0");
    expect(classes).toContain("flex-1");
    expect(classes).toContain("overflow-y-auto");
  });

  it("marks the one element that holds the body and scrolls, so a press can find it", () => {
    useSelection.setState({ selected: { kind: "place", place } });
    const { container } = render(<Inspector />);
    // Presence only: a press finds the element by the bare attribute selector.
    const marked = container.querySelectorAll("[data-inspector-scroll]");
    expect(marked).toHaveLength(1);
    const body = screen.getByText("place body").parentElement!;
    expect(marked[0]).toBe(body);
    expect(body.hasAttribute("data-inspector-scroll")).toBe(true);
    expect(body.className.split(/\s+/)).toContain("overflow-y-auto");
    // The panel itself is not the marked element.
    expect(
      container.querySelector('aside[aria-label="Inspector"]')!.hasAttribute("data-inspector-scroll"),
    ).toBe(false);
  });

  // C2 a finding: nothing said there was more below. The scroll body carries the foot cue (the .foot-cue
  // rule of index.css), a shade at its lower edge while it can scroll further down.
  it("shades the foot of its scrolling body while more is below, and still scrolls", () => {
    useSelection.setState({ selected: { kind: "place", place } });
    const { container } = render(<Inspector />);
    const body = container.querySelector<HTMLElement>("[data-inspector-scroll]")!;
    const classes = body.className.split(/\s+/);
    expect(classes).toContain("foot-cue");
    expect(classes).toContain("overflow-y-auto");
    // The cue is a rule of the stylesheet, which the shell does not hold a second copy of.
    const css = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), "..", "index.css"), "utf8");
    expect(css).toMatch(/\.foot-cue\s*\{/);
    // Only the scrolling body carries it: the panel and the header do not.
    expect(container.querySelectorAll(".foot-cue")).toHaveLength(1);
  });

  it("holds the record window's opener right after the button that goes to the event on the map, for a selected record", () => {
    useNotesStore.setState({ scenario: "card-fraud", notes: [] });
    useSelection.setState({ selected: { kind: "place", place } });
    render(<Inspector />);
    const target = screen.getByRole("button", { name: "Go to this event on the map" });
    const opener = screen.getByRole("button", { name: OPENER.name });
    expect(opener.getAttribute("data-tip")).toBe(OPENER.tip);
    expect(target.nextElementSibling).toBe(opener);
  });

  it("holds no opener for a selected note", () => {
    useSelection.setState({
      selected: {
        kind: "entity",
        entity: {
          id: "n1", kind: "note", timestamp: 0, coords: null, fields: {},
          displayMetadata: { primaryLabel: "n", secondaryLabel: "", paletteKind: "note", pivotableFields: [] },
        },
      },
    });
    render(<Inspector />);
    expect(screen.queryByRole("button", { name: OPENER.name })).toBeNull();
  });

  it("can take focus from script, so closing a popout whose control is gone lands here", () => {
    useSelection.setState({ selected: { kind: "place", place } });
    const { container } = render(<Inspector />);
    const shell = container.querySelector<HTMLElement>('aside[aria-label="Inspector"]')!;
    expect(shell.getAttribute("tabindex")).toBe("-1");
  });
});

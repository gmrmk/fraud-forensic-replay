import { StrictMode } from "react";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, fireEvent, screen, act } from "@testing-library/react";
import { WindowFrame } from "./WindowFrame";
import { usePivotStore } from "../../store/pivot";
import { useTheme } from "../../store/theme";
import { paletteForKind } from "../../lib/entity-palette";
import { popoutOpened } from "../../lib/window-focus";
import type { EntityMatch } from "../../lib/matches";
import type { Transaction } from "../../types";
import { readFileSync } from "node:fs";

const indexCss = readFileSync("src/index.css", "utf8"); // tests run from frontend/investigator

const tx = { id: "t1", merchant_lat: 6.43, merchant_lng: 3.42 } as Transaction;
const entity: EntityMatch = { kind: "fraud", tx };

beforeEach(() => {
  usePivotStore.setState({ windows: [], nextZ: 20 });
  usePivotStore.getState().openGlance(entity, { x: 100, y: 100 });
});

function win() {
  return usePivotStore.getState().windows[0];
}

function renderFrame(overrides: Partial<Parameters<typeof WindowFrame>[0]> = {}) {
  const w = win();
  return render(
    <WindowFrame
      id={w.id}
      title="Detail · Mall cash-out"
      anchorScreen={{ x: 100, y: 100 }}
      z={w.z}
      accent="#FF3D2E"
      pinned={w.pinned}
      collapsed={w.collapsed}
      flagged={false}
      canFlag={true}
      onToggleFlag={() => {}}
      {...overrides}
    >
      <div>body content</div>
    </WindowFrame>
  );
}

describe("WindowFrame - owner laws + controls", () => {
  it("does NOT close on Escape (no-Esc-close law)", () => {
    const { container } = renderFrame();
    const dialog = container.querySelector('[role="dialog"]')!;
    fireEvent.keyDown(dialog, { key: "Escape" });
    expect(usePivotStore.getState().windows).toHaveLength(1);
  });

  it("close button removes the window from the store", () => {
    renderFrame();
    fireEvent.click(screen.getByLabelText("Close window"));
    expect(usePivotStore.getState().windows).toHaveLength(0);
  });

  it("collapse control toggles the store's collapsed state", () => {
    renderFrame();
    fireEvent.click(screen.getByLabelText("Fold the window"));
    expect(win().collapsed).toBe(true);
  });

  it("pin control toggles pinned", () => {
    renderFrame();
    fireEvent.click(screen.getByLabelText("Pin the window. It stays open when the playhead moves."));
    expect(win().pinned).toBe(true);
  });

  it("pin control is disabled while flagged (flag implies pinned)", () => {
    renderFrame({ flagged: true, pinned: true });
    expect(screen.getByLabelText("Pinned (unflag to release)")).toBeDisabled();
  });

  it("given onTogglePin and pinWords, the pin button takes their words and stays enabled while flagged", () => {
    renderFrame({ flagged: true, pinned: true, onTogglePin: vi.fn(), pinWords: { name: "Pin the record", tip: "T" } });
    const pin = screen.getByRole("button", { name: "Pin the record" });
    expect(pin).toHaveAttribute("title", "T");
    expect(pin).toBeEnabled();
    expect(screen.queryByLabelText("Pinned (unflag to release)")).toBeNull();
  });

  it("given onTogglePin, a press calls the handler once and the window store is not pinned by the frame", () => {
    const onTogglePin = vi.fn();
    renderFrame({ onTogglePin, pinWords: { name: "Pin the record", tip: "T" } });
    fireEvent.click(screen.getByRole("button", { name: "Pin the record" }));
    expect(onTogglePin).toHaveBeenCalledTimes(1);
    expect(win().pinned).toBe(false);
  });

  it("flag control is absent when the entity has no geography", () => {
    renderFrame({ canFlag: false });
    expect(screen.queryByLabelText("Flag to node")).toBeNull();
  });

  it("bounds the body to the viewport and scrolls it, leaving the header chrome outside the scroller", () => {
    const { container } = renderFrame({ anchorScreen: { x: 100, y: 300 } });
    const body = container.querySelector<HTMLElement>("[data-window-body]")!;
    expect(body.classList.contains("overflow-y-auto")).toBe(true);
    // top edge (300) + header (34) + bottom margin (12) comes off the window's height (--vh-c, the
    // chrome's own pixels; 100vh at 100 percent), floored at 96 px. The whole value is pinned: a
    // partial match would pass with the floor removed.
    expect(body.style.maxHeight).toBe("max(96px, calc(var(--vh-c) - 346px))");
    const header = container.querySelector("[data-window-header]")!;
    expect(header.closest("[data-window-body]")).toBeNull();
    expect(body.contains(header)).toBe(false);
  });

  it("never lets the body bound collapse below a readable floor, or exceed the viewport for off-screen anchors", () => {
    const low = renderFrame({ anchorScreen: { x: 100, y: 5000 } });
    expect(low.container.querySelector<HTMLElement>("[data-window-body]")!.style.maxHeight).toMatch(/^max\(\d+px, /);
    low.unmount();
    // an anchor above the window counts as 0: only the header (34) and margin (12) come off
    const above = renderFrame({ anchorScreen: { x: 100, y: -400 } });
    expect(above.container.querySelector<HTMLElement>("[data-window-body]")!.style.maxHeight).toBe(
      "max(96px, calc(var(--vh-c) - 46px))",
    );
  });

  it("dragging the header updates the store position (pointer capture math)", () => {
    const { container } = renderFrame();
    const header = container.querySelector("[data-window-header]")!;
    // happy-dom lacks setPointerCapture - polyfill as no-op for the test.
    (header as HTMLElement & { setPointerCapture: (id: number) => void }).setPointerCapture = () => {};
    (header as HTMLElement & { releasePointerCapture: (id: number) => void }).releasePointerCapture = () => {};
    fireEvent.pointerDown(header, { clientX: 110, clientY: 110, pointerId: 1 });
    fireEvent.pointerMove(header, { clientX: 160, clientY: 90, pointerId: 1 });
    fireEvent.pointerUp(header, { pointerId: 1 });
    const a = win().anchor;
    expect(a.type === "screen" && a.x).toBe(150); // 100 + (160-110)
    expect(a.type === "screen" && a.y).toBe(80);  // 100 + (90-110)
  });
});

describe("WindowFrame header controls: 16 px drawings in 24 px squares", () => {
  const PIN_OFF = "Pin the window. It stays open when the playhead moves.";
  // Read the classes through classList: happy-dom mishandles bracket attribute selectors.
  const has = (el: Element, ...names: string[]) => names.every((n) => el.classList.contains(n));
  const control = (container: HTMLElement, label: string) =>
    container.querySelector(`button[aria-label="${label}"]`) as HTMLButtonElement;
  const svgsOf = (btn: Element) => Array.from(btn.querySelectorAll("svg"));

  it("fold, pin, close and the flag are each a 24 by 24 px square button", () => {
    const { container } = renderFrame();
    for (const label of ["Fold the window", PIN_OFF, "Close window", "Flag to node"]) {
      const btn = control(container, label);
      expect(btn, label).not.toBeNull();
      expect(has(btn, "w-6", "h-6"), label).toBe(true);
      expect(btn.classList.contains("w-[18px]"), label).toBe(false);
    }
  });

  it("every control's drawing is one aria-hidden svg sized w-4 h-4 (16 px)", () => {
    const { container } = renderFrame();
    for (const label of ["Fold the window", PIN_OFF, "Close window", "Flag to node"]) {
      const svgs = svgsOf(control(container, label));
      expect(svgs, label).toHaveLength(1);
      expect(has(svgs[0], "w-4", "h-4"), label).toBe(true);
      expect(svgs[0].getAttribute("aria-hidden"), label).toBe("true");
    }
  });

  it("the fold prints no text: while open its drawing is the bar, folded it is the triangle", () => {
    const open = renderFrame();
    const openBtn = control(open.container, "Fold the window");
    expect(openBtn.textContent).toBe("");
    expect(svgsOf(openBtn)[0].getAttribute("data-glyph")).toBe("fold-bar");
    open.unmount();
    const folded = renderFrame({ collapsed: true });
    const foldedBtn = control(folded.container, "Open the window");
    expect(foldedBtn.textContent).toBe("");
    expect(svgsOf(foldedBtn)).toHaveLength(1);
    expect(svgsOf(foldedBtn)[0].getAttribute("data-glyph")).toBe("fold-open");
  });

  it("the close prints no text: its drawing is the cross, and it is still named Close window", () => {
    const { container } = renderFrame();
    const btn = screen.getByRole("button", { name: "Close window" });
    expect(btn.textContent).toBe("");
    expect(svgsOf(btn)).toHaveLength(1);
    expect(svgsOf(btn)[0].getAttribute("data-glyph")).toBe("close");
    expect(container.contains(btn)).toBe(true);
  });

  it("the close carries no side padding, no mono type class and no hover square (its corner reaches into the dog-ear's corner)", () => {
    const { container } = renderFrame({ pinned: true });
    const cls = Array.from(control(container, "Close window").classList);
    expect(cls).not.toContain("px-1");
    expect(cls).not.toContain("font-mono");
    expect(cls.some((c) => c.startsWith("text-[") && c !== "text-[color:var(--text-faint)]")).toBe(false);
    expect(cls).not.toContain("hover:bg-text/5");
    expect(cls).toContain("hover:opacity-70");
  });

  it("the fold keeps no mono type class either, and keeps its colours", () => {
    const { container } = renderFrame();
    const cls = Array.from(control(container, "Fold the window").classList);
    expect(cls).not.toContain("font-mono");
    expect(cls.some((c) => c.startsWith("text-[") && c !== "text-[color:var(--text-faint)]")).toBe(false);
    expect(cls).toContain("text-[color:var(--text-faint)]");
    expect(cls).toContain("hover:text-[color:var(--text-muted)]");
  });

  it("the header keeps its 34 px height and the title keeps exactly today's classes (no type size moved)", () => {
    const { container } = renderFrame({ title: "T" });
    const header = container.querySelector("[data-window-header]")!;
    expect(header.classList.contains("h-[34px]")).toBe(true);
    const title = header.querySelector("span.truncate")!;
    expect(title.textContent).toBe("T");
    expect(Array.from(title.classList).sort()).toEqual(
      ["font-mono", "text-[9px]", "tracking-[0.16em]", "uppercase", "truncate", "flex-1"].sort(),
    );
  });

  it("names and tooltips are today's words in every state", () => {
    const fold = (collapsed: boolean) => {
      const { container, unmount } = renderFrame({ collapsed });
      const btn = control(container, collapsed ? "Open the window" : "Fold the window");
      expect(btn.getAttribute("title")).toBe(collapsed ? "Open the window" : "Fold the window");
      unmount();
    };
    fold(false);
    fold(true);
    const pin = (overrides: Partial<Parameters<typeof WindowFrame>[0]>, name: string, tip: string) => {
      const { container, unmount } = renderFrame(overrides);
      const btn = screen.getByRole("button", { name });
      expect(btn.getAttribute("title")).toBe(tip);
      expect(container.contains(btn)).toBe(true);
      unmount();
    };
    pin({ pinned: false }, PIN_OFF, PIN_OFF);
    pin({ pinned: true }, "Unpin", "Unpin");
    pin({ pinned: true, flagged: true }, "Pinned (unflag to release)", "Pinned (unflag to release)");
    pin({ onTogglePin: () => {}, pinWords: { name: "Pin the record", tip: "T" } }, "Pin the record", "T");
    const flag = (flagged: boolean) => {
      const { container, unmount } = renderFrame({ flagged });
      const label = flagged ? "Unflag" : "Flag to node";
      expect(control(container, label).getAttribute("title")).toBe(label);
      unmount();
    };
    flag(false);
    flag(true);
    // The close has a name and no tooltip today.
    const { container } = renderFrame();
    expect(control(container, "Close window").hasAttribute("title")).toBe(false);
  });

  // The press tests swap the store's actions for spies; every test gets the real ones back.
  const real = (() => {
    const { toggleCollapsed, togglePinned, closeWindow } = usePivotStore.getState();
    return { toggleCollapsed, togglePinned, closeWindow };
  })();
  afterEach(() => usePivotStore.setState(real));

  it("a press on each control calls what it called before", () => {
    const toggleCollapsed = vi.fn();
    const togglePinned = vi.fn();
    const closeWindow = vi.fn();
    usePivotStore.setState({ toggleCollapsed, togglePinned, closeWindow });
    const onToggleFlag = vi.fn();
    const { container } = renderFrame({ onToggleFlag });
    const id = win().id;
    fireEvent.click(control(container, "Fold the window"));
    expect(toggleCollapsed).toHaveBeenCalledWith(id);
    fireEvent.click(control(container, PIN_OFF));
    expect(togglePinned).toHaveBeenCalledWith(id);
    fireEvent.click(control(container, "Flag to node"));
    expect(onToggleFlag).toHaveBeenCalledTimes(1);
    fireEvent.click(control(container, "Close window"));
    expect(closeWindow).toHaveBeenCalledWith(id);
  });

  it("a press on the open control of a folded frame, and on the caller's pin, calls the same handlers", () => {
    const toggleCollapsed = vi.fn();
    const togglePinned = vi.fn();
    usePivotStore.setState({ toggleCollapsed, togglePinned });
    const onTogglePin = vi.fn();
    const { container } = renderFrame({ collapsed: true, onTogglePin, pinWords: { name: "Pin the record", tip: "T" } });
    fireEvent.click(control(container, "Open the window"));
    expect(toggleCollapsed).toHaveBeenCalledWith(win().id);
    fireEvent.click(control(container, "Pin the record"));
    expect(onTogglePin).toHaveBeenCalledTimes(1);
    expect(togglePinned).not.toHaveBeenCalled();
  });
});

describe("WindowFrame popout focus", () => {
  it("takes focus once when its opener asked for it", () => {
    popoutOpened(win().id, document.createElement("button"));
    const { container, rerender } = renderFrame();
    const dialog = container.querySelector<HTMLElement>('[role="dialog"]')!;
    expect(document.activeElement).toBe(dialog);
    dialog.blur();
    rerender(
      <WindowFrame id={win().id} title="t" anchorScreen={{ x: 100, y: 100 }} z={win().z}
        accent="#FF3D2E" pinned={false} collapsed={false} flagged={false} canFlag={false}>
        <div>body content</div>
      </WindowFrame>
    );
    expect(document.activeElement).not.toBe(dialog);
  });

  it("keeps the focus it took through StrictMode's rehearsal unmount (the app renders in StrictMode)", async () => {
    const opener = document.createElement("button");
    document.body.appendChild(opener);
    popoutOpened(win().id, opener);
    render(
      <StrictMode>
        <WindowFrame id={win().id} title="t" anchorScreen={{ x: 100, y: 100 }} z={win().z}
          accent="#FF3D2E" pinned={false} collapsed={false} flagged={false} canFlag={false}>
          <div>body content</div>
        </WindowFrame>
      </StrictMode>
    );
    await act(async () => {}); // let the hidden-window check's microtask run
    expect(document.activeElement).toBe(screen.getByRole("dialog"));
    opener.remove();
  });

  it("closing returns focus to the control that opened it", () => {
    const opener = document.createElement("button");
    document.body.appendChild(opener);
    popoutOpened(win().id, opener);
    renderFrame();
    fireEvent.click(screen.getByLabelText("Close window"));
    expect(document.activeElement).toBe(opener);
    opener.remove();
  });

  it("closing after the opener left the page moves focus to the front-most other window", () => {
    const opener = document.createElement("button"); // the inspector moved on: never attached
    popoutOpened(win().id, opener);
    const closing = win().id;
    render(
      <>
        <WindowFrame id="back" title="back" anchorScreen={{ x: 0, y: 0 }} z={5} accent="#fff"
          pinned collapsed={false} flagged={false} canFlag={false}><div /></WindowFrame>
        <WindowFrame id="front" title="front" anchorScreen={{ x: 0, y: 0 }} z={9} accent="#fff"
          pinned collapsed={false} flagged={false} canFlag={false}><div /></WindowFrame>
        <WindowFrame id={closing} title="closing" anchorScreen={{ x: 0, y: 0 }} z={30} accent="#fff"
          pinned collapsed={false} flagged={false} canFlag={false}><div /></WindowFrame>
      </>
    );
    const closingFrame = screen.getByRole("dialog", { name: "closing" });
    fireEvent.click(closingFrame.querySelector('[aria-label="Close window"]')!);
    expect(document.activeElement).toBe(screen.getByRole("dialog", { name: "front" }));
  });

  it("closing after the opener left the page, with no other window, moves focus to the Inspector", () => {
    const inspector = document.createElement("aside");
    inspector.setAttribute("aria-label", "Inspector");
    inspector.tabIndex = -1;
    document.body.appendChild(inspector);
    popoutOpened(win().id, document.createElement("button"));
    renderFrame();
    fireEvent.click(screen.getByLabelText("Close window"));
    expect(document.activeElement).toBe(inspector);
    inspector.remove();
  });

  it("a fixed-width frame takes its width as given, reserves the scrollbar gutter, and keeps the 1 px of body padding that makes the text 11 px clear of the edge", () => {
    const { container } = renderFrame({ width: 320 });
    const chrome = container.querySelector<HTMLElement>(".chrome-zoom")!;
    expect(chrome.style.width).toBe("320px");
    expect(chrome.className).not.toMatch(/max-w-/);
    const body = container.querySelector<HTMLElement>("[data-window-body]")!;
    expect(body.className).toMatch(/\[scrollbar-gutter:stable\]/);
    expect(body.className).toMatch(/pr-\[1px\]/);
    expect(body.className).not.toMatch(/pr-\[11px\]/);
  });

  it("a frame without a width keeps today's max width, padding and corners", () => {
    const { container } = renderFrame();
    const chrome = container.querySelector<HTMLElement>(".chrome-zoom")!;
    expect(chrome.style.width).toBe("");
    expect(chrome.className).toMatch(/max-w-\[260px\]/);
    expect(chrome.className).toMatch(/rounded-\[14px\]/);
    expect(container.querySelector('[role="dialog"]')!.className).toMatch(/rounded-\[14px\]/);
    expect(chrome.getAttribute("style")).toMatch(/round 14px/);
    const body = container.querySelector<HTMLElement>("[data-window-body]")!;
    expect(body.className).toMatch(/pr-\[11px\]/);
    expect(body.className).not.toMatch(/scrollbar-gutter/);
  });

  it("a square frame has no radius on the frame, the chrome, either clip, or the dog-ear, and the title bar's buttons keep their small hover squares", () => {
    for (const collapsed of [false, true]) {
      const { container, unmount } = renderFrame({ square: true, pinned: true, collapsed });
      const dialog = container.querySelector<HTMLElement>('[role="dialog"]')!;
      const chrome = container.querySelector<HTMLElement>(".chrome-zoom")!;
      expect(dialog.className).not.toMatch(/rounded-\[14px\]/);
      expect(chrome.className).not.toMatch(/rounded-\[14px\]/);
      expect(chrome.getAttribute("style")).toMatch(/round 0px/);
      expect(chrome.getAttribute("style")).not.toMatch(/round 14px/);
      const ear = container.querySelector<HTMLElement>("span.absolute.top-0.right-0")!;
      expect(ear.className).not.toMatch(/rounded-tr/);
      expect(container.querySelector('button[aria-label="Close window"]')).not.toBeNull();
      expect(container.querySelector('button[aria-label="Unpin"]')!.className).toMatch(/\brounded\b/);
      unmount();
    }
  });

  it("a wide frame lifts the max width for popouts", () => {
    const { container } = renderFrame({ wide: true });
    // happy-dom's attribute selectors mishandle brackets; classList does not.
    const widths = Array.from(container.querySelectorAll("div")).flatMap((d) => Array.from(d.classList));
    expect(widths).toContain("max-w-[300px]");
    expect(widths).not.toContain("max-w-[260px]");
  });

  it("a frame draws no foot cue by default: no hook, no background layers, today's bottom padding", () => {
    const { container } = renderFrame();
    const body = container.querySelector<HTMLElement>("[data-window-body]")!;
    expect(body.hasAttribute("data-foot-cue")).toBe(false);
    expect(body.className).not.toMatch(/foot-cue/);
    expect(body.className).toMatch(/pb-\[11px\]/);
  });

  it("a frame with a foot cue carries the hook, a shade that stays with the frame (scroll) under a cover that moves with the content (local), and more room under the last row", () => {
    const { container } = renderFrame({ footCue: true });
    const body = container.querySelector<HTMLElement>("[data-window-body]")!;
    expect(body.hasAttribute("data-foot-cue")).toBe(true);
    expect(body.className).toMatch(/\bfoot-cue\b/);
    // the rule itself (the test DOM loads no stylesheet): the cover is the first (top) layer, the shade the second
    const rule = /\.foot-cue\s*\{([^}]*)\}/.exec(indexCss)![1];
    expect(rule.match(/linear-gradient/g)).toHaveLength(2);
    expect(rule).toMatch(/\blocal\b/);
    expect(rule).toMatch(/\bscroll\b/);
    expect(rule.indexOf("local")).toBeLessThan(rule.indexOf("scroll"));
    expect(rule).toMatch(/rgb\(var\(--panel-base\)/); // the cover is the panel's own colour
    expect(body.className).toMatch(/pb-\[18px\]/);
    expect(body.className).not.toMatch(/pb-\[11px\]/);
  });
});

// The frame fits the title, the lit pin and the lit flag to the header by itself when the caller gives
// no colour of its own. The ratios are computed here with the WCAG relative luminance formula, not
// with the app's own helper (the same way window-ink.test.ts does).
describe("WindowFrame ink: the title, the lit pin and the lit flag keep their contrast in both themes", () => {
  type Rgb = [number, number, number];
  const lum = ([r, g, b]: Rgb): number => {
    const c = [r, g, b].map((v) => {
      const s = v / 255;
      return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
  };
  const ratio = (a: Rgb, b: Rgb): number => {
    const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
    return (hi + 0.05) / (lo + 0.05);
  };
  const rgbOfHex = (hex: string): Rgb => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)) as Rgb;
  // A style colour as the DOM hands it back: #rrggbb or rgb(r, g, b).
  const rgbOfCss = (css: string): Rgb => {
    const m = /^rgb\(\s*(\d+),\s*(\d+),\s*(\d+)\s*\)$/.exec(css);
    return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : rgbOfHex(css);
  };
  // The surfaces the title and the controls sit on, in 8-bit channels: the panel (--panel-base) and
  // the header over it (--panel-floor at 0.85).
  const SURFACES: Record<"light" | "dark", Rgb[]> = {
    light: [[235, 239, 245], [228, 233, 241]],
    dark: [[20, 25, 34], [15, 19, 26]],
  };
  const KEY = "#c4a1ff"; // the Key kind's lavender, pale
  const PIN_OFF = "Pin the window. It stays open when the playhead moves.";
  // A flagged frame's pin is lit and disabled, and carries this name.
  const PIN_LIT = "Pinned (unflag to release)";

  const savedTheme = { theme: useTheme.getState().theme, color: useTheme.getState().color };
  afterEach(() => useTheme.setState(savedTheme));
  const inTheme = (theme: "light" | "dark") => useTheme.setState({ theme, color: "neon" });

  const titleOf = (c: HTMLElement) => c.querySelector<HTMLElement>("[data-window-header] span.truncate")!;
  const btn = (c: HTMLElement, label: string) => c.querySelector<HTMLElement>(`button[aria-label="${label}"]`)!;
  const meets = (css: string, theme: "light" | "dark", floor: number) => {
    for (const surface of SURFACES[theme]) expect(ratio(rgbOfCss(css), surface)).toBeGreaterThanOrEqual(floor);
  };

  it("light: a frame of the Key kind's pale accent draws its title in a fitted colour of 4.5 to 1, not the raw accent", () => {
    inTheme("light");
    const { container } = renderFrame({ accent: KEY });
    const css = titleOf(container).style.color;
    expect(rgbOfCss(css)).not.toEqual(rgbOfHex(KEY));
    meets(css, "light", 4.5);
  });

  it("light: its lit pin and its lit flag reach 3 to 1 and are not the raw accent", () => {
    inTheme("light");
    const { container } = renderFrame({ accent: KEY, pinned: true, flagged: true });
    for (const label of [PIN_LIT, "Unflag"]) {
      const css = btn(container, label).style.color;
      expect(rgbOfCss(css), label).not.toEqual(rgbOfHex(KEY));
      meets(css, "light", 3);
    }
  });

  it("an unlit pin and an unlit flag keep the faint text colour", () => {
    inTheme("light");
    const { container } = renderFrame({ accent: KEY, pinned: false, flagged: false });
    expect(btn(container, PIN_OFF).style.color).toBe("var(--text-faint)");
    expect(btn(container, "Flag to node").style.color).toBe("var(--text-faint)");
  });

  it("dark: an accent that already reaches the floor is drawn unchanged", () => {
    inTheme("dark");
    const { container } = renderFrame({ accent: KEY, pinned: true, flagged: true });
    for (const css of [titleOf(container).style.color, btn(container, PIN_LIT).style.color, btn(container, "Unflag").style.color]) {
      expect(rgbOfCss(css)).toEqual(rgbOfHex(KEY));
    }
  });

  it("a caller's own titleColor and pinColor still win, in the light theme too", () => {
    inTheme("light");
    const { container } = renderFrame({ accent: KEY, pinned: true, titleColor: "#123456", pinColor: "#654321" });
    expect(rgbOfCss(titleOf(container).style.color)).toEqual(rgbOfHex("#123456"));
    expect(rgbOfCss(btn(container, "Unpin").style.color)).toEqual(rgbOfHex("#654321"));
  });

  it("the spine, the line under the header and the dog-ear keep the raw accent", () => {
    inTheme("light");
    const { container } = renderFrame({ accent: KEY, pinned: true });
    const spine = container.querySelector<HTMLElement>("span.absolute.left-0")!;
    expect(rgbOfCss(spine.style.background)).toEqual(rgbOfHex(KEY));
    const header = container.querySelector<HTMLElement>("[data-window-header]")!;
    expect(header.getAttribute("style")!.toLowerCase()).toMatch(/c4a1ff|rgb\(196,\s*161,\s*255\)/);
    // Limit: the test DOM drops the dog-ear's gradient from its style, so only its presence is pinned
    // here; the gradient's colour is the accent in WindowFrame.tsx and the fit never reaches it.
    expect(container.querySelector("span.absolute.top-0.right-0")).not.toBeNull();
  });

  it.each(["light", "dark"] as const)(
    "%s: every concrete kind's accent (detail windows) keeps a title of 4.5 to 1 and a lit pin and flag of 3 to 1",
    (theme) => {
      inTheme(theme);
      for (const kind of ["auth", "fraud", "login", "place", "account_event", "transfer"]) {
        const { container, unmount } = renderFrame({ accent: paletteForKind(kind).hex, pinned: true, flagged: true });
        meets(titleOf(container).style.color, theme, 4.5);
        meets(btn(container, PIN_LIT).style.color, theme, 3);
        meets(btn(container, "Unflag").style.color, theme, 3);
        unmount();
      }
    },
  );

  it.each(["light", "dark"] as const)(
    "%s: a CSS-variable accent (the note window, the rule trace window) passes through unchanged: the variable is already fitted per theme",
    (theme) => {
      inTheme(theme);
      // Limit: the test DOM drops rgb(var(...)) (the rule trace window's form) from a style, so the
      // variable forms the DOM keeps stand for it; windowInk passes every non-#rrggbb value through.
      for (const accent of ["var(--r1-on-panel)", "var(--text-muted)", "var(--alarm)"]) {
        const { container, unmount } = renderFrame({ accent, pinned: true, flagged: true });
        expect(titleOf(container).style.color).toBe(accent);
        expect(btn(container, PIN_LIT).style.color).toBe(accent);
        expect(btn(container, "Unflag").style.color).toBe(accent);
        unmount();
      }
    },
  );
});

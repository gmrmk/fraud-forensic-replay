// frontend/investigator/src/components/ui/Tip.test.tsx
// One tooltip layer for the screen. The hover delays are timers on a hover; no playhead value
// reads them, so the tests drive them with fake timers.
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { act, fireEvent, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TipLayer, showTipAt, showTipOn, tip } from "./Tip";

const layer = (): HTMLElement | null => document.querySelector("[data-tip-layer]");
const advance = (ms: number) => act(() => void vi.advanceTimersByTime(ms));

function Harness() {
  return (
    <div>
      <button id="a" {...tip(["Thing A", "First value", "Second value"], "#ff8800")}>
        A
      </button>
      <button id="b" {...tip(["Thing B", "Only value"])}>
        B
      </button>
      <span id="plain">plain</span>
      <TipLayer />
    </div>
  );
}

const el = (id: string): HTMLElement => document.getElementById(id) as HTMLElement;

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  // The tooltip state lives in a module-level store: send it home between tests.
  act(() => {
    showTipAt(null);
  });
  vi.useRealTimers();
});

describe("tip()", () => {
  it("puts the lines in one attribute, one to a line, and the accent beside it", () => {
    const attrs = tip(["Title", "One", "Two"], "#112233");
    expect(attrs["data-tip"]).toBe("Title\nOne\nTwo");
    expect(attrs["data-tip-accent"]).toBe("#112233");
    expect(attrs["aria-description"]).toBe("Title. One. Two");
  });
  it("drops blank and absent lines, and returns nothing when none is left", () => {
    expect(tip(["Title", "", null, undefined, false, "  "])["data-tip"]).toBe("Title");
    expect(tip(["", null])).toEqual({});
  });
});

describe("TipLayer hover", () => {
  it("shows the first tooltip after 280 ms, not before", () => {
    render(<Harness />);
    fireEvent.pointerOver(el("a"));
    advance(279);
    expect(layer()).toBeNull();
    advance(1);
    expect(layer()).not.toBeNull();
    expect(layer()?.textContent).toContain("Thing A");
    expect(layer()?.textContent).toContain("First value");
    expect(layer()?.getAttribute("role")).toBe("tooltip");
  });

  it("shows the next one after 60 ms while the pointer moves between things", () => {
    render(<Harness />);
    fireEvent.pointerOver(el("a"));
    advance(280);
    fireEvent.pointerOver(el("b"));
    advance(59);
    expect(layer()?.textContent).toContain("Thing A");
    advance(1);
    expect(layer()?.textContent).toContain("Thing B");
    expect(layer()?.textContent).not.toContain("Thing A");
  });

  it("is quick again for a short time after a tooltip has gone", () => {
    render(<Harness />);
    fireEvent.pointerOver(el("a"));
    advance(280);
    fireEvent.pointerDown(el("a"));
    expect(layer()).toBeNull();
    fireEvent.pointerOver(el("b"));
    advance(60);
    expect(layer()?.textContent).toContain("Thing B");
  });

  it("shows nothing for a touch pointer", () => {
    render(<Harness />);
    fireEvent.pointerOver(el("a"), { pointerType: "touch" });
    advance(2000);
    expect(layer()).toBeNull();
  });

  it("shows nothing over an element that carries no tooltip", () => {
    render(<Harness />);
    fireEvent.pointerOver(el("plain"));
    advance(2000);
    expect(layer()).toBeNull();
  });
});

describe("TipLayer focus", () => {
  // happy-dom answers false to ":focus-visible" for every element, so the keyboard case
  // stands in for the browser's answer by spying on `matches`.
  it("shows at once when the keyboard focuses the thing, and goes when focus leaves", () => {
    render(<Harness />);
    const matches = vi.spyOn(el("a"), "matches").mockImplementation((s: string) => s === ":focus-visible");
    act(() => el("a").focus());
    matches.mockRestore();
    expect(layer()?.textContent).toContain("Thing A");
    act(() => el("a").blur());
    expect(layer()).toBeNull();
  });

  it("shows nothing when focus came from a pointer press (not focus-visible)", () => {
    render(<Harness />);
    act(() => el("a").focus());
    expect(layer()).toBeNull();
  });
});

// WCAG 1.4.13, persistent: a tooltip that came by focus stays while its trigger keeps focus. The
// pointer moving over bare page, or out of the window, does not take it away.
describe("TipLayer focus tooltip persists", () => {
  function focusAByKeyboard() {
    const matches = vi.spyOn(el("a"), "matches").mockImplementation((s: string) => s === ":focus-visible");
    act(() => el("a").focus());
    matches.mockRestore();
  }

  it("stays when the pointer moves over bare page while focus has not moved", () => {
    render(<Harness />);
    focusAByKeyboard();
    expect(layer()?.textContent).toContain("Thing A");
    fireEvent.pointerOver(el("plain"));
    advance(1000);
    expect(layer()?.textContent).toContain("Thing A");
  });

  it("stays when the pointer enters another trigger and leaves for bare page before that one shows", () => {
    render(<Harness />);
    focusAByKeyboard();
    fireEvent.pointerOver(el("b"));
    advance(30);
    fireEvent.pointerOver(el("plain"));
    advance(1000);
    expect(layer()?.textContent).toContain("Thing A");
  });

  it("stays when the pointer leaves the window", () => {
    render(<Harness />);
    focusAByKeyboard();
    fireEvent.pointerOut(el("a"));
    advance(1000);
    expect(layer()?.textContent).toContain("Thing A");
  });

  it("still goes when focus leaves the trigger", () => {
    render(<Harness />);
    focusAByKeyboard();
    fireEvent.pointerOver(el("plain"));
    act(() => el("a").blur());
    expect(layer()).toBeNull();
  });

  it("still goes on a press", () => {
    render(<Harness />);
    focusAByKeyboard();
    fireEvent.pointerDown(el("plain"));
    expect(layer()).toBeNull();
  });

  it("still goes on a wheel turn", () => {
    render(<Harness />);
    focusAByKeyboard();
    fireEvent.wheel(el("plain"));
    expect(layer()).toBeNull();
  });

  it("lets a pointer entering another trigger show that trigger's tooltip, which the pointer then owns", () => {
    render(<Harness />);
    focusAByKeyboard();
    fireEvent.pointerOver(el("b"));
    advance(60);
    expect(layer()?.textContent).toContain("Thing B");
    fireEvent.pointerOver(el("plain"));
    advance(1000);
    expect(layer()).toBeNull();
  });
});

// The hold trusts the focus only while the focused element is still there and still holds focus.
describe("TipLayer focus hold checks that the focus is real", () => {
  it("lets go when the trigger is removed from the page without a focusout", () => {
    const trigger = document.createElement("button");
    for (const [k, v] of Object.entries(tip(["Loose thing", "Its value"]))) trigger.setAttribute(k, v);
    document.body.appendChild(trigger);
    try {
      render(<TipLayer />);
      vi.spyOn(trigger, "matches").mockImplementation((s: string) => s === ":focus-visible");
      act(() => trigger.focus());
      expect(layer()?.textContent).toContain("Loose thing");
      // Take the trigger away with no focusout reaching the layer (a capture listener on the
      // window swallows it, as a browser that fires none would).
      const swallow = (e: Event) => e.stopImmediatePropagation();
      window.addEventListener("focusout", swallow, true);
      act(() => trigger.remove());
      window.removeEventListener("focusout", swallow, true);
      expect(trigger.isConnected).toBe(false);
      expect(layer()?.textContent).toContain("Loose thing");
      // The pointer moves over bare page: the hold has no focus behind it, so the grace applies.
      fireEvent.pointerOver(document.body);
      advance(149);
      expect(layer()?.textContent).toContain("Loose thing");
      advance(1);
      expect(layer()).toBeNull();
    } finally {
      trigger.remove();
    }
  });

  it("holds for a trigger whose focusable child holds the focus", () => {
    render(
      <div>
        <div id="wrap" {...tip(["Wrapper thing", "Its value"])}>
          <button id="inner">inner</button>
        </div>
        <span id="plain">plain</span>
        <TipLayer />
      </div>,
    );
    vi.spyOn(el("inner"), "matches").mockImplementation((s: string) => s === ":focus-visible");
    act(() => el("inner").focus());
    expect(layer()?.textContent).toContain("Wrapper thing");
    fireEvent.pointerOver(el("plain"));
    advance(1000);
    expect(layer()?.textContent).toContain("Wrapper thing");
  });
});

// A tooltip the map placed is not held by focus: the pointer owns it, as it owns any pointer tooltip.
describe("TipLayer map tooltip over a focus-held one", () => {
  function focusAByKeyboard() {
    const matches = vi.spyOn(el("a"), "matches").mockImplementation((s: string) => s === ":focus-visible");
    act(() => el("a").focus());
    matches.mockRestore();
  }

  it("is hidden by a pointer-out while the trigger keeps its focus", () => {
    render(<Harness />);
    focusAByKeyboard();
    expect(layer()?.textContent).toContain("Thing A");
    act(() => showTipAt({ x: 100, y: 100 }, ["A map mark", "Its value"]));
    expect(layer()?.textContent).toContain("A map mark");
    expect(document.activeElement).toBe(el("a"));
    fireEvent.pointerOut(el("a"));
    advance(1000);
    expect(layer()).toBeNull();
  });

  // Never red: showTipAt(null) cleared the store before this round and still does. A guard.
  it("is still cleared by showTipAt(null)", () => {
    render(<Harness />);
    focusAByKeyboard();
    act(() => showTipAt({ x: 100, y: 100 }, ["A map mark"]));
    act(() => showTipAt(null));
    expect(layer()).toBeNull();
  });
});

describe("TipLayer dismissal by the pointer", () => {
  it("goes on a press", () => {
    render(<Harness />);
    fireEvent.pointerOver(el("a"));
    advance(280);
    fireEvent.pointerDown(el("a"));
    expect(layer()).toBeNull();
  });

  it("goes on a wheel turn", () => {
    render(<Harness />);
    fireEvent.pointerOver(el("a"));
    advance(280);
    fireEvent.wheel(el("a"));
    expect(layer()).toBeNull();
  });

  it("does not come back on its own after a press while the pointer stays put", () => {
    render(<Harness />);
    fireEvent.pointerOver(el("a"));
    advance(280);
    fireEvent.pointerDown(el("a"));
    advance(3000);
    expect(layer()).toBeNull();
  });

  // The keyboard dismissal of a tooltip that came by focus is Escape; its tests are the
  // "TipLayer Escape" block below.
});

// Escape dismisses an open tooltip, and the layer's one key handler does nothing else.
// WCAG 1.4.13, dismissible: the tooltip goes with the pointer and the focus unmoved, and stays
// gone while either is still on its trigger.
describe("TipLayer Escape", () => {
  function Harness2() {
    return (
      <div>
        <div id="wrap" {...tip(["Wrapper", "Wrapper value"])}>
          <span id="kid">kid</span>
        </div>
        <button id="a" {...tip(["Thing A", "First value"])}>
          A
        </button>
        <button id="b" {...tip(["Thing B", "Only value"])}>
          B
        </button>
        <span id="plain">plain</span>
        <TipLayer />
      </div>
    );
  }
  const press = (key: string, target: Element = document.body) => fireEvent.keyDown(target, { key });
  function keyboardFocus(id: string) {
    const matches = vi.spyOn(el(id), "matches").mockImplementation((s: string) => s === ":focus-visible");
    act(() => el(id).focus());
    matches.mockRestore();
  }
  function hoverShow(id: string) {
    fireEvent.pointerOver(el(id));
    advance(280);
  }

  it("dismisses a tooltip the pointer brought, with the pointer unmoved", () => {
    render(<Harness2 />);
    hoverShow("a");
    expect(layer()).not.toBeNull();
    press("Escape");
    expect(layer()).toBeNull();
  });

  it("dismisses a tooltip that came by focus, with focus unmoved", () => {
    render(<Harness2 />);
    keyboardFocus("a");
    expect(layer()?.textContent).toContain("Thing A");
    press("Escape", el("a"));
    expect(layer()).toBeNull();
    expect(document.activeElement).toBe(el("a"));
  });

  it("dismisses a tooltip the map placed with showTipAt", () => {
    render(<Harness2 />);
    act(() => showTipAt({ x: 100, y: 100 }, ["A map mark", "Its value"]));
    press("Escape");
    expect(layer()).toBeNull();
  });

  it("takes no other key: an open tooltip stays on Enter, Tab, Space, an arrow and look-alike names", () => {
    render(<Harness2 />);
    hoverShow("a");
    for (const key of ["Enter", "Tab", " ", "ArrowDown", "ArrowLeft", "Esc", "escape", "e"]) press(key);
    expect(layer()?.textContent).toContain("Thing A");
  });

  it("does nothing when no tooltip is open, and does not hold back the next one", () => {
    render(<Harness2 />);
    press("Escape");
    expect(layer()).toBeNull();
    hoverShow("a");
    expect(layer()?.textContent).toContain("Thing A");
  });

  it("does nothing during the show delay: the tooltip is not open yet, so it still comes", () => {
    render(<Harness2 />);
    fireEvent.pointerOver(el("a"));
    advance(100);
    press("Escape");
    advance(180);
    expect(layer()?.textContent).toContain("Thing A");
  });

  it("neither stops the key from travelling nor prevents its default", () => {
    render(<Harness2 />);
    hoverShow("a");
    const seen = vi.fn();
    window.addEventListener("keydown", seen);
    const ev = new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true });
    act(() => void document.body.dispatchEvent(ev));
    window.removeEventListener("keydown", seen);
    expect(layer()).toBeNull();
    expect(seen).toHaveBeenCalledTimes(1);
    expect(ev.defaultPrevented).toBe(false);
  });

  it("closes the speed flyout as well when both are open (today's menu behaviour, kept)", async () => {
    const { SpeedFlyout } = await import("../timeline/SpeedFlyout");
    render(
      <div>
        <Harness2 />
        <SpeedFlyout />
      </div>,
    );
    // A hover tooltip is open while the flyout opens (opening it moves focus, which would take a
    // focus tooltip away before Escape).
    hoverShow("a");
    act(() => {
      fireEvent.click(document.querySelector("[aria-haspopup]") as Element);
    });
    expect(document.querySelector("[role=radiogroup]")).not.toBeNull();
    expect(layer()?.textContent).toContain("Thing A");
    press("Escape");
    expect(layer()).toBeNull();
    expect(document.querySelector("[role=radiogroup]")).toBeNull();
  });

  describe("stays dismissed", () => {
    it("while the pointer stays on the trigger or moves to its child", () => {
      render(<Harness2 />);
      hoverShow("wrap");
      press("Escape");
      fireEvent.pointerOver(el("wrap"));
      advance(2000);
      expect(layer()).toBeNull();
      fireEvent.pointerOver(el("kid"));
      advance(2000);
      expect(layer()).toBeNull();
    });

    it("while focus stays on the trigger, whatever the pointer does over bare page or the trigger", () => {
      render(<Harness2 />);
      keyboardFocus("a");
      press("Escape", el("a"));
      fireEvent.pointerOver(el("plain"));
      advance(2000);
      expect(layer()).toBeNull();
      fireEvent.pointerOver(el("a"));
      advance(2000);
      expect(layer()).toBeNull();
    });

    it("while the pointer is on the trigger and focus comes to it", () => {
      render(<Harness2 />);
      hoverShow("a");
      press("Escape");
      keyboardFocus("a");
      expect(layer()).toBeNull();
    });

    it("and Escape on a dismissed trigger changes nothing", () => {
      render(<Harness2 />);
      hoverShow("a");
      press("Escape");
      press("Escape");
      fireEvent.pointerOver(el("a"));
      advance(2000);
      expect(layer()).toBeNull();
    });

    it("for a map tooltip, until the map hides it with null", () => {
      render(<Harness2 />);
      act(() => showTipAt({ x: 100, y: 100 }, ["A map mark"]));
      press("Escape");
      act(() => showTipAt({ x: 101, y: 100 }, ["A map mark"]));
      expect(layer()).toBeNull();
      act(() => showTipAt(null));
      act(() => showTipAt({ x: 101, y: 100 }, ["A map mark"]));
      expect(layer()?.textContent).toContain("A map mark");
    });
  });

  // The rule for coming back: the trigger is released when neither the pointer nor the focus is on
  // it any more. With both on it, both have to leave.
  describe("shows again once the pointer or the focus has left and come back", () => {
    it("pointer: leaves for bare page, then returns", () => {
      render(<Harness2 />);
      hoverShow("a");
      press("Escape");
      fireEvent.pointerOver(el("plain"));
      advance(1000);
      hoverShow("a");
      expect(layer()?.textContent).toContain("Thing A");
    });

    it("pointer: leaves for another trigger, then returns", () => {
      render(<Harness2 />);
      hoverShow("a");
      press("Escape");
      hoverShow("b");
      expect(layer()?.textContent).toContain("Thing B");
      hoverShow("a");
      expect(layer()?.textContent).toContain("Thing A");
    });

    it("pointer: leaves the window, then returns", () => {
      render(<Harness2 />);
      hoverShow("a");
      press("Escape");
      fireEvent.pointerOut(el("a"));
      hoverShow("a");
      expect(layer()?.textContent).toContain("Thing A");
    });

    it("focus: leaves, then returns", () => {
      render(<Harness2 />);
      keyboardFocus("a");
      press("Escape", el("a"));
      act(() => el("a").blur());
      keyboardFocus("a");
      expect(layer()?.textContent).toContain("Thing A");
    });

    it("mixed: the pointer leaves while focus stays, so it stays dismissed until focus leaves too", () => {
      render(<Harness2 />);
      hoverShow("a");
      keyboardFocus("a");
      press("Escape");
      fireEvent.pointerOver(el("plain"));
      advance(1000);
      hoverShow("a");
      expect(layer()).toBeNull();
      fireEvent.pointerOver(el("plain"));
      act(() => el("a").blur());
      hoverShow("a");
      expect(layer()?.textContent).toContain("Thing A");
    });

    it("a map tooltip: after the map hides it and shows it again", () => {
      render(<Harness2 />);
      act(() => showTipAt({ x: 100, y: 100 }, ["A map mark"]));
      press("Escape");
      act(() => showTipAt(null));
      act(() => showTipAt({ x: 100, y: 100 }, ["A map mark"]));
      expect(layer()?.textContent).toContain("A map mark");
    });
  });
});

describe("TipLayer stays while the pointer moves onto it", () => {
  it("is still there when the pointer crosses the gap and lands on the tooltip", () => {
    render(<Harness />);
    fireEvent.pointerOver(el("a"));
    advance(280);
    // The pointer leaves the trigger over bare page, then lands on the tooltip inside the grace.
    fireEvent.pointerOver(el("plain"));
    advance(100);
    expect(layer()).not.toBeNull();
    fireEvent.pointerOver(layer() as HTMLElement);
    advance(5000);
    expect(layer()?.textContent).toContain("Thing A");
  });

  it("takes the pointer, so it can be reached and read", () => {
    render(<Harness />);
    fireEvent.pointerOver(el("a"));
    advance(280);
    expect((layer() as HTMLElement).style.pointerEvents).not.toBe("none");
  });

  it("goes once the pointer has left both the trigger and the tooltip", () => {
    render(<Harness />);
    fireEvent.pointerOver(el("a"));
    advance(280);
    fireEvent.pointerOver(layer() as HTMLElement);
    fireEvent.pointerOver(el("plain"));
    advance(1000);
    expect(layer()).toBeNull();
  });

  it("goes when the pointer leaves the trigger for bare page and never reaches the tooltip", () => {
    render(<Harness />);
    fireEvent.pointerOver(el("a"));
    advance(280);
    fireEvent.pointerOver(el("plain"));
    advance(1000);
    expect(layer()).toBeNull();
  });

  it("never shows when the pointer leaves before the delay is up", () => {
    render(<Harness />);
    fireEvent.pointerOver(el("a"));
    advance(100);
    fireEvent.pointerOver(el("plain"));
    advance(2000);
    expect(layer()).toBeNull();
  });
});

describe("showTipAt", () => {
  it("shows a tooltip beside a point for a thing that is not an element, and hides on null", () => {
    render(<Harness />);
    act(() => showTipAt({ x: 100, y: 100 }, ["A map mark", "Its value"], "#00ff00"));
    expect(layer()?.textContent).toContain("A map mark");
    act(() => showTipAt(null));
    expect(layer()).toBeNull();
  });

  it("does not take the pointer, so the map keeps its hover", () => {
    render(<Harness />);
    act(() => showTipAt({ x: 100, y: 100 }, ["A map mark"]));
    expect((layer() as HTMLElement).style.pointerEvents).toBe("none");
  });
});

// The layout effect sizes the tooltip with offsetWidth and offsetHeight and the viewport with
// innerWidth, so those are what the test stubs, with the trigger's rect. Expected numbers are
// worked by hand: left = clamp(trigger centre - width / 2, 8, innerWidth - width - 8); top =
// trigger top - height - 8 when that is at least 8, else trigger bottom + 8.
describe("placement", () => {
  const W = 100;
  const H = 40;
  const realInnerWidth = window.innerWidth;

  function place(rect: { left: number; top: number; right: number; bottom: number }) {
    render(<Harness />);
    vi.spyOn(el("a"), "getBoundingClientRect").mockReturnValue({ ...rect, width: 0, height: 0, x: 0, y: 0, toJSON: () => ({}) });
    fireEvent.pointerOver(el("a"));
    advance(280);
    return layer() as HTMLElement;
  }

  beforeEach(() => {
    vi.spyOn(HTMLElement.prototype, "offsetWidth", "get").mockReturnValue(W);
    vi.spyOn(HTMLElement.prototype, "offsetHeight", "get").mockReturnValue(H);
    Object.defineProperty(window, "innerWidth", { value: 1024, configurable: true, writable: true });
  });
  afterEach(() => {
    vi.restoreAllMocks();
    Object.defineProperty(window, "innerWidth", { value: realInnerWidth, configurable: true, writable: true });
  });

  it("is hidden until placed, then visible above the trigger and centred on it when there is room", () => {
    const box = place({ left: 200, right: 260, top: 300, bottom: 320 });
    expect(box.style.visibility).toBe("visible");
    expect(box.style.left).toBe("180px");
    expect(box.style.top).toBe("252px");
  });

  it("goes under the trigger when there is no room above", () => {
    const box = place({ left: 200, right: 260, top: 20, bottom: 40 });
    expect(box.style.visibility).toBe("visible");
    expect(box.style.top).toBe("48px");
  });

  it("keeps the left side on the screen", () => {
    expect(place({ left: 0, right: 20, top: 300, bottom: 320 }).style.left).toBe("8px");
  });

  it("keeps the right side on the screen", () => {
    expect(place({ left: 1004, right: 1024, top: 300, bottom: 320 }).style.left).toBe("916px");
  });
});

describe("a pile of nodes", () => {
  it("names how many lie on the node and lists them", () => {
    render(
      <div>
        <div>
          <button id="n1" data-tip-node="Head one · when" {...tip(["Kind A"])}>
            1
          </button>
          <button id="n2" data-tip-node="Head two · when" {...tip(["Kind B"])}>
            2
          </button>
        </div>
        <TipLayer />
      </div>,
    );
    fireEvent.pointerOver(el("n1"));
    advance(280);
    const text = layer()?.textContent ?? "";
    expect(text).toContain("2 marks at this place");
    expect(text).toContain("Kind A: Head one · when");
    expect(text).toContain("Kind B: Head two · when");
  });
});

// A tooltip of a control inside a menu sits beside the menu (PLAN-tag-menu 4.6): the menu's root names the
// side with data-tip-beside, the tooltip takes the host's edge plus 8 px and the control's middle, and its
// first line wraps in a 300 px box. The expected numbers are worked by hand: size 100 by 40 in a 1024 by
// 768 window, host edges 400 and 608, the row's middle 161.
describe("beside a menu", () => {
  const W = 100;
  const H = 40;
  const realInnerWidth = window.innerWidth;
  const realInnerHeight = window.innerHeight;
  const rect = (r: { left: number; top: number; right: number; bottom: number }): DOMRect =>
    ({ ...r, width: r.right - r.left, height: r.bottom - r.top, x: r.left, y: r.top, toJSON: () => ({}) }) as DOMRect;

  function Menu({ side }: { side?: "left" | "right" }) {
    return (
      <div>
        <div id="host" {...(side ? { "data-tip-beside": side } : {})}>
          <button id="row" {...tip(["Row thing", "Its value"])}>
            Row
          </button>
        </div>
        <button id="far" {...tip(["Far thing"])}>
          Far
        </button>
        <span id="plain">plain</span>
        <TipLayer />
      </div>
    );
  }

  function show(host: { left: number; top: number; right: number; bottom: number }, row: { top: number; bottom: number }) {
    vi.spyOn(el("host"), "getBoundingClientRect").mockReturnValue(rect(host));
    vi.spyOn(el("row"), "getBoundingClientRect").mockReturnValue(rect({ left: host.left + 5, right: host.right - 5, ...row }));
    const matches = vi.spyOn(el("row"), "matches").mockImplementation((s: string) => s === ":focus-visible");
    act(() => el("row").focus());
    matches.mockRestore();
    return layer() as HTMLElement;
  }
  const HOST = { left: 400, right: 608, top: 100, bottom: 300 };
  const ROW = { top: 150, bottom: 172 };

  beforeEach(() => {
    vi.spyOn(HTMLElement.prototype, "offsetWidth", "get").mockReturnValue(W);
    vi.spyOn(HTMLElement.prototype, "offsetHeight", "get").mockReturnValue(H);
    Object.defineProperty(window, "innerWidth", { value: 1024, configurable: true, writable: true });
    Object.defineProperty(window, "innerHeight", { value: 768, configurable: true, writable: true });
  });
  afterEach(() => {
    vi.restoreAllMocks();
    Object.defineProperty(window, "innerWidth", { value: realInnerWidth, configurable: true, writable: true });
    Object.defineProperty(window, "innerHeight", { value: realInnerHeight, configurable: true, writable: true });
  });

  it("right: sits at the host's right edge plus 8, its middle level with the control's middle (616, 161 - 20 = 141)", () => {
    render(<Menu side="right" />);
    const box = show(HOST, ROW);
    expect(box.textContent).toContain("Row thing");
    expect(box.style.left).toBe("616px");
    expect(box.style.top).toBe("141px");
    expect(box.style.visibility).toBe("visible");
  });

  it("left: sits left of the host (400 - 100 - 8 = 292)", () => {
    render(<Menu side="left" />);
    expect(show(HOST, ROW).style.left).toBe("292px");
  });

  it("right with no room goes left (host right 980: 988 + 100 is past 1016, so 770 - 100 - 8 = 662)", () => {
    render(<Menu side="right" />);
    expect(show({ left: 770, right: 980, top: 100, bottom: 300 }, ROW).style.left).toBe("662px");
  });

  it("left with no room goes right (host left 50: -58 is off the screen, so 258 + 8 = 266)", () => {
    render(<Menu side="left" />);
    expect(show({ left: 50, right: 258, top: 100, bottom: 300 }, ROW).style.left).toBe("266px");
  });

  it("keeps its middle's place inside the screen, 8 px from the top and the foot", () => {
    const { unmount } = render(<Menu side="right" />);
    expect(show(HOST, { top: 0, bottom: 20 }).style.top).toBe("8px");
    unmount();
    render(<Menu side="right" />);
    expect(show(HOST, { top: 750, bottom: 770 }).style.top).toBe("720px");
  });

  it("wraps its first line and caps its box at 300 chrome px", () => {
    render(<Menu side="right" />);
    const box = show(HOST, ROW);
    const first = box.querySelector("[data-tip-line]") as HTMLElement;
    expect(first.className).toContain("whitespace-normal");
    expect(first.className).not.toContain("whitespace-nowrap");
    expect((box.querySelector(".chrome-zoom") as HTMLElement).style.maxWidth).toBe("300px");
  });

  it("a tooltip of an element with no such host is placed as today and keeps its single line", () => {
    render(<Menu />);
    vi.spyOn(el("far"), "getBoundingClientRect").mockReturnValue(rect({ left: 200, right: 260, top: 300, bottom: 320 }));
    fireEvent.pointerOver(el("far"));
    advance(280);
    const box = layer() as HTMLElement;
    expect(box.style.left).toBe("180px");
    expect(box.style.top).toBe("252px");
    expect((box.querySelector("[data-tip-line]") as HTMLElement).className).toContain("whitespace-nowrap");
    expect((box.querySelector(".chrome-zoom") as HTMLElement).style.maxWidth).toBe("340px");
  });

  it("a tooltip the map places goes back to the single line after a beside one", () => {
    render(<Menu side="right" />);
    show(HOST, ROW);
    act(() => showTipAt({ x: 100, y: 100 }, ["A map mark"]));
    const first = (layer() as HTMLElement).querySelector("[data-tip-line]") as HTMLElement;
    expect(first.className).toContain("whitespace-nowrap");
  });
});

// `showTipOn`: the layer reads a trigger's words only when it shows one and hides on a press, so a tip
// changed under a pressed control is not seen until the menu asks for it.
describe("showTipOn", () => {
  it("shows the changed words of a control at once, after a press had hidden its tip", () => {
    render(<Harness />);
    fireEvent.pointerOver(el("a"));
    advance(280);
    fireEvent.pointerDown(el("a"));
    expect(layer()).toBeNull();
    el("a").setAttribute("data-tip", "Thing A\nA new line");
    act(() => showTipOn(el("a")));
    expect(layer()?.textContent).toContain("A new line");
  });

  it("holds the tip with the focus when the control has it, so the pointer moving over bare page does not take it", () => {
    render(<Harness />);
    act(() => el("a").focus());
    act(() => showTipOn(el("a")));
    expect(layer()?.textContent).toContain("Thing A");
    fireEvent.pointerOver(el("plain"));
    advance(1000);
    expect(layer()?.textContent).toContain("Thing A");
  });

  it("with the control not focused, the pointer leaving takes it away as for any hover tip", () => {
    render(<Harness />);
    act(() => showTipOn(el("a")));
    expect(layer()?.textContent).toContain("Thing A");
    fireEvent.pointerOver(el("plain"));
    advance(1000);
    expect(layer()).toBeNull();
  });

  it("throws nothing and shows nothing with no layer mounted, before or after one was", () => {
    const loose = document.createElement("button");
    for (const [k, v] of Object.entries(tip(["Loose thing"]))) loose.setAttribute(k, v);
    document.body.append(loose);
    try {
      expect(() => showTipOn(loose)).not.toThrow();
      expect(layer()).toBeNull();
      const { unmount } = render(<TipLayer />);
      unmount();
      expect(() => showTipOn(loose)).not.toThrow();
      expect(layer()).toBeNull();
    } finally {
      loose.remove();
    }
  });
});

describe("the layer's source", () => {
  const here = dirname(fileURLToPath(import.meta.url));
  const source = readFileSync(resolve(here, "Tip.tsx"), "utf8");

  // Answer 7 reverses the old pin that said the layer had no key handler. The layer has one, for
  // Escape and for nothing else: one keydown listener, taken off again, no other key event, and
  // no stopPropagation or preventDefault so the menus' own Escape handlers still run.
  it("registers exactly one key handler, a keydown listener that is removed again", () => {
    expect(source.match(/addEventListener\(\s*"keydown"/g) ?? []).toHaveLength(1);
    expect(source.match(/removeEventListener\(\s*"keydown"/g) ?? []).toHaveLength(1);
    expect(source).not.toMatch(/["']key(up|press)["']|onKey(Down|Up|Press)\b/);
  });

  it("reads one key, Escape, and holds back no other handler", () => {
    expect(source.match(/\.key\s*[=!]==?\s*"/g) ?? []).toHaveLength(1);
    expect(source).toMatch(/\.key\s*!==\s*"Escape"|\.key\s*===\s*"Escape"/);
    expect(source).not.toMatch(/stopPropagation|stopImmediatePropagation|preventDefault/);
  });

  it("holds no time zone literal and no workshop switch", () => {
    expect(source).not.toContain("America/Chicago");
    expect(source).not.toMatch(/WS\.tips|workshop/i);
  });
});

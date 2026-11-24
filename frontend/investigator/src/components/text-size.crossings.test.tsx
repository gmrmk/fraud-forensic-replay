// The crossings between window pixels and the chrome's pixels (design 2026-11-19-text-size.md,
// section 8). The browser is the final check; these hold what a DOM without layout can hold: where
// the zoom class sits, where it must not sit, and that each crossing goes through the one helper.
import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { act, fireEvent, render, renderHook } from "@testing-library/react";
import { useRef, type Ref } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TipLayer, showTipAt, tip } from "./ui/Tip";
import { WindowFrame } from "./pivot/WindowFrame";
import { CaseBottomStack } from "./CaseBottomStack";
import { useZoomGestures } from "../lib/use-zoom-gestures";
import { usePlayhead } from "../store/playhead";
import { useTextSize } from "../store/text-size";

vi.mock("./MapCredit", () => ({ MapCredit: () => <i data-testid="credit" /> }));
vi.mock("./TickerBar", () => ({ TickerBar: () => <i data-testid="ticker" /> }));
vi.mock("./Timeline", () => ({ Timeline: () => <i data-testid="timeline" /> }));

const here = dirname(fileURLToPath(import.meta.url));
const SRC = resolve(here, "..");
const read = (rel: string): string => readFileSync(resolve(SRC, rel), "utf8");

beforeEach(() => {
  useTextSize.getState().setSize(100);
  localStorage.clear();
});
afterEach(() => {
  useTextSize.getState().setSize(100);
  localStorage.clear();
});

describe("the stylesheet", () => {
  const css = read("index.css");
  it("holds the factor, the zoom class and the two divided forms once", () => {
    expect(css).toMatch(/--ts:\s*1\s*;/);
    expect(css).toMatch(/\.chrome-zoom\s*\{[^}]*zoom:\s*var\(--ts\)/);
    expect(css).toMatch(/--vh-c:[\s]*calc\(100vh\s*\/\s*var\(--ts\)\)/);
    expect(css).toMatch(/--bottom-stack-c:[\s]*calc\(var\(--bottom-stack-h\)\s*\/\s*var\(--ts\)\)/);
  });
  it("writes no new font-size", () => {
    const block = css.slice(css.indexOf(".chrome-zoom"), css.indexOf(".chrome-zoom") + 120);
    expect(block).not.toMatch(/font-size/);
  });
});

describe("each chrome root takes the zoom class", () => {
  const roots: [string, number][] = [
    ["App.tsx", 1], // the top row (title card and menu group, one root)
    ["components/Inspector.tsx", 1],
    ["components/NarrativeLog.tsx", 1],
    ["components/match/MatchesTable.tsx", 2],
    ["components/DataErrors.tsx", 1],
    ["components/StalenessBanner.tsx", 1],
  ];
  for (const [file, n] of roots) {
    it(`${file} names the class ${n} time${n === 1 ? "" : "s"}`, () => {
      expect(read(file).match(/chrome-zoom/g)?.length ?? 0).toBe(n);
    });
  }
});

describe("a viewport length in the chrome goes through --vh-c, and the stack through --bottom-stack-c", () => {
  const chrome = [
    "components/Inspector.tsx",
    "components/NarrativeLog.tsx",
    "components/ThemeSwitcher.tsx",
    "components/TopMenu.tsx",
    "components/match/MatchesTable.tsx",
    "components/pivot/WindowFrame.tsx",
  ];
  for (const file of chrome) {
    it(`${file} writes no bare 100vh, 60vh, 40vh or --bottom-stack-h`, () => {
      const src = read(file).replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
      expect(src).not.toMatch(/\b(100|60|40)vh\b/);
      expect(src).not.toMatch(/--bottom-stack-h/);
    });
  }
  it("the Inspector's height cap reads both", () => {
    const src = read("components/Inspector.tsx");
    expect(src).toContain("var(--vh-c)");
    expect(src).toContain("var(--bottom-stack-c)");
  });
});

describe("one copy of the arithmetic", () => {
  const files: string[] = [];
  const walk = (dir: string): void => {
    for (const name of readdirSync(dir)) {
      const p = join(dir, name);
      if (statSync(p).isDirectory()) walk(p);
      else if (/\.(ts|tsx)$/.test(name) && !/\.test\./.test(name)) files.push(p);
    }
  };
  walk(SRC);
  it("names the factor function only in the two files that hold it", () => {
    const users = files
      .filter((f) => /\btextFactor\b/.test(readFileSync(f, "utf8")))
      .map((f) => relative(SRC, f).replace(/\\/g, "/"))
      .sort();
    expect(users).toEqual(["lib/text-size.ts", "store/text-size.ts"]);
  });
  it("reads the custom property --ts in no script other than the store that writes it", () => {
    const hits = files
      .filter((f) => !/store\/text-size\.ts$/.test(f.replace(/\\/g, "/")))
      .filter((f) => /["'`(]--ts\b/.test(readFileSync(f, "utf8").replace(/\/\/.*$/gm, "")));
    expect(hits.map((f) => relative(SRC, f))).toEqual([]);
  });
  it("writes no step as a bare number outside the model (a hand-made scale of the chrome)", () => {
    const hits = files
      .filter((f) => !/lib\/text-size\.ts$|lib\/tooltip-words\/text-size\.ts$/.test(f.replace(/\\/g, "/")))
      .filter((f) => /[/*]\s*1\.(12|25)\b/.test(readFileSync(f, "utf8").replace(/\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "")));
    expect(hits.map((f) => relative(SRC, f))).toEqual([]);
  });
  it("shares no step with the share link", () => {
    expect(read("lib/share-link.ts")).not.toMatch(/textsize|text-size|TEXT_SIZE/i);
  });
});

describe("the bottom stack", () => {
  it("measures an unzoomed shell and zooms the content inside it", () => {
    const ref: Ref<HTMLDivElement> = { current: null };
    const { container } = render(
      <CaseBottomStack
        stackRef={ref}
        tickerItems={[]}
        transactions={[]}
        logins={[]}
        accountEvents={[]}
        transfers={[]}
        genericEntities={[]}
        annotations={[]}
      />,
    );
    const shell = ref.current as HTMLDivElement;
    expect(shell).toBe(container.firstElementChild);
    expect(shell.classList.contains("chrome-zoom")).toBe(false);
    const inner = shell.firstElementChild as HTMLElement;
    expect(inner.classList.contains("chrome-zoom")).toBe(true);
    expect(inner.querySelectorAll(".chrome-zoom")).toHaveLength(0);
    expect(inner.querySelector("[data-testid=timeline]")).not.toBeNull();
  });
});

describe("the tooltip layer", () => {
  const layer = (): HTMLElement => document.querySelector("[data-tip-layer]") as HTMLElement;
  afterEach(() => act(() => void showTipAt(null)));

  it("places an unzoomed shell in window pixels and zooms the content, with the width cap inside", () => {
    render(<TipLayer />);
    act(() => showTipAt({ x: 300, y: 200 }, ["Thing", "A value"]));
    expect(layer().classList.contains("chrome-zoom")).toBe(false);
    expect(layer().style.maxWidth).toBe("");
    const inner = layer().firstElementChild as HTMLElement;
    expect(inner.classList.contains("chrome-zoom")).toBe(true);
    expect(inner.style.maxWidth).toBe("340px");
    expect(layer().querySelectorAll(".chrome-zoom")).toHaveLength(1);
  });

  it("counts a pile by the reach at the step now held: 5 px of chrome is 6.25 px of window at 125", () => {
    vi.useFakeTimers();
    try {
      const rectAt = (x: number): (() => DOMRect) => () =>
        ({ left: x - 6, right: x + 6, top: 94, bottom: 106, width: 12, height: 12, x: x - 6, y: 94, toJSON: () => ({}) }) as DOMRect;
      const pileLine = (size: 100 | 125): string | undefined => {
        useTextSize.getState().setSize(size);
        const { container, unmount } = render(
          <div>
            <button id="p1" {...tip(["Node", "one"])} data-tip-node="a" />
            <button id="p2" {...tip(["Node", "two"])} data-tip-node="b" />
            <TipLayer />
          </div>,
        );
        const [a, b] = [container.querySelector("#p1") as HTMLElement, container.querySelector("#p2") as HTMLElement];
        a.getBoundingClientRect = rectAt(100);
        b.getBoundingClientRect = rectAt(106); // 6 px apart in window pixels
        fireEvent.pointerOver(a);
        act(() => void vi.advanceTimersByTime(300));
        const first = document.querySelector("[data-tip-line]")?.textContent ?? undefined;
        act(() => void showTipAt(null));
        unmount();
        return first;
      };
      expect(pileLine(100)).not.toBe("2 marks at this place");
      expect(pileLine(125)).toBe("2 marks at this place");
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("the window frame", () => {
  const frame = (y: number) =>
    render(
      <WindowFrame
        id="w1"
        title="Detail"
        anchorScreen={{ x: 40, y }}
        z={20}
        accent="#ff0000"
        pinned={false}
        collapsed={false}
        flagged={false}
        canFlag={false}
      >
        <div>body</div>
      </WindowFrame>,
    );

  it("keeps its shell in window pixels and zooms the box inside it", () => {
    const { container } = frame(100);
    const shell = container.querySelector("[data-window-frame]") as HTMLElement;
    expect(shell.classList.contains("chrome-zoom")).toBe(false);
    expect(shell.style.left).toBe("40px");
    expect(shell.style.top).toBe("100px");
    expect(shell.querySelectorAll(".chrome-zoom")).toHaveLength(1);
    expect(shell.firstElementChild?.classList.contains("chrome-zoom")).toBe(true);
  });

  it("caps the body by the window's top divided by the factor, in the chrome's own pixels", () => {
    const body = (c: HTMLElement): string => (c.querySelector("[data-window-body]") as HTMLElement).style.maxHeight;
    const a = frame(200);
    const at100 = body(a.container);
    a.unmount();
    expect(at100).toContain("var(--vh-c)");
    expect(at100).toContain("246px"); // the top (200), the 34 px bar and the 12 px margin
    useTextSize.getState().setSize(125);
    const b = frame(200);
    // 200 window px is 160 chrome px at 125; the bar and the margin are chrome px already.
    expect(body(b.container)).toContain("206px");
    b.unmount();
  });
});

describe("a wheel over the plot", () => {
  beforeEach(() => {
    window.requestAnimationFrame = (cb: FrameRequestCallback): number => {
      cb(performance.now());
      return 1;
    };
    window.cancelAnimationFrame = () => {};
  });

  const windowAfterWheel = (size: 100 | 125, clientX: number, width: number, inset: number): [number, number] => {
    useTextSize.getState().setSize(size);
    usePlayhead.setState({ minTime: 0, maxTime: 10_000, windowMin: 0, windowMax: 10_000, playhead: 5_000, isPlaying: false, isScrubbing: false });
    const el = document.createElement("div");
    document.body.appendChild(el);
    el.getBoundingClientRect = () => ({ left: 0, top: 0, right: width, bottom: 100, width, height: 100, x: 0, y: 0, toJSON: () => ({}) }) as DOMRect;
    const { unmount } = renderHook(() => {
      const ref = useRef<HTMLDivElement>(el);
      useZoomGestures(ref, inset);
    });
    const e = new WheelEvent("wheel", { deltaY: -100, bubbles: true, cancelable: true });
    Object.defineProperty(e, "clientX", { value: clientX });
    act(() => void el.dispatchEvent(e));
    const s = usePlayhead.getState();
    unmount();
    el.remove();
    return [s.windowMin, s.windowMax];
  };

  it("treats the name gutter as chrome pixels: at 125 it is 1.25 times as wide in window pixels", () => {
    const GUTTER = 148;
    // At 100: the plot is 1000 px after a 148 px gutter, the pointer 300 px into the plot.
    const base = windowAfterWheel(100, GUTTER + 300, GUTTER + 1000, GUTTER);
    // At 125 the gutter is drawn 185 px wide; the same point of the plot, drawn 1000 px wide, is the same ratio.
    const scaled = windowAfterWheel(125, GUTTER * 1.25 + 300, GUTTER * 1.25 + 1000, GUTTER);
    expect(scaled[0]).toBeCloseTo(base[0], 6);
    expect(scaled[1]).toBeCloseTo(base[1], 6);
  });
});

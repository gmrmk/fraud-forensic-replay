import { afterEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { useEffect, useRef, type ComponentProps } from "react";
import { MAX_RECOVERIES, MapRecovery, RecoveringGlobeMap } from "./MapRecovery";

/**
 * MapRecovery - a map failure rebuilds the map instead of blanking the app.
 * The real cause is a WebGL
 * context that the browser takes away; that cannot happen in this DOM, so the tests throw from
 * a stand-in map and dispatch the browser's own event. The built app is checked in a browser.
 */

// GlobeMap builds a WebGL map. A stand-in keeps the wiring test about the wiring.
const seen = vi.hoisted(() => ({ props: [] as Array<Record<string, unknown>> }));
vi.mock("./GlobeMap", () => ({
  GlobeMap: (props: Record<string, unknown>) => {
    seen.props.push(props);
    return <canvas data-testid="map-canvas" />;
  },
}));

/** React reports an error it caught; keep it out of the test output. */
function quiet(): void {
  vi.spyOn(console, "error").mockImplementation(() => {});
}

/** The browser fires this on the canvas; it does not bubble. */
function loseContext(canvas: Element): void {
  act(() => {
    canvas.dispatchEvent(new Event("webglcontextlost"));
  });
}

afterEach(() => {
  vi.restoreAllMocks();
  seen.props.length = 0;
});

describe("MapRecovery", () => {
  it("renders the map under generation 0, in a host that adds no box", () => {
    const onMapLost = vi.fn();
    const { container } = render(
      <MapRecovery onMapLost={onMapLost}>{(g) => <i data-testid="map">{g}</i>}</MapRecovery>,
    );
    expect(screen.getByTestId("map").textContent).toBe("0");
    expect((container.firstElementChild as HTMLElement).className).toBe("contents");
    expect(onMapLost).not.toHaveBeenCalled();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("mounts the map again when its tree throws once, and tells the app the map is gone", () => {
    quiet();
    const onMapLost = vi.fn();
    let failures = 1;
    function Flaky({ g }: { g: number }) {
      // Where the app's map writes live: an effect. Without a boundary this unmounts the app.
      useEffect(() => {
        if (failures > 0) {
          failures -= 1;
          throw new TypeError("Cannot read properties of null (reading 'getSource')");
        }
      }, []);
      return <i data-testid="map">{g}</i>;
    }
    render(<MapRecovery onMapLost={onMapLost}>{(g) => <Flaky g={g} />}</MapRecovery>);
    expect(screen.getByTestId("map").textContent).toBe("1");
    expect(onMapLost).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("stops after MAX_RECOVERIES when the map's tree always throws: it cannot loop", () => {
    quiet();
    const onMapLost = vi.fn();
    const generations: number[] = [];
    function Broken({ g }: { g: number }) {
      generations.push(g);
      // For this test alone: without the cap the rebuilds never end, and a test that spins
      // cannot fail. Past any honest count it renders, so the assertions below can.
      if (generations.length > 10 * (MAX_RECOVERIES + 1)) return <i data-testid="runaway" />;
      throw new Error("always");
    }
    const view = render(
      <MapRecovery onMapLost={onMapLost}>{(g) => <Broken g={g} />}</MapRecovery>,
    );
    // The first mount and MAX_RECOVERIES rebuilds, then no more.
    expect([...new Set(generations)]).toEqual(Array.from({ length: MAX_RECOVERIES + 1 }, (_, i) => i));
    expect(onMapLost).toHaveBeenCalledTimes(MAX_RECOVERIES + 1);
    const mounts = generations.length;
    expect(screen.getByRole("alert").textContent).toMatch(/map stopped/i);
    expect(screen.getByRole("button", { name: /reload page/i })).toBeTruthy();
    // A re-render of the parent does not start it again.
    view.rerender(<MapRecovery onMapLost={onMapLost}>{(g) => <Broken g={g} />}</MapRecovery>);
    expect(generations).toHaveLength(mounts);
    expect(screen.getByRole("alert")).toBeTruthy();
  });

  it("mounts a new map when the canvas loses its WebGL context", () => {
    const onMapLost = vi.fn();
    const mounts: number[] = [];
    const unmounts: number[] = [];
    function StandIn({ g }: { g: number }) {
      useEffect(() => {
        mounts.push(g);
        return () => {
          unmounts.push(g);
        };
      }, [g]);
      return <canvas data-testid="canvas" data-g={g} />;
    }
    render(<MapRecovery onMapLost={onMapLost}>{(g) => <StandIn g={g} />}</MapRecovery>);
    const first = screen.getByTestId("canvas");
    loseContext(first);
    const second = screen.getByTestId("canvas");
    expect(second).not.toBe(first);
    expect(second.getAttribute("data-g")).toBe("1");
    expect(mounts).toEqual([0, 1]);
    expect(unmounts).toEqual([0]);
    expect(onMapLost).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("allows MAX_RECOVERIES lost contexts, then shows the label and a button that reloads the page", () => {
    const onMapLost = vi.fn();
    render(<MapRecovery onMapLost={onMapLost}>{() => <canvas data-testid="canvas" />}</MapRecovery>);
    for (let i = 0; i < MAX_RECOVERIES; i++) loseContext(screen.getByTestId("canvas"));
    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.getByTestId("canvas")).toBeTruthy();

    loseContext(screen.getByTestId("canvas"));
    expect(screen.queryByTestId("canvas")).toBeNull();
    expect(screen.getByRole("alert").textContent).toMatch(/map stopped/i);
    expect(onMapLost).toHaveBeenCalledTimes(MAX_RECOVERIES + 1);

    const reload = vi.fn();
    vi.stubGlobal("location", { ...window.location, reload });
    fireEvent.click(screen.getByRole("button", { name: /reload page/i }));
    expect(reload).toHaveBeenCalledTimes(1);
    vi.unstubAllGlobals();
  });

  it("counts one recovery when one dead map is reported twice before it is mounted again", () => {
    render(
      <MapRecovery onMapLost={() => {}}>{(g) => <canvas data-testid="canvas" data-g={g} />}</MapRecovery>,
    );
    const canvas = screen.getByTestId("canvas");
    act(() => {
      canvas.dispatchEvent(new Event("webglcontextlost"));
      canvas.dispatchEvent(new Event("webglcontextlost"));
    });
    expect(screen.getByTestId("canvas").getAttribute("data-g")).toBe("1");
    // The rest of the allowance is still there: MAX_RECOVERIES - 1 more, then the fallback.
    for (let i = 1; i < MAX_RECOVERIES; i++) loseContext(screen.getByTestId("canvas"));
    expect(screen.queryByRole("alert")).toBeNull();
    loseContext(screen.getByTestId("canvas"));
    expect(screen.getByRole("alert")).toBeTruthy();
  });

  it("counts one recovery when a lost context is followed at once by a write that throws", () => {
    quiet();
    let fail = true;
    function LosesThenThrows({ g }: { g: number }) {
      const ref = useRef<HTMLCanvasElement>(null);
      // What playback can do in the built app: the context goes, and a write to the dead map
      // throws before React has mounted the next one.
      useEffect(() => {
        if (!fail) return;
        fail = false;
        ref.current?.dispatchEvent(new Event("webglcontextlost"));
        throw new TypeError("Cannot read properties of null (reading 'getSource')");
      }, []);
      return <canvas ref={ref} data-testid="canvas" data-g={g} />;
    }
    render(<MapRecovery onMapLost={() => {}}>{(g) => <LosesThenThrows g={g} />}</MapRecovery>);
    // Mounted again (the second report must not leave the map's place empty), and once.
    expect(screen.getByTestId("canvas").getAttribute("data-g")).toBe("1");
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("does not count a throw from the dead map's own cleanup", () => {
    quiet();
    let thrown = 0;
    function ThrowsOnUnmount({ g }: { g: number }) {
      useEffect(
        () => () => {
          // A cleanup that writes to the map it is leaving, whose style is gone. It lands above
          // that map's own boundary; uncaught, it would unmount the app.
          if (g === 0 && thrown === 0) {
            thrown += 1;
            throw new TypeError("Cannot read properties of null (reading 'getLayer')");
          }
        },
        [g],
      );
      return <canvas data-testid="canvas" data-g={g} />;
    }
    render(<MapRecovery onMapLost={() => {}}>{(g) => <ThrowsOnUnmount g={g} />}</MapRecovery>);
    loseContext(screen.getByTestId("canvas"));
    expect(thrown).toBe(1);
    expect(screen.getByTestId("canvas").getAttribute("data-g")).toBe("1");
    // One failure, one recovery: MAX_RECOVERIES - 1 are left, then the fallback.
    for (let i = 1; i < MAX_RECOVERIES; i++) loseContext(screen.getByTestId("canvas"));
    expect(screen.queryByRole("alert")).toBeNull();
    loseContext(screen.getByTestId("canvas"));
    expect(screen.getByRole("alert")).toBeTruthy();
  });

  it("stops when a map's cleanup throws on every unmount: the outer catch cannot loop", () => {
    quiet();
    const onMapLost = vi.fn();
    let mounts = 0;
    function AlwaysThrowsOnUnmount({ g }: { g: number }) {
      useEffect(() => {
        mounts += 1;
        return () => {
          throw new TypeError("Cannot read properties of null (reading 'getLayer')");
        };
      }, []);
      return <canvas data-testid="canvas" data-g={g} />;
    }
    render(<MapRecovery onMapLost={onMapLost}>{(g) => <AlwaysThrowsOnUnmount g={g} />}</MapRecovery>);
    // One lost context. Each throw is caught above the map, React mounts the map again, and
    // that unmount throws again: unbounded, it ran until React itself gave up.
    loseContext(screen.getByTestId("canvas"));
    expect(screen.getByRole("alert").textContent).toMatch(/map stopped/i);
    expect(screen.queryByTestId("canvas")).toBeNull();
    // The first map, its rebuild, and the mount React makes after each caught throw: the
    // MAX_RECOVERIES that are let by, and the one that stops it.
    expect(mounts).toBe(2 + MAX_RECOVERIES + 1);
    // Once for the lost context, once when the catch gives the map up.
    expect(onMapLost).toHaveBeenCalledTimes(2);
  });

  it("draws the reload control as a button: a square edge in the dim token, not a bare word or a pill", () => {
    render(<MapRecovery onMapLost={() => {}}>{() => <canvas data-testid="canvas" />}</MapRecovery>);
    for (let i = 0; i <= MAX_RECOVERIES; i++) loseContext(screen.getByTestId("canvas"));
    const classes = screen.getByRole("button", { name: /reload page/i }).className.split(/\s+/);
    expect(classes).toContain("border");
    expect(classes).toContain("border-dim");
    // The 2 px corner. In this scale rounded-sm is 9 px, which on a 25 px control is a capsule.
    expect(classes.filter((c) => c.startsWith("rounded"))).toEqual(["rounded-xs"]);
  });

  it("stops listening when it unmounts", () => {
    const onMapLost = vi.fn();
    const view = render(
      <MapRecovery onMapLost={onMapLost}>{() => <canvas data-testid="canvas" />}</MapRecovery>,
    );
    const canvas = screen.getByTestId("canvas");
    view.unmount();
    canvas.dispatchEvent(new Event("webglcontextlost"));
    expect(onMapLost).not.toHaveBeenCalled();
  });
});

describe("RecoveringGlobeMap", () => {
  const props = { onMapReady: vi.fn(), scenarioHome: undefined } as unknown as ComponentProps<
    typeof RecoveringGlobeMap
  >;

  it("hands GlobeMap its props unchanged", () => {
    render(<RecoveringGlobeMap {...props} />);
    expect(screen.getByTestId("map-canvas")).toBeTruthy();
    expect(seen.props[0].onMapReady).toBe(props.onMapReady);
    expect("scenarioHome" in seen.props[0]).toBe(true);
  });

  it("clears the app's map and mounts a new GlobeMap when the context is lost", () => {
    const onMapReady = vi.fn();
    render(<RecoveringGlobeMap {...props} onMapReady={onMapReady} />);
    const first = screen.getByTestId("map-canvas");
    loseContext(first);
    expect(onMapReady).toHaveBeenCalledTimes(1);
    expect(onMapReady).toHaveBeenCalledWith(null);
    expect(screen.getByTestId("map-canvas")).not.toBe(first);
  });

  it("recovers without an onMapReady callback", () => {
    const { onMapReady: _unused, ...rest } = props;
    void _unused;
    render(<RecoveringGlobeMap {...(rest as ComponentProps<typeof RecoveringGlobeMap>)} />);
    const first = screen.getByTestId("map-canvas");
    expect(() => loseContext(first)).not.toThrow();
    expect(screen.getByTestId("map-canvas")).not.toBe(first);
  });
});

/**
 * The investigator's paths on the globe: the plate (StopPlate), the maplibre Marker that carries it
 * (PlateMarker) and the layer that draws the saved paths and the draft (CustomPathGlobeLayer).
 * The map is a fake and the Marker a recorder, so these tests say what the layer asks of the map and
 * what it renders, not what the real globe draws.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, screen } from "@testing-library/react";
import type maplibregl from "maplibre-gl";
import { StopPlate } from "./StopPlate";
import { PlateMarker } from "./PlateMarker";
import { PLATE as GEOMETRY } from "./path-geometry";
import { plateLabel } from "../../lib/tooltip-words/paths";

const live = vi.hoisted(() => ({ markers: [] as { el: HTMLElement; opts: Record<string, unknown>; lngLat: [number, number] | null }[] }));

vi.mock("maplibre-gl", () => {
  class Marker {
    el: HTMLElement;
    opts: Record<string, unknown>;
    lngLat: [number, number] | null = null;
    constructor(opts: { element: HTMLElement }) {
      this.el = opts.element;
      this.opts = opts;
    }
    setLngLat(ll: [number, number]) {
      this.lngLat = ll;
      return this;
    }
    addTo(map: { getCanvasContainer(): HTMLElement }) {
      map.getCanvasContainer().appendChild(this.el);
      live.markers.push(this);
      return this;
    }
    remove() {
      this.el.remove();
      live.markers = live.markers.filter((m) => m !== this);
      return this;
    }
  }
  return { default: { Marker }, Marker };
});

function fakeContainerMap() {
  const container = document.createElement("div");
  document.body.appendChild(container);
  return { container, map: { getCanvasContainer: () => container } as unknown as maplibregl.Map };
}

beforeEach(() => {
  document.body.innerHTML = "";
  live.markers = [];
});
afterEach(() => {
  document.body.innerHTML = "";
});

describe("StopPlate", () => {
  it("prints its number, and the numbers of a merged plate joined by the middle dot", () => {
    const { container, rerender } = render(<StopPlate label={plateLabel([2])} lens={false} size="globe" />);
    expect(container.textContent).toBe("2");
    rerender(<StopPlate label={plateLabel([1, 3])} lens={false} size="globe" />);
    expect(container.textContent).toBe(`1${String.fromCodePoint(0xb7)}3`);
  });

  it("carries the lens only when asked, 9 px on the globe and 7 px on the Timeline", () => {
    const { container, rerender } = render(<StopPlate label="1" lens={false} size="globe" />);
    expect(container.querySelector('[data-glyph="lens"]')).toBeNull();
    rerender(<StopPlate label="1" lens size="globe" />);
    const lens = container.querySelector('[data-glyph="lens"]');
    expect(lens?.getAttribute("width")).toBe(String(GEOMETRY.globe.lens));
    rerender(<StopPlate label="1" lens size="timeline" />);
    expect(container.querySelector('[data-glyph="lens"]')?.getAttribute("width")).toBe(String(GEOMETRY.timeline.lens));
  });

  it("is mono 9 px on the globe and 8 px on the Timeline, square, on the plate ground with a 1 px ink border", () => {
    const { container, rerender } = render(<StopPlate label="1" lens={false} size="globe" />);
    const globe = container.firstElementChild as HTMLElement;
    expect(globe.className).toContain("font-mono");
    expect(globe.className).toContain("text-[9px]");
    expect(globe.className).toContain("font-semibold");
    expect(globe.className).toContain("tabular-nums");
    expect(globe.className).not.toMatch(/rounded/);
    expect(globe.style.borderWidth).toBe("1px");
    expect(globe.style.borderStyle).toBe("solid");
    expect(globe.style.borderColor).toBe("var(--text)");
    expect(globe.style.color).toBe("var(--text)");
    expect(globe.style.height).toBe(`${GEOMETRY.globe.height}px`);
    expect(globe.style.minWidth).toBe(`${GEOMETRY.globe.minWidth}px`);
    rerender(<StopPlate label="1" lens={false} size="timeline" />);
    const timeline = container.firstElementChild as HTMLElement;
    expect(timeline.className).toContain("text-[8px]");
    expect(timeline.className).not.toContain("text-[9px]");
    expect(timeline.style.height).toBe(`${GEOMETRY.timeline.size}px`);
    expect(timeline.style.minWidth).toBe(`${GEOMETRY.timeline.size}px`);
  });

  it("takes an opacity only when given one", () => {
    const { container, rerender } = render(<StopPlate label="1" lens={false} size="globe" />);
    expect((container.firstElementChild as HTMLElement).style.opacity).toBe("");
    rerender(<StopPlate label="1" lens={false} size="globe" opacity={0.45} />);
    expect((container.firstElementChild as HTMLElement).style.opacity).toBe("0.45");
  });
});

describe("PlateMarker", () => {
  it("creates a Marker anchored right at the given offset, hidden when covered, at the point", () => {
    const { map } = fakeContainerMap();
    render(
      <PlateMarker map={map} lng={-95.5} lat={29.7} offset={[-12, 15]} name="Stop 1 of 2, Path 1" lines={["Stop 1 of 2, Path 1"]} onActivate={() => {}}>
        <StopPlate label="1" lens={false} size="globe" />
      </PlateMarker>,
    );
    expect(live.markers).toHaveLength(1);
    expect(live.markers[0].opts).toMatchObject({ anchor: "right", offset: [-12, 15], opacityWhenCovered: 0 });
    expect(live.markers[0].lngLat).toEqual([-95.5, 29.7]);
  });

  it("is a button with the given name, holding the plate", () => {
    const { map } = fakeContainerMap();
    render(
      <PlateMarker
        map={map}
        lng={0}
        lat={0}
        offset={[-12, 0]}
        name="Stop 1 of 2, Path 1. Corner"
        lines={["Stop 1 of 2, Path 1", "Corner"]}
        onActivate={() => {}}
      >
        <StopPlate label="7" lens={false} size="globe" />
      </PlateMarker>,
    );
    const el = live.markers[0].el;
    expect(el.tagName).toBe("BUTTON");
    expect(el.getAttribute("type")).toBe("button");
    expect(el.getAttribute("aria-label")).toBe("Stop 1 of 2, Path 1. Corner");
    // The tooltip is on the button itself, so keyboard focus on the button finds it as the hover does.
    expect(el.getAttribute("data-tip")).toBe("Stop 1 of 2, Path 1\nCorner");
    expect(el.getAttribute("aria-description")).toBe("Stop 1 of 2, Path 1. Corner");
    expect(el.textContent).toBe("7");
    expect(el.className).toContain("focus-visible:ring-signal");
  });

  it("stops the events the map pans on, so a press never reaches the map", () => {
    const { container, map } = fakeContainerMap();
    render(
      <PlateMarker map={map} lng={0} lat={0} offset={[-12, 0]} name="n" lines={["n"]} onActivate={() => {}}>
        <StopPlate label="1" lens={false} size="globe" />
      </PlateMarker>,
    );
    const seen: string[] = [];
    for (const type of ["mousedown", "pointerdown", "touchstart", "dblclick"]) container.addEventListener(type, () => seen.push(type));
    for (const type of ["mousedown", "pointerdown", "touchstart", "dblclick"]) {
      live.markers[0].el.dispatchEvent(new Event(type, { bubbles: true }));
    }
    expect(seen).toEqual([]);
  });

  it("stops a pointer's move on the plate, so the map's own tooltip never writes over the plate's words", () => {
    const { container, map } = fakeContainerMap();
    render(
      <PlateMarker map={map} lng={0} lat={0} offset={[-12, 0]} name="n" lines={["n"]} onActivate={() => {}}>
        <StopPlate label="1" lens={false} size="globe" />
      </PlateMarker>,
    );
    // maplibre listens for mousemove on the canvas container, which holds the markers.
    const seen: string[] = [];
    container.addEventListener("mousemove", () => seen.push("mousemove"));
    live.markers[0].el.dispatchEvent(new MouseEvent("mousemove", { bubbles: true }));
    // A move on the plate's own face (the plate is the button's child) is stopped too.
    (live.markers[0].el.firstElementChild as HTMLElement).dispatchEvent(new MouseEvent("mousemove", { bubbles: true }));
    expect(seen).toEqual([]);
  });

  it("still lets the events the tooltip layer reads reach the document, and the map's mouseout", () => {
    const { container, map } = fakeContainerMap();
    render(
      <PlateMarker map={map} lng={0} lat={0} offset={[-12, 0]} name="n" lines={["n"]} onActivate={() => {}}>
        <StopPlate label="1" lens={false} size="globe" />
      </PlateMarker>,
    );
    const seen: string[] = [];
    const onDocument = (e: Event) => seen.push(`document ${e.type}`);
    document.addEventListener("pointerover", onDocument);
    document.addEventListener("pointerout", onDocument);
    container.addEventListener("mouseout", () => seen.push("container mouseout"));
    try {
      live.markers[0].el.dispatchEvent(new Event("pointerover", { bubbles: true }));
      live.markers[0].el.dispatchEvent(new Event("pointerout", { bubbles: true }));
      live.markers[0].el.dispatchEvent(new MouseEvent("mouseout", { bubbles: true }));
    } finally {
      document.removeEventListener("pointerover", onDocument);
      document.removeEventListener("pointerout", onDocument);
    }
    expect(seen).toEqual(["document pointerover", "document pointerout", "container mouseout"]);
  });

  it("calls onActivate once for a click, and does not let the click reach the map", () => {
    const { container, map } = fakeContainerMap();
    const onActivate = vi.fn();
    const outside = vi.fn();
    container.addEventListener("click", outside);
    render(
      <PlateMarker map={map} lng={0} lat={0} offset={[-12, 0]} name="n" lines={["n"]} onActivate={onActivate}>
        <StopPlate label="1" lens={false} size="globe" />
      </PlateMarker>,
    );
    act(() => live.markers[0].el.click());
    expect(onActivate).toHaveBeenCalledTimes(1);
    expect(outside).not.toHaveBeenCalled();
  });

  it("keeps its Marker while only the name or the handler change, and makes a new one when the offset moves", () => {
    const { map } = fakeContainerMap();
    const view = render(
      <PlateMarker map={map} lng={1} lat={2} offset={[-12, 0]} name="a" lines={["a"]} onActivate={() => {}}>
        <StopPlate label="1" lens={false} size="globe" />
      </PlateMarker>,
    );
    const first = live.markers[0];
    view.rerender(
      <PlateMarker map={map} lng={1} lat={2} offset={[-12, 0]} name="b" lines={["a"]} onActivate={() => {}}>
        <StopPlate label="1" lens={false} size="globe" />
      </PlateMarker>,
    );
    expect(live.markers).toEqual([first]);
    expect(first.el.getAttribute("aria-label")).toBe("b");
    view.rerender(
      <PlateMarker map={map} lng={1} lat={2} offset={[-12, 15]} name="b" lines={["a"]} onActivate={() => {}}>
        <StopPlate label="1" lens={false} size="globe" />
      </PlateMarker>,
    );
    expect(live.markers).toHaveLength(1);
    expect(live.markers[0]).not.toBe(first);
    expect(live.markers[0].opts.offset).toEqual([-12, 15]);
  });

  it("removes its Marker on unmount", () => {
    const { map } = fakeContainerMap();
    const view = render(
      <PlateMarker map={map} lng={1} lat={2} offset={[-12, 0]} name="a" lines={["a"]} onActivate={() => {}}>
        <StopPlate label="1" lens={false} size="globe" />
      </PlateMarker>,
    );
    view.unmount();
    expect(live.markers).toEqual([]);
    expect(screen.queryByRole("button")).toBeNull();
  });
});

import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { act, fireEvent, render, waitFor } from "@testing-library/react";
import { PivotWindowsLayer } from "./PivotWindowsLayer";
import { RECORD, NOTE_TIME } from "../notes/test-support";
import { paletteForKind } from "../../lib/entity-palette";
import { makeNode } from "../../lib/notes/test-fixtures";
import { WINDOW_TITLE } from "../../lib/tooltip-words/record-window";
import { useMarksStore } from "../../store/marks";
import { useSchema } from "../../store/schema";
import { usePivotStore } from "../../store/pivot";
import { usePlayhead } from "../../store/playhead";
import { usePivotData } from "../../store/pivot-data";
import { useSelection } from "../../store/selection";
import type { EntityMatch, PivotContext } from "../../lib/matches";
import type { Transaction } from "../../types";
import type { Entity } from "../../lib/entity";
import type maplibregl from "maplibre-gl";
import { popoutOpened } from "../../lib/window-focus";

const tx = {
  id: "t1",
  timestamp: "2026-05-14T22:41:00Z",
  amount: 1275.97,
  merchant_name: "Mall · cash-out",
  merchant_country: "NG",
  risk_score: 943,
  auth_source: "card_present",
  merchant_lat: 6.43,
  merchant_lng: 3.42,
  is_fraud: 1,
} as Transaction;
const fraudEntity: EntityMatch = { kind: "fraud", tx };

const emptyContext: PivotContext = { transactions: [], logins: [], places: [] };

const signIn: Entity = {
  id: "si-0628", kind: "signin", timestamp: 0, coords: { lat: 52.3676, lng: 4.9041 },
  fields: { id: "si-0628" },
  displayMetadata: { primaryLabel: "Dana Whitlow", secondaryLabel: "", paletteKind: "signin", pivotableFields: [] },
};
const SIGN_IN = { type: "section", sectionId: "sign-in", label: "Sign-in" } as const;

/** A globe map stub: every pin projects to (100, 100); `center()` says which side faces us. */
function globeMap(center: () => { lng: number; lat: number }, at = { x: 100, y: 100 }): maplibregl.Map {
  return { project: () => at, getCenter: center, on: vi.fn(), off: vi.fn() } as unknown as maplibregl.Map;
}

beforeEach(() => {
  usePivotStore.setState({ windows: [], nextZ: 20 });
  useSelection.setState({ selected: null });
  usePivotData.setState({ transactions: [], logins: [], accountEvents: [], transfers: [] });
  usePlayhead.setState({
    playhead: Date.parse("2026-05-14T23:00:00Z"),
    minTime: Date.parse("2026-05-14T00:00:00Z"),
    maxTime: Date.parse("2026-05-15T00:00:00Z"),
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("PivotWindowsLayer - mapping host", () => {
  it("renders nothing when no windows are open", () => {
    const { container } = render(
      <PivotWindowsLayer map={null} decisions={[]} context={emptyContext} />
    );
    expect(container.firstChild).toBeNull();
  });

  it("renders an open detail glance window", () => {
    usePivotStore.getState().openGlance(fraudEntity, { x: 40, y: 40 });
    const { container } = render(
      <PivotWindowsLayer map={null} decisions={[]} context={emptyContext} />
    );
    expect(container.querySelector('[role="dialog"]')).not.toBeNull();
  });

  it("reaps a stranded trace among mapped windows with a clean console (I1 mechanism lock)", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    usePivotStore.getState().openGlance(fraudEntity, { x: 40, y: 40 });
    const glanceId = usePivotStore.getState().windows[0].id;
    usePivotStore.getState().togglePinned(glanceId);
    usePivotStore.getState().openTrace("decision:gone", { x: 200, y: 200 });

    render(<PivotWindowsLayer map={null} decisions={[]} context={emptyContext} />);

    // The stranded trace reaps itself via effect; the pinned glance survives.
    await waitFor(() => {
      const ws = usePivotStore.getState().windows;
      expect(ws).toHaveLength(1);
      expect(ws[0].id).toBe(glanceId);
    });
    // No cross-component-update warning fired during the mapped render.
    const crossUpdate = errorSpy.mock.calls.find((args) =>
      String(args[0]).includes("Cannot update a component")
    );
    expect(crossUpdate).toBeUndefined();
  });

  it("dims a detail window whose entity is ahead of the playhead", () => {
    usePlayhead.setState({ playhead: Date.parse("2026-05-14T20:00:00Z") }); // before tx ts
    usePivotStore.getState().openGlance(fraudEntity, { x: 40, y: 40 });
    const { container } = render(
      <PivotWindowsLayer map={null} decisions={[]} context={emptyContext} />
    );
    // Dim lives on the WindowFrame's positioned outer div (review I1) so
    // the store z keeps ordering dimmed windows.
    const dialog = container.querySelector('[role="dialog"]') as HTMLElement;
    expect(dialog.style.opacity).toBe("0.45");
  });

  it("a popout of an entity ahead of the playhead is dimmed like any detail window", () => {
    const later: Entity = {
      id: "ch-0002", kind: "account_change", timestamp: Date.parse("2026-05-15T09:00:00Z"),
      coords: { lat: 52.3676, lng: 4.9041 }, fields: { id: "ch-0002" },
      displayMetadata: { primaryLabel: "Dana Whitlow", secondaryLabel: "", paletteKind: "account_change", pivotableFields: [] },
    };
    usePivotStore.getState().openPopout(later, { type: "section", sectionId: "account-change", label: "Bank-account change" });
    const { container } = render(
      <PivotWindowsLayer
        map={globeMap(() => ({ lng: 4.9, lat: 52.4 }))}
        decisions={[]}
        context={{ ...emptyContext, entities: [later] }}
      />
    );
    const dialog = container.querySelector<HTMLElement>('[role="dialog"]')!;
    expect(dialog.style.opacity).toBe("0.45");
  });

  it("a popout opened behind the globe does not take focus later, when its pin rotates into view", () => {
    let center = { lng: -175, lat: -52 }; // the far side of the globe from Amsterdam
    const map = globeMap(() => center);
    const opener = document.createElement("button");
    document.body.appendChild(opener);
    opener.focus();
    const id = usePivotStore.getState().openPopout(signIn, SIGN_IN)!;
    popoutOpened(id, opener);
    const ui = <PivotWindowsLayer map={map} decisions={[]} context={emptyContext} />;
    const { container, rerender } = render(ui);
    expect(container.querySelector('[role="dialog"]')).toBeNull();
    center = { lng: 4.9, lat: 52.4 };
    rerender(<PivotWindowsLayer map={map} decisions={[]} context={{ ...emptyContext }} />);
    expect(container.querySelector('[role="dialog"]')).not.toBeNull();
    expect(document.activeElement).toBe(opener);
    opener.remove();
  });

  it("a focused popout whose pin rotates behind the globe hands focus back to its opener", async () => {
    let center = { lng: 4.9, lat: 52.4 }; // Amsterdam faces the camera
    const map = globeMap(() => center);
    const opener = document.createElement("button");
    document.body.appendChild(opener);
    const id = usePivotStore.getState().openPopout(signIn, SIGN_IN)!;
    popoutOpened(id, opener);
    const { container, rerender } = render(<PivotWindowsLayer map={map} decisions={[]} context={emptyContext} />);
    expect(document.activeElement).toBe(container.querySelector('[role="dialog"]'));
    center = { lng: -175, lat: -52 };
    rerender(<PivotWindowsLayer map={map} decisions={[]} context={{ ...emptyContext }} />);
    expect(container.querySelector('[role="dialog"]')).toBeNull();
    await waitFor(() => expect(document.activeElement).toBe(opener));
    opener.remove();
  });

  it("draws no frame for a node-anchored window while there is no map, and still draws a screen-anchored one", () => {
    const popoutId = usePivotStore.getState().openPopout(signIn, SIGN_IN)!;
    usePivotStore.getState().openGlance(fraudEntity, { x: 40, y: 40 });
    const ws = usePivotStore.getState().windows;
    expect(ws.find((w) => w.id === popoutId)?.anchor.type).toBe("node");
    expect(ws.filter((w) => w.anchor.type === "screen")).toHaveLength(1);

    const { container, rerender } = render(
      <PivotWindowsLayer map={null} decisions={[]} context={emptyContext} />
    );
    // Only the screen-anchored glance has a position; the node-anchored popout would fall back
    // to the top left corner without a map.
    expect(container.querySelectorAll('[role="dialog"]')).toHaveLength(1);
    // The store keeps the window, so it comes back when a map does.
    expect(usePivotStore.getState().windows).toHaveLength(2);

    rerender(
      <PivotWindowsLayer
        map={globeMap(() => ({ lng: 4.9, lat: 52.4 }))}
        decisions={[]}
        context={emptyContext}
      />
    );
    expect(container.querySelectorAll('[role="dialog"]')).toHaveLength(2);
  });

  it("measures a new popout's free area: left of the Inspector, above the bottom stack", () => {
    const inspector = document.createElement("aside");
    inspector.setAttribute("aria-label", "Inspector");
    vi.spyOn(inspector, "getBoundingClientRect").mockReturnValue({ left: 700 } as DOMRect);
    document.body.appendChild(inspector);
    document.documentElement.style.setProperty("--bottom-stack-h", "172px");
    try {
      render(<PivotWindowsLayer map={globeMap(() => ({ lng: 0, lat: 0 }), { x: 300, y: 200 })} decisions={[]} context={emptyContext} />);
      const room = usePivotStore.getState().pinRoom!;
      expect(room({ lng: 0, lat: 0 })).toEqual({ pinX: 300, pinY: 200, right: 700, bottom: window.innerHeight - 172 });
      inspector.remove();
      expect(room({ lng: 0, lat: 0 }).right).toBe(window.innerWidth);
    } finally {
      inspector.remove();
      document.documentElement.style.removeProperty("--bottom-stack-h");
    }
  });

});

describe("PivotWindowsLayer - the record's own window", () => {
  const REC = { kind: "stop", id: "rec-1" };
  const recordContext: PivotContext = { ...emptyContext, entities: [RECORD] };
  const hereMap = () => globeMap(() => ({ lng: -95.37, lat: 29.76 }));
  const dialog = (c: HTMLElement) => c.querySelector<HTMLElement>('[role="dialog"]')!;

  beforeEach(() => {
    useMarksStore.getState().clear();
    useSchema.setState({ nodes: [] });
  });

  it("draws the window for a record with a place, tethered by a dashed line in the record kind's colour", () => {
    usePivotStore.getState().openRecord(REC, { lngLat: RECORD.coords, pinned: false });
    const { container } = render(<PivotWindowsLayer map={hereMap()} decisions={[]} context={recordContext} />);
    expect(dialog(container).getAttribute("aria-label")).toBe(WINDOW_TITLE("rec-1"));
    const lines = container.querySelectorAll("line");
    expect(lines).toHaveLength(1);
    expect(lines[0].getAttribute("stroke-dasharray")).toBe("4 3");
    expect(lines[0].getAttribute("stroke-width")).toBe("1.5");
    expect(lines[0].getAttribute("stroke-opacity")).toBe("0.55");
    expect(lines[0].getAttribute("stroke")).toBe(paletteForKind("stop").hex);
  });

  it("a record window with no place is held on the screen and draws no tether", () => {
    usePivotStore.getState().openRecord(REC, { lngLat: null, pinned: false, at: { x: 90, y: 90 } });
    const { container } = render(<PivotWindowsLayer map={hereMap()} decisions={[]} context={recordContext} />);
    expect(container.querySelectorAll('[role="dialog"]')).toHaveLength(1);
    expect(container.querySelectorAll("line")).toHaveLength(0);
    expect(dialog(container).style.left).toBe("90px");
  });

  it("hides with its point behind the globe, and keeps the window in the store", () => {
    usePivotStore.getState().openRecord(REC, { lngLat: RECORD.coords, pinned: false });
    const { container } = render(<PivotWindowsLayer map={globeMap(() => ({ lng: 84, lat: -30 }))} decisions={[]} context={recordContext} />);
    expect(container.querySelectorAll('[role="dialog"]')).toHaveLength(0);
    expect(container.querySelectorAll("line")).toHaveLength(0);
    expect(usePivotStore.getState().windows).toHaveLength(1);
  });

  it("a record the data does not hold still draws its window", () => {
    usePivotStore.getState().openRecord({ kind: "stop", id: "rec-404" }, { lngLat: null, pinned: false, at: { x: 40, y: 40 } });
    const { container } = render(<PivotWindowsLayer map={null} decisions={[]} context={recordContext} />);
    expect(dialog(container).textContent).toContain("This record is not in the data.");
  });

  it("dims while the record's time is after the playhead, and not at or before it", () => {
    usePivotStore.getState().openRecord(REC, { lngLat: null, pinned: false, at: { x: 90, y: 90 } });
    usePlayhead.setState({ playhead: NOTE_TIME - 1 });
    const { container } = render(<PivotWindowsLayer map={null} decisions={[]} context={recordContext} />);
    expect(dialog(container).style.opacity).toBe("0.45");
    act(() => usePlayhead.setState({ playhead: NOTE_TIME }));
    expect(dialog(container).style.opacity).toBe("1");
    act(() => usePlayhead.setState({ playhead: NOTE_TIME + 1 }));
    expect(dialog(container).style.opacity).toBe("1");
  });

  it("a record with no time never dims", () => {
    const untimed = { ...RECORD, timestamp: 0 };
    usePivotStore.getState().openRecord(REC, { lngLat: null, pinned: false, at: { x: 90, y: 90 } });
    usePlayhead.setState({ playhead: 1 });
    const { container } = render(<PivotWindowsLayer map={null} decisions={[]} context={{ ...emptyContext, entities: [untimed] }} />);
    expect(dialog(container).style.opacity).toBe("1");
  });

  it("keeps every record window's pin equal to its node's, whatever changed the node", () => {
    usePivotStore.getState().openRecord(REC, { lngLat: null, pinned: false, at: { x: 90, y: 90 } });
    render(<PivotWindowsLayer map={null} decisions={[]} context={recordContext} />);
    const pinned = () => usePivotStore.getState().windows.find((w) => w.kind === "record")?.pinned;
    expect(pinned()).toBe(false);
    act(() => useMarksStore.setState({ scenario: "card-fraud", nodes: [makeNode({ pinned: true })] }));
    expect(pinned()).toBe(true);
    act(() => useMarksStore.setState({ nodes: [makeNode({ pinned: false })] }));
    expect(pinned()).toBe(false);
    act(() => useMarksStore.setState({ nodes: [makeNode({ pinned: true })] }));
    expect(pinned()).toBe(true);
    act(() => useMarksStore.setState({ nodes: [] }));
    expect(pinned()).toBe(false);
  });

  it("a pinned record's window is not replaced by a glance, and an unpinned one is", () => {
    usePivotStore.getState().openRecord(REC, { lngLat: null, pinned: false, at: { x: 90, y: 90 } });
    render(<PivotWindowsLayer map={null} decisions={[]} context={recordContext} />);
    act(() => useMarksStore.setState({ scenario: "card-fraud", nodes: [makeNode({ pinned: true })] }));
    usePivotStore.getState().openGlance(fraudEntity, { x: 40, y: 40 });
    expect(usePivotStore.getState().windows.map((w) => w.kind)).toEqual(["record", "detail"]);
    act(() => useMarksStore.setState({ nodes: [] }));
    usePivotStore.getState().openGlance({ kind: "auth", tx: { ...tx, id: "t2", is_fraud: 0 } }, { x: 60, y: 60 });
    expect(usePivotStore.getState().windows.map((w) => w.kind)).toEqual(["detail"]);
  });

  it("takes focus once when asked, and its close hands focus back to the opener and leaves the record's node alone", () => {
    const opener = document.createElement("button");
    document.body.appendChild(opener);
    const id = usePivotStore.getState().openRecord(REC, { lngLat: null, pinned: false, at: { x: 90, y: 90 } });
    popoutOpened(id, opener);
    const { container } = render(<PivotWindowsLayer map={null} decisions={[]} context={recordContext} />);
    expect(document.activeElement).toBe(dialog(container));
    act(() => useMarksStore.setState({ scenario: "card-fraud", nodes: [makeNode({ disposition: "pass" })] }));
    const held = useMarksStore.getState().nodes;
    fireEvent.click(container.querySelector('button[aria-label="Close window"]')!);
    expect(usePivotStore.getState().windows).toHaveLength(0);
    expect(document.activeElement).toBe(opener);
    expect(useMarksStore.getState().nodes).toBe(held);
    expect(held[0].disposition).toBe("pass");
    opener.remove();
  });

  it("draws the record window beside a popout in one render, each with its own tether", () => {
    usePivotStore.getState().openRecord(REC, { lngLat: RECORD.coords, pinned: true });
    usePivotStore.getState().openPopout(signIn, SIGN_IN);
    const { container } = render(<PivotWindowsLayer map={hereMap()} decisions={[]} context={recordContext} />);
    expect(container.querySelectorAll('[role="dialog"]')).toHaveLength(2);
    expect(container.querySelectorAll("line")).toHaveLength(2);
    expect(usePivotStore.getState().windows).toHaveLength(2);
  });
});

import { describe, it, expect, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { DetailWindow } from "./DetailWindow";
import { usePivotStore } from "../../store/pivot";
import { useSelection } from "../../store/selection";
import type { EntityMatch } from "../../lib/matches";
import type { Transaction } from "../../types";
import { useSchema } from "../../store/schema";
import type { Entity } from "../../lib/entity";
import type { ScenarioNode } from "../../lib/scenarios";
import { manifestRowToEntity } from "../../lib/adapters/manifest-row";
import { verdictNode } from "../../lib/verdict-fixtures";

const tx = {
  id: "t1", amount: 1275.97, merchant_name: "Mall · cash-out",
  merchant_country: "NG", risk_score: 943, auth_source: "card_present",
  merchant_lat: 6.43, merchant_lng: 3.42, is_fraud: 1,
} as Transaction;
const entity: EntityMatch = { kind: "fraud", tx };

beforeEach(() => {
  usePivotStore.setState({ windows: [], nextZ: 20 });
  useSelection.setState({ selected: null });
  usePivotStore.getState().openGlance(entity, { x: 10, y: 10 });
});

describe("DetailWindow", () => {
  it("renders the fraud glance body from real fields", () => {
    const w = usePivotStore.getState().windows[0];
    if (w.kind !== "detail") throw new Error("expected detail window");
    render(<DetailWindow window={w} />);
    expect(screen.getByText("$1275.97")).toBeInTheDocument();
    expect(screen.getByText(/Mall · cash-out · NG/)).toBeInTheDocument();
    expect(screen.getByText(/RISK 943/)).toBeInTheDocument();
  });

  it("full-inspect selects the entity into the docked Inspector", () => {
    const w = usePivotStore.getState().windows[0];
    if (w.kind !== "detail") throw new Error("expected detail window");
    render(<DetailWindow window={w} />);
    fireEvent.click(screen.getByLabelText("Open in full inspector"));
    expect(useSelection.getState().selected?.kind).toBe("fraud");
  });
});

describe("DetailWindow popouts", () => {
  const signInNode: ScenarioNode = {
    kind: "signin", label: "Portal sign-in", palette: "#7ee787", source: "json",
    coords: { lat: "lat", lng: "lng" }, timestamp: "timestamp", pivotable: ["device_id", "ip_asn"],
    sections: [{ id: "sign-in", label: "Sign-in", fields: ["device_id", "ip_asn", "ip_type"] }],
  };
  const signIn: Entity = {
    id: "si-0628", kind: "signin", timestamp: 0, coords: { lat: 52.3676, lng: 4.9041 },
    fields: { id: "si-0628", device_id: "QX4T7N2RB9KM", ip_asn: "AS64511 Cloud host", ip_type: "datacenter" },
    displayMetadata: { primaryLabel: "Dana Whitlow · 203.0.113.66", secondaryLabel: "", paletteKind: "signin", pivotableFields: ["device_id", "ip_asn"] },
  };

  beforeEach(() => {
    usePivotStore.setState({ windows: [], nextZ: 20 });
    useSchema.setState({ nodes: [signInNode] });
  });

  it("a section popout renders the section's fields under a title that leads with the entity id", () => {
    usePivotStore.getState().openPopout(signIn, { type: "section", sectionId: "sign-in", label: "Sign-in" });
    const w = usePivotStore.getState().windows[0];
    if (w.kind !== "detail") throw new Error("expected detail window");
    render(<DetailWindow window={w} />);
    // The header truncates at about 22 characters: the id and the view must come first.
    expect(screen.getByRole("dialog", { name: "si-0628 · Sign-in · Dana Whitlow · 203.0.113.66" })).toBeInTheDocument();
    expect(screen.getByText("QX4T7N2RB9KM")).toBeInTheDocument();
    expect(screen.getByText("Device ID")).toBeInTheDocument(); // labelled from the key, the way the inspector labels it
    expect(screen.getByText("datacenter")).toBeInTheDocument();
  });

  it("a section popout draws the Inspector's rows with their icons", () => {
    usePivotStore.getState().openPopout(signIn, { type: "section", sectionId: "sign-in", label: "Sign-in" });
    const w = usePivotStore.getState().windows[0];
    if (w.kind !== "detail") throw new Error("expected detail window");
    render(<DetailWindow window={w} />);
    const iconOf = (label: string | RegExp) =>
      ((screen.getByText(label).parentElement as HTMLElement).firstElementChild as Element).getAttribute("class") ?? "";
    expect(iconOf("Device ID")).toContain("lucide-smartphone");
    expect(iconOf(/ASN$/)).toContain("lucide-router");
  });

  it("a section the active pack no longer declares says so instead of rendering fields", () => {
    useSchema.setState({ nodes: [] });
    usePivotStore.getState().openPopout(signIn, { type: "section", sectionId: "sign-in", label: "Sign-in" });
    const w = usePivotStore.getState().windows[0];
    if (w.kind !== "detail") throw new Error("expected detail window");
    render(<DetailWindow window={w} />);
    expect(screen.getByText("This scenario has no such section.")).toBeInTheDocument();
    expect(screen.queryByText("QX4T7N2RB9KM")).toBeNull();
  });
});

describe("DetailWindow notes and pile popouts", () => {
  const decision = manifestRowToEntity(verdictNode, {
    id: "d1", state: "FAIL", finding: "ATO", memo: "Account takeover.", who: "investigator",
    subject: "Carol · Branson, MO", acct: "a1", when: "2026-06-09T09:40:00-05:00", y: 36.6, x: -93.2,
  });

  beforeEach(() => {
    usePivotStore.setState({ windows: [], nextZ: 20 });
    useSchema.setState({ nodes: [verdictNode] });
  });

  it("a notes popout renders the decision capsule and the note", () => {
    usePivotStore.getState().openPopout(decision, { type: "notes", label: "Notes" });
    const w = usePivotStore.getState().windows[0];
    if (w.kind !== "detail") throw new Error("expected detail window");
    render(<DetailWindow window={w} />);
    expect(screen.getByText("ATO")).toHaveAttribute("data-tone", "fail");
    expect(screen.getByText("Account takeover.")).toBeInTheDocument();
  });

  it("a notes window takes its verdict's colour, not the decision layer's", () => {
    const pass = manifestRowToEntity(verdictNode, {
      id: "d2", state: "PASS", finding: "PASSED", memo: "Her own laptop.", who: "investigator",
      subject: "Priya · Houston, TX", acct: "a2", when: "2026-05-25T11:45:00-05:00", y: 29.7, x: -95.4,
    });
    usePivotStore.getState().openPopout(pass, { type: "notes", label: "Notes" });
    const w = usePivotStore.getState().windows[0];
    if (w.kind !== "detail") throw new Error("expected detail window");
    render(<DetailWindow window={w} />);
    expect(screen.getByRole("dialog").style.outlineColor).toBe("var(--verdict-pass-on-panel)");
  });

  it("a pile popout's title is the view label only", () => {
    usePivotStore.getState().openPopout(decision, { type: "pile", label: "2 decisions here", memberIds: ["d1"] });
    const w = usePivotStore.getState().windows[0];
    if (w.kind !== "detail") throw new Error("expected detail window");
    render(<DetailWindow window={w} byKind={{ verdict_export: [decision] }} />);
    expect(screen.getByRole("dialog", { name: "2 decisions here" })).toBeInTheDocument();
  });
});

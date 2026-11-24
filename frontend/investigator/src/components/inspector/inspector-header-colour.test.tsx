import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { Inspector } from "../Inspector";
import { useSelection } from "../../store/selection";
import { useSchema } from "../../store/schema";
import { storyInkNow } from "../../store/kind-ink";
import type { Entity } from "../../lib/entity";

/**
 * BACKLOG item 16: the Inspector's heading took its kind's raw palette class (--r2 as text-identity
 * read 2.19 on the panel in light tritanopia, --r1 1.40, --alarm 4.88). It takes the on-inspector
 * form of the same slot now. The numbers are pinned in src/theme/inspector-text-colour.test.ts; this
 * file pins the heading's class for each kind. A kind whose palette class is not a raw slot keeps it.
 */
function entityOf(kind: string): Entity {
  return {
    id: `${kind}-1`,
    kind,
    timestamp: 0,
    coords: null,
    fields: { id: `${kind}-1` },
    displayMetadata: { primaryLabel: kind, secondaryLabel: "", paletteKind: kind, pivotableFields: [] },
  };
}

function headingClass(kind: string): string {
  useSelection.setState({ selected: { kind: "entity", entity: entityOf(kind) } });
  render(<Inspector />);
  return screen.getByText("Inspector").className;
}

describe("the Inspector's heading colour", () => {
  beforeEach(() => {
    useSelection.setState({ selected: null });
  });

  it("an authorization takes the r1 on-inspector colour", () => {
    const cls = headingClass("auth");
    expect(cls).toContain("text-[color:var(--r1-on-inspector)]");
    expect(cls).not.toContain("text-accent");
  });

  it("a login takes the r2 on-inspector colour", () => {
    const cls = headingClass("login");
    expect(cls).toContain("text-[color:var(--r2-on-inspector)]");
    expect(cls).not.toContain("text-identity");
  });

  it("a fraud record takes the alarm on-inspector colour", () => {
    const cls = headingClass("fraud");
    expect(cls).toContain("text-[color:var(--alarm-on-inspector)]");
    expect(cls).not.toContain("text-signal");
  });

  it("a place keeps its muted class: it is not a raw palette slot", () => {
    const cls = headingClass("place");
    expect(cls).toContain("text-muted");
    expect(cls).not.toContain("on-inspector");
  });

  it("an account event keeps its fixed colour class: it is a hex, not a palette slot (recorded finding)", () => {
    const cls = headingClass("account_event");
    expect(cls).toContain("text-[#ffb347]");
    expect(cls).not.toContain("on-inspector");
  });

  it("keeps the heading's size, tracking and truncation", () => {
    const cls = headingClass("login");
    for (const c of ["font-mono", "text-[10px]", "uppercase", "tracking-ultra", "truncate"]) {
      expect(cls.split(/\s+/)).toContain(c);
    }
  });
});

// Ship list entry 30: the heading carries the kind's library icon before its word, after the record
// window opener. No word is added or changed: the heading still prints the fixed word.
describe("the Inspector's heading icon", () => {
  beforeEach(() => {
    useSelection.setState({ selected: null });
  });
  afterEach(() => {
    useSchema.setState({ nodes: [] });
  });

  function iconOf(kind: string): SVGElement {
    useSelection.setState({ selected: { kind: "entity", entity: entityOf(kind) } });
    render(<Inspector />);
    return screen.getByText("Inspector").previousElementSibling as SVGElement;
  }

  it("draws the kind's icon before its word, in the word's colour", () => {
    const auth = iconOf("auth");
    expect(auth.classList.contains("lucide-receipt-text")).toBe(true);
    expect(auth.getAttribute("class")).toContain("text-[color:var(--r1-on-inspector)]");
    cleanup();
    const login = iconOf("login");
    expect(login.classList.contains("lucide-log-in")).toBe(true);
    expect(login.getAttribute("class")).toContain("text-[color:var(--r2-on-inspector)]");
    cleanup();
    const place = iconOf("place");
    expect(place.classList.contains("lucide-map-pin")).toBe(true);
    expect(place.getAttribute("class")).toContain("text-muted");
  });

  it("sits after the record window opener, hidden from assistive technology, and the word is unchanged", () => {
    const icon = iconOf("login");
    expect(icon.getAttribute("aria-hidden")).toBe("true");
    expect(icon.previousElementSibling?.tagName.toLowerCase()).not.toBe("svg");
    expect(screen.getByText("Inspector").textContent).toBe("Inspector");
  });

  it("a story's own kind takes the resolver's text ink", () => {
    useSchema.setState({ nodes: [{ kind: "org", label: "Organisation", palette: "#4da3ff", source: "json" }] });
    const ink = storyInkNow().get("org");
    expect(ink).toBeDefined();
    const icon = iconOf("org");
    expect(icon.classList.contains("lucide-building-2")).toBe(true);
    expect(icon.style.color).not.toBe("");
    // happy-dom may normalise a hex to rgb(...), so compare either form
    const [r, g, b] = [1, 3, 5].map((i) => parseInt((ink as { text: string }).text.slice(i, i + 2), 16));
    expect([ink?.text.toLowerCase(), `rgb(${r}, ${g}, ${b})`]).toContain(icon.style.color.toLowerCase());
    // the word stays on its own class, not the resolver's ink
    expect(screen.getByText("Inspector").style.color).toBe("");
  });
});

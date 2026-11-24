import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { InspectorField } from "./InspectorField";
import { FieldIcon, KindIcon } from "./LibraryIcon";
import { codeOf } from "../../lib/code-text";
import { VOCABULARY } from "../../lib/icons";
import type { ScenarioFieldWords, ScenarioNode } from "../../lib/scenarios";
import { useSchema } from "../../store/schema";

/**
 * Instrument-B: the inspector field label adopts the shared Eyebrow
 * Label tier (themed, mode-aware) while the VALUE keeps its mono face + the
 * `valueClass` caller contract intact, so the 20+ body-inspector call sites
 * inherit the reskin without edits.
 */
describe("InspectorField", () => {
  it("renders the label muted (text-muted tone), not the mono value face", () => {
    render(<InspectorField label="Acquirer" value="Zellmere Payments" />);
    const label = screen.getByText("Acquirer");
    // The label rides the muted neutral tone via the floated label's text-muted
    // class (the mono face is reserved for tabular values). The colon is a
    // separator, so the label's own text stays clean for assertions.
    expect(label.closest(".text-muted")).not.toBeNull();
    expect(label.className).not.toContain("font-mono");
  });

  it("keeps the value in the mono tier and applies valueClass verbatim (caller contract)", () => {
    render(<InspectorField label="Score" value="981" valueClass="text-signal" />);
    const value = screen.getByText("981");
    expect(value.className).toContain("font-mono");
    expect(value.className).toContain("text-signal");
  });

  // Every datum is a row of its own, nothing is printed as a small line under
  // another value. The row draws a label and a value and nothing under the value, and the
  // component has no prop that could draw a line again.
  it("draws a label and a value and nothing under the value", () => {
    const { container } = render(<InspectorField label="From" value="Mainland Electronics" />);
    expect(container.querySelector(".clear-both")).toBeNull();
    const row = container.firstElementChild as HTMLElement;
    expect(row.children).toHaveLength(2);
    expect(row.lastElementChild?.textContent).toBe("Mainland Electronics");
  });

  it("draws nothing for a secondary handed to it from outside the types", () => {
    const stray: object = { secondary: "NG, May 27, 7:41 AM" };
    const { container } = render(<InspectorField label="From" value="Mainland Electronics" {...stray} />);
    expect(screen.queryByText(/NG, May 27/)).toBeNull();
    expect(container.querySelector(".clear-both")).toBeNull();
  });

  it("its source holds no secondary prop, so a line under a value cannot be written by accident", () => {
    const source = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), "InspectorField.tsx"), "utf8");
    expect(codeOf(source)).not.toMatch(/\bsecondary\b/);
    expect(source).not.toMatch(/\bsecondary\b/);
  });

  it("with a field, draws the field's icon inside the label's span, before the label's words", () => {
    const { container } = render(<InspectorField label="Acquirer" field="acquirer" value="Zellmere" />);
    const label = container.querySelector("span.float-left") as HTMLElement;
    const first = label.firstElementChild as Element;
    expect(first.tagName.toLowerCase()).toBe("svg");
    expect(first.classList.contains("lucide-landmark")).toBe(true);
    expect(first.classList.contains("inline-block")).toBe(true);
    expect(first.classList.contains("align-middle")).toBe(true);
    const words = first.nextElementSibling as HTMLElement;
    expect(words.tagName.toLowerCase()).toBe("span");
    expect(screen.getByText("Acquirer")).toBe(words);
  });

  it("with a field, the label names the attribute on hover", () => {
    const { container, rerender } = render(<InspectorField label="Acquirer" field="acquirer" value="Z" />);
    expect(container.querySelector("span.float-left")?.getAttribute("data-tip")).toBe("Acquirer");
    rerender(<InspectorField label="Payee Id" field="payee_id" value="Z" />);
    expect(container.querySelector("span.float-left")?.getAttribute("data-tip")).toBe("Payee ID");
  });

  it("without a field, draws no icon and no tooltip (a rule trace, a decision's notes)", () => {
    const { container } = render(<InspectorField label="Acquirer" value="Zellmere" />);
    expect(container.querySelector("svg")).toBeNull();
    expect(container.querySelector("span.float-left")?.hasAttribute("data-tip")).toBe(false);
  });

  it("keeps the row's type size and its two parts", () => {
    const { container } = render(<InspectorField label="Acquirer" field="acquirer" value="Zellmere" />);
    const row = container.firstElementChild as HTMLElement;
    expect(row.className).toContain("text-[11px]");
    expect(row.className).toContain("leading-snug");
    expect(row.children).toHaveLength(2);
    expect(row.lastElementChild?.textContent).toBe("Zellmere");
  });

  // A kept gap of 8 px after the label. The pixel is measured on the built page; this pins the
  // class that makes it.
  it("the label keeps a gap of 8 px before the value", () => {
    const withField = render(<InspectorField label="Acquirer" field="acquirer" value="Zellmere" />);
    expect(withField.container.querySelector("span.float-left")?.classList.contains("mr-2")).toBe(true);
    withField.unmount();
    const without = render(<InspectorField label="Acquirer" value="Zellmere" />);
    expect(without.container.querySelector("span.float-left")?.classList.contains("mr-2")).toBe(true);
  });

  // shortcut: reads source text, so a row built by a helper in another file is not seen; the render cases
  // of each body check the drawn rows.
  it("every row of the Inspector's bodies passes a field, and the kept-out places pass none", () => {
    const here = dirname(fileURLToPath(import.meta.url));
    const ROW = /<InspectorField\s+label=(?:"[^"]*"|\{[^}]*\})\s+field=(?:"([^"]*)"|\{[^}]*\})/g;
    // No InspectorSection is given a field: a section title carries no icon.
    const SECTION = /<InspectorSection\b[^>]*\bfield=/g;
    const ICON = /<FieldIcon field="([^"]*)"/g;
    const fieldIds = new Set(VOCABULARY.filter((e) => !e.kind).map((e) => e.id));
    const IN = [
      "AuthInspector.tsx",
      "FraudInspector.tsx",
      "LoginInspector.tsx",
      "PlaceInspector.tsx",
      "TransferInspector.tsx",
      "AccountEventInspector.tsx",
      "SessionField.tsx",
      "ManifestFieldsSection.tsx",
      "../notes/noteInspector.tsx",
    ];
    for (const file of IN) {
      const source = readFileSync(resolve(here, file), "utf8");
      const rows = [...source.matchAll(ROW)];
      const all = source.match(/<InspectorField/g) ?? [];
      expect(all.length, file).toBeGreaterThan(0);
      expect(rows.length, file).toBe(all.length);
      const ids = [
        ...rows.map((m) => m[1]).filter((id): id is string => id !== undefined),
        ...[...source.matchAll(ICON)].map((m) => m[1]),
      ];
      expect([...source.matchAll(SECTION)].length, `${file}: a section given a field`).toBe(0);
      for (const id of ids) expect(fieldIds.has(id), `${file}: ${id}`).toBe(true);
    }
    // The section primitive draws no icon and takes no field.
    expect(readFileSync(resolve(here, "InspectorSection.tsx"), "utf8")).not.toMatch(/FieldIcon|LibraryIcon|\bfield\b/);
    const OUT = [
      "../pivot/RuleTraceWindow.tsx",
      "../verdict/NotesBody.tsx",
    ];
    for (const file of OUT) {
      const source = readFileSync(resolve(here, file), "utf8");
      expect([...source.matchAll(ROW)].length, file).toBe(0);
    }
  });
});

describe("the library icon", () => {
  afterEach(() => {
    useSchema.setState({ nodes: [], fields: undefined });
  });

  it("draws the vocabulary's icon at 16 px with the library's 1.5 line, hidden from assistive technology", () => {
    const { container } = render(<FieldIcon field="mcc" />);
    const svg = container.querySelector("svg") as SVGElement;
    expect(svg.classList.contains("lucide-tag")).toBe(true);
    expect(svg.getAttribute("width")).toBe("16");
    expect(svg.getAttribute("height")).toBe("16");
    expect(svg.getAttribute("stroke-width")).toBe("1.5");
    expect(svg.getAttribute("aria-hidden")).toBe("true");
    expect(svg.getAttribute("stroke")).toBe("currentColor");
  });

  it("draws a kind's icon, and the fallback for an id it does not know", () => {
    const { container, rerender } = render(<KindIcon kind="login" />);
    expect(container.querySelector("svg")?.classList.contains("lucide-log-in")).toBe(true);
    rerender(<FieldIcon field="holder_name" />);
    expect(container.querySelector("svg")?.classList.contains("lucide-square-dashed")).toBe(true);
  });

  it("a story's override wins, read from the schema store", () => {
    useSchema.setState({
      nodes: [{ kind: "login", label: "Login", palette: "identity", source: "sql", icon: "orbit" } as unknown as ScenarioNode],
      fields: { mcc: { label: "MCC", icon: "hash" } } as unknown as Record<string, ScenarioFieldWords>,
    });
    const { container } = render(
      <>
        <KindIcon kind="login" />
        <FieldIcon field="mcc" />
      </>,
    );
    const svgs = container.querySelectorAll("svg");
    expect(svgs[0].classList.contains("lucide-orbit")).toBe(true);
    expect(svgs[1].classList.contains("lucide-hash")).toBe(true);
  });

  it("passes the caller's class and style, and sizes by no class", () => {
    const { container } = render(<FieldIcon field="mcc" className="mr-1" style={{ color: "#123456" }} />);
    const svg = container.querySelector("svg") as SVGElement;
    expect(svg.classList.contains("mr-1")).toBe(true);
    expect(svg.classList.contains("shrink-0")).toBe(true);
    expect(svg.classList.contains("inline-block")).toBe(true);
    for (const c of Array.from(svg.classList)) expect(c).not.toMatch(/^(text-\[|w-|h-)/);
    expect(svg.style.color).not.toBe("");
  });
});

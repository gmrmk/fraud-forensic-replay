import { describe, it, expect } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { InspectorSection } from "./InspectorSection";
import { sectionFoldName, sectionFoldWords } from "../../lib/tooltip-words/inspector";

/**
 * The inspector section title uses the shared Eyebrow
 * Label tier (themed, mode-aware). The divider structure, children slot, and
 * trailing slot are preserved so every body inspector keeps composing freely.
 */
describe("InspectorSection", () => {
  it("renders the title in the Eyebrow Label tier (themed inline color)", () => {
    render(
      <InspectorSection title="Geo">
        <div>body</div>
      </InspectorSection>
    );
    const title = screen.getByText("Geo");
    expect(title.style.color).toBe("var(--text-muted)");
    expect(title.className).not.toContain("font-mono");
    expect(title.className).toContain("uppercase");
  });

  it("renders its children", () => {
    render(
      <InspectorSection title="Geo">
        <div>BODY_CONTENT</div>
      </InspectorSection>
    );
    expect(screen.getByText("BODY_CONTENT")).toBeInTheDocument();
  });

  it("renders the trailing slot", () => {
    render(
      <InspectorSection title="Geo" trailing={<span>TRAIL</span>}>
        x
      </InspectorSection>
    );
    expect(screen.getByText("TRAIL")).toBeInTheDocument();
  });
});

// The fold is opt-in: a section given no foldSummary is today's title row and body, with no control.
// One given a summary (the section's first row as it prints) gets a title button that folds the body to
// that line. The state lives in the section and is not saved.
describe("InspectorSection fold", () => {
  it("draws no control when it is given no foldSummary", () => {
    render(
      <InspectorSection title="Geo" trailing={<span>TRAIL</span>}>
        <div>BODY_CONTENT</div>
      </InspectorSection>
    );
    expect(screen.queryByRole("button")).toBeNull();
    expect(screen.getByText("BODY_CONTENT")).toBeInTheDocument();
  });

  it("gives the title a button that starts open, with the body shown", () => {
    render(
      <InspectorSection title="Geo" foldSummary="IP: 203.0.113.204">
        <div>BODY_CONTENT</div>
      </InspectorSection>
    );
    const button = screen.getByRole("button", { name: sectionFoldName("Geo", true) });
    expect(button).toHaveAttribute("aria-expanded", "true");
    expect(button).toHaveTextContent("Geo");
    expect(button.getAttribute("data-tip")).toBe(sectionFoldWords("Geo", true).join("\n"));
    expect(screen.getByText("BODY_CONTENT")).toBeInTheDocument();
    expect(screen.queryByText("IP: 203.0.113.204")).toBeNull();
  });

  it("folds to the summary line on a press and opens again on a second", () => {
    render(
      <InspectorSection title="Geo" foldSummary="IP: 203.0.113.204">
        <div>BODY_CONTENT</div>
      </InspectorSection>
    );
    fireEvent.click(screen.getByRole("button", { name: "Fold the Geo section" }));
    const button = screen.getByRole("button", { name: "Open the Geo section" });
    expect(button).toHaveAttribute("aria-expanded", "false");
    expect(button.getAttribute("data-tip")).toBe(sectionFoldWords("Geo", false).join("\n"));
    expect(screen.queryByText("BODY_CONTENT")).toBeNull();
    const line = screen.getByText("IP: 203.0.113.204");
    expect(line.getAttribute("data-tip")).toBe("IP: 203.0.113.204");
    expect(line.className).toContain("truncate");
    expect(line.className).toContain("text-[10px]");
    expect(line.className).toContain("text-[color:var(--text-faint-on-inspector)]");

    fireEvent.click(button);
    expect(screen.getByRole("button", { name: "Fold the Geo section" })).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText("BODY_CONTENT")).toBeInTheDocument();
    expect(screen.queryByText("IP: 203.0.113.204")).toBeNull();
  });

  it("points the button at the body it folds", () => {
    render(
      <InspectorSection title="Geo" foldSummary="IP: 203.0.113.204">
        <div>BODY_CONTENT</div>
      </InspectorSection>
    );
    const button = screen.getByRole("button", { name: "Fold the Geo section" });
    const body = screen.getByText("BODY_CONTENT").parentElement as HTMLElement;
    expect(button.getAttribute("aria-controls")).toBe(body.id);
    expect(body.id).not.toBe("");
  });

  it("keeps the trailing element outside the button, shown folded or open", () => {
    render(
      <InspectorSection title="Geo" foldSummary="IP: 203.0.113.204" trailing={<span>TRAIL</span>}>
        <div>BODY_CONTENT</div>
      </InspectorSection>
    );
    const button = screen.getByRole("button", { name: "Fold the Geo section" });
    expect(button).not.toContainElement(screen.getByText("TRAIL"));
    fireEvent.click(button);
    expect(screen.getByText("TRAIL")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Open the Geo section" })).not.toContainElement(screen.getByText("TRAIL"));
  });

  it("draws the chevron by state and keeps it out of the accessible name", () => {
    render(
      <InspectorSection title="Geo" foldSummary="x">
        <div>BODY_CONTENT</div>
      </InspectorSection>
    );
    const icon = () => screen.getByRole("button").querySelector("svg") as SVGElement;
    expect(icon().getAttribute("aria-hidden")).toBe("true");
    const open = icon().getAttribute("class");
    fireEvent.click(screen.getByRole("button"));
    expect(icon().getAttribute("aria-hidden")).toBe("true");
    expect(icon().getAttribute("class")).not.toBe(open);
  });

  it("a section draws no icon in its title, even when an old caller still passes a field", () => {
    // The prop is gone from the type, so the old call is built with a cast.
    const old = { field: "derived_at_this_merchant" } as object;
    render(
      <InspectorSection title="At this merchant" {...old}>
        x
      </InspectorSection>
    );
    const title = screen.getByText("At this merchant");
    expect(title.querySelector("svg")).toBeNull();
    expect(title.style.color).toBe("var(--text-muted)");
  });

  it("a section with no field draws no icon in its title", () => {
    render(<InspectorSection title="Geo">x</InspectorSection>);
    expect(screen.getByText("Geo").querySelector("svg")).toBeNull();
  });
});

import { describe, it, expect, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { PopOutButton } from "./PopOutButton";
import { WindowFrame } from "../pivot/WindowFrame";
import { usePivotStore } from "../../store/pivot";
import type { Entity } from "../../lib/entity";

const signIn: Entity = {
  id: "si-0628", kind: "signin", timestamp: 0, coords: { lat: 52.3676, lng: 4.9041 },
  fields: { id: "si-0628" },
  displayMetadata: { primaryLabel: "Dana Whitlow · 203.0.113.66", secondaryLabel: "", paletteKind: "signin", pivotableFields: [] },
};
const view = { type: "section", sectionId: "sign-in", label: "Sign-in" } as const;

beforeEach(() => usePivotStore.setState({ windows: [], nextZ: 20 }));

describe("PopOutButton", () => {
  it("is a named button that opens the section beside the pin", () => {
    render(<PopOutButton entity={signIn} view={view} />);
    fireEvent.click(screen.getByRole("button", { name: "Pop out Sign-in beside its pin" }));
    const [w] = usePivotStore.getState().windows;
    expect(w.kind === "detail" && w.view).toEqual(view);
  });

  it("its tooltip repeats the accessible name, so a screen reader does not read it twice", () => {
    render(<PopOutButton entity={signIn} view={view} />);
    const btn = screen.getByRole("button", { name: "Pop out Sign-in beside its pin" });
    expect(btn.getAttribute("title")).toBe(btn.getAttribute("aria-label"));
  });

  it("hands focus to the window it opens, and again when pressed for the open window", () => {
    // The layer's role, reduced: render the store's popout through the real frame.
    function Frame() {
      const w = usePivotStore((s) => s.windows[0]);
      if (!w) return null;
      return (
        <WindowFrame id={w.id} title="popout" anchorScreen={{ x: 0, y: 0 }} z={w.z} accent="#7ee787"
          pinned={w.pinned} collapsed={w.collapsed} flagged canFlag={false}>
          <div>rows</div>
        </WindowFrame>
      );
    }
    render(<><PopOutButton entity={signIn} view={view} /><Frame /></>);
    const btn = screen.getByRole("button", { name: "Pop out Sign-in beside its pin" });
    fireEvent.click(btn);
    const dialog = screen.getByRole("dialog");
    expect(document.activeElement).toBe(dialog);
    // The investigator goes back to the inspector, then presses the control for the open window.
    btn.focus();
    fireEvent.click(btn);
    expect(usePivotStore.getState().windows).toHaveLength(1);
    expect(document.activeElement).toBe(dialog);
  });

  it("renders nothing for an entity with no geography", () => {
    const { container } = render(<PopOutButton entity={{ ...signIn, coords: null }} view={view} />);
    expect(container.firstChild).toBeNull();
  });
});

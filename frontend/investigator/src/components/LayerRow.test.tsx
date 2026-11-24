import { afterEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, renderHook, screen } from "@testing-library/react";
import { KeyRow, LayerSwitch, MixedSwatch, Swatch, useOnMenu, type LayerSwitchProps } from "./LayerRow";
import { useTheme } from "../store/theme";
import { legibleOnPanel } from "../theme/legibility";
import { resolvePalette } from "../theme/resolve";

const base: LayerSwitchProps = {
  label: "Authorizations",
  on: true,
  onToggle: () => {},
  color: "var(--r1-on-panel)",
};

const toggleButton = () => screen.getByRole("button", { pressed: true }) as HTMLButtonElement;

describe("Swatch", () => {
  it("is filled with its colour when on, with no border", () => {
    const { container } = render(<Swatch on color="rgb(1, 2, 3)" />);
    const el = container.firstElementChild as HTMLElement;
    expect(el.style.backgroundColor).toBe("rgb(1, 2, 3)");
    expect(el.classList.contains("border")).toBe(false);
    expect(el.getAttribute("aria-hidden")).toBe("true");
    expect(el.classList.contains("rounded-xs")).toBe(true);
  });

  it("is a ring in the dim token with no background when off", () => {
    const { container } = render(<Swatch on={false} color="rgb(1, 2, 3)" />);
    const el = container.firstElementChild as HTMLElement;
    expect(el.classList.contains("border")).toBe(true);
    expect(el.classList.contains("border-dim")).toBe(true);
    expect(el.style.backgroundColor).toBe("");
  });
});

describe("LayerSwitch", () => {
  it("reports its state through aria-pressed", () => {
    const { unmount } = render(<LayerSwitch {...base} on />);
    expect(screen.getByRole("button", { name: /^Authorizations/ }).getAttribute("aria-pressed")).toBe("true");
    unmount();
    render(<LayerSwitch {...base} on={false} />);
    expect(screen.getByRole("button", { name: /^Authorizations/ }).getAttribute("aria-pressed")).toBe("false");
  });

  it("calls onToggle once per click", () => {
    const onToggle = vi.fn();
    render(<LayerSwitch {...base} onToggle={onToggle} />);
    fireEvent.click(toggleButton());
    expect(onToggle).toHaveBeenCalledTimes(1);
  });

  it("reads the label in the text tone when on and the muted tone when off", () => {
    const { unmount } = render(<LayerSwitch {...base} on />);
    expect(screen.getByText("Authorizations").style.color).toBe("var(--text)");
    unmount();
    render(<LayerSwitch {...base} on={false} />);
    expect(screen.getByText("Authorizations").style.color).toBe("var(--text-muted)");
  });

  it("shows the count, in the muted tone unless a countTone is given", () => {
    const { unmount } = render(<LayerSwitch {...base} count="3 / 9" />);
    expect(screen.getByText("3 / 9").style.color).toBe("var(--text-muted)");
    expect(screen.getByText("3 / 9").className).toContain("tabular-nums");
    unmount();
    const err = render(<LayerSwitch {...base} count="ERR" countTone="var(--alarm-on-panel)" />);
    // "ERR" has no slash, so the screen-reader copy repeats it; the visible count is the one
    // carrying the tabular-nums class.
    const visible = err.container.querySelector(".tabular-nums") as HTMLElement;
    expect(visible.textContent).toBe("ERR");
    expect(visible.style.color).toBe("var(--alarm-on-panel)");
  });

  it("draws no count element without a count", () => {
    const { container } = render(<LayerSwitch {...base} />);
    expect(container.querySelector(".tabular-nums")).toBeNull();
  });

  it("fills the swatch with its colour when on and rings it when off", () => {
    const { container, unmount } = render(<LayerSwitch {...base} color="rgb(9, 8, 7)" on />);
    expect((container.querySelector("button span[aria-hidden]") as HTMLElement).style.backgroundColor).toBe(
      "rgb(9, 8, 7)",
    );
    unmount();
    const off = render(<LayerSwitch {...base} color="rgb(9, 8, 7)" on={false} />);
    expect(off.container.querySelector("button span.border-dim")).not.toBeNull();
  });

  it("has exactly one button without details", () => {
    render(<LayerSwitch {...base} />);
    expect(screen.getAllByRole("button")).toHaveLength(1);
  });

  it("adds a details button tied to its region, and a click on it leaves onToggle alone", () => {
    const onToggle = vi.fn();
    const onDetails = vi.fn();
    render(
      <LayerSwitch
        {...base}
        onToggle={onToggle}
        details={{ open: false, onToggle: onDetails, id: "region-1" }}
      />,
    );
    const fold = screen.getByRole("button", { name: "Authorizations details" });
    expect(fold.getAttribute("aria-expanded")).toBe("false");
    // The region is not in the document while folded, so the chevron names no region yet.
    expect(fold.hasAttribute("aria-controls")).toBe(false);
    fireEvent.click(fold);
    expect(onDetails).toHaveBeenCalledTimes(1);
    expect(onToggle).not.toHaveBeenCalled();
    expect(screen.getAllByRole("button")).toHaveLength(2);
  });

  it("draws a right chevron when folded and a down chevron when open", () => {
    const { rerender } = render(
      <LayerSwitch {...base} details={{ open: false, onToggle: () => {}, id: "r" }} />,
    );
    const icon = () =>
      screen.getByRole("button", { name: "Authorizations details" }).querySelector("svg") as SVGElement;
    expect(icon().getAttribute("class")).toContain("lucide-chevron-right");
    expect(icon().getAttribute("aria-hidden")).toBe("true");
    rerender(<LayerSwitch {...base} details={{ open: true, onToggle: () => {}, id: "r" }} />);
    expect(icon().getAttribute("class")).toContain("lucide-chevron-down");
    expect(screen.getByRole("button", { name: "Authorizations details" }).getAttribute("aria-expanded")).toBe(
      "true",
    );
  });

  it("holds a spare w-6 slot after the button when gutter is set and there are no details", () => {
    const { container, unmount } = render(<LayerSwitch {...base} gutter />);
    const slot = container.querySelector("button + span.w-6") as HTMLElement;
    expect(slot).not.toBeNull();
    expect(slot.getAttribute("aria-hidden")).toBe("true");
    expect(slot.textContent).toBe("");
    unmount();
    const without = render(<LayerSwitch {...base} />);
    expect(without.container.querySelector("span.w-6")).toBeNull();
  });

  it("holds no spare slot when it carries details, gutter or not", () => {
    const { container } = render(
      <LayerSwitch {...base} gutter details={{ open: false, onToggle: () => {}, id: "r" }} />,
    );
    expect(container.querySelectorAll("span.w-6")).toHaveLength(0);
  });

  it("names the toggle by name when one is given", () => {
    render(<LayerSwitch {...base} label="Fraud" name="Fraud path" />);
    expect(screen.getByRole("button", { name: "Fraud path" })).toBeTruthy();
  });

  it("names the toggle by its label and the spoken count together without a name", () => {
    render(<LayerSwitch {...base} count="144 / 144" />);
    expect(screen.getByRole("button", { name: "Authorizations 144 of 144" })).toBeTruthy();
  });

  it("names the region the chevron controls only while the details are open", () => {
    const { rerender } = render(
      <LayerSwitch {...base} details={{ open: false, onToggle: () => {}, id: "region-9" }} />,
    );
    const fold = () => screen.getByRole("button", { name: "Authorizations details" });
    expect(fold().hasAttribute("aria-controls")).toBe(false);
    rerender(<LayerSwitch {...base} details={{ open: true, onToggle: () => {}, id: "region-9" }} />);
    expect(fold().getAttribute("aria-controls")).toBe("region-9");
  });

  it("points the toggle's aria-describedby at describedBy, and sets none without it", () => {
    const { unmount } = render(<LayerSwitch {...base} describedBy="note-1" />);
    expect(toggleButton().getAttribute("aria-describedby")).toBe("note-1");
    unmount();
    render(<LayerSwitch {...base} />);
    expect(toggleButton().hasAttribute("aria-describedby")).toBe(false);
  });

  it("keeps the fill of the square and the dot under forced colours", () => {
    const { container, unmount } = render(<LayerSwitch {...base} on />);
    expect(container.querySelector("button span[aria-hidden]")?.classList.contains("forced-color-adjust-none")).toBe(
      true,
    );
    unmount();
    const off = render(<LayerSwitch {...base} on={false} />);
    expect(
      off.container.querySelector("button span[aria-hidden]")?.classList.contains("forced-color-adjust-none"),
    ).toBe(true);
    off.unmount();
    const key = render(<KeyRow label="Shipment" color="red" count="1" />);
    expect(key.container.querySelector("span.rounded-full")?.classList.contains("forced-color-adjust-none")).toBe(
      true,
    );
  });
});

describe("spoken counts", () => {
  // The visible count is for the eye; a screen reader hears the second span instead.
  const spans = (container: HTMLElement) => {
    const visible = container.querySelector(".tabular-nums") as HTMLElement;
    return { visible, spoken: visible.nextElementSibling as HTMLElement };
  };

  it("a switch row hides its visible count and follows it with the count in words", () => {
    const { container } = render(<LayerSwitch {...base} count="144 / 144" />);
    const { visible, spoken } = spans(container);
    expect(visible.textContent).toBe("144 / 144");
    expect(visible.getAttribute("aria-hidden")).toBe("true");
    expect(spoken.classList.contains("sr-only")).toBe(true);
    expect(spoken.textContent).toBe("144 of 144");
    expect(spoken.classList.contains("tabular-nums")).toBe(false);
  });

  it("a switch row speaks countSpoken when it is given", () => {
    const { container } = render(<LayerSwitch {...base} count="ERR" countSpoken="load error" />);
    const { visible, spoken } = spans(container);
    expect(visible.textContent).toBe("ERR");
    expect(spoken.textContent).toBe("load error");
    expect(screen.getByRole("button", { name: "Authorizations load error" })).toBeTruthy();
  });

  it("a key row hides its visible count and follows it with the count in words", () => {
    const { container } = render(<KeyRow label="Shipment" color="red" count="2 / 3" />);
    const { visible, spoken } = spans(container);
    expect(visible.getAttribute("aria-hidden")).toBe("true");
    expect(spoken.classList.contains("sr-only")).toBe(true);
    expect(spoken.textContent).toBe("2 of 3");
  });

  it("a key row speaks countSpoken when it is given", () => {
    const { container } = render(<KeyRow label="Shipment" color="red" count="2 / 3" countSpoken="two reached" />);
    expect(spans(container).spoken.textContent).toBe("two reached");
  });

  it("a count with no slash is spoken as it is", () => {
    const { container } = render(<LayerSwitch {...base} count="ERR" />);
    expect(spans(container).spoken.textContent).toBe("ERR");
  });
});

describe("LayerSwitch hover", () => {
  it("uses the flat transport hover fill and no fade", () => {
    render(<LayerSwitch {...base} />);
    expect(toggleButton().className).toContain("hover:bg-text/10");
    expect(toggleButton().className).not.toContain("opacity-");
  });
});

describe("row tooltips", () => {
  // The tooltip sits on the left span (the square and the label), not on the control, so a screen
  // reader does not hear the name twice.
  it("a switch row carries its whole label as a tooltip on the label span, never on the button", () => {
    const { container, unmount } = render(<LayerSwitch {...base} label="Authorizations" />);
    expect(toggleButton().hasAttribute("title")).toBe(false);
    const tip = container.querySelector("[title]") as HTMLElement;
    expect(tip.getAttribute("title")).toBe("Authorizations");
    expect(tip.tagName).toBe("SPAN");
    expect(tip.textContent).toBe("Authorizations");
    expect(container.querySelectorAll("[title]")).toHaveLength(1);
    unmount();
    const named = render(
      <LayerSwitch {...base} label="Console sign-in" name="Console sign-in path" count="3" />,
    );
    expect(toggleButton().hasAttribute("title")).toBe(false);
    expect(named.container.querySelector("[title]")?.getAttribute("title")).toBe("Console sign-in");
  });

  it("the details chevron takes no label tooltip", () => {
    render(<LayerSwitch {...base} details={{ open: false, onToggle: () => {}, id: "d" }} />);
    expect(screen.getByRole("button", { name: "Authorizations details" }).title).toBe("");
  });

  it("a key row carries its whole label as a tooltip on the label span only", () => {
    const { container } = render(<KeyRow label="Organisation" color="red" count="1 / 2" />);
    const tip = container.querySelector("[title]") as HTMLElement;
    expect(tip.getAttribute("title")).toBe("Organisation");
    expect(tip.tagName).toBe("SPAN");
    expect(tip.textContent).toBe("Organisation");
    expect(container.querySelectorAll("[title]")).toHaveLength(1);
  });
});

describe("KeyRow", () => {
  it("renders no button, with a round dot, the label and the count", () => {
    const { container } = render(<KeyRow label="Shipment" color="rgb(4, 5, 6)" count="2 / 3" />);
    expect(screen.queryByRole("button")).toBeNull();
    const dot = container.querySelector("span.rounded-full") as HTMLElement;
    expect(dot).not.toBeNull();
    expect(dot.style.backgroundColor).toBe("rgb(4, 5, 6)");
    expect(dot.getAttribute("aria-hidden")).toBe("true");
    expect(screen.getByText("Shipment")).toBeTruthy();
    expect(screen.getByText("2 / 3").className).toContain("tabular-nums");
    expect(container.innerHTML).not.toContain("hover:");
    expect(container.innerHTML).not.toContain("cursor-pointer");
  });

  it("ends its count where a switch row's count does: the inner row takes the button's 6 px", () => {
    const { container } = render(<KeyRow label="Shipment" color="red" count="1" />);
    const row = container.querySelector("div.h-\\[26px\\]") as HTMLElement;
    expect(row.classList.contains("pr-1.5")).toBe(true);
    // The switch button carries the same 6 px on its right edge.
    const sw = render(<LayerSwitch {...base} count="1" />);
    expect(sw.container.querySelector("button")?.classList.contains("px-1.5")).toBe(true);
  });

  it("adds the spare w-6 slot only with gutter", () => {
    const { container, unmount } = render(<KeyRow label="Shipment" color="red" count="1" gutter />);
    expect(container.querySelector("span.w-6[aria-hidden]")).not.toBeNull();
    unmount();
    const plain = render(<KeyRow label="Shipment" color="red" count="1" />);
    expect(plain.container.querySelector("span.w-6")).toBeNull();
  });
});

describe("LayerSwitch: mixed", () => {
  it("reads aria-pressed mixed and draws a two-part square, the label staying in the text tone", () => {
    const { container } = render(<LayerSwitch {...base} on mixed color="rgb(9, 8, 7)" />);
    const button = screen.getByRole("button", { name: /^Authorizations/ });
    expect(button.getAttribute("aria-pressed")).toBe("mixed");
    const square = container.querySelector("button svg") as SVGElement;
    expect(square).not.toBeNull();
    expect(square.getAttribute("aria-hidden")).toBe("true");
    expect(square.querySelectorAll("rect")).toHaveLength(2);
    expect(square.style.color).toBe("rgb(9, 8, 7)");
    // No round-cornered square: the drawing's corners are square.
    expect(square.querySelector("rect[rx]")).toBeNull();
    expect(screen.getByText("Authorizations").style.color).toBe("var(--text)");
  });

  it("draws the plain square when mixed is not set", () => {
    const { container } = render(<LayerSwitch {...base} on />);
    expect(container.querySelector("button svg")).toBeNull();
  });
});

describe("MixedSwatch", () => {
  it("is a 9 px aria-hidden svg in the given colour that keeps its fill under forced colours", () => {
    const { container } = render(<MixedSwatch color="rgb(1, 2, 3)" />);
    const svg = container.firstElementChild as SVGElement;
    expect(svg.tagName.toLowerCase()).toBe("svg");
    expect(svg.getAttribute("aria-hidden")).toBe("true");
    expect(svg.getAttribute("width")).toBe("9");
    expect(svg.getAttribute("height")).toBe("9");
    expect(svg.style.color).toBe("rgb(1, 2, 3)");
    expect(svg.getAttribute("class")).toContain("forced-color-adjust-none");
  });
});

describe("LayerSwitch: plain", () => {
  it("prints the label as given, with no capitals and no letter spacing, at 10 px and weight 600", () => {
    render(<LayerSwitch {...base} label="residential proxy" plain />);
    const label = screen.getByText("residential proxy");
    expect(label.textContent).toBe("residential proxy");
    expect(label.classList.contains("uppercase")).toBe(false);
    expect(label.className).not.toContain("tracking-");
    expect(label.classList.contains("text-[10px]")).toBe(true);
    expect(label.style.fontWeight).toBe("600");
  });

  it("keeps the on and off tones of the Eyebrow label", () => {
    const { unmount } = render(<LayerSwitch {...base} label="corporate" plain on />);
    expect(screen.getByText("corporate").style.color).toBe("var(--text)");
    unmount();
    render(<LayerSwitch {...base} label="corporate" plain on={false} />);
    expect(screen.getByText("corporate").style.color).toBe("var(--text-muted)");
  });

  it("is the uppercase Eyebrow label without it", () => {
    render(<LayerSwitch {...base} />);
    expect(screen.getByText("Authorizations").classList.contains("uppercase")).toBe(true);
  });
});

describe("LayerSwitch: tipLines", () => {
  it("puts the lines on the toggle button as data-tip and aria-description, and no title anywhere", () => {
    const { container } = render(<LayerSwitch {...base} tipLines={["Sign-in", "Shows or hides the records."]} />);
    const button = toggleButton();
    expect(button.getAttribute("data-tip")).toBe("Sign-in\nShows or hides the records.");
    expect(button.getAttribute("aria-description")).toBe("Sign-in. Shows or hides the records.");
    expect(container.querySelectorAll("[title]")).toHaveLength(0);
  });

  it("keeps the label title when no lines are given", () => {
    const { container } = render(<LayerSwitch {...base} />);
    expect(toggleButton().hasAttribute("data-tip")).toBe(false);
    expect(container.querySelectorAll("[title]")).toHaveLength(1);
  });
});

describe("LayerSwitch: glyph", () => {
  it("draws the node in a 9 px aria-hidden box between the square and the label", () => {
    const { container } = render(<LayerSwitch {...base} glyph={<svg data-testid="g" />} />);
    const labelSpan = container.querySelector("[title]") as HTMLElement;
    const kids = [...labelSpan.children];
    // The square, the glyph box, then the label.
    expect(kids).toHaveLength(3);
    const box = kids[1] as HTMLElement;
    expect(box.getAttribute("aria-hidden")).toBe("true");
    expect(box.className).toContain("h-[9px]");
    expect(box.className).toContain("w-[9px]");
    expect(box.querySelector("[data-testid='g']")).not.toBeNull();
    expect(kids[2].textContent).toBe("Authorizations");
  });

  it("draws no box without a glyph", () => {
    const { container } = render(<LayerSwitch {...base} />);
    expect((container.querySelector("[title]") as HTMLElement).children).toHaveLength(2);
  });
});

describe("LayerSwitch: disabled", () => {
  it("says so with aria-disabled, ignores a press, dims the label and stays focusable", () => {
    const onToggle = vi.fn();
    render(<LayerSwitch {...base} on={false} disabled onToggle={onToggle} />);
    const button = screen.getByRole("button", { name: /^Authorizations/ }) as HTMLButtonElement;
    expect(button.getAttribute("aria-disabled")).toBe("true");
    expect(button.hasAttribute("disabled")).toBe(false);
    fireEvent.click(button);
    expect(onToggle).not.toHaveBeenCalled();
    expect(screen.getByText("Authorizations").style.color).toBe("var(--text-faint)");
    button.focus();
    expect(document.activeElement).toBe(button);
  });

  it("sets no aria-disabled when it is not disabled", () => {
    render(<LayerSwitch {...base} />);
    expect(toggleButton().hasAttribute("aria-disabled")).toBe(false);
  });
});

describe("LayerSwitch: details.tipLines", () => {
  it("puts the lines on the chevron, and nothing without them", () => {
    const { unmount } = render(
      <LayerSwitch {...base} details={{ open: false, onToggle: () => {}, id: "d", tipLines: ["Sign-in by Network type", "Press to open the values."] }} />,
    );
    const chevron = screen.getByRole("button", { name: "Authorizations details" });
    expect(chevron.getAttribute("data-tip")).toBe("Sign-in by Network type\nPress to open the values.");
    unmount();
    render(<LayerSwitch {...base} details={{ open: false, onToggle: () => {}, id: "d" }} />);
    expect(screen.getByRole("button", { name: "Authorizations details" }).hasAttribute("data-tip")).toBe(false);
  });
});

describe("useOnMenu", () => {
  const saved = { theme: useTheme.getState().theme, color: useTheme.getState().color };
  afterEach(() => useTheme.setState(saved));

  const surface = (theme: "dark" | "light"): [number, number, number] =>
    resolvePalette(theme, "rainbow")
      .material.panelBase.split(/\s+/)
      .map((n) => Number(n) / 255) as [number, number, number];

  it("steps a #rrggbb colour to 3:1 on the current menu surface, and re-steps when the theme changes", () => {
    useTheme.setState({ theme: "light", color: "rainbow" });
    const { result } = renderHook(() => useOnMenu());
    const stepped = result.current("#7ee787");
    expect(stepped).toBe(legibleOnPanel("#7ee787", surface("light"), 3));
    expect(stepped).not.toBe("#7ee787");
    act(() => useTheme.setState({ theme: "dark", color: "rainbow" }));
    expect(result.current("#7ee787")).toBe(legibleOnPanel("#7ee787", surface("dark"), 3));
  });

  it("steps an uppercase #RRGGBB colour to the same value as its lowercase form", () => {
    useTheme.setState({ theme: "light", color: "rainbow" });
    const { result } = renderHook(() => useOnMenu());
    const lower = result.current("#7ee787");
    // On the light menu the lowercase colour is stepped, so an uppercase colour passed through
    // unchanged would differ from it.
    expect(lower).not.toBe("#7ee787");
    expect(result.current("#7EE787")).toBe(lower);
  });

  it("passes a value that is not #rrggbb through unchanged", () => {
    const { result } = renderHook(() => useOnMenu());
    expect(result.current("rebeccapurple")).toBe("rebeccapurple");
    expect(result.current("var(--r1)")).toBe("var(--r1)");
  });
});

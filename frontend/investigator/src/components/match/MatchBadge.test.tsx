import { describe, it, expect, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MatchBadge } from "./MatchBadge";
import { useMatches } from "../../store/matches";

describe("MatchBadge", () => {
  beforeEach(() => useMatches.setState({ active: null }));

  it("renders nothing when count is 0", () => {
    const { container } = render(<MatchBadge field="mcc" value="5411" count={0} baseline={2} />);
    expect(container.querySelector("button")).toBeNull();
  });

  it("renders 'xN match' text when count > 0", () => {
    render(<MatchBadge field="mcc" value="5411" count={3} baseline={2} />);
    expect(screen.getByText(/×3/)).toBeInTheDocument();
  });

  it("click opens matches with field + value", () => {
    render(<MatchBadge field="acquirer" value="Zamberi Pay" count={5} baseline={1} />);
    fireEvent.click(screen.getByRole("button"));
    const a = useMatches.getState().active;
    expect(a?.mode).toBe("field");
    expect(a?.mode === "field" && a.field).toBe("acquirer");
    expect(a?.mode === "field" && a.value).toBe("Zamberi Pay");
  });

  it("renders red tone when baseline=0 and count>0 (signature anomaly)", () => {
    render(<MatchBadge field="mcc" value="9999" count={3} baseline={0} />);
    const btn = screen.getByRole("button");
    expect(btn.getAttribute("data-tone")).toBe("red");
  });

  it("renders red tone when count/baseline >= 3", () => {
    render(<MatchBadge field="mcc" value="5411" count={30} baseline={5} />);
    expect(screen.getByRole("button").getAttribute("data-tone")).toBe("red");
  });

  it("renders cyan tone when within baseline", () => {
    render(<MatchBadge field="mcc" value="5411" count={5} baseline={3} />);
    expect(screen.getByRole("button").getAttribute("data-tone")).toBe("cyan");
  });

  // The plate: a square box, a 1 px line in the tag's own colour
  // at 60 percent, and a fill of that colour at --tag-fill (a token per palette cell, theme/tokens.ts).
  // Red and cyan differ by colour and weight only; the plate is identical.
  const TIMES = String.fromCharCode(215); // the multiplication sign before the count
  const PLATE_TONES = [
    { name: "red", colour: "var(--alarm-on-panel)", weight: "700", args: [3, 0] as const },
    { name: "cyan", colour: "var(--r1-on-panel)", weight: "500", args: [5, 3] as const },
  ];

  // happy-dom drops a colour holding color-mix(), so the two colours (the line at 60 percent, the
  // fill at --tag-fill, both of the tag's own text colour) are the .tag-plate class, whose rule is
  // pinned in theme/css-gen.test.ts; the box is inline and read here.
  it.each(PLATE_TONES)("$name draws the plate: 1px solid line, 1px radius, the colours from .tag-plate", (t) => {
    render(<MatchBadge field="mcc" value="9999" count={t.args[0]} baseline={t.args[1]} />);
    const btn = screen.getByRole("button");
    expect(btn.dataset.tone).toBe(t.name);
    expect(btn.style.borderTopWidth).toBe("1px");
    expect(btn.style.borderRightWidth).toBe("1px");
    expect(btn.style.borderBottomWidth).toBe("1px");
    expect(btn.style.borderLeftWidth).toBe("1px");
    expect(btn.style.borderStyle).toBe("solid");
    expect(btn.style.borderRadius).toBe("1px");
    expect(btn.className.split(/\s+/)).toContain("tag-plate");
    // The line and the fill come from the text colour (currentColor), so no raw colour is set here.
    expect(btn.style.borderColor).toBe("");
    expect(btn.style.backgroundColor).toBe("");
    expect(btn.style.color).toBe(t.colour);
    expect(btn.textContent).toBe(`${TIMES}${t.args[0]}`);
  });

  it("red is bold and cyan medium, so the two tones differ without colour once the left rule is gone", () => {
    const red = render(<MatchBadge field="mcc" value="9999" count={3} baseline={0} />);
    const redWeight = screen.getByRole("button").style.fontWeight;
    red.unmount();
    render(<MatchBadge field="mcc" value="5411" count={5} baseline={3} />);
    const cyanWeight = screen.getByRole("button").style.fontWeight;
    expect(redWeight).toBe("700");
    expect(cyanWeight).toBe("500");
    expect(redWeight).not.toBe(cyanWeight);
  });

  it("the plate is the same in both tones: 1px above and below, 3px at the sides, a pinned 9.5px line", () => {
    const seen: string[] = [];
    for (const t of PLATE_TONES) {
      const { unmount } = render(<MatchBadge field="mcc" value="5411" count={t.args[0]} baseline={t.args[1]} />);
      const s = screen.getByRole("button").style;
      seen.push([s.paddingTop, s.paddingRight, s.paddingBottom, s.paddingLeft, s.lineHeight].join(" "));
      unmount();
    }
    expect(seen).toEqual(["1px 3px 1px 3px 9.5px", "1px 3px 1px 3px 9.5px"]);
  });

  it("adds no word and no signal: no title, no tooltip, the same accessible name, no extra children", () => {
    render(<MatchBadge field="mcc" value="5411" count={5} baseline={3} />);
    const btn = screen.getByRole("button");
    expect(btn.hasAttribute("title")).toBe(false);
    expect(btn.hasAttribute("aria-describedby")).toBe(false);
    expect(btn.getAttribute("aria-label")).toBe("Open matches for mcc=5411 (5 matches)");
    expect(btn.childElementCount).toBe(0);
    expect(btn.textContent).toBe(`${TIMES}5`);
  });

  // The two sizes may change later: this
  // pins today's size so that change is two edited numbers.
  const COUNT_SIZE_CLASS = "text-[9px]";
  it("keeps the count's size class as it is", () => {
    render(<MatchBadge field="mcc" value="5411" count={5} baseline={3} />);
    const cls = screen.getByRole("button").className.split(/\s+/);
    expect(cls).toContain(COUNT_SIZE_CLASS);
    expect(cls.filter((c) => /^text-\[/.test(c))).toEqual([COUNT_SIZE_CLASS]);
  });

  it("is a square plate button: no pill class, no raw-slot text class, the contract attributes and name kept", () => {
    render(<MatchBadge field="mcc" value="5411" count={5} baseline={3} />);
    const btn = screen.getByRole("button");
    expect(btn.style.borderRadius).toBe("1px");
    expect(btn.className).not.toMatch(/rounded/);
    expect(btn.className).not.toContain("text-accent");
    expect(btn.className).not.toContain("text-signal");
    expect(btn.hasAttribute("data-badge")).toBe(true);
    expect(btn.getAttribute("aria-label")).toBe("Open matches for mcc=5411 (5 matches)");
  });

  it("carries hover and press feedback and honours reduced motion", () => {
    render(<MatchBadge field="mcc" value="5411" count={5} baseline={3} />);
    const cls = screen.getByRole("button").className.split(/\s+/);
    expect(cls).toContain("active:scale-[0.95]");
    expect(cls).toContain("motion-reduce:transition-none");
    // Hover underlines the count and changes no colour: a brightness filter
    // drops the on-panel colours below 4.5:1 in the light cells.
    expect(cls).toContain("hover:underline");
    expect(cls).toContain("underline-offset-2");
    expect(cls.some((c) => c.includes("brightness"))).toBe(false);
  });

  it("click stops propagation (parent handler does not fire)", () => {
    let parentFired = false;
    render(
      <div onClick={() => { parentFired = true; }}>
        <MatchBadge field="mcc" value="5411" count={3} baseline={1} />
      </div>
    );
    fireEvent.click(screen.getByRole("button"));
    expect(parentFired).toBe(false);
  });
});

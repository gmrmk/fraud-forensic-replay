import { describe, it, expect, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { render, screen, fireEvent } from "@testing-library/react";
import { DecisionPill } from "./DecisionPill";
import type { Decision, DecisionAction } from "../lib/decisions";
import { COLOR_MODES, THEMES } from "../theme/axes";
import { contrastRatio } from "../theme/legibility";
import { resolvePalette } from "../theme/resolve";
import { hexToRgb01 } from "../theme/to-rgb";

function decision(overrides: Partial<Decision> = {}): Decision {
  return {
    id: "decision:account-takeover:gen-login-40927",
    rule: { id: "account-takeover", label: "account-takeover", kind: "login-anomaly" },
    subjectPathKind: "login",
    triggerEntityIds: ["gen-login-40927"],
    inputs: [],
    thresholds: [],
    verdict: "ACCOUNT TAKEOVER",
    decision: "STEP-UP",
    evidence: [],
    severity: 0.9,
    ...overrides,
  };
}

const MODEL = {
  rule: { id: "ml-card-anomaly", label: "model anomaly", kind: "ml-anomaly" },
  verdict: "MODEL ANOMALY",
  decision: "REVIEW" as const,
};

describe("DecisionPill", () => {
  it("renders the verdict and the action word", () => {
    render(<DecisionPill decision={decision()} onClick={() => {}} />);
    expect(screen.getByText("ACCOUNT TAKEOVER")).toBeTruthy();
    expect(screen.getByText("STEP-UP")).toBeTruthy();
  });

  it("tags ml-anomaly decisions with ML and omits it otherwise", () => {
    const { rerender } = render(<DecisionPill decision={decision(MODEL)} onClick={() => {}} />);
    expect(screen.getByText("ML")).toBeTruthy();
    rerender(<DecisionPill decision={decision()} onClick={() => {}} />);
    expect(screen.queryByText("ML")).toBeNull();
  });

  it("fires onClick and carries the breakout aria-label, starting with its visible text", () => {
    const onClick = vi.fn();
    render(<DecisionPill decision={decision()} onClick={onClick} />);
    const btn = screen.getByRole("button", {
      name: "STEP-UP ACCOUNT TAKEOVER. Open the rule trace.",
    });
    fireEvent.click(btn);
    expect(onClick).toHaveBeenCalledOnce();
  });

  it("names a model rule with the ML tag first", () => {
    render(<DecisionPill decision={decision(MODEL)} onClick={() => {}} />);
    expect(
      screen.getByRole("button", { name: "ML REVIEW MODEL ANOMALY. Open the rule trace." }),
    ).toBeTruthy();
  });

  it("takes the placement's action label", () => {
    render(
      <DecisionPill decision={decision()} onClick={() => {}} actionLabel="View rule description." />,
    );
    expect(
      screen.getByRole("button", { name: "STEP-UP ACCOUNT TAKEOVER. View rule description." }),
    ).toBeTruthy();
  });

  it("is one button: no nested button and no count", () => {
    const { container } = render(<DecisionPill decision={decision()} onClick={() => {}} />);
    expect(container.querySelectorAll("button")).toHaveLength(1);
    expect(container.querySelectorAll("button button")).toHaveLength(0);
    expect(container.textContent).toBe("STEP-UPACCOUNT TAKEOVER");
  });

  it("draws no warning glyph and no pill radius", () => {
    const { container } = render(<DecisionPill decision={decision()} onClick={() => {}} />);
    const btn = screen.getByRole("button");
    expect(container.textContent).not.toContain("⚠");
    expect(btn.style.borderRadius).toBe("");
    expect(container.querySelector(".rounded-pill")).toBeNull();
    expect(container.querySelector(".rounded-full")).toBeNull();
  });

  it("draws a left rule whose width follows the action's slot", () => {
    const widths: [DecisionAction, string][] = [
      ["DECLINE", "3px"],
      ["FLAG", "2px"],
      ["STEP-UP", "2px"],
      ["STEP_UP", "2px"],
      ["REVIEW", "2px"],
      ["ALLOW", "1px"],
    ];
    for (const [action, width] of widths) {
      const { unmount } = render(
        <DecisionPill decision={decision({ decision: action })} onClick={() => {}} />,
      );
      const btn = screen.getByRole("button");
      expect(btn.style.borderLeftWidth, action).toBe(width);
      expect(btn.style.borderLeftStyle, action).toBe("solid");
      unmount();
    }
  });

  it("colours the action word by the on-panel slot and the rule name with --text", () => {
    const { rerender } = render(
      <DecisionPill decision={decision({ decision: "DECLINE" })} onClick={() => {}} />,
    );
    expect(screen.getByText("DECLINE").style.color).toBe("var(--alarm-on-panel)");
    expect(screen.getByText("ACCOUNT TAKEOVER").style.color).toBe("var(--text)");
    rerender(<DecisionPill decision={decision({ decision: "ALLOW" })} onClick={() => {}} />);
    expect(screen.getByText("ALLOW").style.color).toBe("var(--r1-on-panel)");
    rerender(<DecisionPill decision={decision()} onClick={() => {}} />);
    expect(screen.getByText("STEP-UP").style.color).toBe("var(--r3-on-panel)");
  });

  it("keeps the action word bold at 9px and the rule name at 8.5px", () => {
    render(<DecisionPill decision={decision()} onClick={() => {}} />);
    const word = screen.getByText("STEP-UP");
    expect(word.style.fontSize).toBe("9px");
    expect(word.className).toContain("font-bold");
    expect(screen.getByText("ACCOUNT TAKEOVER").style.fontSize).toBe("8.5px");
  });

  it("dimmed: the words keep their colour and the button takes no opacity", () => {
    const lit = render(<DecisionPill decision={decision()} onClick={() => {}} />);
    const litWord = screen.getByText("STEP-UP").style.color;
    const litName = screen.getByText("ACCOUNT TAKEOVER").style.color;
    lit.unmount();

    render(<DecisionPill decision={decision()} onClick={() => {}} emphasized={false} />);
    const btn = screen.getByRole("button");
    expect(screen.getByText("STEP-UP").style.color).toBe("var(--r3-on-panel)");
    expect(screen.getByText("STEP-UP").style.color).toBe(litWord);
    expect(screen.getByText("ACCOUNT TAKEOVER").style.color).toBe(litName);
    expect(btn.style.opacity).toBe("");
    expect(btn.className).not.toMatch(/opacity-/);
    expect(btn.style.borderLeftWidth).toBe("2px");
  });

  it("dimmed: only the rule's colour changes", () => {
    const lit = render(<DecisionPill decision={decision()} onClick={() => {}} />);
    const litRule = screen.getByRole("button").style.borderLeftColor;
    lit.unmount();
    render(<DecisionPill decision={decision()} onClick={() => {}} emphasized={false} />);
    const dimRule = screen.getByRole("button").style.borderLeftColor;
    expect(litRule).toBe("var(--r3-on-panel)");
    // happy-dom drops the dimmed `rgb(var(...) / 0.4)` form from style reads, so the
    // dimmed rule is read here only as different from the lit one; actionRuleColor's
    // own test pins its value.
    expect(dimRule).not.toBe(litRule);
  });

  it("colours the ML tag like the action word", () => {
    render(<DecisionPill decision={decision(MODEL)} onClick={() => {}} />);
    expect(screen.getByText("ML").style.color).toBe("var(--r3-on-panel)");
    expect(screen.getByText("ML").style.color).toBe(screen.getByText("REVIEW").style.color);
  });

  // The ML tag's plate: the count's plate around the two letters,
  // in the action word's colour; the fill is that colour at --tag-fill (theme/tokens.ts).
  it.each([
    ["ALLOW", "var(--r1-on-panel)"],
    ["STEP-UP", "var(--r3-on-panel)"],
    ["DECLINE", "var(--alarm-on-panel)"],
  ] as const)("the ML tag is a plate in the %s colour: 1px solid line, 1px radius, the colours from .tag-plate", (action, colour) => {
    // happy-dom drops a colour holding color-mix(), so the line (60 percent) and the fill (--tag-fill)
    // are the .tag-plate class, both of the tag's own text colour; its rule is pinned in
    // theme/css-gen.test.ts. The box is inline and read here.
    for (const emphasized of [true, false]) {
      const { unmount } = render(
        <DecisionPill decision={decision({ ...MODEL, decision: action })} onClick={() => {}} emphasized={emphasized} />,
      );
      const ml = screen.getByText("ML");
      const s = ml.style;
      expect(s.color).toBe(colour);
      expect(s.borderTopWidth).toBe("1px");
      expect(s.borderRightWidth).toBe("1px");
      expect(s.borderBottomWidth).toBe("1px");
      expect(s.borderLeftWidth).toBe("1px");
      expect(s.borderStyle).toBe("solid");
      expect(s.borderRadius).toBe("1px");
      expect(ml.className.split(/\s+/)).toContain("tag-plate");
      expect(s.borderColor).toBe("");
      expect(s.backgroundColor).toBe("");
      unmount();
    }
  });

  it("the ML plate has 1px above and below, 3px at the left and a right side shortened by the letter spacing, and a line height of 1", () => {
    render(<DecisionPill decision={decision(MODEL)} onClick={() => {}} />);
    const ml = screen.getByText("ML");
    // The .12em tracking leaves that much after the last letter, so the right padding is 3px less
    // that much and the two letters sit centred in the plate.
    expect(ml.style.letterSpacing).toBe(".12em");
    expect(ml.style.lineHeight).toBe("1");
    // happy-dom drops the whole padding once one side holds calc(), so the padding is read from
    // the source (the page proof reads it computed): 1px above and below, 3px at the sides, and
    // the right side less the .12em of tracking that follows the last letter.
    const src = readFileSync(resolve(__dirname, "DecisionPill.tsx"), "utf8");
    expect(src).toMatch(/padding: "1px 3px",\s*paddingRight: "calc\(3px - \.12em\)",\s*lineHeight: 1,/);
  });

  it("the plate does not change with emphasis: a dimmed row's ML tag is drawn as a lit one's", () => {
    const lit = render(<DecisionPill decision={decision(MODEL)} onClick={() => {}} />);
    const a = screen.getByText("ML").getAttribute("style");
    lit.unmount();
    render(<DecisionPill decision={decision(MODEL)} onClick={() => {}} emphasized={false} />);
    expect(screen.getByText("ML").getAttribute("style")).toBe(a);
  });

  it("adds no word and no signal: the ML tag has no title, no tooltip and the accessible name it had", () => {
    render(<DecisionPill decision={decision(MODEL)} onClick={() => {}} />);
    const btn = screen.getByRole("button");
    expect(btn.hasAttribute("title")).toBe(false);
    expect(screen.getByText("ML").hasAttribute("title")).toBe(false);
    expect(btn.getAttribute("aria-label")).toBe("ML REVIEW MODEL ANOMALY. Open the rule trace.");
    expect(screen.getByText("ML").childElementCount).toBe(0);
  });

  // This pins the ML tag's current size so a later size change is one edited number.
  const ML_FONT_SIZE = "6.5px";
  it("keeps the ML tag's size as it is, bold and upper case", () => {
    render(<DecisionPill decision={decision(MODEL)} onClick={() => {}} />);
    const ml = screen.getByText("ML");
    expect(ml.style.fontSize).toBe(ML_FONT_SIZE);
    expect(ml.className).toContain("font-bold");
    expect(ml.className).toContain("uppercase");
  });

  it("carries press and hover feedback and honours reduced motion", () => {
    render(<DecisionPill decision={decision()} onClick={() => {}} />);
    const cls = screen.getByRole("button").className.split(/\s+/);
    expect(cls).toContain("active:scale-[0.97]");
    expect(cls).toContain("motion-reduce:transition-none");
    // Hover underlines the words in their own colours. A brightness filter would
    // lighten the on-panel colours below 4.5:1 in the light cells (measured
    // 3.47 to 4.34 on 2026-11-15), so hover changes no colour.
    expect(cls).toContain("group");
    expect(cls.some((c) => c.includes("brightness"))).toBe(false);
    for (const word of ["STEP-UP", "ACCOUNT TAKEOVER"]) {
      const wc = screen.getByText(word).className.split(/\s+/);
      expect(wc, word).toContain("group-hover:underline");
      expect(wc, word).toContain("underline-offset-2");
    }
  });
});

describe("chip and badge contrast (tokens, all themes and colour modes)", () => {
  const triplet = (t: string): [number, number, number] => {
    const [r, g, b] = t.split(/\s+/).map((n) => parseInt(n, 10) / 255);
    return [r, g, b];
  };

  it("each on-panel action colour reaches 4.5:1 on the Inspector surface and the matches window", () => {
    const failures: string[] = [];
    let min = Infinity;
    for (const theme of THEMES) {
      for (const color of COLOR_MODES) {
        const p = resolvePalette(theme, color);
        const surfaces = {
          inspector: triplet(p.material.panelBase),
          matches: hexToRgb01(p.neutral.surface),
        };
        for (const slot of ["alarm", "r3", "r1"] as const) {
          const fg = hexToRgb01(p.onPanel[slot]);
          for (const [where, bg] of Object.entries(surfaces)) {
            const c = contrastRatio(fg, bg);
            min = Math.min(min, c);
            if (c < 4.5) failures.push(`${theme}.${color}.${slot} on ${where} = ${c.toFixed(2)}:1`);
          }
        }
      }
    }
    expect(failures).toEqual([]);
    // The loops ran: 3 slots on 2 surfaces in every cell, so the minimum is not an empty walk's Infinity.
    expect(Number.isFinite(min)).toBe(true);
    // Computed from the built site: at least 5.01 in every cell.
    expect(min).toBeGreaterThanOrEqual(5);
  });
});

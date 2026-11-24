// The two marks a declined attempt adds to a row (the word DECLINED and the struck amount) must
// reach 4.5 to 1 on the surface each one sits on. The colours are read from the customer theme
// (tailwind.config.js) by the class each mark carries in the rendered row; nothing is copied into
// this file. The ratio is the WCAG relative luminance formula, computed by the helpers below.
// Not covered: the row's second line, the badge's border, the FLAGGED badge (other parts own them).
import { afterEach, it, expect } from "vitest";
import { cleanup, render } from "@testing-library/react";
// The config is plain JavaScript with no declaration file; its shape is read through the cast below.
// @ts-expect-error TS7016: no types for tailwind.config.js
import tailwind from "../../tailwind.config.js";
import { TxnRow } from "./TxnRow";
import type { Transaction } from "../lib/types";

afterEach(cleanup);

const FLOOR = 4.5;

// Flatten the theme's colours to the names a class uses: { fraud: { DEFAULT, bg } } becomes
// fraud and fraud-bg; a plain key stays as it is.
function themeColours(): Record<string, string> {
  const out: Record<string, string> = {};
  const colors = tailwind.theme.extend.colors as Record<string, string | Record<string, string>>;
  for (const [key, value] of Object.entries(colors)) {
    if (typeof value === "string") {
      out[key] = value;
    } else {
      for (const [sub, hex] of Object.entries(value)) {
        out[sub === "DEFAULT" ? key : `${key}-${sub}`] = hex;
      }
    }
  }
  return out;
}

// The theme colour a prefix class (text- or bg-) names on an element; exactly one is expected.
function colourOf(el: Element, prefix: "text-" | "bg-"): string {
  const colours = themeColours();
  const names = Array.from(el.classList)
    .filter((c) => c.startsWith(prefix))
    .map((c) => c.slice(prefix.length))
    .filter((name) => name in colours);
  expect(names, `${prefix} colour class on <${el.tagName.toLowerCase()} class="${el.className}">`).toHaveLength(1);
  return colours[names[0]];
}

function channel(v: number): number {
  const s = v / 255;
  return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
}

function luminance(hex: string): number {
  const n = parseInt(hex.slice(1), 16);
  return 0.2126 * channel((n >> 16) & 255) + 0.7152 * channel((n >> 8) & 255) + 0.0722 * channel(n & 255);
}

function ratio(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

const row = (over: Partial<Transaction> = {}): Transaction => ({
  id: "t1", card_id: "c1", timestamp: "2026-05-27T07:41:00-05:00", amount: 580.4,
  merchant_name: "Harbor Cash Point", merchant_lat: 6.5364, merchant_lng: 3.3972,
  merchant_country: "NG", mcc: "6011", category: "Cash Advance",
  is_card_present: 1, is_fraud: 1, balance_after: 100, auth_response_code: "05", ...over,
});

it("the word DECLINED reaches 4.5 to 1 on the badge's own fill", () => {
  const { getByText } = render(<TxnRow tx={row()} />);
  const badge = getByText("DECLINED");
  const r = ratio(colourOf(badge, "text-"), colourOf(badge, "bg-"));
  expect(r).toBeGreaterThanOrEqual(FLOOR);
});

it("the struck amount reaches 4.5 to 1 on a flagged row's fill", () => {
  const { container, getByText } = render(<TxnRow tx={row()} />);
  const rowEl = container.firstElementChild as Element;
  const amount = getByText("$580.40");
  expect(amount.className).toContain("line-through");
  const r = ratio(colourOf(amount, "text-"), colourOf(rowEl, "bg-"));
  expect(r).toBeGreaterThanOrEqual(FLOOR);
});

it("the struck amount reaches 4.5 to 1 on the plain row's surface (the list's panel)", () => {
  const { container, getByText } = render(<TxnRow tx={row({ is_fraud: 0, merchant_country: "US" })} />);
  const rowEl = container.firstElementChild as Element;
  // A row that is not flagged carries no fill of its own: it sits on the list's panel.
  expect(Array.from(rowEl.classList).some((c) => c.startsWith("bg-"))).toBe(false);
  const amount = getByText("$580.40");
  const r = ratio(colourOf(amount, "text-"), themeColours().panel);
  expect(r).toBeGreaterThanOrEqual(FLOOR);
});

it("the helper measures the known pairs of the probe (a pair under the floor reads under it)", () => {
  // Pins the formula to figures measured in the browser: white on the flagged badge's red is 6.57.
  expect(ratio("#ffffff", themeColours().fraud)).toBeCloseTo(6.57, 1);
});

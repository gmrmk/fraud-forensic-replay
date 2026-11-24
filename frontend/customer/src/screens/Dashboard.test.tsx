// The Dashboard's day headings and row times read Houston time, as the top bar does, for a viewer
// anywhere. A viewer in London is played by giving every date or time format that names no zone
// the London zone; a format that names a zone keeps it. The fixtures are made up (no card data).
import { afterEach, beforeEach, it, expect, vi } from "vitest";
import { cleanup, render } from "@testing-library/react";
import { Dashboard } from "./Dashboard";
import { useClock } from "../store/clock";
import { useData } from "../store/data";
import type { Transaction } from "../lib/types";

const VIEWER = "Europe/London";
const timeOf = Date.prototype.toLocaleTimeString;
const dateOf = Date.prototype.toLocaleDateString;

const grocery: Transaction = {
  id: "grocery", card_id: "c1", timestamp: "2026-05-26T22:00:00-05:00", amount: 40,
  merchant_name: "Harbor Grocers", merchant_lat: 29.777, merchant_lng: -95.546, merchant_country: "US",
  mcc: "5411", category: "Groceries", is_card_present: 1, is_fraud: 0, balance_after: 100,
};

beforeEach(() => {
  vi.spyOn(Date.prototype, "toLocaleTimeString").mockImplementation(function (
    this: Date, locales?: Intl.LocalesArgument, options?: Intl.DateTimeFormatOptions,
  ) {
    return timeOf.call(this, locales, { timeZone: VIEWER, ...options });
  });
  vi.spyOn(Date.prototype, "toLocaleDateString").mockImplementation(function (
    this: Date, locales?: Intl.LocalesArgument, options?: Intl.DateTimeFormatOptions,
  ) {
    return dateOf.call(this, locales, { timeZone: VIEWER, ...options });
  });
  useData.setState({ account: null, txns: [grocery], error: null });
  useClock.setState({ t: Date.parse("2026-05-26T23:00:00-05:00"), playing: false, rate: 1 });
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  useData.setState({ txns: [], error: null });
  useClock.setState({ t: 0, playing: false, rate: 1 });
});

it("a viewer in London sees the 10 PM Houston grocery row at 10:00 PM under Tue, May 26", () => {
  // The viewer's own zone holds: with no zone named, the row's moment is 4 AM the next day.
  expect(new Date(grocery.timestamp).toLocaleTimeString("en-US", { hour: "numeric", hour12: true })).toMatch(/^4\sAM$/);
  const { container } = render(<Dashboard />);
  const text = container.textContent ?? "";
  expect(text).toContain("Tue, May 26");
  expect(text).not.toContain("Wed, May 27");
  expect(text).toMatch(/US · Groceries · 10:00\sPM/);
});

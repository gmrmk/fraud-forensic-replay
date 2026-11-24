// The Alerts screen before and during the Lagos minutes: with only an online test charge flagged it
// lists the charge and names no Lagos activity, and once a Lagos attempt is visible its callout
// keeps the real distance from the last purchase. The fixtures are made up (no card data); the
// clock and the data are set straight on the stores.
import { afterEach, beforeEach, it, expect } from "vitest";
import { cleanup, render } from "@testing-library/react";
import { Alerts } from "./Alerts";
import { useClock } from "../store/clock";
import { useData } from "../store/data";
import type { Transaction } from "../lib/types";

const tx = (id: string, iso: string, over: Partial<Transaction> = {}): Transaction => ({
  id, card_id: "c1", timestamp: iso, amount: 40, merchant_name: "Harbor Cash Point",
  merchant_lat: 29.777, merchant_lng: -95.546, merchant_country: "US", mcc: "5411",
  category: "Groceries", is_card_present: 1, is_fraud: 0, balance_after: 100, ...over,
});
const lag = { merchant_lat: 6.5364, merchant_lng: 3.3972, merchant_country: "NG", is_fraud: 1 };

const txns: Transaction[] = [
  tx("grocery", "2026-05-26T22:00:00-05:00"),
  tx("atm1", "2026-05-27T07:41:00-05:00", { ...lag, auth_response_code: "05" }),
  tx("atm2", "2026-05-27T07:42:00-05:00", lag),
];

beforeEach(() => { useData.setState({ account: null, txns, error: null }); });
afterEach(() => { cleanup(); useData.setState({ txns: [], error: null }); useClock.setState({ t: 0, playing: false, rate: 1 }); });

const at = (iso: string) => useClock.setState({ t: Date.parse(iso), playing: false, rate: 1 });

it("with only the declined attempt visible the callout prints the distance in miles, not the word far", () => {
  at("2026-05-27T07:41:30-05:00");
  const { container, getByText } = render(<Alerts />);
  expect(getByText("DECLINED")).toBeInTheDocument();
  expect(container.textContent).toMatch(/Card-present activity 6,526 mi from your last purchase/);
  expect(container.textContent).not.toMatch(/activity far from/);
});

it("with only an online test charge flagged the screen lists it and names no Lagos activity", () => {
  useData.setState({
    txns: [...txns, tx("probe", "2026-05-21T09:14:00-05:00", { is_card_present: 0, is_fraud: 1, amount: 1 })],
  });
  at("2026-05-21T09:15:00-05:00");
  const { container, getByText } = render(<Alerts />);
  expect(getByText("1 active")).toBeInTheDocument();
  expect(container.textContent).not.toMatch(/Lagos/);
  expect(container.textContent).not.toMatch(/Card-present activity/);
});

it("once the approved charge posts the callout still prints the same distance", () => {
  at("2026-05-27T07:42:30-05:00");
  const { container } = render(<Alerts />);
  expect(container.textContent).toMatch(/Card-present activity 6,526 mi from your last purchase/);
});

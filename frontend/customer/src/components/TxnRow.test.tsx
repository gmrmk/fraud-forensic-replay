// What a row of the customer app's list prints for an approved row, a flagged one and a declined
// attempt. Fixtures use a made-up merchant and no card data of any kind.
import { afterEach, it, expect } from "vitest";
import { cleanup, render } from "@testing-library/react";
import { TxnRow } from "./TxnRow";
import type { Transaction } from "../lib/types";

afterEach(cleanup);

const row = (over: Partial<Transaction> = {}): Transaction => ({
  id: "t1", card_id: "c1", timestamp: "2026-05-27T07:41:00-05:00", amount: 580.4,
  merchant_name: "Harbor Cash Point", merchant_lat: 6.5364, merchant_lng: 3.3972,
  merchant_country: "NG", mcc: "6011", category: "Cash Advance",
  is_card_present: 1, is_fraud: 1, balance_after: 100, ...over,
});

const LABEL = "Declined, not charged";

it("a declined, flagged row prints FLAGGED then DECLINED and the amount with no minus sign", () => {
  const { getByText } = render(<TxnRow tx={row({ auth_response_code: "05" })} />);
  const flagged = getByText("FLAGGED");
  const declined = getByText("DECLINED");
  expect(flagged.compareDocumentPosition(declined) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  const amount = getByText("$580.40");
  expect(amount.className).toContain("line-through");
  expect(amount.className).toContain("text-muted-strong");
});

it("a declined row carries its words as visually hidden text that no ancestor hides from assistive technology", () => {
  const { container, getByText } = render(<TxnRow tx={row({ auth_response_code: "05" })} />);
  const hidden = getByText(LABEL);
  expect(container.contains(hidden)).toBe(true);
  expect(hidden.className).toContain("sr-only");
  // The words sit inside the amount's element, and nothing from the span up to the container is hidden.
  expect(hidden.parentElement).toBe(getByText("$580.40"));
  for (let el: Element | null = hidden; el !== null && el !== container.parentElement; el = el.parentElement) {
    expect(el.getAttribute("aria-hidden")).not.toBe("true");
    expect(el.hasAttribute("hidden")).toBe(false);
  }
});

it("an approved, flagged row prints FLAGGED, no DECLINED, and the amount with its minus sign", () => {
  const { getByText, queryByText } = render(<TxnRow tx={row({ auth_response_code: "00" })} />);
  expect(getByText("FLAGGED")).toBeInTheDocument();
  expect(queryByText("DECLINED")).toBeNull();
  expect(getByText("-$580.40")).toBeInTheDocument();
  expect(queryByText(LABEL)).toBeNull();
});

it("a row with no response code reads as approved", () => {
  const { queryByText, getByText } = render(<TxnRow tx={row()} />);
  expect(queryByText("DECLINED")).toBeNull();
  expect(getByText("-$580.40")).toBeInTheDocument();
});

it("an approved, unflagged row is unchanged: no badge of either kind and -$ before its amount", () => {
  const { queryByText, getByText } = render(
    <TxnRow tx={row({ is_fraud: 0, amount: 24.5, merchant_country: "US", auth_response_code: "00" })} />,
  );
  expect(queryByText("FLAGGED")).toBeNull();
  expect(queryByText("DECLINED")).toBeNull();
  expect(getByText("-$24.50")).toBeInTheDocument();
  expect(queryByText(LABEL)).toBeNull();
});

it("a declined row that is not flagged still carries the DECLINED badge and the struck amount", () => {
  const { getByText, queryByText } = render(
    <TxnRow tx={row({ is_fraud: 0, merchant_country: "US", auth_response_code: "05" })} />,
  );
  expect(queryByText("FLAGGED")).toBeNull();
  expect(getByText("DECLINED")).toBeInTheDocument();
  expect(getByText("$580.40").className).toContain("line-through");
  expect(getByText(LABEL)).toBeInTheDocument();
});

import { it, expect } from "vitest";
import { render } from "@testing-library/react";
import { CreditCard } from "./CreditCard";

it("shows the real card network as V*** on the face and in the product name", () => {
  const { getByText, queryByText } = render(<CreditCard network="Visa" bin="414720" lastFour="4729" holder="Marcus Chen" product="Visa Signature Cash Rewards" />);
  expect(getByText("V***")).toBeInTheDocument();
  expect(getByText("V*** Signature Cash Rewards")).toBeInTheDocument();
  expect(queryByText(/visa/i)).toBeNull();
});

it("prints the card's own BIN prefix, not a fixed one", () => {
  const { getByText } = render(<CreditCard network="visa" bin="414720" lastFour="4729" holder="Marcus Chen" product="Visa Signature Cash Rewards" />);
  expect(getByText("4147 ···· ···· 4729")).toBeInTheDocument();
});

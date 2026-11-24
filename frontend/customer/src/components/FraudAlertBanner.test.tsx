// The banner speaks of charges: its count is the alert's count, singular for one, nothing for no alert.
import { afterEach, it, expect } from "vitest";
import { cleanup, render } from "@testing-library/react";
import { FraudAlertBanner } from "./FraudAlertBanner";

afterEach(cleanup);

it("prints the plural for 3 charges", () => {
  const { getByText } = render(<FraudAlertBanner alert={{ count: 3, miles: 6526, minutes: 581 }} onReview={() => {}} />);
  expect(getByText("We spotted 3 unusual charges in Lagos, Nigeria")).toBeInTheDocument();
});

it("prints the singular for 1 charge", () => {
  const { getByText } = render(<FraudAlertBanner alert={{ count: 1, miles: 6526, minutes: 581 }} onReview={() => {}} />);
  expect(getByText("We spotted 1 unusual charge in Lagos, Nigeria")).toBeInTheDocument();
});

it("with count 0 it prints nothing", () => {
  const { container } = render(<FraudAlertBanner alert={{ count: 0, miles: 6526, minutes: 581 }} onReview={() => {}} />);
  expect(container).toBeEmptyDOMElement();
});

it("prints nothing with no alert", () => {
  const { container } = render(<FraudAlertBanner alert={null} onReview={() => {}} />);
  expect(container).toBeEmptyDOMElement();
});

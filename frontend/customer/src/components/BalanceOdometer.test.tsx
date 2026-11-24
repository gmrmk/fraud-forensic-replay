import { it, expect } from "vitest";
import { render } from "@testing-library/react";
import { BalanceOdometer } from "./BalanceOdometer";

it("renders one wheel per digit of #,###.## (6 wheels)", () => {
  const { container } = render(<BalanceOdometer value={2847.32} />);
  expect(container.querySelectorAll("[data-wheel]").length).toBe(6);
});
it("exposes the formatted value for assistive tech", () => {
  const { getByText } = render(<BalanceOdometer value={2847.32} />);
  expect(getByText("$2,847.32")).toBeInTheDocument();
});
it("positions each wheel declaratively at its digit (translateY = -digit*48)", () => {
  const { container } = render(<BalanceOdometer value={2847.32} />);
  const wheels = container.querySelectorAll<HTMLElement>("[data-wheel]");
  // digits [2,8,4,7,3,2] -> -96, -384, -192, -336, -144, -96
  expect(wheels[0].style.transform).toBe("translateY(-96px)");
  expect(wheels[1].style.transform).toBe("translateY(-384px)");
});
it("scales the roll transition to the playback rate", () => {
  const { container } = render(<BalanceOdometer value={100} rate={4} />);
  const wheel = container.querySelector<HTMLElement>("[data-wheel]")!;
  expect(wheel.style.transition).toContain("125ms"); // rollDurationMs(4)
});

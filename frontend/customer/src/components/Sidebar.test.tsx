import { it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { Sidebar } from "./Sidebar";

it("says the data is synthetic", () => {
  render(<Sidebar active="dashboard" onNavigate={() => {}} alertCount={0} />);
  expect(screen.getByText("Synthetic data. Fictional people and merchants.")).toBeInTheDocument();
});

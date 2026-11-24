import { describe, it, expect, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { PivotBadge } from "./PivotBadge";
import { usePivotStore } from "../../store/pivot";
import { useSelection } from "../../store/selection";
import type { EntityMatch } from "../../lib/matches";
import type { Transaction } from "../../types";

const tx = {
  id: "t1",
  merchant_name: "Mall · cash-out",
  merchant_lat: 6.43,
  merchant_lng: 3.42,
  is_fraud: 1,
} as Transaction;
const fraudEntity: EntityMatch = { kind: "fraud", tx };

describe("PivotBadge color rule", () => {
  beforeEach(() => {
    usePivotStore.setState({ windows: [], nextZ: 20 });
  });

  it("renders cyan when count matches baseline (within 3x)", () => {
    const { container } = render(
      <PivotBadge entity={fraudEntity} field="mcc" value="5411" count={15} baseline={14} />
    );
    const badge = container.querySelector("[data-badge]");
    expect(badge?.getAttribute("data-tone")).toBe("cyan");
  });

  it("renders red when baseline is 0 and count is > 0 (signature anomaly)", () => {
    const { container } = render(
      <PivotBadge entity={fraudEntity} field="merchant_country" value="NG" count={3} baseline={0} />
    );
    const badge = container.querySelector("[data-badge]");
    expect(badge?.getAttribute("data-tone")).toBe("red");
  });

  it("renders red when count >= 3x baseline", () => {
    const { container } = render(
      <PivotBadge entity={fraudEntity} field="mcc" value="5814" count={30} baseline={5} />
    );
    const badge = container.querySelector("[data-badge]");
    expect(badge?.getAttribute("data-tone")).toBe("red");
  });

  it("renders the ×N text with the count", () => {
    render(
      <PivotBadge entity={fraudEntity} field="acquirer" value="Zamberi Pay" count={3} baseline={0} />
    );
    expect(screen.getByText(/×3/)).toBeInTheDocument();
  });

  it("does not render when count is 0", () => {
    const { container } = render(
      <PivotBadge entity={fraudEntity} field="acquirer" value="Ladleton Pay" count={0} baseline={0} />
    );
    expect(container.querySelector("[data-badge]")).toBeNull();
  });
});

describe("PivotBadge click behavior", () => {
  beforeEach(() => {
    usePivotStore.setState({ windows: [], nextZ: 20 });
    useSelection.setState({ selected: null });
  });

  it("click opens a glance for the row entity WITHOUT changing selection", () => {
    render(
      <PivotBadge entity={fraudEntity} field="mcc" value="6011" count={6} baseline={1} />
    );
    fireEvent.click(screen.getByRole("button"));
    const ws = usePivotStore.getState().windows;
    expect(ws).toHaveLength(1);
    expect(ws[0].kind).toBe("detail");
    if (ws[0].kind === "detail") {
      expect(ws[0].entity).toEqual(fraudEntity);
    }
    expect(useSelection.getState().selected).toBeNull();
  });
});

import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { TargetButton } from "./TargetButton";
import { useNavigation } from "../../store/navigation";
import { useSelection } from "../../store/selection";
import type { EntityMatch } from "../../lib/matches";
import type { Transaction } from "../../types";

const tx: Transaction = {
  id: "tx-target-test", card_id: "c1", account_id: "a1",
  amount: 50, merchant_name: "TM", merchant_lat: 29, merchant_lng: -95,
  merchant_country: "US", mcc: "5411", category: "grocery",
  timestamp: "2026-05-26T20:00:00Z", is_card_present: 1, is_fraud: 0,
  balance_after: 100, auth_response_code: "00", pos_entry_mode: "chip",
  network_ref_number: "N1", terminal_id: "T1", acquirer: "Harlowe Bank",
  auth_source: "issuer", risk_score: 50, is_3ds: 0, currency: "USD",
};
const entity: EntityMatch = { kind: "auth", tx };

describe("TargetButton", () => {
  beforeEach(() => {
    useNavigation.setState({ panTarget: null, zoomTarget: null, pulseEntityId: null, pulseToken: 0 });
    useSelection.setState({ selected: null });
  });

  it("renders a button with the 'Go to this event on the map' aria-label", () => {
    render(<TargetButton entity={entity} variant="chrome" />);
    expect(screen.getByLabelText("Go to this event on the map")).toBeInTheDocument();
  });

  it("calls useNavigation.navigate on click", () => {
    render(<TargetButton entity={entity} variant="chrome" />);
    fireEvent.click(screen.getByLabelText("Go to this event on the map"));
    expect(useNavigation.getState().pulseEntityId).toBe("tx-target-test");
  });

  it("click stops propagation (parent handler does not fire)", () => {
    const parentHandler = vi.fn();
    render(
      <div onClick={parentHandler}>
        <TargetButton entity={entity} variant="row" />
      </div>
    );
    fireEvent.click(screen.getByLabelText("Go to this event on the map"));
    expect(parentHandler).not.toHaveBeenCalled();
  });

  it("chrome variant has data-variant='chrome'", () => {
    render(<TargetButton entity={entity} variant="chrome" />);
    expect(screen.getByLabelText("Go to this event on the map").getAttribute("data-variant")).toBe("chrome");
  });

  it("row variant has data-variant='row'", () => {
    render(<TargetButton entity={entity} variant="row" />);
    expect(screen.getByLabelText("Go to this event on the map").getAttribute("data-variant")).toBe("row");
  });
});

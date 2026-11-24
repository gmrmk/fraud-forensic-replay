import { describe, it, expect, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { TransferInspector } from "./TransferInspector";
import { useSessionFilter } from "../../store/session-filter";
import type { Transfer } from "../../types";

function makeTransfer(overrides: Partial<Transfer> = {}): Transfer {
  return {
    id: "tr_test_1",
    account_id: "acct_test_1",
    timestamp: "2026-06-08T16:30:00Z",
    amount: 250.0,
    payee_id: "payee_test_1",
    rail: "tamsinmere",
    status: "sent",
    decline_reason: null,
    session_id: "sess_tr_test",
    is_fraud: 0,
    ...overrides,
  };
}

describe("TransferInspector session button", () => {
  beforeEach(() => {
    useSessionFilter.setState({ selectedSessionId: null });
  });

  it("toggles the session filter on click and reflects aria-pressed", () => {
    const transfer = makeTransfer();
    render(<TransferInspector transfer={transfer} />);

    const button = screen.getByRole("button", { name: "Open session thread sess_tr_test" });
    expect(button.getAttribute("aria-pressed")).toBe("false");

    fireEvent.click(button);
    expect(useSessionFilter.getState().selectedSessionId).toBe("sess_tr_test");
    expect(button.getAttribute("aria-pressed")).toBe("true");
  });

  it("has a clip-safe keyboard focus indicator (inset ring survives the truncate wrapper's overflow:hidden)", () => {
    const transfer = makeTransfer();
    render(<TransferInspector transfer={transfer} />);

    const button = screen.getByRole("button", { name: "Open session thread sess_tr_test" });
    expect(button.className).toContain("focus:outline-none");
    expect(button.className).toContain("focus-visible:ring-1");
    expect(button.className).toContain("focus-visible:ring-inset");
    expect(button.className).toContain("focus-visible:ring-accent");
  });
});

// Ship list entry 30: every attribute row starts with the library icon of its field id, inside the
// label's own span and before its words.
describe("TransferInspector row icons", () => {
  it("every attribute row starts with its icon, with the Status plate of a blocked transfer", () => {
    const { container } = render(
      <TransferInspector transfer={makeTransfer({ status: "blocked", decline_reason: "velocity_limit" })} />,
    );
    const labels = container.querySelectorAll("span.float-left");
    expect(labels.length).toBe(5);
    for (const label of labels) expect(label.querySelector("svg.lucide"), label.textContent ?? "").not.toBeNull();
    const TABLE: readonly (readonly [string, string])[] = [
      ["When", "clock"],
      ["Amount", "banknote"],
      ["Payee", "contact"],
      ["Status", "toggle-right"],
      ["Session", "cookie"],
    ];
    for (const [label, icon] of TABLE) {
      const first = (screen.getByText(label).parentElement as HTMLElement).firstElementChild as Element;
      expect(first.classList.contains(`lucide-${icon}`), `${label} -> ${icon}`).toBe(true);
    }
  });
});

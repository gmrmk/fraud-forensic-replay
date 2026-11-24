import { describe, it, expect, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { AccountEventInspector } from "./AccountEventInspector";
import { useSessionFilter } from "../../store/session-filter";
import { TransferInspector } from "./TransferInspector";
import type { AccountEvent, Transfer } from "../../types";

function makeEvent(overrides: Partial<AccountEvent> = {}): AccountEvent {
  return {
    id: "ae_test_1",
    account_id: "acct_test_1",
    timestamp: "2026-06-08T16:00:00Z",
    kind: "profile_change",
    field: "email",
    old_value: "priya@tealmoor.example",
    new_value: "drain@sentrypine.example",
    payee_id: null,
    session_id: "sess_ae_test",
    is_fraud: 0,
    ...overrides,
  };
}

describe("AccountEventInspector status", () => {
  it("prints no Status row and no BLOCKED for a flagged profile change", () => {
    const { container } = render(<AccountEventInspector event={makeEvent({ is_fraud: 1 })} />);
    expect(screen.queryByText("Status")).toBeNull();
    expect(container.textContent).not.toContain("Status");
    expect(container.textContent).not.toContain("BLOCKED");
  });

  it("prints no Status row and no BLOCKED for a flagged payee add", () => {
    const { container } = render(
      <AccountEventInspector
        event={makeEvent({ kind: "payee_add", field: null, old_value: null, new_value: null, payee_id: "payee_test_9", is_fraud: 1 })}
      />,
    );
    expect(container.textContent).toContain("payee_test_9");
    expect(container.textContent).not.toContain("Status");
    expect(container.textContent).not.toContain("BLOCKED");
  });

  it("prints an unflagged profile change as it did: when, field, old and new value, session", () => {
    const { container } = render(<AccountEventInspector event={makeEvent()} />);
    const text = container.textContent ?? "";
    expect(text).toContain("Profile change");
    expect(text).toContain("When");
    expect(text).toContain("Field");
    expect(text).toContain("email");
    expect(text).toContain("p\u2022\u2022\u2022@tealmoor.example");
    expect(text).toContain("d\u2022\u2022\u2022@sentrypine.example");
    expect(screen.getByRole("button", { name: "Open session thread sess_ae_test" })).toBeTruthy();
    expect(text).not.toContain("Status");
  });

  it("prints a flagged event exactly as it prints an unflagged one: the flag changes nothing in this Inspector", () => {
    const flagged = render(<AccountEventInspector event={makeEvent({ is_fraud: 1 })} />);
    const flaggedText = flagged.container.textContent;
    flagged.unmount();
    const plain = render(<AccountEventInspector event={makeEvent({ is_fraud: 0 })} />);
    expect(flaggedText).toBe(plain.container.textContent);
  });

  it("leaves the transfer's Inspector alone: a blocked transfer still prints its own status and reason", () => {
    const transfer: Transfer = {
      id: "tr_test_1",
      account_id: "acct_test_1",
      timestamp: "2026-06-08T16:30:00Z",
      amount: 250,
      payee_id: "payee_test_1",
      rail: "wire",
      status: "blocked",
      decline_reason: "velocity_limit",
      session_id: "sess_tr_test",
      is_fraud: 1,
    };
    const { container } = render(<TransferInspector transfer={transfer} />);
    expect(container.textContent).toContain("Status");
    expect(container.textContent).toContain("BLOCKED \u00b7 VELOCITY LIMIT");
  });
});

describe("AccountEventInspector session button", () => {
  beforeEach(() => {
    useSessionFilter.setState({ selectedSessionId: null });
  });

  it("toggles the session filter on click and reflects aria-pressed", () => {
    render(<AccountEventInspector event={makeEvent()} />);

    const button = screen.getByRole("button", { name: "Open session thread sess_ae_test" });
    expect(button.getAttribute("aria-pressed")).toBe("false");

    fireEvent.click(button);
    expect(useSessionFilter.getState().selectedSessionId).toBe("sess_ae_test");
    expect(button.getAttribute("aria-pressed")).toBe("true");
  });

  it("has a clip-safe keyboard focus indicator (inset ring survives the truncate wrapper's overflow:hidden)", () => {
    render(<AccountEventInspector event={makeEvent()} />);

    const button = screen.getByRole("button", { name: "Open session thread sess_ae_test" });
    expect(button.className).toContain("focus:outline-none");
    expect(button.className).toContain("focus-visible:ring-1");
    expect(button.className).toContain("focus-visible:ring-inset");
    expect(button.className).toContain("focus-visible:ring-accent");
  });
});

// Ship list entry 30: every attribute row starts with the library icon of its field id, inside the
// label's own span and before its words.
describe("AccountEventInspector row icons", () => {
  function expectIcon(label: string, icon: string) {
    const first = (screen.getByText(label).parentElement as HTMLElement).firstElementChild as Element;
    expect(first.classList.contains(`lucide-${icon}`), `${label} -> ${icon}`).toBe(true);
  }

  it("every attribute row starts with its icon, for a profile change and for a payee add", () => {
    const change = render(<AccountEventInspector event={makeEvent()} />);
    const changeLabels = change.container.querySelectorAll("span.float-left");
    expect(changeLabels.length).toBe(3);
    for (const label of changeLabels) expect(label.querySelector("svg.lucide"), label.textContent ?? "").not.toBeNull();
    expectIcon("When", "clock");
    expectIcon("Field", "text-cursor-input");
    expectIcon("Session", "cookie");
    change.unmount();

    const add = render(
      <AccountEventInspector
        event={makeEvent({ kind: "payee_add", field: null, old_value: null, new_value: null, payee_id: "payee_test_9" })}
      />,
    );
    const addLabels = add.container.querySelectorAll("span.float-left");
    expect(addLabels.length).toBe(3);
    for (const label of addLabels) expect(label.querySelector("svg.lucide"), label.textContent ?? "").not.toBeNull();
    expectIcon("When", "clock");
    expectIcon("Payee", "contact");
    expectIcon("Session", "cookie");
  });

  it("the old to new line draws no icon", () => {
    const { container } = render(<AccountEventInspector event={makeEvent()} />);
    const line = screen.getByText(String.fromCharCode(0x2192)).parentElement as HTMLElement;
    expect(line.querySelector("svg")).toBeNull();
    expect(container.querySelectorAll("svg").length).toBe(3);
  });
});

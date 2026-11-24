import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { PlaceInspector } from "./PlaceInspector";
import type { Place, Transaction } from "../../types";

function makePlace(overrides: Partial<Place> = {}): Place {
  return {
    id: "place-1",
    name: "Cobstead Grocers Central",
    category: "grocery_store",
    lat: 29.7412,
    lng: -95.3929,
    ...overrides,
  };
}

function makeTx(overrides: Partial<Transaction> = {}): Transaction {
  return {
    id: "tx-1",
    card_id: "c",
    account_id: "a",
    timestamp: "2026-05-26T18:00:00-05:00",
    amount: 42.5,
    merchant_name: "Cobstead Grocers Central",
    merchant_lat: 29.7412,
    merchant_lng: -95.3929,
    merchant_country: "US",
    mcc: "5411",
    category: "groceries",
    is_card_present: 1,
    is_fraud: 0,
    balance_after: 500,
    auth_response_code: "00",
    pos_entry_mode: "chip",
    network_ref_number: "NRN001",
    terminal_id: "T001",
    acquirer: "Harlowe Bank",
    auth_source: "issuer",
    risk_score: 100,
    is_3ds: 0,
    currency: "USD",
    ...overrides,
  };
}

const place = makePlace();

describe("PlaceInspector", () => {
  it("renders place metadata fields", () => {
    render(<PlaceInspector place={place} transactions={[]} />);
    expect(screen.getByText("Cobstead Grocers Central")).toBeInTheDocument();
    expect(screen.getByText("grocery_store")).toBeInTheDocument();
  });

  // The Inspector carries no helper text: the Source row prints its value alone.
  it("Source: the value stands alone, with no line under it", () => {
    const { container } = render(<PlaceInspector place={place} transactions={[]} />);
    expect(screen.getByText("Source")).toBeInTheDocument();
    expect(screen.getByText("Places feed (cached)")).toBeInTheDocument();
    expect(screen.queryByText("not in txn DB")).toBeNull();
    expect(container.querySelector(".clear-both")).toBeNull();
  });

  it("shows 'None' when no nearby transactions", () => {
    render(<PlaceInspector place={place} transactions={[]} />);
    expect(screen.getByText("Nearby authorizations: none")).toBeInTheDocument();
  });

  it("shows nearby transactions without FRAUD tag when is_fraud = 0 (INS-08)", () => {
    const cleanTx = makeTx({ id: "tx-clean", is_fraud: 0 });
    render(<PlaceInspector place={place} transactions={[cleanTx]} />);
    expect(screen.getByText("$42.50")).toBeInTheDocument();
    expect(screen.queryByText("FRAUD")).toBeNull();
  });

  it("shows FRAUD marker on fraud transactions (INS-08)", () => {
    const fraudTx = makeTx({ id: "tx-fraud", is_fraud: 1, amount: 580.4 });
    render(<PlaceInspector place={place} transactions={[fraudTx]} />);
    expect(screen.getByText("FRAUD")).toBeInTheDocument();
    // The alarm colour as text takes the Inspector's on-panel form (BACKLOG item 16), not the raw slot.
    expect(screen.getByText("FRAUD").className).toContain("text-[color:var(--alarm-on-inspector)]");
  });

  it("applies signal color to the amount on fraud rows (INS-08)", () => {
    const fraudTx = makeTx({ id: "tx-fraud", is_fraud: 1, amount: 580.4 });
    render(<PlaceInspector place={place} transactions={[fraudTx]} />);
    const amountEl = screen.getByText("$580.40");
    expect(amountEl.className).toContain("text-[color:var(--alarm-on-inspector)]");
  });

  it("shows mixed: FRAUD on fraud row, no marker on clean row", () => {
    // Two transactions within range - one clean, one fraud.
    const cleanTx = makeTx({ id: "tx-clean", is_fraud: 0, amount: 42.5 });
    const fraudTx = makeTx({ id: "tx-fraud", is_fraud: 1, amount: 580.4 });
    render(<PlaceInspector place={place} transactions={[cleanTx, fraudTx]} />);

    // FRAUD label appears exactly once (only on the fraud row).
    const fraudLabels = screen.getAllByText("FRAUD");
    expect(fraudLabels).toHaveLength(1);
    expect(screen.getByText("$42.50")).toBeInTheDocument();
    expect(screen.getByText("$580.40")).toBeInTheDocument();
  });

  it("excludes transactions farther than 0.25 mi from the place", () => {
    // Houston Cobstead Grocers vs a merchant in Nigeria - haversine distance >> 0.25 mi.
    const farTx = makeTx({
      id: "tx-far",
      merchant_lat: 6.45,
      merchant_lng: 3.39,
      is_fraud: 1,
    });
    render(<PlaceInspector place={place} transactions={[farTx]} />);
    expect(screen.queryByText("FRAUD")).toBeNull();
    expect(screen.getByText("Nearby authorizations: none")).toBeInTheDocument();
  });
});

// Ship list entry 30: every attribute row starts with the library icon of its field id, inside the
// label's own span and before its words.
describe("PlaceInspector row icons", () => {
  it("every attribute row starts with its icon", () => {
    const { container } = render(<PlaceInspector place={makePlace()} transactions={[makeTx()]} />);
    const labels = container.querySelectorAll("span.float-left");
    expect(labels.length).toBe(4);
    for (const label of labels) expect(label.querySelector("svg.lucide"), label.textContent ?? "").not.toBeNull();
    const TABLE: readonly (readonly [string, string])[] = [
      ["Name", "case-sensitive"],
      ["Category", "shapes"],
      ["Location", "locate"],
      ["Source", "database"],
    ];
    for (const [label, icon] of TABLE) {
      const first = (screen.getByText(label).parentElement as HTMLElement).firstElementChild as Element;
      expect(first.classList.contains(`lucide-${icon}`), `${label} -> ${icon}`).toBe(true);
    }
    expect(screen.getByText("Authorizations within 0.25 miles").querySelector("svg")).toBeNull();
  });
});

import { describe, it, expect, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { AuthInspector } from "./AuthInspector";
import { useMatches } from "../../store/matches";
import { useTerminalRows } from "../match/terminal-rows";
import type { Transaction } from "../../types";

function makeTx(overrides: Partial<Transaction> = {}): Transaction {
  return {
    id: "tx1",
    card_id: "card-1",
    account_id: "acct-1",
    timestamp: "2026-05-25T10:07:00-05:00",
    amount: 42.5,
    merchant_name: "Corner Store",
    merchant_lat: 29.76,
    merchant_lng: -95.37,
    merchant_country: "US",
    mcc: "5411",
    category: "grocery",
    is_card_present: 1,
    is_fraud: 0,
    balance_after: 1000,
    auth_response_code: "00",
    pos_entry_mode: "chip",
    network_ref_number: "NRN1",
    terminal_id: "T1",
    acquirer: "Acme Acquiring",
    auth_source: "issuer",
    risk_score: 50,
    is_3ds: 0,
    currency: "USD",
    ...overrides,
  };
}

describe("AuthInspector", () => {
  beforeEach(() => {
    useMatches.setState({ active: null });
  });

  it("ERR-054: a common/benign merchant does not render the anomaly (red) tone", () => {
    // Realistic peer spread: several distinct merchants each with a normal
    // handful of transactions, and the inspected merchant sitting inside
    // that normal range - not a lone signature. baseline={0} would force
    // red regardless of how unremarkable this merchant actually is.
    const shared = "Corner Store";
    const transactions = [
      makeTx({ id: "t1", merchant_name: shared }),
      makeTx({ id: "t2", merchant_name: shared }),
      makeTx({ id: "t3", merchant_name: shared }),
      makeTx({ id: "t4", merchant_name: "Peer Merchant A" }),
      makeTx({ id: "t5", merchant_name: "Peer Merchant A" }),
      makeTx({ id: "t6", merchant_name: "Peer Merchant A" }),
      makeTx({ id: "t7", merchant_name: "Peer Merchant B" }),
      makeTx({ id: "t8", merchant_name: "Peer Merchant B" }),
      makeTx({ id: "t9", merchant_name: "Peer Merchant B" }),
    ];
    render(<AuthInspector tx={transactions[0]} transactions={transactions} logins={[]} />);
    const badge = screen.getByRole("button", {
      name: /Open matches for merchant_name=Corner Store/,
    });
    expect(badge.getAttribute("data-tone")).not.toBe("red");
  });

  it("ERR-054: a common/benign card_id does not render the anomaly (red) tone", () => {
    const shared = "card-1";
    const transactions = [
      makeTx({ id: "t1", card_id: shared }),
      makeTx({ id: "t2", card_id: shared }),
      makeTx({ id: "t3", card_id: shared }),
      makeTx({ id: "t4", card_id: "card-peer-a" }),
      makeTx({ id: "t5", card_id: "card-peer-a" }),
      makeTx({ id: "t6", card_id: "card-peer-a" }),
      makeTx({ id: "t7", card_id: "card-peer-b" }),
      makeTx({ id: "t8", card_id: "card-peer-b" }),
      makeTx({ id: "t9", card_id: "card-peer-b" }),
    ];
    render(<AuthInspector tx={transactions[0]} transactions={transactions} logins={[]} />);
    const badge = screen.getByRole("button", {
      name: /Open matches for card_id=card-1/,
    });
    expect(badge.getAttribute("data-tone")).not.toBe("red");
  });
});

// A caption says what a value is, never what it means for the case. The Score caption once printed
// "high - review" and a band word.
describe("AuthInspector score caption", () => {
  it("prints no caption under the Score at any score: no band word, no verdict, no line that no rule draws", () => {
    for (const risk_score of [0, 250, 450, 750, 981]) {
      const tx = makeTx({ risk_score });
      const { unmount } = render(<AuthInspector tx={tx} transactions={[tx]} logins={[]} />);
      expect(screen.queryByText(/review line|900/)).toBeNull();
      expect(screen.queryByText(/high|review$|elevated|^low$/)).toBeNull();
      unmount();
    }
  });
});

// The Inspector has no helper text. The Balance row prints its value
// alone, and so does every other row: the model's name and version are a row of their own (Model Version).
describe("AuthInspector prints no fixed line under a value", () => {
  beforeEach(() => {
    useMatches.setState({ active: null });
  });

  it("Balance: the value stands alone, with no line under it, card present and not present", () => {
    for (const is_card_present of [1, 0]) {
      const tx = makeTx({ is_card_present, balance_after: 2929.39 });
      const { container, unmount } = render(<AuthInspector tx={tx} transactions={[tx]} logins={[]} />);
      expect(screen.getByText("Balance")).toBeInTheDocument();
      expect(screen.getByText("$2929.39")).toBeInTheDocument();
      expect(screen.queryByText("Running")).toBeNull();
      expect(container.querySelector(".clear-both")).toBeNull();
      unmount();
    }
  });

  it("the panel holds no line under any value, even for a scored transaction with a model version", () => {
    const tx = makeTx({ ml_score: 0.93, ml_percentile: 99.8, ml_model_version: "f14edcac4fa0" });
    const { container } = render(<AuthInspector tx={tx} transactions={[tx]} logins={[]} />);
    const lines = Array.from(container.querySelectorAll(".clear-both")).map((el) => el.textContent);
    expect(lines).toEqual([]);
  });

  it("Source and POS Entry in Authorization details print their values only", () => {
    const tx = makeTx({ pos_entry_mode: "chip_fallback_swipe", auth_source: "stip" });
    render(<AuthInspector tx={tx} transactions={[tx]} logins={[]} />);
    expect(screen.getByText("STIP")).toBeInTheDocument();
    expect(screen.getByText("chip fallback swipe")).toBeInTheDocument();
    expect(screen.queryByText(/stand-in|issuer-authorized|chip was not read/)).toBeNull();
  });
});

// The Posted row's format is the one the panel prints for a timestamp (a weekday, a month and day, a dot,
// a time with a or p, CDT). Pinned on the rendered row from the function as it stood before it moved to
// lib/entities.ts: the strings did not change by a character. The dot is built from its code point.
describe("AuthInspector Posted row", () => {
  const DOT = String.fromCharCode(0xb7);
  const PINNED: readonly (readonly [string, string])[] = [
    ["2026-05-26T21:14:00Z", `Tue May 26 ${DOT} 4:14p CDT`],
    ["2026-05-26T10:07:00-05:00", `Tue May 26 ${DOT} 10:07a CDT`],
    ["2026-01-15T03:05:00Z", `Wed Jan 14 ${DOT} 9:05p CDT`],
  ];

  it("prints each of three fixed timestamps as it always has", () => {
    for (const [timestamp, expected] of PINNED) {
      const tx = makeTx({ timestamp });
      const { unmount } = render(<AuthInspector tx={tx} transactions={[tx]} logins={[]} />);
      expect(screen.getByText("Posted").closest("div")?.querySelector(".font-mono")?.textContent).toBe(expected);
      unmount();
    }
  });
});

// The Inspector has no helper text: the Baseline heading's trailing slot holds no fixed grey words,
// and the heading keeps its title.
describe("AuthInspector Baseline heading", () => {
  it("prints the title and nothing beside it", () => {
    const earlier = makeTx({ id: "t0", timestamp: "2026-05-20T10:07:00-05:00" });
    const tx = makeTx({ id: "t1" });
    const { container } = render(<AuthInspector tx={tx} transactions={[earlier, tx]} logins={[]} />);
    expect(screen.getByText("Baseline (30d)")).toBeInTheDocument();
    expect(screen.queryByText(/prior to this txn/)).toBeNull();
    const heading = screen.getByText("Baseline (30d)").parentElement as HTMLElement;
    expect(heading.children).toHaveLength(1);
    expect(container.textContent ?? "").not.toContain("prior to this txn");
  });
});

describe("AuthInspector model score row", () => {
  beforeEach(() => {
    useMatches.setState({ active: null });
  });

  const scored = {
    ml_score: 0.93,
    ml_percentile: 99.8,
    ml_model_version: "f14edcac4fa0",
  };

  it("shows the scorecard percentile, raw score and model version for a scored transaction", () => {
    const tx = makeTx(scored);
    render(<AuthInspector tx={tx} transactions={[tx]} logins={[]} />);

    const row = screen.getByText("Model").closest("div");
    expect(row).not.toBeNull();
    expect(row).toHaveTextContent("99.8 pct · score 0.930");
    // the version is a row of its own now, not a line under the Model value
    expect(row).not.toHaveTextContent("card-fraud-scorecard");
    expect(row?.querySelector(".clear-both")).toBeNull();
    // Calibration is untested: never a % or a probability claim.
    expect(row?.textContent).not.toMatch(/%|probab/i);
  });

  it("a row labelled Model Version follows Model and holds the record's version alone, so it stays on one line", () => {
    const tx = makeTx(scored);
    render(<AuthInspector tx={tx} transactions={[tx]} logins={[]} />);
    const model = screen.getByText("Model").closest("div") as HTMLElement;
    const version = screen.getByText("Model Version").closest("div") as HTMLElement;
    expect(model.nextElementSibling).toBe(version);
    expect(version.querySelector(".font-mono")?.textContent).toBe("f14edcac4fa0");
    // the model's fixed name is not printed: it is no datum of the record
    expect(document.body.textContent ?? "").not.toContain("card-fraud-scorecard");
    // a plain row: no line under its value
    expect(version.querySelector(".clear-both")).toBeNull();
    // the Risk section's rows are the Score, the Model and the Model Version, in that order
    const labels = Array.from(model.parentElement!.children)
      .map((el) => el.querySelector("span")?.textContent?.replace(/\s/g, ""))
      .filter((l) => l?.startsWith("Model") || l === "Score:");
    expect(labels).toEqual(["Score:", "Model:", "ModelVersion:"]);
  });

  it("a scored record with no version draws no Model Version row", () => {
    for (const ml_model_version of [undefined, null, ""]) {
      const tx = makeTx({ ...scored, ml_model_version });
      const { unmount } = render(<AuthInspector tx={tx} transactions={[tx]} logins={[]} />);
      expect(screen.getByText("Model")).toBeInTheDocument();
      expect(screen.queryByText("Model Version")).toBeNull();
      expect(document.body.textContent ?? "").not.toContain("card-fraud-scorecard");
      unmount();
    }
  });

  it("does not print a near-zero score as a bare 0.000", () => {
    const tx = makeTx({ ...scored, ml_score: 1.098e-28, ml_percentile: 0.3 });
    render(<AuthInspector tx={tx} transactions={[tx]} logins={[]} />);

    const row = screen.getByText("Model").closest("div");
    expect(row).toHaveTextContent("0.3 pct · score <0.001");
  });

  it("renders no model row when the payload carries no model fields", () => {
    const tx = makeTx();
    render(<AuthInspector tx={tx} transactions={[tx]} logins={[]} />);
    expect(screen.queryByText("Model")).toBeNull();
    expect(screen.queryByText("Model Version")).toBeNull();
  });

  it("renders no model row for a transaction the model never scored (null fields)", () => {
    const tx = makeTx({ ml_score: null, ml_percentile: null, ml_model_version: null });
    render(<AuthInspector tx={tx} transactions={[tx]} logins={[]} />);
    expect(screen.queryByText("Model")).toBeNull();
    expect(screen.queryByText("Model Version")).toBeNull();
  });
});

// Ship list entry 30: every attribute row starts with the library icon of its field, found by the field's
// id (never by the label it prints), inside the label's own span and before its words.
describe("AuthInspector row icons", () => {
  beforeEach(() => {
    useMatches.setState({ active: null });
    useTerminalRows.setState({ rows: {}, status: {} });
  });

  function expectIcon(label: string | RegExp, icon: string) {
    const words = screen.getAllByText(label)[0];
    const first = (words.parentElement as HTMLElement).firstElementChild as Element;
    expect(first.classList.contains(`lucide-${icon}`), `${String(label)} -> ${icon}`).toBe(true);
  }

  it("every attribute row starts with its icon", () => {
    // Card not present, an earlier authorization on the card at the same merchant, and a scored model, so
    // every conditional row is drawn.
    const earlier = makeTx({ id: "t0", timestamp: "2026-05-20T10:07:00-05:00", merchant_lat: 29.9, merchant_lng: -95.4 });
    const tx = makeTx({
      id: "t1",
      is_card_present: 0,
      ml_score: 0.93,
      ml_percentile: 99.8,
      ml_model_version: "f14edcac4fa0",
    });
    const { container } = render(<AuthInspector tx={tx} transactions={[earlier, tx]} logins={[]} />);
    const labels = container.querySelectorAll("div.text-right > span.float-left");
    expect(labels.length).toBe(25);
    for (const label of labels) expect(label.querySelector("svg.lucide"), label.textContent ?? "").not.toBeNull();
    const TABLE: readonly (readonly [string | RegExp, string])[] = [
      ["Amount", "banknote"],
      ["Merchant", "store"],
      ["Channel", "nfc"],
      ["MCC", "tag"],
      ["Posted", "clock"],
      [/Prior Auth$/, "history"],
      ["Latitude, longitude", "locate-fixed"],
      ["MGRS", "grid-3x3"],
      ["Country", "map"],
      [/Prior Geo$/, "ruler"],
      ["Response", "file-code"],
      ["POS Entry", "smartphone-nfc"],
      ["NRN", "hash"],
      ["Terminal", "calculator"],
      ["Acquirer", "landmark"],
      ["Source", "radio-tower"],
      ["3DS", "shield-ellipsis"],
      ["Currency", "currency"],
      ["Score", "circle-gauge"],
      ["Model", "brain-circuit"],
      ["Model Version", "brain"],
      ["PAN", "credit-card"],
      ["Balance", "piggy-bank"],
      ["Average spend a day", "chart-line"],
      ["Average authorizations a day", "calendar-days"],
    ];
    for (const [label, icon] of TABLE) expectIcon(label, icon);
    // The sub-heading and the list section's title carry no icon (the pass after the visual verdict).
    expect(screen.getByText("Top Merchants").querySelector("svg")).toBeNull();
    expect(screen.getByText("At this merchant").querySelector("svg")).toBeNull();
  });

  it("no section title and no sub-heading holds an icon", () => {
    const earlier = makeTx({ id: "t0", timestamp: "2026-05-20T10:07:00-05:00", merchant_lat: 29.9, merchant_lng: -95.4 });
    const tx = makeTx({ id: "t1" });
    const { container } = render(<AuthInspector tx={tx} transactions={[earlier, tx]} logins={[]} />);
    // A section's title is the first part of its header row, the header being the first child of the section.
    const titles = [...container.querySelectorAll(".border-t.border-panel-border > div:first-child span.uppercase")];
    expect(titles.length).toBeGreaterThanOrEqual(5);
    expect(titles.map((t) => t.textContent)).toContain("At this merchant");
    for (const title of titles) expect(title.querySelector("svg"), title.textContent ?? "").toBeNull();
    expect(screen.getByText("Top Merchants").querySelector("svg")).toBeNull();
  });
});

describe("AuthInspector terminal match badge", () => {
  beforeEach(() => {
    useMatches.setState({ active: null });
    useTerminalRows.setState({ rows: {}, status: {} });
  });

  const CPP = "ZEL-7731042";
  const badgeFor = (terminal: string) =>
    screen.getByRole("button", { name: new RegExp(`Open matches for terminal_id=${terminal}`) });

  it("puts a match badge on the Terminal row that opens the terminal's matches", () => {
    const tx = makeTx({ terminal_id: CPP });
    render(<AuthInspector tx={tx} transactions={[tx]} logins={[]} />);
    const badge = badgeFor(CPP);
    expect(badge).toHaveAccessibleName(`Open matches for terminal_id=${CPP} (1 matches)`);
    fireEvent.click(badge);
    const active = useMatches.getState().active;
    expect(active?.mode === "field" && [active.field, active.value]).toEqual(["terminal_id", CPP]);
  });

  it("counts every card's visit once the terminal's cross-card rows are loaded", () => {
    const tx = makeTx({ id: "mine", terminal_id: CPP });
    const peers = Array.from({ length: 29 }, (_, i) =>
      makeTx({ id: `peer-${i}`, card_id: `card-peer-${i}`, terminal_id: CPP })
    );
    useTerminalRows.setState({ rows: { [CPP]: [tx, ...peers] }, status: { [CPP]: "ok" } });
    // the focal card's other terminals are each visited once: a shared terminal diverges
    const focal = [tx, makeTx({ id: "o1", terminal_id: "T-A" }), makeTx({ id: "o2", terminal_id: "T-B" })];
    render(<AuthInspector tx={tx} transactions={focal} logins={[]} />);
    const badge = badgeFor(CPP);
    expect(badge).toHaveAccessibleName(`Open matches for terminal_id=${CPP} (30 matches)`);
    expect(badge.getAttribute("data-tone")).toBe("red");
  });

  it("a terminal only this card used stays on the cyan baseline tone", () => {
    const tx = makeTx({ id: "mine", terminal_id: "T-ONLY" });
    const focal = [tx, makeTx({ id: "o1", terminal_id: "T-A" }), makeTx({ id: "o2", terminal_id: "T-B" })];
    render(<AuthInspector tx={tx} transactions={focal} logins={[]} />);
    expect(badgeFor("T-ONLY").getAttribute("data-tone")).toBe("cyan");
  });

  it("a peer card's transaction (not in the focal set) is still badged once its rows are loaded", () => {
    const peer = makeTx({ id: "peer-1", card_id: "card-peer", terminal_id: CPP });
    const focal = [makeTx({ id: "mine", terminal_id: "T-A" })];
    useTerminalRows.setState({ rows: { [CPP]: [peer] }, status: { [CPP]: "ok" } });
    render(<AuthInspector tx={peer} transactions={focal} logins={[]} />);
    expect(badgeFor(CPP)).toHaveAccessibleName(`Open matches for terminal_id=${CPP} (1 matches)`);
  });

  it("shows an MGRS row directly beneath Latitude, longitude", () => {
    // Houston Pump 4 -> 15R TN 53862 97114 (pyproj-verified in lib/geo/mgrs.test.ts)
    const tx = makeTx({ merchant_lat: 29.7799, merchant_lng: -95.546 });
    render(<AuthInspector tx={tx} transactions={[tx]} logins={[]} />);
    const mgrsRow = screen.getByText("MGRS").closest("div");
    // the label gap is a nbsp (copy-as-one-line contract), so normalise whitespace
    expect(mgrsRow?.textContent?.replace(/\s/g, " ")).toBe("MGRS: 15R TN 53862 97114");
    expect(mgrsRow?.previousElementSibling?.textContent).toContain("Latitude, longitude");
  });

  it("renders no badge when the transaction has no terminal id", () => {
    const tx = makeTx({ terminal_id: "" });
    render(<AuthInspector tx={tx} transactions={[tx]} logins={[]} />);
    expect(screen.queryByRole("button", { name: /Open matches for terminal_id=/ })).toBeNull();
  });
});

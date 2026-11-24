import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { FraudInspector } from "./FraudInspector";
import type { Transaction } from "../../types";

// AuthInspector is out of scope for these tests and unconditionally renders
// its own "<score> / 1000" Risk section, which would mask the channel-framing
// assertions below. Stub it so the unit under test is FraudInspector's output.
vi.mock("./AuthInspector", () => ({
  AuthInspector: () => null,
}));

function makeTx(overrides: Partial<Transaction> = {}): Transaction {
  return {
    id: "tx_test",
    card_id: "card_test_1",
    account_id: "acct_test_1",
    timestamp: "2026-05-26T21:14:00Z",
    amount: 42.18,
    merchant_name: "Montrose Market",
    merchant_lat: 29.7433,
    merchant_lng: -95.3909,
    merchant_country: "US",
    mcc: "5411",
    category: "groceries",
    is_card_present: 1,
    is_fraud: 0,
    balance_after: 1450.22,
    auth_response_code: "00",
    pos_entry_mode: "chip",
    network_ref_number: "NRN-000001",
    terminal_id: "T-HOU-001",
    acquirer: "Zellmere Payments",
    auth_source: "issuer",
    risk_score: 0,
    is_3ds: 0,
    currency: "USD",
    ...overrides,
  };
}

/** Clean card-present transaction in Houston, hours before the fraud. */
const priorClean = makeTx({
  id: "tx_clean_prior",
  timestamp: "2026-05-26T18:00:00Z",
});

/** Card-present fraud far from the prior clean auth. */
const cpFraud = makeTx({
  id: "tx_cp_fraud",
  is_fraud: 1,
  is_card_present: 1,
  merchant_name: "Mainland Electronics",
  merchant_lat: 6.4531,
  merchant_lng: 3.3958,
  merchant_country: "NG",
  pos_entry_mode: "chip_fallback_swipe",
  acquirer: "Zamberi Pay",
  risk_score: 981,
});

/** Card-not-present micro-test fraud: $1 ecom auth, schema-default score. */
const cnpFraud = makeTx({
  id: "tx_cnp_fraud",
  is_fraud: 1,
  is_card_present: 0,
  merchant_name: "OnlineMart",
  amount: 1.0,
  pos_entry_mode: "ecom",
  terminal_id: "WEB",
  acquirer: "Ladleton Pay",
  risk_score: 0,
  is_3ds: 0,
});

describe("FraudInspector channel framing", () => {
  it("renders travel math and skimmer framing for card-present fraud", () => {
    render(
      <FraudInspector
        tx={cpFraud}
        transactions={[priorClean, cpFraud]}
        logins={[]}
      />
    );

    expect(screen.getByText("Required Speed")).toBeInTheDocument();
    expect(screen.getByText("981 / 1000")).toBeInTheDocument();
  });

  it("renders the channel-honest block instead of travel/skimmer framing for card-not-present fraud", () => {
    render(
      <FraudInspector
        tx={cnpFraud}
        transactions={[priorClean, cnpFraud]}
        logins={[]}
      />
    );

    // Travel math omitted: merchant_lat/lng are merchant-HQ geocodes for
    // CNP rows, not cardholder locations.
    expect(screen.queryByText("Required Speed")).toBeNull();
    expect(screen.queryByText("Distance")).toBeNull();
    // Skimmer framing omitted: POS-entry skimmer signatures do not exist online.
    expect(screen.queryByText(/skimmer/)).toBeNull();
    expect(screen.queryByText("POS Entry")).toBeNull();
    // Channel-honest block renders.
    expect(screen.getByText("Card not present")).toBeInTheDocument();
    // The stored entry mode is not printed under the Channel value (it was a fixed-looking grey line).
    expect(screen.queryByText("ecom")).toBeNull();
    expect(screen.getByText("No 3DS")).toBeInTheDocument();
    // A schema-default risk_score of 0 must not read as reassurance.
    expect(screen.queryByText(/0 \/ 1000/)).toBeNull();
    expect(screen.queryByText("Score")).toBeNull();
  });

  it("still surfaces the risk score for card-not-present fraud when scored", () => {
    const scored = makeTx({ ...cnpFraud, risk_score: 720, is_3ds: 1 });
    render(
      <FraudInspector
        tx={scored}
        transactions={[priorClean, scored]}
        logins={[]}
      />
    );

    expect(screen.getByText("Card not present")).toBeInTheDocument();
    expect(screen.getByText("3DS passed")).toBeInTheDocument();
    expect(screen.getByText("720 / 1000")).toBeInTheDocument();
    expect(screen.getByText("Score")).toBeInTheDocument();
    expect(screen.getByText("720")).toBeInTheDocument();
  });

  it("ERR-063: a low/zero risk_score on the card-present path does not render 'elevated'", () => {
    const lowScoreCpFraud = makeTx({ ...cpFraud, risk_score: 0 });
    render(
      <FraudInspector
        tx={lowScoreCpFraud}
        transactions={[priorClean, lowScoreCpFraud]}
        logins={[]}
      />
    );

    // Old behavior: risk_score>=900 ? "above 900..." : "elevated" - a score
    // of 0 fell into the else branch and printed "elevated", the opposite
    // of what a 0 score means.
    expect(screen.queryByText("elevated")).toBeNull();
    expect(screen.getByText("0")).toBeInTheDocument();
  });

  it("a mid-range risk_score on the card-present path prints no caption under the Score, not a band word", () => {
    const midScoreCpFraud = makeTx({ ...cpFraud, risk_score: 550 });
    render(
      <FraudInspector
        tx={midScoreCpFraud}
        transactions={[priorClean, midScoreCpFraud]}
        logins={[]}
      />
    );

    expect(screen.queryByText(/review line/)).toBeNull();
    expect(screen.queryByText("elevated")).toBeNull();
  });

  it("a >=900 risk_score on the card-present path prints no caption under the Score and no verdict", () => {
    render(
      <FraudInspector
        tx={cpFraud}
        transactions={[priorClean, cpFraud]}
        logins={[]}
      />
    );

    expect(screen.queryByText(/review line/)).toBeNull();
    expect(screen.queryByText(/flagged|above 900/)).toBeNull();
  });
});

// The Inspector carries no helper text: the fraud panel prints no fixed line under a value, and
// the countries are rows too: the Travel section prints From Country and To Country as rows of their own, nothing under From or To.
describe("FraudInspector prints no fixed line under a value", () => {
  const stip = makeTx({ ...cpFraud, auth_source: "stip" });
  const near = makeTx({
    ...cpFraud,
    id: "tx_near",
    merchant_lat: 29.75,
    merchant_lng: -95.39,
    merchant_country: "US",
    pos_entry_mode: "chip",
    risk_score: 12,
  });
  const cnpKey = makeTx({ ...cnpFraud, id: "tx_cnp_key", pos_entry_mode: "cnp_key" });
  const cnpStip = makeTx({ ...cnpFraud, id: "tx_cnp_stip", auth_source: "stip" });

  /** The lines the panel drew under a value: the Inspector's grey line is the one that clears the float. */
  const linesUnderValues = (container: HTMLElement) =>
    Array.from(container.querySelectorAll(".clear-both")).map((el) => el.textContent ?? "");

  it("POS Entry: a swipe after a chip fallback has no line under it, and the value stays in the alarm colour", () => {
    render(<FraudInspector tx={cpFraud} transactions={[priorClean, cpFraud]} logins={[]} />);
    expect(screen.queryByText(/chip was not read|stripe was swiped/)).toBeNull();
    expect(screen.getByText("chip fallback swipe").className).toContain("--alarm-on-inspector");
  });

  it("POS Entry: a chip read has no line under it", () => {
    render(<FraudInspector tx={near} transactions={[priorClean, near]} logins={[]} />);
    expect(screen.queryByText(/chip was not read/)).toBeNull();
    expect(screen.getByText("chip")).toBeInTheDocument();
  });

  it("Required Speed: no rule line on either side of 600, and the value keeps its colour", () => {
    const { unmount } = render(<FraudInspector tx={cpFraud} transactions={[priorClean, cpFraud]} logins={[]} />);
    expect(screen.queryByText(/rule line/)).toBeNull();
    expect(screen.getByText(/^[\d,]+ mph$/).className).toContain("--alarm-on-inspector");
    unmount();
    render(<FraudInspector tx={near} transactions={[priorClean, near]} logins={[]} />);
    expect(screen.queryByText(/rule line/)).toBeNull();
    expect(screen.getByText(/^[\d,]+ mph$/).className).not.toContain("--alarm-on-inspector");
  });

  it("Travel: no heading badge repeats the speed", () => {
    render(<FraudInspector tx={cpFraud} transactions={[priorClean, cpFraud]} logins={[]} />);
    expect(screen.getByText("Travel")).toBeInTheDocument();
    expect(screen.queryByText(/over 600 mph/i)).toBeNull();
    expect(document.body.textContent ?? "").not.toMatch(/over 600/i);
  });

  it("Source: STIP and an issuer's own approval print the value and nothing under it, card present and not present", () => {
    for (const [tx, shown] of [
      [stip, "STIP"],
      [cpFraud, "ISSUER"],
      [cnpStip, "STIP"],
      [cnpFraud, "ISSUER"],
    ] as const) {
      const { unmount } = render(<FraudInspector tx={tx} transactions={[priorClean, tx]} logins={[]} />);
      expect(screen.getByText(shown)).toBeInTheDocument();
      expect(screen.queryByText(/stand-in|issuer-authorized/)).toBeNull();
      unmount();
    }
  });

  it("Channel: the stored entry mode is not printed under Card not present", () => {
    render(<FraudInspector tx={cnpKey} transactions={[priorClean, cnpKey]} logins={[]} />);
    expect(screen.getByText("Card not present")).toBeInTheDocument();
    expect(screen.queryByText("cnp key")).toBeNull();
  });

  it("no caption of the retired set is in the panel's text, in any branch", () => {
    for (const tx of [cpFraud, near, stip, cnpKey, cnpStip]) {
      const { unmount } = render(<FraudInspector tx={tx} transactions={[priorClean, tx]} logins={[]} />);
      expect(document.body.textContent ?? "").not.toMatch(
        /rule line|stand-in|issuer-authorized|chip was not read|stripe was swiped|cnp key/,
      );
      unmount();
    }
  });

  it("card not present: no line under any value", () => {
    for (const tx of [cnpKey, cnpStip, cnpFraud]) {
      const { container, unmount } = render(<FraudInspector tx={tx} transactions={[priorClean, tx]} logins={[]} />);
      expect(linesUnderValues(container)).toEqual([]);
      unmount();
    }
  });

  it("card present: no line under any value; the countries are rows of their own", () => {
    const { container } = render(<FraudInspector tx={cpFraud} transactions={[priorClean, cpFraud]} logins={[]} />);
    expect(linesUnderValues(container)).toEqual([]);
    expect(screen.getByText("From Country")).toBeInTheDocument();
    expect(screen.getByText("To Country")).toBeInTheDocument();
  });

  it("card present, no earlier record: the lines under the values are none", () => {
    const { container } = render(<FraudInspector tx={cpFraud} transactions={[cpFraud]} logins={[]} />);
    expect(screen.getByText("Earlier transaction: none")).toBeInTheDocument();
    expect(linesUnderValues(container)).toEqual([]);
  });
});

// A date or a time read from a record is a row of its own, a label and the
// timestamp, never a grey line under another value and never glued onto another value. The Travel
// section's From row printed the earlier record's country and time on one grey line.
describe("FraudInspector From Date row", () => {
  const DOT = String.fromCharCode(0xb7);
  // The earlier record sits at 2026-05-26T18:00:00Z, 1:00 PM in Houston, in the format of the Posted row.
  const PRIOR_TS = `Tue May 26 ${DOT} 1:00p CDT`;
  const rowOf = (label: string) => screen.getByText(label).closest("div") as HTMLElement;
  const valueOf = (label: string) => rowOf(label).querySelector(".font-mono")?.textContent;

  it("the From row holds the name alone: no line under it, no country, no date or time", () => {
    render(<FraudInspector tx={cpFraud} transactions={[priorClean, cpFraud]} logins={[]} />);
    expect(rowOf("From").querySelector(".clear-both")).toBeNull();
    expect(valueOf("From")).toBe(priorClean.merchant_name);
  });

  it("a row labelled From Date follows From Country and holds the timestamp in the Posted row's format", () => {
    render(<FraudInspector tx={cpFraud} transactions={[priorClean, cpFraud]} logins={[]} />);
    const date = rowOf("From Date");
    expect(rowOf("From Country").nextElementSibling).toBe(date);
    expect(valueOf("From Date")).toBe(PRIOR_TS);
    // a plain row: no line under its value
    expect(date.querySelector(".clear-both")).toBeNull();
    // To follows it
    expect(date.nextElementSibling).toBe(rowOf("To"));
  });

  it("the new row prints the same string the Posted row prints for the same instant", async () => {
    const { formatTs } = await import("../../lib/entities");
    render(<FraudInspector tx={cpFraud} transactions={[priorClean, cpFraud]} logins={[]} />);
    expect(valueOf("From Date")).toBe(formatTs(priorClean.timestamp));
  });

  it("no earlier record: nothing new is drawn and the line stays", () => {
    render(<FraudInspector tx={cpFraud} transactions={[cpFraud]} logins={[]} />);
    expect(screen.getByText("Earlier transaction: none")).toBeInTheDocument();
    expect(screen.queryByText("From Date")).toBeNull();
    expect(screen.queryByText("From")).toBeNull();
  });

  it("card not present: no Travel section and no From Date row", () => {
    render(<FraudInspector tx={cnpFraud} transactions={[priorClean, cnpFraud]} logins={[]} />);
    expect(screen.queryByText("From Date")).toBeNull();
    expect(screen.queryByText("Travel")).toBeNull();
  });

  it("the old form is gone: no month and day, comma, time with AM or PM anywhere in the panel", () => {
    render(<FraudInspector tx={cpFraud} transactions={[priorClean, cpFraud]} logins={[]} />);
    expect(document.body.textContent ?? "").not.toMatch(/[A-Z][a-z]{2} \d{1,2},\s*\d{1,2}:\d{2}\s*[AP]M/);
  });
});

// The country of the earlier record and of this record are rows of
// their own, labelled From Country and To Country, each a plain row. Nothing is printed under From or To.
describe("FraudInspector country rows", () => {
  const rowOf = (label: string) => screen.getByText(label).closest("div") as HTMLElement;
  const valueOf = (label: string) => rowOf(label).querySelector(".font-mono")?.textContent;
  const labelsOfSection = () =>
    Array.from(rowOf("From").parentElement!.children).map((el) => el.querySelector("span")?.textContent?.replace(/\s/g, ""));

  it("From Country holds the earlier record's country and To Country holds this record's", () => {
    render(<FraudInspector tx={cpFraud} transactions={[priorClean, cpFraud]} logins={[]} />);
    expect(valueOf("From Country")).toBe("US");
    expect(valueOf("To Country")).toBe("NG");
  });

  it("each country follows its own name: From, From Country, From Date, To, To Country", () => {
    render(<FraudInspector tx={cpFraud} transactions={[priorClean, cpFraud]} logins={[]} />);
    expect(rowOf("From").nextElementSibling).toBe(rowOf("From Country"));
    expect(rowOf("To").nextElementSibling).toBe(rowOf("To Country"));
    expect(rowOf("To Country").nextElementSibling).toBe(rowOf("Distance"));
  });

  it("the From and To rows hold the name alone, with no line under it", () => {
    render(<FraudInspector tx={cpFraud} transactions={[priorClean, cpFraud]} logins={[]} />);
    for (const label of ["From", "To", "From Country", "To Country"]) {
      expect(rowOf(label).querySelector(".clear-both"), label).toBeNull();
    }
    expect(valueOf("From")).toBe("Montrose Market");
    expect(valueOf("To")).toBe("Mainland Electronics");
  });

  it("the Travel section's labels are exactly From, From Country, From Date, To, To Country, Distance, Time, Required Speed", () => {
    render(<FraudInspector tx={cpFraud} transactions={[priorClean, cpFraud]} logins={[]} />);
    expect(labelsOfSection()).toEqual([
      "From:",
      "FromCountry:",
      "FromDate:",
      "To:",
      "ToCountry:",
      "Distance:",
      "Time:",
      "RequiredSpeed:",
    ]);
  });

  it("with no earlier record nothing of From is drawn and the line stays", () => {
    render(<FraudInspector tx={cpFraud} transactions={[cpFraud]} logins={[]} />);
    expect(screen.getByText("Earlier transaction: none")).toBeInTheDocument();
    for (const label of ["From", "From Country", "From Date", "To", "To Country"]) {
      expect(screen.queryByText(label), label).toBeNull();
    }
  });

  it("card not present: no country row", () => {
    render(<FraudInspector tx={cnpFraud} transactions={[priorClean, cnpFraud]} logins={[]} />);
    expect(screen.queryByText("From Country")).toBeNull();
    expect(screen.queryByText("To Country")).toBeNull();
  });
});

// Ship list entry 30: every attribute row starts with the library icon of its field id, inside the
// label's own span and before its words.
describe("FraudInspector row icons", () => {
  function expectIcon(label: string, icon: string, nth = 0) {
    const words = screen.getAllByText(label)[nth];
    const first = (words.parentElement as HTMLElement).firstElementChild as Element;
    expect(first.classList.contains(`lucide-${icon}`), `${label} -> ${icon}`).toBe(true);
  }

  it("every attribute row starts with its icon, card present and card not present", () => {
    const present = render(<FraudInspector tx={cpFraud} transactions={[priorClean, cpFraud]} logins={[]} />);
    const presentLabels = present.container.querySelectorAll("span.float-left");
    expect(presentLabels.length).toBe(12);
    for (const label of presentLabels) expect(label.querySelector("svg.lucide"), label.textContent ?? "").not.toBeNull();
    const PRESENT: readonly (readonly [string, string, number])[] = [
      ["From", "plane-takeoff", 0],
      ["From Country", "tickets-plane", 0],
      ["From Date", "calendar-arrow-up", 0],
      ["To", "plane-landing", 0],
      ["To Country", "luggage", 0],
      ["Distance", "ruler-dimension-line", 0],
      ["Time", "watch", 0],
      ["Required Speed", "wind", 0],
      ["Score", "circle-gauge", 0],
      ["Source", "radio-tower", 0],
      ["POS Entry", "smartphone-nfc", 0],
      ["Acquirer", "landmark", 0],
    ];
    for (const [label, icon, nth] of PRESENT) expectIcon(label, icon, nth);
    present.unmount();

    const notPresent = render(
      <FraudInspector tx={{ ...cnpFraud, risk_score: 700 }} transactions={[priorClean, cnpFraud]} logins={[]} />,
    );
    const cnpLabels = notPresent.container.querySelectorAll("span.float-left");
    expect(cnpLabels.length).toBe(5);
    for (const label of cnpLabels) expect(label.querySelector("svg.lucide"), label.textContent ?? "").not.toBeNull();
    const NOT_PRESENT: readonly (readonly [string, string])[] = [
      ["Channel", "nfc"],
      ["3DS", "shield-ellipsis"],
      ["Score", "circle-gauge"],
      ["Source", "radio-tower"],
      ["Acquirer", "landmark"],
    ];
    for (const [label, icon] of NOT_PRESENT) expectIcon(label, icon);
  });
});

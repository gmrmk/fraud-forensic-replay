import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MatchesTable } from "./MatchesTable";
import { useTerminalRows } from "./terminal-rows";
import { useMatches } from "../../store/matches";
import { useNavigation } from "../../store/navigation";
import { usePivotStore } from "../../store/pivot";
import type { PivotContext } from "../../lib/matches";
import type { AccountEvent, LoginEvent, Transaction, Transfer } from "../../types";

function fakeTx(overrides: Partial<Transaction> = {}): Transaction {
  return {
    id: "tx-1", card_id: "c", account_id: "a",
    amount: 580.40, merchant_name: "Tidewater Trust Bank ATM", merchant_lat: 6.5, merchant_lng: 3.4,
    merchant_country: "NG", mcc: "5411", category: "g",
    timestamp: "2026-05-26T22:18:00Z", is_card_present: 1, is_fraud: 1,
    balance_after: 0, auth_response_code: "00", pos_entry_mode: "chip_fallback_swipe",
    network_ref_number: "NRN8800STB", terminal_id: "ZAM-2871174", acquirer: "Tidewater Trust Bank",
    auth_source: "stip", risk_score: 942, is_3ds: 0, currency: "NGN",
    ...overrides,
  };
}

const ctxWithThreeFraud: PivotContext = {
  transactions: [
    fakeTx({ id: "tx-tidewater" }),
    fakeTx({ id: "tx-garrmere", merchant_name: "Garrmere Mall", amount: 1240 }),
    fakeTx({ id: "tx-heskford", merchant_name: "Heskford Lekki", amount: 890.50, risk_score: 981 }),
  ],
  logins: [],
  places: [],
};

describe("MatchesTable", () => {
  beforeEach(() => {
    useMatches.setState({ active: null });
    useNavigation.setState({ panTarget: null, zoomTarget: null, pulseEntityId: null, pulseToken: 0 });
  });

  it("renders nothing when useMatches.active is null", () => {
    const { container } = render(<MatchesTable context={ctxWithThreeFraud} />);
    expect(container.firstChild).toBeNull();
  });

  it("renders rows for each related entity when active is set", () => {
    useMatches.setState({
      active: { mode: "field", field: "pos_entry_mode", value: "chip_fallback_swipe", parentKind: "fraud" },
    });
    render(<MatchesTable context={ctxWithThreeFraud} />);
    expect(screen.getByText("Tidewater Trust Bank ATM")).toBeInTheDocument();
    expect(screen.getByText("Garrmere Mall")).toBeInTheDocument();
    expect(screen.getByText("Heskford Lekki")).toBeInTheDocument();
  });

  it("renders header with field + value", () => {
    useMatches.setState({
      active: { mode: "field", field: "pos_entry_mode", value: "chip_fallback_swipe", parentKind: "fraud" },
    });
    render(<MatchesTable context={ctxWithThreeFraud} />);
    // Case-sensitive - the header is uppercase ("MATCHES · ..."); the
    // count line below uses lowercase ("3 matches"). Without the
    // case-sensitivity, /MATCHES/i matches both.
    expect(screen.getByText(/MATCHES/)).toBeInTheDocument();
    expect(screen.getByText(/chip_fallback_swipe/)).toBeInTheDocument();
  });

  it("click row fires useNavigation.navigate (pulse fires)", () => {
    useMatches.setState({
      active: { mode: "field", field: "pos_entry_mode", value: "chip_fallback_swipe", parentKind: "fraud" },
    });
    render(<MatchesTable context={ctxWithThreeFraud} />);
    fireEvent.click(screen.getByText("Tidewater Trust Bank ATM").closest('[role="button"]')!);
    expect(useNavigation.getState().pulseEntityId).toBe("tx-tidewater");
  });

  it("table STAYS OPEN after row click (per spec)", () => {
    useMatches.setState({
      active: { mode: "field", field: "pos_entry_mode", value: "chip_fallback_swipe", parentKind: "fraud" },
    });
    render(<MatchesTable context={ctxWithThreeFraud} />);
    fireEvent.click(screen.getByText("Tidewater Trust Bank ATM").closest('[role="button"]')!);
    expect(useMatches.getState().active).not.toBeNull();
  });

  it("header × calls useMatches.close (closes table)", () => {
    useMatches.setState({
      active: { mode: "field", field: "pos_entry_mode", value: "chip_fallback_swipe", parentKind: "fraud" },
    });
    render(<MatchesTable context={ctxWithThreeFraud} />);
    fireEvent.click(screen.getByLabelText(/Close matches/i));
    expect(useMatches.getState().active).toBeNull();
  });

  it("renders 0-row case (no matches) with empty body", () => {
    useMatches.setState({
      active: { mode: "field", field: "acquirer", value: "NoMatch", parentKind: "auth" },
    });
    const { container } = render(<MatchesTable context={ctxWithThreeFraud} />);
    expect(container.querySelectorAll('[role="button"]').length).toBe(1);  // just close button, no rows
  });

  it("renders at 320 px Inspector-mirror width (Variant A, spec § 4)", () => {
    useMatches.setState({
      active: { mode: "field", field: "pos_entry_mode", value: "chip_fallback_swipe", parentKind: "fraud" },
    });
    render(<MatchesTable context={ctxWithThreeFraud} />);
    const region = screen.getByRole("region", { name: /matches workspace/i });
    expect(region).toHaveStyle({ width: "320px" });
  });

  it("drops NRN + Terminal from row cells (still pivotable via Inspector)", () => {
    useMatches.setState({
      active: { mode: "field", field: "pos_entry_mode", value: "chip_fallback_swipe", parentKind: "fraud" },
    });
    const { container } = render(<MatchesTable context={ctxWithThreeFraud} />);
    // NRN8800STB + ZAM-2871174 belong to the Tidewater Trust Bank ATM transaction.
    // After Variant A, NRN + Terminal cells dropped from the row layout
    // (still surfaced in the Inspector's Card-Network section). Regex
    // match (not queryByText) because the old layout joined them with
    // <br/> which normalizes to a space - exact-text match silently
    // missed the combined cell.
    expect(container.textContent).not.toMatch(/NRN8800STB/);
    expect(container.textContent).not.toMatch(/ZAM-2871174/);
  });

  it("tags each transaction row with its card suffix only when the matches span cards", () => {
    useMatches.setState({
      active: { mode: "field", field: "pos_entry_mode", value: "chip_fallback_swipe", parentKind: "fraud" },
    });
    const ctxFor = (cardA: string, cardB: string): PivotContext => ({
      transactions: [
        fakeTx({ id: "tx-a", card_id: cardA }),
        fakeTx({ id: "tx-b", card_id: cardB, merchant_name: "Garrmere Mall" }),
      ],
      logins: [],
      places: [],
    });
    const multi = render(<MatchesTable context={ctxFor("card-4111110174", "card-5500009921")} />);
    expect(screen.getByText("·0174")).toBeInTheDocument();
    expect(screen.getByText("·9921")).toBeInTheDocument();
    multi.unmount();
    render(<MatchesTable context={ctxFor("card-4111110174", "card-4111110174")} />);
    expect(screen.getByText("Garrmere Mall")).toBeInTheDocument();
    expect(screen.queryByText("·0174")).toBeNull();
  });
});

const threadLogin: LoginEvent = {
    id: "l-1", account_id: "a", timestamp: "2026-05-25T10:07:00-05:00",
    ip: "192.0.2.1", ip_country: "US", ip_lat: 0, ip_lng: 0,
    ip_type: "datacenter", ip_asn: "AS64499", ip_reputation: 29,
    device_fp: "Handset-Unknown-9f2", user_agent: "ua", outcome: "challenge_passed",
    session_id: "sess-takeover", two_fa_used: 1,
    device_first_seen_at: "2026-05-25T10:07:00-05:00",
    device_trust: "new", auth_method: "password", challenge_reason: null,
  };

  const threadEvent: AccountEvent = {
    id: "ae-1", account_id: "a", timestamp: "2026-05-25T10:14:00-05:00",
    kind: "profile_change", field: "email", old_value: "a", new_value: "b",
    payee_id: null, session_id: "sess-takeover", is_fraud: 1,
  };

  const threadWire: Transfer = {
    id: "tr-1", account_id: "a", timestamp: "2026-05-25T10:36:00-05:00",
    amount: 4200, payee_id: "p", rail: "wire", status: "sent",
    decline_reason: null, session_id: "sess-takeover", is_fraud: 1,
  };

  const threadContext: PivotContext = {
    transactions: [], logins: [threadLogin], places: [],
    accountEvents: [threadEvent], transfers: [threadWire],
  };

describe("MatchesTable - behavioral kinds (session_id fold-in)", () => {
  beforeEach(() => {
    useMatches.setState({ active: null });
    useNavigation.setState({ panTarget: null, zoomTarget: null, pulseEntityId: null, pulseToken: 0 });
  });

  it("labels behavioral rows PROFILE and TRANSFER, not AUTH", () => {
    useMatches.setState({
      active: { mode: "field", field: "session_id", value: "sess-takeover", parentKind: "login" },
    });
    render(<MatchesTable context={threadContext} />);
    expect(screen.getByText("LOGIN")).toBeInTheDocument();
    expect(screen.getByText("PROFILE")).toBeInTheDocument();
    expect(screen.getByText("TRANSFER")).toBeInTheDocument();
    expect(screen.queryByText("AUTH")).toBeNull();
    expect(screen.getByText("3 matches")).toBeInTheDocument();
  });

  it("marks a fraud transfer row with the signal class", () => {
    useMatches.setState({
      active: { mode: "field", field: "session_id", value: "sess-takeover", parentKind: "transfer" },
    });
    render(<MatchesTable context={threadContext} />);
    const label = screen.getByText("TRANSFER");
    expect(label.className).toContain("text-signal");
  });
});

describe("MatchesTable - rule mode (the breakout)", () => {
  const decision = {
    id: "decision:account-takeover:l-1",
    rule: {
      id: "account-takeover",
      label: "account-takeover",
      kind: "login-anomaly",
      sop: {
        what: "A successful authentication from a device never seen on the account.",
        why: "why text",
        brief:
          "Authenticated login from a device never seen on this account. Passing 2FA does not clear it; phishing harvests codes too. Verify via details on file. Review the session's next actions.",
      },
    },
    subjectPathKind: "login",
    triggerEntityIds: ["l-1"],
    inputs: [],
    thresholds: [],
    verdict: "ACCOUNT TAKEOVER",
    decision: "STEP-UP" as const,
    evidence: [],
    severity: 0.9,
  };

  beforeEach(() => {
    useMatches.setState({ active: null });
    usePivotStore.setState({ windows: [], nextZ: 20 });
  });

  it("renders the authored brief verbatim with the pill and the trace link", () => {
    useMatches.setState({ active: { mode: "rule", decisionId: decision.id } });
    render(<MatchesTable context={threadContext} decisions={[decision]} />);
    expect(screen.getByText(decision.rule.sop.brief)).toBeInTheDocument();
    expect(screen.getByText("ACCOUNT TAKEOVER")).toBeInTheDocument();
    fireEvent.click(screen.getByText("VIEW RULE DESCRIPTION ▸"));
    const ws = usePivotStore.getState().windows;
    expect(ws).toHaveLength(1);
    expect(ws[0].kind).toBe("trace");
    expect(ws[0].kind === "trace" && ws[0].decisionId).toBe(decision.id);
    // The trace window replaces the breakout - leaving the breakout open
    // paints it OVER the trace window (same z, later sibling) and the
    // detail becomes unreachable.
    expect(useMatches.getState().active).toBeNull();
  });

  it("header pill opens the trace window too (no dead button in the card)", () => {
    useMatches.setState({ active: { mode: "rule", decisionId: decision.id } });
    render(<MatchesTable context={threadContext} decisions={[decision]} />);
    fireEvent.click(
      screen.getByRole("button", { name: "STEP-UP ACCOUNT TAKEOVER. View rule description." }),
    );
    const ws = usePivotStore.getState().windows;
    expect(ws).toHaveLength(1);
    expect(ws[0].kind === "trace" && ws[0].decisionId).toBe(decision.id);
    expect(useMatches.getState().active).toBeNull();
  });

  it("expands a session-bearing trigger to the whole thread, chronological", () => {
    useMatches.setState({ active: { mode: "rule", decisionId: decision.id } });
    render(<MatchesTable context={threadContext} decisions={[decision]} />);
    expect(screen.getByText("3 matched events")).toBeInTheDocument();
    expect(screen.getByText("LOGIN")).toBeInTheDocument();
    expect(screen.getByText("PROFILE")).toBeInTheDocument();
    expect(screen.getByText("TRANSFER")).toBeInTheDocument();
  });

  it("lists only trigger entities when no session field exists", () => {
    const txDecision = {
      ...decision,
      id: "decision:impossible-travel:tx-2",
      rule: { id: "impossible-travel", label: "impossible-travel", kind: "geo-velocity" },
      triggerEntityIds: ["tx-1", "tx-2"],
      verdict: "IMPOSSIBLE TRAVEL",
      decision: "DECLINE" as const,
    };
    const txA = {
      id: "tx-1", card_id: "c", account_id: "a", timestamp: "2026-05-26T08:00:00-05:00",
      amount: 12, merchant_name: "Cobstead Grocers", merchant_lat: 29.7, merchant_lng: -95.5,
      merchant_country: "US", mcc: "5411", category: "g", is_card_present: 1, is_fraud: 0,
      balance_after: 0, auth_response_code: "00", pos_entry_mode: "chip",
      network_ref_number: "n", terminal_id: "t", acquirer: "Harlowe Bank",
      auth_source: "issuer", risk_score: 100, is_3ds: 0, currency: "USD",
    };
    const txB = { ...txA, id: "tx-2", merchant_name: "Heskford Lekki", merchant_country: "NG", is_fraud: 1, risk_score: 981, timestamp: "2026-05-26T17:46:00-05:00" };
    const ctx = { ...threadContext, transactions: [txA, txB] };
    useMatches.setState({ active: { mode: "rule", decisionId: txDecision.id } });
    render(<MatchesTable context={ctx} decisions={[txDecision]} />);
    expect(screen.getByText("2 matched events")).toBeInTheDocument();
    expect(screen.getByText("Cobstead Grocers")).toBeInTheDocument();
    expect(screen.getByText("Heskford Lekki")).toBeInTheDocument();
  });
});

describe("MatchesTable - terminal_id lists every card at the terminal", () => {
  const CPP = "ZEL-7731042";
  const visit = (id: string, merchant: string, card: string) =>
    fakeTx({ id, card_id: card, merchant_name: merchant, terminal_id: CPP, is_fraud: 0, timestamp: `2026-05-0${id.slice(-1)}T10:00:00Z` });
  const focalVisit = visit("v1", "Own Pump", "card-focal");
  const peers = [visit("v2", "Peer Pump A", "card-a"), visit("v3", "Peer Pump B", "card-b")];
  const focalContext: PivotContext = { transactions: [focalVisit, fakeTx({ id: "other", terminal_id: "T-9" })], logins: [], places: [] };
  const open = () =>
    useMatches.setState({ active: { mode: "field", field: "terminal_id", value: CPP, parentKind: "auth" } });
  const reply = (ok: boolean, body: unknown) =>
    vi.fn(() => Promise.resolve({ ok, json: () => Promise.resolve(body) } as Response));

  beforeEach(() => {
    useMatches.setState({ active: null });
    useTerminalRows.setState({ rows: {}, status: {} });
    useNavigation.setState({ panTarget: null, zoomTarget: null, pulseEntityId: null, pulseToken: 0 });
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("fetches the terminal on open and lists the other cards' rows beside the focal card's", async () => {
    const fetchMock = reply(true, [focalVisit, ...peers]);
    vi.stubGlobal("fetch", fetchMock);
    open();
    render(<MatchesTable context={focalContext} />);
    expect(await screen.findByText("Peer Pump A")).toBeInTheDocument();
    expect(screen.getByText("Peer Pump B")).toBeInTheDocument();
    expect(screen.getByText("Own Pump")).toBeInTheDocument(); // the focal row is not doubled
    expect(screen.getByText("3 matches · all cards")).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith(`/api/transactions?terminal_id=${CPP}`);
  });

  it("says it is still loading, showing only the focal case's rows, until the fetch settles", () => {
    vi.stubGlobal("fetch", vi.fn(() => new Promise(() => {})));
    open();
    render(<MatchesTable context={focalContext} />);
    expect(screen.getByText("1 match · loading all cards")).toBeInTheDocument();
    expect(screen.queryByText("Peer Pump A")).toBeNull();
  });

  it("says the cross-card read failed instead of presenting the focal rows as the whole set", async () => {
    vi.stubGlobal("fetch", reply(false, { detail: "boom" }));
    open();
    render(<MatchesTable context={focalContext} />);
    expect(await screen.findByText("1 match · all cards unavailable")).toBeInTheDocument();
  });

  it("opens a peer card's row like any other row", async () => {
    vi.stubGlobal("fetch", reply(true, [focalVisit, ...peers]));
    open();
    render(<MatchesTable context={focalContext} />);
    fireEvent.click((await screen.findByText("Peer Pump A")).closest('[role="button"]')!);
    expect(useNavigation.getState().pulseEntityId).toBe("v2");
  });

  it("does not fetch for any other field", () => {
    const fetchMock = reply(true, []);
    vi.stubGlobal("fetch", fetchMock);
    useMatches.setState({ active: { mode: "field", field: "mcc", value: "5411", parentKind: "auth" } });
    render(<MatchesTable context={focalContext} />);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(screen.getByText("2 matches")).toBeInTheDocument();
  });
});

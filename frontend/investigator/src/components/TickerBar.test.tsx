import { describe, it, expect, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { render, screen, fireEvent } from "@testing-library/react";
import { TickerBar } from "./TickerBar";
import { slotFor } from "../theme/entity-mapping";
import { usePlayhead } from "../store/playhead";
import { useNavigation } from "../store/navigation";
import { useSelection } from "../store/selection";
import { buildTickerStream } from "../lib/ticker-stream";
import { manifestRowToEntity } from "../lib/adapters/manifest-row";
import { usePivotData } from "../store/pivot-data";
import type { ScenarioNode } from "../lib/scenarios";
// TickerBar renders label/palette/primary/secondary from the manifest
// node carried on each TickerItem - no hardcoded per-kind switches. The
// nodes here are the REAL shipped card-fraud manifest nodes (loaded
// raw, not hand-copied fixtures), so this suite pins the integration
// the ticker actually ships with: ${field} template strings, never
// bare field keys.
import cardFraudRaw from "../../../../backend/scenarios/card-fraud.scenario.json?raw";

const cardFraudManifest = JSON.parse(cardFraudRaw) as { id: string; nodes: ScenarioNode[] };

function nodeFor(kind: string): ScenarioNode {
  const node = cardFraudManifest.nodes.find((n) => n.kind === kind);
  if (!node) throw new Error(`card-fraud manifest is missing the ${kind} node`);
  return node;
}

const authNode = nodeFor("auth"); // label "Authorization", palette #00e5ff
const fraudNode = nodeFor("fraud"); // label "Fraud", palette #ff3d2e
const loginNode = nodeFor("login"); // label "Login", palette #ff5ce8

const T_AUTH_1 = "2026-05-26T08:00:00-05:00";
const T_LOGIN = "2026-05-26T10:00:00-05:00";
const T_AUTH_2 = "2026-05-26T12:00:00-05:00";
const MS_AUTH_1 = Date.parse(T_AUTH_1);
const MS_LOGIN = Date.parse(T_LOGIN);
const MS_AUTH_2 = Date.parse(T_AUTH_2);

// Rows carry the fields the navigate() bridge reads (id, timestamp,
// coords) plus the fields the manifest node templates name. Raw rows
// flow through TickerItem.raw exactly as App's fetched arrays would.
const AUTH_ROW_1 = {
  id: "t1",
  timestamp: T_AUTH_1,
  merchant_name: "Daily Grind",
  amount: 4.75,
  mcc: "5812",
  merchant_country: "US",
  merchant_lat: 29.78,
  merchant_lng: -95.39,
};
const AUTH_ROW_2 = {
  id: "t2",
  timestamp: T_AUTH_2,
  merchant_name: "Vinyl Vault",
  amount: 13.59,
  mcc: "5999",
  merchant_country: "US",
  merchant_lat: 29.74,
  merchant_lng: -95.46,
};
const LOGIN_ROW = {
  id: "l1",
  timestamp: T_LOGIN,
  device_fp: "Handset-Browser-A1F8",
  outcome: "success",
  ip_type: "residential",
  ip_lat: 29.76,
  ip_lng: -95.37,
};
const FRAUD_ROW = {
  id: "f1",
  timestamp: T_AUTH_1,
  merchant_name: "Heskford Lekki",
  amount: 890.5,
  mcc: "5411",
  merchant_country: "NG",
  merchant_lat: 6.44,
  merchant_lng: 3.47,
};

// The merged cross-kind stream: auth t1 (08:00) -> login l1 (10:00) ->
// auth t2 (12:00). Built through the real stream layer so these tests
// pin the integration TickerBar actually ships with.
const ITEMS = buildTickerStream(
  { auth: [AUTH_ROW_1, AUTH_ROW_2], login: [LOGIN_ROW] },
  [authNode, loginNode],
);

describe("TickerBar", () => {
  beforeEach(() => {
    usePlayhead.setState({
      playhead: 0,
      minTime: MS_AUTH_1,
      maxTime: MS_AUTH_2,
      isPlaying: false,
    });
    useNavigation.setState({
      panTarget: null,
      zoomTarget: null,
      pulseEntityId: null,
      pulseToken: 0,
    });
    useSelection.setState({ selected: null });
    usePivotData.setState({ entities: [] });
  });

  it("shows nothing when items list is empty", () => {
    const { container } = render(<TickerBar items={[]} />);
    expect(container.querySelector('[data-testid="ticker-event"]')).toBeNull();
  });

  it("merges both kinds time-ordered: the login row sits at 2 / 3 between the two auths", () => {
    usePlayhead.setState({ playhead: MS_LOGIN });
    render(<TickerBar items={ITEMS} />);
    expect(screen.getByText(/Handset-Browser-A1F8/)).toBeInTheDocument();
    expect(screen.getByText(/2\s*\/\s*3/)).toBeInTheDocument();
  });

  it("login row renders the manifest node label uppercase plus device_fp primary", () => {
    usePlayhead.setState({ playhead: MS_LOGIN });
    render(<TickerBar items={ITEMS} />);
    expect(screen.getByText("LOGIN")).toBeInTheDocument();
    expect(screen.getByText(/Handset-Browser-A1F8/)).toBeInTheDocument();
    expect(screen.getByText(/success/)).toBeInTheDocument();
  });

  it("card row keeps the old ticker's full density: $amount · merchant / mcc · country", () => {
    usePlayhead.setState({ playhead: MS_AUTH_1 });
    render(<TickerBar items={ITEMS} />);
    expect(screen.getByText("AUTHORIZATION")).toBeInTheDocument();
    expect(screen.getByText("$4.75 · Daily Grind")).toBeInTheDocument();
    expect(screen.getByText("5812 · US")).toBeInTheDocument();
  });

  it("dot routes color through the mode-aware kind token, exposing the manifest palette as the fallback", () => {
    // The dot no longer hard-codes the manifest hex inline (which
    // was mode-blind - it stayed cyan/magenta/red in every CVD mode while the
    // globe markers and the pulse recolored). It now carries .ticker-kind-dot
    // and reads `background-color: var(--kind-token, var(--kind-fallback))`,
    // where the parent .event.kind-X sets --kind-token to the per-mode slot
    // token (rgb(var(--r2-rgb)) for login). The manifest palette survives as
    // the inline --kind-fallback so an unknown kind still gets its declared
    // color. The resolved per-mode pixel is an eyes concern; this pins wiring.
    usePlayhead.setState({ playhead: MS_LOGIN });
    const { container } = render(<TickerBar items={ITEMS} />);
    const dot = container.querySelector(
      '[data-testid="ticker-kind-dot"]',
    ) as HTMLElement;
    expect(dot).not.toBeNull();
    expect(dot.className).toContain("ticker-kind-dot");
    // The manifest node palette is still the source of the fallback color.
    expect(dot.style.getPropertyValue("--kind-fallback")).toBe("#ff5ce8");
    // No hard-coded inline background - the mode-aware CSS token governs.
    expect(dot.style.backgroundColor).toBe("");
  });

  it("fraud label routes color through the mode-aware kind token, manifest palette as fallback", () => {
    const fraudItems = buildTickerStream({ fraud: [FRAUD_ROW] }, [fraudNode]);
    usePlayhead.setState({ playhead: MS_AUTH_1 });
    render(<TickerBar items={fraudItems} />);
    const label = screen.getByText("FRAUD") as HTMLElement;
    expect(label.className).toContain("ticker-kind-label");
    expect(label.style.getPropertyValue("--kind-fallback")).toBe("#ff3d2e");
    expect(label.style.color).toBe("");
  });

  it("fraud row through the real manifest keeps the canonical density: $890.50 · Heskford Lekki / 5411 · NG", () => {
    const fraudItems = buildTickerStream({ fraud: [FRAUD_ROW] }, [fraudNode]);
    usePlayhead.setState({ playhead: MS_AUTH_1 });
    render(<TickerBar items={fraudItems} />);
    expect(screen.getByText("$890.50 · Heskford Lekki")).toBeInTheDocument();
    expect(screen.getByText("5411 · NG")).toBeInTheDocument();
  });

  it("click event body fires useNavigation.navigate the same way as today for transactions", () => {
    usePlayhead.setState({ playhead: MS_AUTH_1 });
    render(<TickerBar items={ITEMS} />);
    fireEvent.click(screen.getByTestId("ticker-event"));
    const nav = useNavigation.getState();
    expect(nav.pulseEntityId).toBe("t1");
    expect(nav.panTarget).toEqual({ lat: 29.78, lng: -95.39 });
  });

  it("click on a login row navigates by kind (new kinds drive the same primitive)", () => {
    usePlayhead.setState({ playhead: MS_LOGIN });
    render(<TickerBar items={ITEMS} />);
    fireEvent.click(screen.getByTestId("ticker-event"));
    const nav = useNavigation.getState();
    expect(nav.pulseEntityId).toBe("l1");
    expect(nav.panTarget).toEqual({ lat: 29.76, lng: -95.37 });
  });

  it("<- button steps to the previous event across kinds and rewinds the playhead", () => {
    usePlayhead.setState({ playhead: MS_LOGIN });
    render(<TickerBar items={ITEMS} />);
    fireEvent.click(screen.getByTitle("Previous event"));
    expect(useNavigation.getState().pulseEntityId).toBe("t1");
    expect(usePlayhead.getState().playhead).toBe(MS_AUTH_1);
  });

  it("-> button steps to the next event across kinds and advances the playhead", () => {
    usePlayhead.setState({ playhead: MS_AUTH_1 });
    render(<TickerBar items={ITEMS} />);
    fireEvent.click(screen.getByTitle("Next event"));
    expect(useNavigation.getState().pulseEntityId).toBe("l1");
    expect(usePlayhead.getState().playhead).toBe(MS_LOGIN);
  });

  it("-> at end is no-op for playhead (stays at last event)", () => {
    usePlayhead.setState({ playhead: MS_AUTH_2 + 1000 });
    render(<TickerBar items={ITEMS} />);
    fireEvent.click(screen.getByTitle("Next event"));
    expect(usePlayhead.getState().playhead).toBe(MS_AUTH_2 + 1000);
  });

  it("NOW label has 'paused' class when isPlaying=false", () => {
    usePlayhead.setState({ playhead: MS_AUTH_1, isPlaying: false });
    const { container } = render(<TickerBar items={ITEMS} />);
    expect(container.querySelector(".ticker.paused")).not.toBeNull();
  });

  it("TML-22: now-label reads PAUSED when isPlaying=false", () => {
    // The amber-state indicator: text flips from NOW -> PAUSED so a paused
    // timeline is clearly distinguished from a live one (the .paused CSS class
    // adds the amber stripe; this pins the text half of the signal).
    usePlayhead.setState({ playhead: MS_AUTH_1, isPlaying: false });
    const { container } = render(<TickerBar items={ITEMS} />);
    const nowLabel = container.querySelector(".now-label");
    expect(nowLabel?.textContent).toBe("PAUSED");
  });

  it("TML-22: now-label reads NOW when isPlaying=true", () => {
    usePlayhead.setState({ playhead: MS_AUTH_1, isPlaying: true });
    const { container } = render(<TickerBar items={ITEMS} />);
    const nowLabel = container.querySelector(".now-label");
    expect(nowLabel?.textContent).toBe("NOW");
  });

  it("TML-22: index.css has a .ticker.paused CSS rule (amber stripe gate)", () => {
    // The amber-state indicator requires a CSS rule - the .paused class on
    // the ticker shell must have at least one rule in index.css, otherwise
    // the class is applied but completely invisible (TML-22 root cause).
    const cssPath = resolve(dirname(fileURLToPath(import.meta.url)), "../index.css");
    const css = readFileSync(cssPath, "utf8");
    expect(css).toMatch(/\.ticker\.paused/);
  });

  it("ticker rides the unified bottom-stack flex flow (Phase 5 L): no own absolute/bottom offset, height preserved", () => {
    // Phase 5 L (2026-06-18): the bottom stack (attribution + ticker + Timeline) is
    // now ONE `absolute bottom-0 left-3 right-3 flex flex-col` container in App.tsx.
    // The ticker no longer carries its own `absolute bottom-[119px] left-3 right-3`
    // offset (which drifted whenever the Timeline's content height changed and once
    // got lost entirely). It rides the flex flow at h-9, so its pixel position
    // (distFromBottom=119) is reproduced by the container + the children's intrinsic
    // heights, not a magic offset - and is published as --bottom-stack-h for the
    // Inspector/Matches consumers. (Live before/after ticker measurement is the gate.)
    usePlayhead.setState({ playhead: MS_AUTH_1 });
    const { container } = render(<TickerBar items={ITEMS} />);
    const ticker = container.querySelector(".ticker");
    expect(ticker).not.toBeNull();
    expect(ticker?.className).toContain("h-9"); // height (36px) preserved
    expect(ticker?.className).not.toContain("absolute"); // positioning moved to the parent flex container
    expect(ticker?.className).not.toContain("bottom-[119px]"); // the drift-prone magic offset is gone
  });

  it("shell adopts the Instrument-B lit material with a grain overlay, not the flat HUD panel", () => {
    // The hand-rolled `bg-panel-bg border-* border-panel-border` shell
    // becomes a <Panel material="instrument"> (lit gradient + edge-light +
    // grain). The flat fill is gone; the noise overlay is present. Positioning
    // and the .ticker/.paused hooks survive via the className escape hatch
    // (the absolute bottom-[119px] offset is load-bearing -- a prior session
    // lost it and the ticker rendered hidden, see DOCTRINE-CATCHES 2026-05-28).
    usePlayhead.setState({ playhead: MS_AUTH_1 });
    const { container } = render(<TickerBar items={ITEMS} />);
    const ticker = container.querySelector(".ticker") as HTMLElement;
    expect(ticker).not.toBeNull();
    expect(ticker.className).toContain("instrument");
    expect(ticker.className).not.toContain("bg-panel-bg");
    expect(ticker.querySelector(".grain")).not.toBeNull();
  });

  it("steppers are FocusButton icon controls (ui/ primitive), not bare buttons", () => {
    // prev/next migrate to <FocusButton variant="icon">, which tags
    // the stable fb-icon hook while forwarding title/onClick (the step tests
    // above still pass through it unchanged).
    usePlayhead.setState({ playhead: MS_LOGIN });
    render(<TickerBar items={ITEMS} />);
    expect(screen.getByTitle("Previous event").className).toContain("fb-icon");
    expect(screen.getByTitle("Next event").className).toContain("fb-icon");
  });

  it("applies kind-colored breathing-pulse class on the event (fraud)", () => {
    const fraudItems = buildTickerStream({ fraud: [FRAUD_ROW] }, [fraudNode]);
    usePlayhead.setState({ playhead: MS_AUTH_1 });
    render(<TickerBar items={fraudItems} />);
    const event = screen.getByTestId("ticker-event");
    // Per spec § 3, kind-colored breathing pulse - always-on 2.4s CSS
    // sawtooth on the .event row. The kind class is templated from
    // item.kind (data-driven); the keyframe runs in the browser.
    expect(event.className).toContain("ticker-event-pulse");
    expect(event.className).toContain("kind-fraud");
  });

  it("applies kind-colored breathing-pulse class for auth (default)", () => {
    usePlayhead.setState({ playhead: MS_AUTH_1 });
    render(<TickerBar items={ITEMS} />);
    const event = screen.getByTestId("ticker-event");
    expect(event.className).toContain("ticker-event-pulse");
    expect(event.className).toContain("kind-auth");
  });

  it("a press on a record of a story's own kind navigates to that loaded record", () => {
    const signinNode: ScenarioNode = {
      kind: "signin",
      label: "Sign-in",
      palette: "#66ccff",
      source: "json",
      timestamp: "timestamp",
      primary: "${outcome}",
      secondary: "${city}",
      coords: { lat: "lat", lng: "lng" },
    };
    const row = { id: "s1", timestamp: T_LOGIN, outcome: "success", city: "Lagos", lat: 6.5, lng: 3.4 };
    const entity = manifestRowToEntity(signinNode, row);
    usePivotData.setState({ entities: [entity] });
    usePlayhead.setState({ playhead: MS_LOGIN });
    render(<TickerBar items={buildTickerStream({ signin: [entity.fields] }, [signinNode])} />);
    fireEvent.click(screen.getByTestId("ticker-event"));
    const nav = useNavigation.getState();
    expect(nav.pulseEntityId).toBe("s1");
    expect(nav.panTarget).toEqual({ lat: 6.5, lng: 3.4 });
  });

  it("the step arrows reach a record of a story's own kind as they reach the card kinds", () => {
    const signinNode: ScenarioNode = {
      kind: "signin",
      label: "Sign-in",
      palette: "#66ccff",
      source: "json",
      timestamp: "timestamp",
      primary: "${outcome}",
      secondary: "${city}",
    };
    const s1 = manifestRowToEntity(signinNode, { id: "s1", timestamp: T_LOGIN, outcome: "success", city: "Lagos" });
    usePivotData.setState({ entities: [s1] });
    const items = buildTickerStream({ auth: [AUTH_ROW_1, AUTH_ROW_2], signin: [s1.fields] }, [authNode, signinNode]);
    usePlayhead.setState({ playhead: MS_AUTH_1 });
    const { unmount } = render(<TickerBar items={items} />);
    fireEvent.click(screen.getByTitle("Next event"));
    expect(useNavigation.getState().pulseEntityId).toBe("s1");
    expect(usePlayhead.getState().playhead).toBe(MS_LOGIN);
    unmount();
    usePlayhead.setState({ playhead: MS_AUTH_2 });
    render(<TickerBar items={items} />);
    fireEvent.click(screen.getByTitle("Previous event"));
    expect(useNavigation.getState().pulseEntityId).toBe("s1");
    expect(usePlayhead.getState().playhead).toBe(MS_LOGIN);
  });

  it("renders a non-FFR schema node (platform-readiness) and click is a safe no-op", () => {
    // Synthetic future schema: ecom_return is NOT in the FFR seed. The
    // row must render from node metadata alone via the same ${field}
    // template contract the shipped manifests use; no entity of its kind
    // is loaded in the pivot-data store, so click must not throw or fire.
    const returnNode: ScenarioNode = {
      kind: "ecom_return",
      label: "Return",
      palette: "#9b8cff",
      source: "sql",
      timestamp: "timestamp",
      primary: "${order_ref}",
      secondary: "$${refund_value}",
    };
    const futureItems = buildTickerStream(
      {
        ecom_return: [
          { id: "r1", timestamp: T_AUTH_2, order_ref: "Item-X", refund_value: 50 },
        ],
      },
      [returnNode],
    );
    usePlayhead.setState({ playhead: MS_AUTH_2 });
    const { container } = render(<TickerBar items={futureItems} />);
    expect(screen.getByText("RETURN")).toBeInTheDocument();
    expect(screen.getByText(/Item-X/)).toBeInTheDocument();
    // Schema-agnostic guarantee: ecom_return has no .kind-X CSS rule,
    // so --kind-token is unset and the dot falls back to the declared manifest
    // palette (#9b8cff) - a new kind still renders its color with zero code.
    const dot = container.querySelector(
      '[data-testid="ticker-kind-dot"]',
    ) as HTMLElement;
    expect(dot.style.getPropertyValue("--kind-fallback")).toBe("#9b8cff");
    // refund_value matches the stream layer's money field-name pattern:
    // two-decimal padding, with the literal $ supplied by the template.
    expect(screen.getByText("$50.00")).toBeInTheDocument();
    fireEvent.click(screen.getByTestId("ticker-event"));
    expect(useNavigation.getState().pulseEntityId).toBeNull();
  });

  it("index.css maps each .kind-X --kind-token to the on-panel var for its slot (Slice 2-H)", () => {
    // The legible color reaches the dot/label through a chain whose middle hop -
    // the kind→slot mapping in index.css - is asserted nowhere else: a wrong-slot
    // edit (.kind-login → --r3-on-panel) or a dropped --kind-token (silent
    // fallback to the mode-blind manifest hex) would leave every other test green
    // while regressing the feature. Pin index.css to KIND_SLOT (entity-mapping.ts).
    const cssPath = resolve(dirname(fileURLToPath(import.meta.url)), "../index.css");
    const css = readFileSync(cssPath, "utf8");
    const onPanelVar = (slot: string) => `--${slot === "textFaint" ? "text-faint" : slot}-on-panel`;
    // The six base transactional kinds are the ticker's rows.
    const TICKER_KINDS = ["fraud", "auth", "login", "account_event", "transfer", "place"];
    const mismatches: string[] = [];
    for (const kind of TICKER_KINDS) {
      const want = `--kind-token: var(${onPanelVar(slotFor(kind))})`;
      const block = css.match(new RegExp(`\\.ticker-event-pulse\\.kind-${kind}\\s*\\{([^}]*)\\}`));
      if (!block) mismatches.push(`${kind}: no .kind-${kind} rule in index.css`);
      else if (!block[1].includes(want))
        mismatches.push(`${kind}: expected "${want}", block has: ${block[1].replace(/\s+/g, " ").trim()}`);
    }
    expect(mismatches).toEqual([]);
  });
});

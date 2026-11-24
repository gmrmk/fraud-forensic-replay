import { describe, it, expect, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { LoginInspector } from "./LoginInspector";
import { useSessionFilter } from "../../store/session-filter";
import { useMatches } from "../../store/matches";
import { usePivotData } from "../../store/pivot-data";
import type { LoginEvent } from "../../types";

function makeLogin(overrides: Partial<LoginEvent> = {}): LoginEvent {
  return {
    id: "login_test_1",
    account_id: "acct_test_1",
    timestamp: "2026-06-08T15:30:00Z",
    ip: "203.0.113.7",
    ip_country: "US",
    ip_lat: 29.7604,
    ip_lng: -95.3698,
    device_fp: "fp_test_device",
    user_agent: "Mozilla/5.0 (Test) Engine/537.36",
    outcome: "success",
    two_fa_used: 0,
    session_id: "sess_login_test",
    ip_type: "residential",
    ip_asn: "AS64496 Quiltide",
    ip_reputation: 92,
    device_first_seen_at: "2026-01-04",
    device_trust: "known",
    auth_method: "password",
    challenge_reason: null,
    ...overrides,
  };
}

describe("LoginInspector session button", () => {
  beforeEach(() => {
    useSessionFilter.setState({ selectedSessionId: null });
    useMatches.setState({ active: null });
    usePivotData.setState({ logins: [], accountEvents: [], transfers: [] });
  });

  it("toggles the session filter on click and reflects aria-pressed", () => {
    const login = makeLogin();
    render(<LoginInspector login={login} logins={[login]} />);

    const button = screen.getByRole("button", { name: "Open session thread sess_login_test" });
    expect(button.getAttribute("aria-pressed")).toBe("false");

    fireEvent.click(button);
    expect(useSessionFilter.getState().selectedSessionId).toBe(
      "sess_login_test"
    );
    expect(button.getAttribute("aria-pressed")).toBe("true");
  });

  it("has a clip-safe keyboard focus indicator (inset ring survives the truncate wrapper's overflow:hidden)", () => {
    const login = makeLogin();
    render(<LoginInspector login={login} logins={[login]} />);

    const button = screen.getByRole("button", { name: "Open session thread sess_login_test" });
    // Codebase focus convention (TargetButton, MatchesTable), made clip-safe:
    // a default ring paints OUTSIDE the border box and is clipped by
    // InspectorField's `truncate` wrapper; `ring-inset` paints inside.
    expect(button.className).toContain("focus:outline-none");
    expect(button.className).toContain("focus-visible:ring-1");
    expect(button.className).toContain("focus-visible:ring-inset");
    expect(button.className).toContain("focus-visible:ring-accent");
  });
});

describe("LoginInspector defects", () => {
  beforeEach(() => {
    useSessionFilter.setState({ selectedSessionId: null });
    useMatches.setState({ active: null });
    usePivotData.setState({ logins: [], accountEvents: [], transfers: [] });
  });

  it("ERR-065: humanizes device First Seen instead of a raw ISO timestamp", () => {
    const login = makeLogin({ device_first_seen_at: "2026-05-25T10:07:00-05:00" });
    render(<LoginInspector login={login} logins={[login]} />);
    // The raw ISO string must never appear verbatim in the panel.
    expect(screen.queryByText("2026-05-25T10:07:00-05:00")).toBeNull();
    expect(screen.queryByText(/2026-05-25T/)).toBeNull();
  });

  it("ERR-054: a common/benign ASN does not render the anomaly (red) tone", () => {
    // A realistic peer spread: several distinct ASNs, each with a normal
    // handful of logins, and the inspected ASN sitting right in that
    // normal range - not a lone signature. baseline={0} would force red
    // regardless of how unremarkable this actually is.
    const shared = "AS64496 Quiltide";
    const logins = [
      makeLogin({ id: "l1", ip_asn: shared }),
      makeLogin({ id: "l2", ip_asn: shared }),
      makeLogin({ id: "l3", ip_asn: shared }),
      makeLogin({ id: "l4", ip_asn: "AS-peer-1" }),
      makeLogin({ id: "l5", ip_asn: "AS-peer-1" }),
      makeLogin({ id: "l6", ip_asn: "AS-peer-1" }),
      makeLogin({ id: "l7", ip_asn: "AS-peer-2" }),
      makeLogin({ id: "l8", ip_asn: "AS-peer-2" }),
      makeLogin({ id: "l9", ip_asn: "AS-peer-2" }),
    ];
    render(<LoginInspector login={logins[0]} logins={logins} />);
    const badge = screen.getByRole("button", {
      name: /Open matches for ip_asn=AS64496 Quiltide/,
    });
    expect(badge.getAttribute("data-tone")).not.toBe("red");
  });

  it("ERR-054: a common/benign device fingerprint does not render the anomaly (red) tone", () => {
    const shared = "fp_test_device";
    const logins = [
      makeLogin({ id: "l1", device_fp: shared }),
      makeLogin({ id: "l2", device_fp: shared }),
      makeLogin({ id: "l3", device_fp: shared }),
      makeLogin({ id: "l4", device_fp: "fp-peer-1" }),
      makeLogin({ id: "l5", device_fp: "fp-peer-1" }),
      makeLogin({ id: "l6", device_fp: "fp-peer-1" }),
      makeLogin({ id: "l7", device_fp: "fp-peer-2" }),
      makeLogin({ id: "l8", device_fp: "fp-peer-2" }),
      makeLogin({ id: "l9", device_fp: "fp-peer-2" }),
    ];
    render(<LoginInspector login={logins[0]} logins={logins} />);
    const badge = screen.getByRole("button", {
      name: /Open matches for device_fp=fp_test_device/,
    });
    expect(badge.getAttribute("data-tone")).not.toBe("red");
  });
});

// Ship list entry 30: every attribute row starts with the library icon of its field id, inside the
// label's own span and before its words.
describe("LoginInspector row icons", () => {
  beforeEach(() => {
    useSessionFilter.setState({ selectedSessionId: null });
    useMatches.setState({ active: null });
    usePivotData.setState({ logins: [], accountEvents: [], transfers: [] });
  });

  it("every attribute row starts with its icon", () => {
    // An earlier login on the account from the same device, and a challenge reason, so every
    // conditional row and the From this device section are drawn.
    const earlier = makeLogin({ id: "l0", timestamp: "2026-06-08T10:00:00Z" });
    const login = makeLogin({ id: "l1", challenge_reason: "new_device" });
    const { container } = render(<LoginInspector login={login} logins={[earlier, login]} />);
    const labels = container.querySelectorAll("span.float-left");
    expect(labels.length).toBe(16);
    for (const label of labels) expect(label.querySelector("svg.lucide"), label.textContent ?? "").not.toBeNull();
    const TABLE: readonly (readonly [string | RegExp, string])[] = [
      ["Outcome", "split"],
      ["2FA", "rectangle-ellipsis"],
      ["Posted", "clock"],
      [/Prior Login$/, "door-closed"],
      ["IP", "ethernet-port"],
      ["ASN", "router"],
      ["Type", "wifi"],
      ["Country", "globe"],
      ["Location", "move-vertical"],
      ["Fingerprint", "smartphone"],
      ["Trust Level", "handshake"],
      ["First Seen", "smartphone-charging"],
      ["Auth Method", "lock-keyhole"],
      ["Challenge Reason", "message-circle-question-mark"],
      ["Session", "cookie"],
      ["User Agent", "monitor-cog"],
    ];
    for (const [label, icon] of TABLE) {
      const words = screen.getAllByText(label)[0];
      const first = (words.parentElement as HTMLElement).firstElementChild as Element;
      expect(first.classList.contains(`lucide-${icon}`), `${String(label)} -> ${icon}`).toBe(true);
    }
    expect(screen.getByText("From this device").querySelector("svg")).toBeNull();
  });
});

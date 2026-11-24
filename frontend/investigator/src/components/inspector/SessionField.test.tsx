import { describe, it, expect, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { SessionField } from "./SessionField";
import { useSessionFilter } from "../../store/session-filter";
import { usePivotData } from "../../store/pivot-data";
import { useMatches } from "../../store/matches";
import type { AccountEvent, LoginEvent, Transfer } from "../../types";

function fakeLogin(session_id: string, id: string): LoginEvent {
  return {
    id, account_id: "a", timestamp: "2026-05-25T10:07:00-05:00",
    ip: "192.0.2.1", ip_country: "US", ip_lat: 0, ip_lng: 0,
    ip_type: "residential", ip_asn: "AS1", ip_reputation: 90,
    device_fp: "dev", user_agent: "ua", outcome: "success",
    session_id, two_fa_used: 0,
    device_first_seen_at: "2026-01-01T00:00:00-05:00",
    device_trust: "known", auth_method: "password", challenge_reason: null,
  };
}

function fakeEvent(session_id: string, id: string): AccountEvent {
  return {
    id, account_id: "a", timestamp: "2026-05-25T10:14:00-05:00",
    kind: "profile_change", field: "email", old_value: "a", new_value: "b",
    payee_id: null, session_id, is_fraud: 1,
  };
}

function fakeTransfer(session_id: string, id: string): Transfer {
  return {
    id, account_id: "a", timestamp: "2026-05-25T10:36:00-05:00",
    amount: 4200, payee_id: "p", rail: "wire", status: "sent",
    decline_reason: null, session_id, is_fraud: 1,
  };
}

describe("SessionField", () => {
  beforeEach(() => {
    useSessionFilter.setState({ selectedSessionId: null });
    usePivotData.setState({ logins: [], accountEvents: [], transfers: [] });
    useMatches.setState({ active: null });
  });

  it("the Session row starts with the session icon", () => {
    const { container } = render(<SessionField sessionId="sess_x" />);
    const label = container.querySelector("span.float-left") as HTMLElement;
    expect(label.querySelector("svg.lucide-cookie")).not.toBeNull();
    expect(label.getAttribute("data-tip")).toBe("Session");
  });

  it("renders a hyphen and no button for a null session", () => {
    render(<SessionField sessionId={null} />);
    expect(screen.queryByRole("button")).toBeNull();
    expect(screen.getByText("-")).toBeTruthy();
  });

  it("opens the thread on click: matches window + filter as one state", () => {
    render(<SessionField sessionId="sess_x" />);
    const button = screen.getByRole("button", { name: "Open session thread sess_x" });
    expect(button.getAttribute("aria-pressed")).toBe("false");

    fireEvent.click(button);
    expect(useSessionFilter.getState().selectedSessionId).toBe("sess_x");
    const active = useMatches.getState().active;
    expect(active?.mode === "field" && active.field).toBe("session_id");
    expect(active?.mode === "field" && active.value).toBe("sess_x");
    expect(button.getAttribute("aria-pressed")).toBe("true");

    fireEvent.click(button);
    expect(useSessionFilter.getState().selectedSessionId).toBeNull();
    expect(useMatches.getState().active).toBeNull();
    expect(button.getAttribute("aria-pressed")).toBe("false");
  });

  it("reflects aria-pressed=true when this session is the active one", () => {
    useSessionFilter.setState({ selectedSessionId: "sess_active" });
    render(<SessionField sessionId="sess_active" />);
    expect(
      screen.getByRole("button", { name: "Close session thread sess_active" }).getAttribute("aria-pressed"),
    ).toBe("true");
  });

  it("G1: aria-label carries the purpose (off the hover-title) and flips Open/Close with state", () => {
    const { unmount } = render(<SessionField sessionId="sess_x" />);
    // at rest: an Open label + a persistent affordance (border + tint, not bare text)
    const rest = screen.getByRole("button", { name: "Open session thread sess_x" });
    expect(rest.className).toContain("border"); // persistent rest affordance, not hover-only
    unmount();
    // active: the label flips to Close
    useSessionFilter.setState({ selectedSessionId: "sess_x" });
    render(<SessionField sessionId="sess_x" />);
    expect(screen.getByRole("button", { name: "Close session thread sess_x" })).toBeTruthy();
  });

  it("carries the clip-safe inset focus ring", () => {
    render(<SessionField sessionId="sess_x" />);
    const button = screen.getByRole("button", { name: "Open session thread sess_x" });
    expect(button.className).toContain("focus:outline-none");
    expect(button.className).toContain("focus-visible:ring-1");
    expect(button.className).toContain("focus-visible:ring-inset");
    expect(button.className).toContain("focus-visible:ring-accent");
  });

  it("renders no MatchBadge when the pivot data store is empty", () => {
    render(<SessionField sessionId="sess_x" />);
    expect(screen.queryByRole("button", { name: /Open matches/ })).toBeNull();
  });

  it("renders a MatchBadge counting all same-session events across kinds", () => {
    usePivotData.setState({
      logins: [fakeLogin("sess-takeover", "l1"), fakeLogin("s-1", "l2"), fakeLogin("s-2", "l3")],
      accountEvents: [fakeEvent("sess-takeover", "e1"), fakeEvent("sess-takeover", "e2")],
      transfers: [fakeTransfer("sess-takeover", "t1"), fakeTransfer("sess-takeover", "t2")],
    });
    render(<SessionField sessionId="sess-takeover" />);
    const badge = screen.getByRole("button", {
      name: "Open matches for session_id=sess-takeover (5 matches)",
    });
    expect(badge.textContent).toBe("×5");
    expect(badge.getAttribute("data-tone")).toBe("red");
  });

  it("gives a baseline-sized session a cyan badge", () => {
    usePivotData.setState({
      logins: [fakeLogin("s-1", "l1"), fakeLogin("s-2", "l2"), fakeLogin("s-3", "l3")],
      accountEvents: [],
      transfers: [],
    });
    render(<SessionField sessionId="s-1" />);
    const badge = screen.getByRole("button", { name: /Open matches for session_id=s-1/ });
    expect(badge.getAttribute("data-tone")).toBe("cyan");
  });

  it("badge click opens the matches store for session_id", () => {
    useMatches.setState({ active: null });
    usePivotData.setState({
      logins: [fakeLogin("sess-takeover", "l1")],
      accountEvents: [],
      transfers: [],
    });
    render(<SessionField sessionId="sess-takeover" />);
    fireEvent.click(screen.getByRole("button", { name: /Open matches/ }));
    const active = useMatches.getState().active;
    expect(active?.mode).toBe("field");
    expect(active?.mode === "field" && active.field).toBe("session_id");
    expect(active?.mode === "field" && active.value).toBe("sess-takeover");
  });

  it("ERR-064: clicking the ×N badge while its session IS the active thread closes it", () => {
    // Arrange: this session is already the active thread (both the filter
    // AND the matches store agree - the one-thread invariant).
    useSessionFilter.setState({ selectedSessionId: "sess-takeover" });
    useMatches.setState({
      active: { mode: "field", field: "session_id", value: "sess-takeover", parentKind: "login" },
    });
    usePivotData.setState({
      logins: [fakeLogin("sess-takeover", "l1")],
      accountEvents: [],
      transfers: [],
    });
    render(<SessionField sessionId="sess-takeover" />);

    // Act: click the ×N badge (not the value button) while it's active.
    fireEvent.click(screen.getByRole("button", { name: /Open matches|Close matches/ }));

    // Assert: the badge CLOSED the thread instead of re-opening it.
    expect(useSessionFilter.getState().selectedSessionId).toBeNull();
    expect(useMatches.getState().active).toBeNull();
  });

  it("ERR-064: clicking the ×N badge while CLOSED still opens the thread (unchanged)", () => {
    useMatches.setState({ active: null });
    usePivotData.setState({
      logins: [fakeLogin("sess-takeover", "l1")],
      accountEvents: [],
      transfers: [],
    });
    render(<SessionField sessionId="sess-takeover" />);
    fireEvent.click(screen.getByRole("button", { name: /Open matches/ }));
    expect(useSessionFilter.getState().selectedSessionId).toBe("sess-takeover");
    const active = useMatches.getState().active;
    expect(active?.mode === "field" && active.value).toBe("sess-takeover");
  });
});

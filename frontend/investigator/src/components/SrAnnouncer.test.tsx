import { describe, it, expect, beforeEach } from "vitest";
import { render, screen, act } from "@testing-library/react";
import { SrAnnouncer } from "./SrAnnouncer";
import { useSessionFilter } from "../store/session-filter";
import { usePivotData } from "../store/pivot-data";
import type { LoginEvent } from "../types";

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

describe("SrAnnouncer (G3 - aria-live thread announcer)", () => {
  beforeEach(() => {
    useSessionFilter.setState({ selectedSessionId: null });
    usePivotData.setState({ logins: [], accountEvents: [], transfers: [] });
  });

  it("exposes a polite status live region", () => {
    render(<SrAnnouncer />);
    const region = screen.getByRole("status");
    expect(region.getAttribute("aria-live")).toBe("polite");
  });

  it("is SILENT on mount - no spurious 'cleared' (initial selection is already null)", () => {
    render(<SrAnnouncer />);
    expect(screen.getByRole("status").textContent).toBe("");
  });

  it("announces 'active: N events' on thread select (N from sessionMatchStats)", () => {
    usePivotData.setState({ logins: [fakeLogin("s1", "l1"), fakeLogin("s1", "l2")], accountEvents: [], transfers: [] });
    render(<SrAnnouncer />);
    act(() => useSessionFilter.setState({ selectedSessionId: "s1" }));
    expect(screen.getByRole("status").textContent).toBe("Session thread active: 2 events");
  });

  it("announces 'cleared' ONLY on a real active -> null transition", () => {
    usePivotData.setState({ logins: [fakeLogin("s1", "l1")], accountEvents: [], transfers: [] });
    render(<SrAnnouncer />);
    act(() => useSessionFilter.setState({ selectedSessionId: "s1" }));
    expect(screen.getByRole("status").textContent).toBe("Session thread active: 1 event");
    act(() => useSessionFilter.setState({ selectedSessionId: null }));
    expect(screen.getByRole("status").textContent).toBe("Session thread cleared");
  });
});

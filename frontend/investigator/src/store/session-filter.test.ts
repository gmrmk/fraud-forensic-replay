import { describe, it, expect, beforeEach } from "vitest";
import { useSessionFilter } from "./session-filter";

// Captured at import, BEFORE any test mutates the store -- the real module
// default. A beforeEach reset would test the reset, not the default.
const initialSelectedSessionId = useSessionFilter.getState().selectedSessionId;

describe("useSessionFilter", () => {
  beforeEach(() => useSessionFilter.setState({ selectedSessionId: null }));

  it("defaults to no session selected", () => {
    expect(initialSelectedSessionId).toBeNull();
  });

  it("toggleSession selects a session", () => {
    useSessionFilter.getState().toggleSession("sess-1");
    expect(useSessionFilter.getState().selectedSessionId).toBe("sess-1");
  });

  it("toggleSession with the active id clears the filter", () => {
    useSessionFilter.getState().toggleSession("sess-1");
    useSessionFilter.getState().toggleSession("sess-1");
    expect(useSessionFilter.getState().selectedSessionId).toBeNull();
  });

  it("toggleSession with a different id switches the filter", () => {
    useSessionFilter.getState().toggleSession("sess-1");
    useSessionFilter.getState().toggleSession("sess-2");
    expect(useSessionFilter.getState().selectedSessionId).toBe("sess-2");
  });

  it("clearSession clears an active filter", () => {
    useSessionFilter.getState().toggleSession("sess-1");
    useSessionFilter.getState().clearSession();
    expect(useSessionFilter.getState().selectedSessionId).toBeNull();
  });

  it("clearSession when already null stays null", () => {
    useSessionFilter.getState().clearSession();
    expect(useSessionFilter.getState().selectedSessionId).toBeNull();
  });
});

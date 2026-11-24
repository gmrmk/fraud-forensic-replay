import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { useTerminalRows } from "./terminal-rows";
import type { Transaction } from "../../types";

const row = (id: string) => ({ id, terminal_id: "ZEL-7731042" }) as Transaction;

function respond(body: unknown, ok = true) {
  return Promise.resolve({ ok, json: () => Promise.resolve(body) } as Response);
}

describe("useTerminalRows", () => {
  beforeEach(() => useTerminalRows.setState({ rows: {}, status: {} }));
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("fetches one terminal's rows from the terminal-scoped transactions read", async () => {
    const fetchMock = vi.fn(() => respond([row("a"), row("b")]));
    vi.stubGlobal("fetch", fetchMock);
    useTerminalRows.getState().load("ZEL-7731042");
    expect(useTerminalRows.getState().status["ZEL-7731042"]).toBe("loading");
    await vi.waitFor(() => expect(useTerminalRows.getState().status["ZEL-7731042"]).toBe("ok"));
    expect(fetchMock).toHaveBeenCalledWith("/api/transactions?terminal_id=ZEL-7731042");
    expect(useTerminalRows.getState().rows["ZEL-7731042"].map((t) => t.id)).toEqual(["a", "b"]);
  });

  it("encodes the terminal id in the query string", async () => {
    const fetchMock = vi.fn(() => respond([]));
    vi.stubGlobal("fetch", fetchMock);
    useTerminalRows.getState().load("A&B=1 2");
    await vi.waitFor(() => expect(useTerminalRows.getState().status["A&B=1 2"]).toBe("ok"));
    expect(fetchMock).toHaveBeenCalledWith("/api/transactions?terminal_id=A%26B%3D1%202");
  });

  it("fetches a terminal once: in-flight and settled loads are no-ops", async () => {
    const fetchMock = vi.fn(() => respond([row("a")]));
    vi.stubGlobal("fetch", fetchMock);
    const { load } = useTerminalRows.getState();
    load("T-1");
    load("T-1");
    await vi.waitFor(() => expect(useTerminalRows.getState().status["T-1"]).toBe("ok"));
    load("T-1");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("never fetches an empty terminal id (that would mean every card-not-present row)", () => {
    const fetchMock = vi.fn(() => respond([]));
    vi.stubGlobal("fetch", fetchMock);
    useTerminalRows.getState().load("");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("records a failed read as an error, keeps no rows, and allows a retry", async () => {
    vi.stubGlobal("fetch", vi.fn(() => respond({ detail: "boom" }, false)));
    useTerminalRows.getState().load("T-2");
    await vi.waitFor(() => expect(useTerminalRows.getState().status["T-2"]).toBe("error"));
    expect(useTerminalRows.getState().rows["T-2"]).toBeUndefined();

    vi.stubGlobal("fetch", vi.fn(() => respond([row("c")])));
    useTerminalRows.getState().load("T-2");
    await vi.waitFor(() => expect(useTerminalRows.getState().status["T-2"]).toBe("ok"));
    expect(useTerminalRows.getState().rows["T-2"]).toHaveLength(1);
  });
});

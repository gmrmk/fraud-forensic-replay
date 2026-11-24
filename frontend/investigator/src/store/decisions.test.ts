import { describe, it, expect, vi, afterEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { staticPath } from "../lib/static-api";
import { fetchDecisions, useDecisions } from "./decisions";

afterEach(() => { vi.restoreAllMocks(); });

const RAW = [{
  id: "d1",
  rule: { id: "impossible-travel", label: "impossible-travel", kind: "geo-velocity" },
  subject_path_kind: "fraud", trigger_entity_ids: ["grocery", "lag1"],
  inputs: [], thresholds: [], verdict: "IMPOSSIBLE TRAVEL", decision: "DECLINE",
  evidence: [{ label: "Currency", value: "NGN", entity_ref: "lag1" }], severity: 0.98,
}];

describe("fetchDecisions", () => {
  it("fetches /api/decisions and maps to camelCase Decision[]", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => RAW }));
    const out = await fetchDecisions();
    expect(out).toHaveLength(1);
    expect(out[0].subjectPathKind).toBe("fraud");
    expect(out[0].evidence[0].entityRef).toBe("lag1");
  });

  it("rejects on a non-ok response instead of returning [] (D4)", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 500, json: async () => [] }));
    await expect(fetchDecisions()).rejects.toThrow(/500/);
  });
});

describe("useDecisions", () => {
  it("surfaces a failed fetch as an error, with no decisions", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 500, json: async () => [] }));
    const { result } = renderHook(() => useDecisions());
    await waitFor(() => expect(result.current.error).toMatch(/500/));
    expect(result.current.decisions).toEqual([]);
  });

  it("has no error and the mapped decisions on success", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => RAW }));
    const { result } = renderHook(() => useDecisions());
    await waitFor(() => expect(result.current.decisions).toHaveLength(1));
    expect(result.current.error).toBeNull();
  });

  it("is not loaded until the read settles, and is loaded after a success or a failure", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => [] }));
    const ok = renderHook(() => useDecisions());
    expect(ok.result.current.loaded).toBe(false);
    await waitFor(() => expect(ok.result.current.loaded).toBe(true));
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 500, json: async () => [] }));
    const bad = renderHook(() => useDecisions());
    await waitFor(() => expect(bad.result.current.loaded).toBe(true));
    expect(bad.result.current.error).toMatch(/500/);
  });
});

/** A fetch whose answers are held until the test resolves them, so the order of arrival is the test's. */
function heldFetch() {
  const calls: { url: string; answer: (rows: unknown[]) => void }[] = [];
  const fn = vi.fn((url: string) =>
    new Promise((resolve) => {
      calls.push({ url, answer: (rows) => resolve({ ok: true, json: async () => rows }) });
    }),
  );
  vi.stubGlobal("fetch", fn);
  return { calls, fn };
}

function okFetch() {
  const fn = vi.fn().mockResolvedValue({ ok: true, json: async () => [] });
  vi.stubGlobal("fetch", fn);
  return fn;
}

describe("the decisions request", () => {
  it("asks for the bare address, once", async () => {
    const fn = okFetch();
    renderHook(() => useDecisions());
    await waitFor(() => expect(fn).toHaveBeenCalled());
    expect(fn.mock.calls.map((c) => c[0])).toEqual(["/api/decisions"]);
  });

  it("keeps the same empty list between renders so a consumer's effect does not loop", () => {
    heldFetch();
    const { result, rerender } = renderHook(() => useDecisions());
    const first = result.current.decisions;
    rerender();
    expect(result.current.decisions).toBe(first);
  });
});

describe("the static key of the decisions request", () => {
  it("the bare request still resolves to decisions/_.json", async () => {
    const fn = okFetch();
    renderHook(() => useDecisions());
    await waitFor(() => expect(fn).toHaveBeenCalled());
    expect(staticPath(fn.mock.calls[0][0] as string)).toBe("decisions/_.json");
  });

  it("a focal request keys to a file of its own, whatever the parameter order", () => {
    expect(staticPath("/api/decisions?card_id=card-x&account_id=acct-x")).toBe(
      staticPath("/api/decisions?account_id=acct-x&card_id=card-x"),
    );
    expect(staticPath("/api/decisions?card_id=card-x&account_id=acct-x")).not.toBe("decisions/_.json");
  });
});

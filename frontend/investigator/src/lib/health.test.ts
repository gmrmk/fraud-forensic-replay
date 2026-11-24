import { describe, it, expect, vi, beforeEach } from "vitest";
import { fetchHealth } from "./health";

beforeEach(() => {
  vi.unstubAllGlobals();
});

describe("fetchHealth", () => {
  it("returns status, boot_id, and scenario", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: () =>
          Promise.resolve({ status: "ok", boot_id: "abc123", scenario: "priya-ato" }),
      }),
    );
    await expect(fetchHealth()).resolves.toEqual({
      status: "ok",
      boot_id: "abc123",
      scenario: "priya-ato",
    });
  });

  it("throws on a non-ok response", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: false, status: 503, json: () => Promise.resolve({}) }),
    );
    await expect(fetchHealth()).rejects.toThrow(/503/);
  });
});

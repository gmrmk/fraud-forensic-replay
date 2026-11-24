import { describe, it, expect } from "vitest";
import { resolveEntityRef } from "./decision-entities";
import type { PivotContext } from "./matches";
import type { LoginEvent, Transaction } from "../types";

const fraudTx = { id: "lag1", is_fraud: 1, merchant_name: "Tidewater Trust ATM" } as unknown as Transaction;
const authTx = { id: "grocery", is_fraud: 0, merchant_name: "Cobstead Grocers" } as unknown as Transaction;
const login = { id: "lgn1", device_fp: "Handset" } as unknown as LoginEvent;

const context: PivotContext = { transactions: [fraudTx, authTx], logins: [login], places: [] };

describe("resolveEntityRef", () => {
  it("resolves a fraud transaction id to a fraud EntityMatch", () => {
    const m = resolveEntityRef("lag1", context);
    expect(m).toEqual({ kind: "fraud", tx: fraudTx });
  });

  it("resolves a non-fraud transaction id to an auth EntityMatch", () => {
    const m = resolveEntityRef("grocery", context);
    expect(m).toEqual({ kind: "auth", tx: authTx });
  });

  it("resolves a login id to a login EntityMatch", () => {
    const m = resolveEntityRef("lgn1", context);
    expect(m).toEqual({ kind: "login", login });
  });

  it("returns null for an undefined ref (inert row - honest-encoding degrade)", () => {
    expect(resolveEntityRef(undefined, context)).toBeNull();
  });

  it("returns null for an id that no longer resolves (inert click, spec 9)", () => {
    expect(resolveEntityRef("ghost", context)).toBeNull();
  });
});

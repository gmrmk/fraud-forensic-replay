import { describe, it, expect } from "vitest";
import { cardLine, deviceLine } from "./case-summary";
import type { LoginEvent, Transaction } from "../types";

const tx = (id: string, card_id: string): Transaction =>
  ({ id, card_id } as unknown as Transaction);
const login = (id: string, device_fp: string): LoginEvent =>
  ({ id, device_fp } as unknown as LoginEvent);

describe("cardLine", () => {
  it("names the card when there is exactly one", () => {
    expect(cardLine([tx("t1", "gen-card-001"), tx("t2", "gen-card-001")])).toBe(
      "card gen-card-001",
    );
  });

  it("counts cards for a portfolio", () => {
    expect(cardLine([tx("t1", "c1"), tx("t2", "c2"), tx("t3", "c1")])).toBe("2 cards");
  });

  it("shows a real card network in the id as V*** (every brand on screen is fictional)", () => {
    expect(cardLine([tx("t1", "card-marcus-visa-001")])).toBe("card card-marcus-v***-001");
  });

  it("reads honestly when empty", () => {
    expect(cardLine([])).toBe("no cards");
  });
});

describe("deviceLine", () => {
  it("counts distinct devices and events", () => {
    expect(
      deviceLine([login("l1", "handset"), login("l2", "laptop"), login("l3", "handset")]),
    ).toBe("2 devices · 3 events");
  });

  it("singularizes correctly", () => {
    expect(deviceLine([login("l1", "handset")])).toBe("1 device · 1 event");
  });

  it("reads honestly when empty", () => {
    expect(deviceLine([])).toBe("0 devices · 0 events");
  });
});

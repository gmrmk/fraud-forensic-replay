/**
 * The two readers of a stop's words: a kind's label (the manifest's, else the kind with spaces) and a
 * stop in words ("<kind label>: <headline>", or "Record not found" when the record is not in the data).
 */
import { describe, expect, it } from "vitest";
import type { PathStopView } from "../../lib/marks/select";
import type { ScenarioNode } from "../../lib/scenarios";
import { infoOf } from "../../lib/notes/test-fixtures";
import { kindLabelOf, stopWords } from "./path-lookup";

const node = (kind: string, label: string): ScenarioNode => ({ kind, label, palette: "info", source: kind });
const NODES: ScenarioNode[] = [node("signin", "Sign-in"), node("key_event", "Key event")];

const view = (over: Partial<PathStopView> = {}): PathStopView => ({
  record: { kind: "signin", id: "si-0001" },
  n: 1,
  info: infoOf({ headline: "192.0.2.7", draw: { kind: "signin", id: "si-0001", timestamp: 1, fields: {} } }),
  shown: true,
  onGlobe: true,
  onTimeline: true,
  ...over,
});

describe("kindLabelOf", () => {
  it("gives the manifest's label for the kind", () => {
    expect(kindLabelOf(NODES, "signin")).toBe("Sign-in");
    expect(kindLabelOf(NODES, "key_event")).toBe("Key event");
  });

  it("gives the kind with spaces for a kind no node declares", () => {
    expect(kindLabelOf(NODES, "account_event")).toBe("account event");
    expect(kindLabelOf([], "login")).toBe("login");
  });

  it("reads a fraud kind as auth, so the word fraud is never printed as a kind", () => {
    expect(kindLabelOf([], "fraud")).toBe("auth");
    expect(kindLabelOf([node("auth", "Authorization")], "fraud")).toBe("Authorization");
  });

  it("an own key only: a kind named like an object method still reads as itself", () => {
    expect(kindLabelOf(NODES, "constructor")).toBe("constructor");
  });
});

describe("stopWords", () => {
  it("is the kind's label and the headline", () => {
    expect(stopWords(view(), NODES)).toBe("Sign-in: 192.0.2.7");
  });

  it("reads the kind the record draws as: a fraud transaction is not worded as fraud", () => {
    const fraud = view({
      info: infoOf({ headline: "Corner Store", kind: "auth", draw: { kind: "fraud", id: "t-1", timestamp: 1, fields: {} } }),
    });
    expect(stopWords(fraud, [])).toBe("auth: Corner Store");
  });

  it("says Record not found for a stop whose record is not in the data", () => {
    expect(stopWords(view({ info: null, shown: false, onGlobe: false, onTimeline: false }), NODES)).toBe("Record not found");
  });
});

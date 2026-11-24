/**
 * Test fixtures for the overlay readers: manifest nodes whose field names differ from every real
 * pack's, so a test that passes with them proves the renderer reads fields only through the
 * node's decision mapping.
 */
import type { ScenarioNode } from "./scenarios";

export const verdictNode: ScenarioNode = {
  kind: "verdict_export", label: "Verdict", palette: "#ff0000", source: "json",
  coords: { lat: "y", lng: "x" }, timestamp: "when", primary: "${finding} · ${subject}", pivotable: ["acct"],
  decision: { status: "state", outcome: "finding", note: "memo", actor: "who", target: "subject", key: "acct", event: "worked" },
};

/** A record kind keyed to the decisions by `acct`, linked to each other through `gadget`. */
export const recordNode: ScenarioNode = {
  kind: "login_like", label: "Login-like", palette: "#00ff00", source: "json",
  coords: { lat: "y", lng: "x" }, timestamp: "when", primary: "${id}", pivotable: ["acct", "gadget"],
};

export const plainNode: ScenarioNode = { kind: "card_swipe", label: "Swipe", palette: "#00ff00", source: "json" };

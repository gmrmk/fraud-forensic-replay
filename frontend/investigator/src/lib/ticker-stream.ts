/**
 * Pure merge layer for the schema-driven ticker.
 *
 * Folds per-kind raw entity rows into ONE time-ordered stream using
 * manifest node metadata (ScenarioNode) alone - no kind-specific code
 * paths, per the platform-readiness seam. The consumer (TickerBar)
 * renders label/palette from item.node and bridges navigation through
 * item.raw.
 *
 * Template contract: node.primary/node.secondary are ${field} TEMPLATE
 * strings, exactly as the shipped manifests declare them - e.g.
 * "$${amount} · ${merchant_name}" or "${mcc} · ${merchant_country}".
 * Each ${field} placeholder resolves against the raw row; literal text
 * (separators, currency symbols) passes through verbatim, so the
 * template owns the "$" in "$${amount}" (the priya-ato transfer node's
 * "${rail} $${amount}" is the canonical compound form).
 *
 * Absence-as-data rules:
 * - A node with no `timestamp` field contributes nothing (places are
 *   ambient reference geometry, not events).
 * - A kind present in byKind that no node declares is skipped.
 * - A null/missing row field resolves to "" inside its template slot.
 */
import type { ScenarioNode } from "./scenarios";

export interface TickerItem {
  id: string;
  kind: string;
  /** The manifest node this row was read through - label/palette source. */
  node: ScenarioNode;
  /** Raw timestamp string, exactly as the row carries it (ISO 8601). */
  ts: string;
  primary: string;
  secondary: string;
  raw: Record<string, unknown>;
}

/** Matches one ${field} placeholder inside a manifest template string. */
const PLACEHOLDER_PATTERN = /\$\{(\w+)\}/g;

/** Field keys whose finite-number values render with two decimals
 *  (890.5 -> "890.50"). Pattern is by FIELD NAME, not by kind - a new
 *  schema's `spend_total` pads free. The currency symbol is the
 *  template's job ("$${amount}"), never prepended here. */
const MONEY_FIELD_PATTERN = /amount|spend|price|value/i;

function resolveField(field: string, raw: Record<string, unknown>): string {
  const v = raw[field];
  if (MONEY_FIELD_PATTERN.test(field) && typeof v === "number" && Number.isFinite(v)) {
    return v.toFixed(2);
  }
  return String(v ?? "");
}

/** Resolve a manifest ${field} template against a raw row. A template
 *  with no placeholders renders verbatim; an absent template -> "". */
export function resolveTemplate(
  template: string | undefined,
  raw: Record<string, unknown>,
): string {
  if (!template) return "";
  return template.replace(PLACEHOLDER_PATTERN, (_match, field: string) =>
    resolveField(field, raw),
  );
}

/**
 * Merge per-kind raw rows into one ascending time-ordered ticker stream.
 *
 * Sort assumption: timestamps are ISO 8601 strings with a uniform
 * format within a scenario (the seed emits one offset per case), so
 * lexicographic order (localeCompare) IS chronological order. Mixed
 * formats would need Date.parse - deliberately not paid for here.
 */
export function buildTickerStream(
  byKind: Record<string, Array<Record<string, unknown>>>,
  nodes: ScenarioNode[],
): TickerItem[] {
  const items: TickerItem[] = [];
  for (const node of nodes) {
    // No timestamp field declared = not an event stream (e.g. places).
    if (!node.timestamp) continue;
    const rows = byKind[node.kind] ?? [];
    rows.forEach((raw, i) => {
      items.push({
        // Every seed row carries `id`; the positional fallback keeps
        // keys unique for hypothetical id-less schemas.
        id: raw.id != null ? String(raw.id) : `${node.kind}-${i}`,
        kind: node.kind,
        node,
        ts: String(raw[node.timestamp as string]),
        primary: resolveTemplate(node.primary, raw),
        secondary: resolveTemplate(node.secondary, raw),
        raw,
      });
    });
  }
  return items.sort((a, b) => a.ts.localeCompare(b.ts));
}

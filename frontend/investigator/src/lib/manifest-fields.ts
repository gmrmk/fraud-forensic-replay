/**
 * Pure helpers for manifest-field classification and value formatting.
 *
 * The manifest (ScenarioNode) is the AUTHORITY. No field names are
 * hardcoded here; every classification decision derives from what the
 * node declares in primary, secondary, pivotable, coords, timestamp.
 *
 * Field types (used by ManifestFieldsSection):
 *   - "currency"   -- finite numeric field whose name matches MONEY_FIELD_PATTERN
 *   - "pivotable"  -- declared in node.pivotable[]
 *   - "text"       -- everything else
 *
 * Design: kept pure (no React, no Zustand) so it is fully unit-testable
 * without a DOM environment.
 */
import { parseTemplateFields } from "./scenarios";
export { parseTemplateFields } from "./scenarios";
import type { ScenarioNode } from "./scenarios";
import { formatHoustonDateTime } from "./houston-day";
import { statusAddsInformation } from "./verdicts";



/** Money-like field names -- value rendered with 2 decimal places.
 *  Pattern mirrors ticker-stream.ts so they stay in sync. */
const MONEY_FIELD_PATTERN = /amount|spend|price|value/i;

/** The set of field keys that appear in the node's primary or secondary
 *  templates -- surfaced in the ticker bar headline; the manifest-fields
 *  section shows them but visually de-emphasises to avoid duplication. */
export function headlineFields(node: ScenarioNode): ReadonlySet<string> {
  return new Set([
    ...parseTemplateFields(node.primary),
    ...parseTemplateFields(node.secondary),
  ]);
}

/** Fields that are always excluded from the "all fields" table.
 *  Minimal: only id (identity key, not evidence). */
const ALWAYS_SKIP_FIELDS = new Set(["id"]);

/** Classify a field key against the manifest node. */
export type FieldClass = "currency" | "pivotable" | "text";

export function classifyField(fieldKey: string, node: ScenarioNode): FieldClass {
  if ((node.pivotable ?? []).includes(fieldKey)) return "pivotable";
  if (MONEY_FIELD_PATTERN.test(fieldKey)) return "currency";
  return "text";
}

/** Format a raw field value for display in the inspector.
 *  - null / undefined -> "---"
 *  - currency fields (finite number) -> two decimal places
 *  - 0|1 boolean-flag fields (is_*, two_fa_*, has_*) -> "Yes" / "No"
 *  - booleans -> "Yes" / "No"
 *  - ISO datetime strings -> Houston time, the timeline's style (the raw value stays on the entry)
 *  - a list -> its values, each formatted, separated by commas
 *  - everything else -> String() */
export function formatFieldValue(fieldKey: string, raw: unknown): string {
  if (raw == null) return "-";
  if (Array.isArray(raw)) return raw.map((v) => formatFieldValue(fieldKey, v)).join(", ");
  if (
    typeof raw === "number" &&
    MONEY_FIELD_PATTERN.test(fieldKey) &&
    Number.isFinite(raw)
  ) {
    return raw.toFixed(2);
  }
  if (typeof raw === "boolean") return raw ? "Yes" : "No";
  if (typeof raw === "string") return formatHoustonDateTime(raw);
  if (typeof raw === "number" && (raw === 0 || raw === 1)) {
    const lc = fieldKey.toLowerCase();
    if (lc.startsWith("is_") || lc.startsWith("two_fa") || lc.startsWith("has_")) {
      return raw === 1 ? "Yes" : "No";
    }
  }
  return String(raw);
}

/** Human-readable label for a snake_case field key.
 *  "merchant_name" -> "Merchant Name" */
export function labelForField(fieldKey: string): string {
  return fieldKey
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

/** Domain initialisms that stay fully uppercase inside a Title-Cased label
 *  (so a `payee id` field reads "Payee ID", not "Payee Id"). */
const LABEL_INITIALISMS = new Set([
  "id", "ip", "url", "utc", "mcc", "cnp", "pos", "otp", "p2p",
  "ach", "cvv", "ssn", "atm", "kyc", "sms", "api", "usd", "fp", "mfa", "asn", "mgrs",
]);

/** Multi-word phrase fixes applied before per-word title-casing, so a rule like
 *  "two fa" -> "2FA" lands wherever the phrase appears (e.g. `two_fa_used` reads
 *  "2FA Used", not "Two Fa Used"). */
const LABEL_PHRASE_FIXES: ReadonlyArray<readonly [RegExp, string]> = [
  [/\btwo[\s_]*fa\b/gi, "2FA"],
  [/\b2fa\b/gi, "2FA"],
];

/** Title-case a humanized label: apply phrase fixes, then per-word title-case
 *  while keeping known initialisms uppercase. */
export function displayLabel(label: string): string {
  let s = label.replace(/_+/g, " ");
  for (const [re, rep] of LABEL_PHRASE_FIXES) s = s.replace(re, rep);
  return s
    .split(/\s+/)
    .filter(Boolean)
    .map((w) =>
      w === "2FA"
        ? w
        : LABEL_INITIALISMS.has(w.toLowerCase())
          ? w.toUpperCase()
          : w,
    )
    .join(" ");
}

/** The field keys a node tells the Inspector to leave out for its records: the manifest key `omit`,
 *  read as the manifest gives it and checked here (ScenarioNode does not name the key; the type is the
 *  model piece's file). Only an own key holding an array of strings counts; anything else is no key. */
export function omittedFields(node: ScenarioNode): ReadonlySet<string> {
  if (!Object.hasOwn(node, "omit")) return new Set();
  const raw = (node as ScenarioNode & { omit?: unknown }).omit;
  return Array.isArray(raw) && raw.every((k) => typeof k === "string") ? new Set<string>(raw) : new Set();
}

export interface ManifestFieldEntry {
  key: string;
  label: string;
  value: string;
  raw: unknown;
  fieldClass: FieldClass;
  /** True if the field appears in the node's primary or secondary templates. */
  isHeadline: boolean;
}

/** Build the ordered list of displayable field entries for a given
 *  entity's raw fields and its manifest node.
 *
 *  Exclusion rules:
 *   1. ALWAYS_SKIP_FIELDS (id)
 *   2. Coord fields declared in node.coords (lat/lng columns)
 *   3. The timestamp field declared in node.timestamp
 *   4. The field mapped to node.decision.status, when its value is not empty and the
 *      decision's outcome already says it (see statusAddsInformation)
 *   5. Every key the node lists in its manifest key `omit` (see omittedFields)
 *
 *  Ordering: pivotable first (forensically most interesting), then
 *  headline fields, then the rest -- alphabetical within each group. */
export function buildFieldEntries(
  fields: Record<string, unknown>,
  node: ScenarioNode,
): ManifestFieldEntry[] {
  const skipCoords = new Set<string>();
  if (node.coords) {
    skipCoords.add(node.coords.lat);
    skipCoords.add(node.coords.lng);
  }
  if (node.timestamp) skipCoords.add(node.timestamp);
  // A key a declared section claims renders in that section, not twice.
  for (const section of node.sections ?? []) for (const k of section.fields) skipCoords.add(k);
  // A key the node lists in `omit` (a filler value, such as the 0 an untimed kind keeps) is left out.
  for (const k of omittedFields(node)) skipCoords.add(k);
  // A decision's status the outcome already says is not printed twice. An empty status keeps its row
  // (the gap is data), and so does a status beside an empty outcome (the only word that is shown).
  const m = node.decision;
  if (m) {
    const status = String(fields[m.status] ?? "");
    const outcome = String(fields[m.outcome] ?? "");
    if (status.trim() !== "" && !statusAddsInformation(outcome, status)) skipCoords.add(m.status);
  }

  const headlines = headlineFields(node);
  const pivotable = new Set(node.pivotable ?? []);

  const entries: ManifestFieldEntry[] = [];
  for (const [key, raw] of Object.entries(fields)) {
    if (ALWAYS_SKIP_FIELDS.has(key)) continue;
    if (skipCoords.has(key)) continue;
    const fieldClass = classifyField(key, node);
    entries.push({
      key,
      label: labelForField(key),
      value: formatFieldValue(key, raw),
      raw,
      fieldClass,
      isHeadline: headlines.has(key),
    });
  }

  const rank = (e: ManifestFieldEntry): number => {
    if (pivotable.has(e.key)) return 0;
    if (e.isHeadline) return 1;
    return 2;
  };
  return entries.sort((a, b) => rank(a) - rank(b) || a.key.localeCompare(b.key));
}

/** Entries for one declared section, in the section's own order. A key the record lacks
 *  renders as "-" (flagged, never dropped). The timestamp is included when a section names it. */
export function sectionEntries(
  fields: Record<string, unknown>,
  node: ScenarioNode,
  keys: readonly string[],
): ManifestFieldEntry[] {
  const headlines = headlineFields(node);
  return keys.map((key) => ({
    key,
    label: labelForField(key),
    value: formatFieldValue(key, fields[key]),
    raw: fields[key],
    fieldClass: classifyField(key, node),
    isHeadline: headlines.has(key),
  }));
}

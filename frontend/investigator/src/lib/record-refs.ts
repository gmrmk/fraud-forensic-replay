/**
 * Record refs: a manifest node may declare, for a field, which kinds of record the
 * field's value names (`refs: { <field>: [<kind>, ...] }`). This file reads that
 * declaration and resolves a field's value to the records it names. It is pure: the
 * loaded rows, the manifest nodes and the open record's id come in as arguments, and
 * nothing here names a field or a kind of any pack.
 *
 * Deliberate shortcut: `ScenarioNode` does not name `refs`; `RefNode` adds it for
 * fixtures, and `refsOf` reads it as unknown and checks its shape. Limit: the manifest's
 * own type is written elsewhere, so a typo in a manifest is caught here at
 * read time (the entry is dropped), not by the compiler.
 */
import type { EntityMatch, PivotContext } from "./matches";
import type { ScenarioNode } from "./scenarios";
import { resolveEntityRef } from "./decision-entities";
import { selectedToEntity } from "./adapters/ffr-seed";

/** A manifest node that may declare refs. Used to type fixtures. */
export type RefNode = ScenarioNode & { refs?: Record<string, string[]> };

/** One value that names a record of a kind its field declares. */
export interface ResolvedRef {
  /** What `useNavigation.navigate` takes, as `resolveEntityRef` returned it. */
  match: EntityMatch;
  id: string;
  /** The kind judged against the ref: `match.entity.kind` for a manifest record, `match.kind` otherwise. */
  kind: string;
  /** The manifest's label for the kind, or the kind itself when no node carries one. */
  kindLabel: string;
  /** The record's primary line, unchanged. */
  name: string;
}

function isStringList(v: unknown): v is string[] {
  return Array.isArray(v) && v.every((k) => typeof k === "string");
}

/**
 * The refs a node declares: field name to the kinds that field's value may name.
 * Anything that is not a non-empty list of strings is ignored, never thrown on; a node
 * with no `refs`, or a missing node, gives an empty map.
 */
export function refsOf(node: ScenarioNode | RefNode | null | undefined): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  const raw: unknown = node ? (node as { refs?: unknown }).refs : undefined;
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) return out;
  for (const [field, kinds] of Object.entries(raw)) {
    if (field === "__proto__") continue;
    if (isStringList(kinds) && kinds.length > 0) out[field] = [...kinds];
  }
  return out;
}

function matchKind(match: EntityMatch): string {
  return match.kind === "entity" ? match.entity.kind : match.kind;
}

function resolveOne(
  value: unknown,
  kinds: readonly string[],
  context: PivotContext,
  nodes: readonly ScenarioNode[],
  openId: string | null | undefined,
): ResolvedRef | null {
  if (typeof value !== "string" || value === "") return null;
  if (openId != null && value === openId) return null;
  const match = resolveEntityRef(value, context);
  if (!match) return null;
  const kind = matchKind(match);
  if (!kinds.includes(kind)) return null;
  return {
    match,
    id: value,
    kind,
    kindLabel: nodes.find((n) => n.kind === kind)?.label ?? kind,
    name: selectedToEntity(match).displayMetadata.primaryLabel,
  };
}

/**
 * Resolve a field's value to records, one result for each value and in the value's order:
 * a scalar gives one result, a list one for each member, an empty list none. A result is
 * null when the value is empty, null, not a string, names no loaded record, names a record
 * of a kind the ref does not list, or names the open record itself.
 */
export function resolveRefs(
  value: unknown,
  kinds: readonly string[],
  context: PivotContext,
  nodes: readonly ScenarioNode[],
  openId?: string | null,
): (ResolvedRef | null)[] {
  const values: unknown[] = Array.isArray(value) ? value : [value];
  return values.map((v) => resolveOne(v, kinds, context, nodes, openId));
}

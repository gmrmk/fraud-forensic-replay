/**
 * The lane feed. The lane builder reads entities, and
 * the case's own rows (authorizations, sign-ins, transfers) are not entities until an adapter makes
 * them one, so a lane declared over those kinds had no rows to read. This file adapts the rows that
 * some lane lists, once per data, and builds the lanes, with or without a solo.
 *
 * It holds no field, kind or word of a pack: the declarations arrive from the manifest.
 *
 * Under a solo a lane that adds its values up (a sum) is
 * drawn on the soloed row's largest hourly bar over the whole case, taken exactly. A lane that is
 * not a sum keeps the top it has with no solo: its scale under a solo was not drawn, so it does not
 * change.
 */
import { accountEventToEntity, loginToEntity, transactionToEntity, transferToEntity } from "./adapters/ffr-seed";
import type { Entity } from "./entity";
import { validLanes } from "./scenarios";
import type { ScenarioNode } from "./scenarios";
import {
  LANE_PLOT_PX,
  buildDeclaredLane,
  declarationOfNode,
  emptyLaneLike,
  magnitudeNodes,
  type LaneDeclaration,
  type LaneModel,
} from "./timeline-lanes";
import type { AccountEvent, LoginEvent, Transaction, Transfer } from "../types";

/** The rows of the case a lane may read. */
export interface LaneRows {
  transactions: readonly Transaction[];
  logins?: readonly LoginEvent[];
  accountEvents?: readonly AccountEvent[];
  transfers?: readonly Transfer[];
  /** The manifest-declared kinds, already entities: every one of them is kept. */
  entities?: readonly Entity[];
}

/** The lanes of a pack as declarations, in the order `buildLanes` draws them: the nodes' own, then
 *  the manifest's. An invalid manifest entry is left out, and an id a node's lane has is too. */
export function laneDeclarations(nodes: readonly ScenarioNode[], declared?: unknown): LaneDeclaration[] {
  const own = magnitudeNodes(nodes);
  const fromManifest = validLanes(declared, nodes, own.map((n) => n.kind)).map(
    (entry): LaneDeclaration => ({ ...entry, palette: nodes.find((n) => n.kind === entry.kinds[0])?.palette ?? "" }),
  );
  return [...own.map(declarationOfNode), ...fromManifest];
}

/** The case's rows as entities, for the kinds in `kinds` only (a row of a kind no lane lists is not
 *  adapted), then every generic entity. Built once for the data, never at a tick. */
export function laneEntities(rows: LaneRows, kinds: ReadonlySet<string>): Entity[] {
  const out: Entity[] = [];
  for (const t of rows.transactions) if (kinds.has(t.is_fraud ? "fraud" : "auth")) out.push(transactionToEntity(t));
  if (kinds.has("login")) for (const l of rows.logins ?? []) out.push(loginToEntity(l));
  if (kinds.has("account_event")) for (const e of rows.accountEvents ?? []) out.push(accountEventToEntity(e));
  if (kinds.has("transfer")) for (const t of rows.transfers ?? []) out.push(transferToEntity(t));
  out.push(...(rows.entities ?? []));
  return out;
}

/**
 * The lanes of a pack. With `alone` (the entities of the soloed row, narrowed by the one solo
 * derivation) each lane is built from them: a sum lane on the row's largest hourly bar, any other
 * lane on the top it has over `entities`. A lane the row has no value for stays, with no bars and
 * the top it has over `entities`. With no `alone` the result is what `buildLanes` gives.
 */
export function buildCaseLanes(
  nodes: readonly ScenarioNode[],
  entities: readonly Entity[],
  declared?: unknown,
  alone?: readonly Entity[] | null,
): LaneModel[] {
  const out: LaneModel[] = [];
  for (const decl of laneDeclarations(nodes, declared)) {
    const whole = buildDeclaredLane(entities, decl);
    if (!alone) {
      if (whole) out.push(whole);
      continue;
    }
    const mine = buildDeclaredLane(alone, decl);
    if (!mine) {
      // The row has no value for this lane: the lane stays, with no bars (section 8, Solo), when
      // the case has one. A lane with no value in the whole case is left out, as with no solo.
      if (whole) out.push(emptyLaneLike(whole));
      continue;
    }
    const top = decl.aggregate === "max" ? whole?.scale.top : mine.scale.max;
    const lane = buildDeclaredLane(alone, decl, LANE_PLOT_PX, top) ?? mine;
    // A lane with no declared bucket infers its step from the bars it has, and a row with one bar
    // or with gaps would infer none or a wider one. The step is the case's own, as the top's
    // place in the grid is: the number at the line, the bar widths and the veil all read it.
    out.push(whole && whole.step > 0 ? { ...lane, step: whole.step } : lane);
  }
  return out;
}

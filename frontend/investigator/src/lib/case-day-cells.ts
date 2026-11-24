/**
 * useCaseDayCells - the case-mode day-density band cells (one per Houston day,
 * brightness by event count, red where a severe event landed). Lifted out of the
 * old Timeline.tsx `story.cells` memo (TimelineShell split, item P) so the band
 * feeds the shell's mode-agnostic `dayDensity` slot. Kept in lib (not the layer
 * component) so the layer file exports a component only (react-refresh clean).
 *
 * The severity rule (new-device login / blocked transfer / fraud kind) and the
 * window-relative bucketing match the old storyTicks exactly - a pure move.
 */
import { useMemo } from "react";
import { usePlayhead } from "../store/playhead";
import {
  accountEventToEntity,
  loginToEntity,
  transactionToEntity,
  transferToEntity,
} from "./adapters/ffr-seed";
import { dayCells, type StoryTick } from "./timeline-story";
import { dotKinds } from "./case-events";
import { useSchema } from "../store/schema";
import type { Entity } from "./entity";
import type { DayDensityCell } from "../components/timeline/TimelineShell";
import type { AccountEvent, Transaction, LoginEvent, Transfer } from "../types";

export function useCaseDayCells(
  transactions: Transaction[],
  logins: LoginEvent[] | undefined,
  accountEvents: AccountEvent[] | undefined,
  transfers: Transfer[] | undefined,
  genericEntities: Entity[] | undefined,
): DayDensityCell[] {
  const windowMin = usePlayhead((s) => s.windowMin);
  const windowMax = usePlayhead((s) => s.windowMax);
  const nodes = useSchema((s) => s.nodes);
  const span = windowMax - windowMin;
  return useMemo(() => {
    if (span <= 0) return [];
    const newDeviceIds = new Set<string>();
    for (const l of logins ?? []) {
      if (l.device_trust === "new") newDeviceIds.add(l.id);
    }
    const blockedIds = new Set(
      (transfers ?? []).filter((t) => t.status === "blocked").map((t) => t.id),
    );
    // A manifest kind counts where the track draws it as a dot, as the step keys walk it.
    const dots = dotKinds(nodes);
    const all = [
      ...transactions.map(transactionToEntity),
      ...(logins ?? []).map(loginToEntity),
      ...(accountEvents ?? []).map(accountEventToEntity),
      ...(transfers ?? []).map(transferToEntity),
      ...(genericEntities ?? []).filter((e) => dots.has(e.kind)),
    ];
    const storyTicks: StoryTick[] = all
      .filter((e) => e.timestamp >= windowMin && e.timestamp <= windowMax)
      .map((e) => ({
        id: e.id,
        kind: e.kind,
        ts: e.timestamp,
        session: (e.fields as { session_id?: string }).session_id ?? null,
        severe:
          newDeviceIds.has(e.id) || blockedIds.has(e.id) || e.kind === "fraud",
      }));
    return dayCells(storyTicks, windowMin, windowMax);
  }, [transactions, logins, accountEvents, transfers, genericEntities, nodes, windowMin, windowMax, span]);
}

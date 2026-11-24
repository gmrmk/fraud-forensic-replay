import { create } from "zustand";
import type { ScenarioFieldWords, ScenarioLane, ScenarioNode, ScenarioRows } from "../lib/scenarios";

/** The manifest's root keys for the timeline's rows and lanes, as the manifest declares them
 *  (unchecked: the code that reads one checks it there). Each is undefined when the pack has none. */
export interface ActiveKeys {
  rows?: ScenarioRows;
  fields?: Record<string, ScenarioFieldWords>;
  lanes?: ScenarioLane[];
}

interface SchemaState extends ActiveKeys {
  /** The active scenario's id (null until the manifest has loaded). */
  scenarioId: string | null;
  nodes: ScenarioNode[];
  setNodes: (nodes: ScenarioNode[]) => void;
  /** Seed all of it from the active manifest. The root keys are replaced, not merged, so a pack that
   *  declares none holds none and the last pack's do not stay. */
  setActive: (scenarioId: string, nodes: ScenarioNode[], keys?: ActiveKeys) => void;
  nodeFor: (kind: string) => ScenarioNode | undefined;
}

/** The active scenario's declared entity kinds. Seeded once at boot from the
 *  manifest (App's onActive); every schema-driven surface reads from here
 *  instead of hardcoding kinds. */
export const useSchema = create<SchemaState>((set, get) => ({
  scenarioId: null,
  nodes: [],
  rows: undefined,
  fields: undefined,
  lanes: undefined,
  setNodes: (nodes) => set({ nodes }),
  setActive: (scenarioId, nodes, keys) =>
    set({ scenarioId, nodes, rows: keys?.rows, fields: keys?.fields, lanes: keys?.lanes }),
  nodeFor: (kind) => get().nodes.find((n) => n.kind === kind),
}));

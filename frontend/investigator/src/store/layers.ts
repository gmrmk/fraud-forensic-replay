/**
 * Layers store - visibility toggles for the deck.gl data surfaces.
 *
 * Kept separate from the playhead store so layer-toggle subscribers
 * don't re-render on every playhead tick. Each layer added in future
 * slices (biometric heatmap, velocity arcs, etc.) gets a new boolean
 * here.
 */
import { create } from "zustand";
import { readBarSize, writeBarSize, type BarSize } from "../lib/bar-size";
import type { YoursFacet } from "../lib/marks/types";
import type { ScenarioNode } from "../lib/scenarios";
import { parseCollapsedLanes, serializeCollapsedLanes } from "../lib/timeline-lanes";

/** Where the folded lanes are saved, beside the theme preferences (a UI preference only). */
const COLLAPSED_LANES_KEY = "ffr.lanes.collapsed";

/** The saved fold list. Never throws: a blocked or absent storage gives []. The default storage is
 *  resolved inside the try, because merely touching `localStorage` can throw. */
export function initialCollapsedLanes(storage?: Pick<Storage, "getItem">): string[] {
  try {
    return parseCollapsedLanes((storage ?? localStorage).getItem(COLLAPSED_LANES_KEY));
  } catch {
    return [];
  }
}

export interface LayersState {
  showAuths: boolean;
  showLogins: boolean;
  showPlaces: boolean;
  /** Day/night + UTC-offset-band overlay. Opt-in (default off): map context, not
   *  case-entity data. The night/terminator geometry derives from the playhead
   *  (playhead-as-truth), the offset bands from a lazy-fetched vendored geojson. */
  showTimezone: boolean;
  /** Per-kind Path overlay visibility. Open map (schema-agnostic) so future
   *  ingested kinds toggle without a store edit. */
  pathKinds: Record<string, boolean>;
  togglePath: (kind: string) => void;
  /** Add a Path toggle (on) for every manifest node flagged `path: true`; a
   *  toggle already in the map keeps the analyst's setting. */
  seedPathKinds: (nodes: readonly ScenarioNode[]) => void;
  toggleAuths: () => void;
  toggleLogins: () => void;
  togglePlaces: () => void;
  toggleTimezone: () => void;
  /** Kinds whose magnitude lane is folded. Keyed by kind alone, so a kind of the same name in two
   *  packs folds in both; accepted for a preference. Saved under `ffr.lanes.collapsed`. */
  collapsedLanes: string[];
  toggleLane: (kind: string) => void;
  /** The bar's size: "line", "middle" or "open" (`lib/bar-size.ts`). Read once from storage; a
   *  first visit is "middle", the open bar with its rows folded. At "middle" the lanes stay open
   *  and only the rows fold, so the size does not touch `collapsedLanes`. INT-1 and P1 read this
   *  field to choose what the bar draws. Never in the share link. */
  barSize: BarSize;
  /** Set the size and save it. */
  setBarSize: (size: BarSize) => void;
  /** Set the size to "open" for this session and write nothing: the saved size stays as it was. */
  openBar: () => void;
  /**
   * The switches of the investigator's marks and of Layers. Session only: never in localStorage, never
   * in the share link. A kind is shown unless its name is here (auths, logins and places have their
   * own switches above and are never read from this list).
   */
  hiddenKinds: string[];
  /** Kind to the values of its filter field that are switched off; a kind with none has no key. */
  hiddenValues: Record<string, string[]>;
  /** Dispositions: show only the records the investigator touched, by the facets that are on. */
  yoursOn: boolean;
  yoursFacets: Record<YoursFacet, boolean>;
  toggleKind: (kind: string) => void;
  toggleValue: (kind: string, value: string) => void;
  toggleYours: () => void;
  toggleFacet: (facet: YoursFacet) => void;
}

/**
 * Item 1: the pin wins over a switched-off kind or value. False until the layers piece's item 1
 * commit sets it true; read only through `ShowInputs.pinWins`, so one revert removes the behaviour.
 */
export const PIN_WINS: boolean = false;

export const useLayers = create<LayersState>((set) => ({
  showAuths: true,
  showLogins: true,
  // Places is context, not entity data - default off so the demo opens
  // clean. Analyst toggles it on when they want neighborhood awareness.
  showPlaces: false,
  // Timezone overlay is opt-in (day/night + UTC bands are heavy context); the
  // demo opens clean. Analyst toggles it on to read the solar terminator.
  showTimezone: false,
  // Fraud Path on by default (the marquee signal); auth/login opt-in to "busy".
  // transfer drives the TIMELINE money-movement path only (transfers are
  // coordless by design; lib/paths drops them from globe geometry).
  pathKinds: { fraud: true, auth: false, login: false, transfer: false },
  togglePath: (kind) =>
    set((s) => ({ pathKinds: { ...s.pathKinds, [kind]: !s.pathKinds[kind] } })),
  seedPathKinds: (nodes) =>
    set((s) => {
      const add = nodes.filter((n) => n.path && !(n.kind in s.pathKinds));
      if (add.length === 0) return s;
      return { pathKinds: { ...s.pathKinds, ...Object.fromEntries(add.map((n) => [n.kind, true])) } };
    }),
  toggleAuths: () => set((s) => ({ showAuths: !s.showAuths })),
  toggleLogins: () => set((s) => ({ showLogins: !s.showLogins })),
  togglePlaces: () => set((s) => ({ showPlaces: !s.showPlaces })),
  toggleTimezone: () => set((s) => ({ showTimezone: !s.showTimezone })),
  collapsedLanes: initialCollapsedLanes(),
  toggleLane: (kind) => {
    const current = useLayers.getState().collapsedLanes;
    const next = current.includes(kind) ? current.filter((k) => k !== kind) : [...current, kind];
    set({ collapsedLanes: next });
    try {
      localStorage.setItem(COLLAPSED_LANES_KEY, serializeCollapsedLanes(next));
    } catch {
      /* best-effort: the fold still holds for this session */
    }
  },
  barSize: readBarSize(),
  setBarSize: (size) => {
    set({ barSize: size });
    writeBarSize(size);
  },
  openBar: () => set({ barSize: "open" }),
  hiddenKinds: [],
  hiddenValues: {},
  yoursOn: false,
  yoursFacets: { pinned: true, pass: true, fail: true, wait: true, noted: true, inPath: true },
  toggleKind: (kind) =>
    set((s) => ({ hiddenKinds: s.hiddenKinds.includes(kind) ? s.hiddenKinds.filter((k) => k !== kind) : [...s.hiddenKinds, kind] })),
  toggleValue: (kind, value) =>
    set((s) => {
      const held = Object.hasOwn(s.hiddenValues, kind) ? s.hiddenValues[kind] : [];
      const next = held.includes(value) ? held.filter((v) => v !== value) : [...held, value];
      // Rebuilt from own entries, so a kind named like an inherited key stays an ordinary key; a kind
      // with no value off has no key, so switching the last one back on restores the default.
      const rest = Object.entries(s.hiddenValues).filter(([k]) => k !== kind);
      return { hiddenValues: Object.fromEntries(next.length > 0 ? [...rest, [kind, next]] : rest) };
    }),
  toggleYours: () => set((s) => ({ yoursOn: !s.yoursOn })),
  toggleFacet: (facet) => set((s) => ({ yoursFacets: { ...s.yoursFacets, [facet]: !s.yoursFacets[facet] } })),
}));

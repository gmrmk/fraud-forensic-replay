/**
 * Typed client for the scenario-registry endpoints (Plan 1a backend).
 * Switching is select + full page reload: every store and data fetch in the
 * app re-derives from a fresh boot against the newly active DB, so there is
 * no stale-state surface. In-place hot-swap is the deliberate non-goal of
 * this slice (BACKLOG).
 */

export interface ScenarioSummary {
  id: string;
  label: string;
}

/** The manifest's establishing shot - where the camera frames this scenario. */
export interface ScenarioHome {
  lat: number;
  lng: number;
  zoom: number;
}

/** A bank-UNOBSERVABLE story beat (e.g. a customer-reported phish SMS).
 *  Rendered as a timeline annotation marker, never as a data row. */
export interface ScenarioAnnotation {
  timestamp: string; // ISO
  label: string;
  note: string;
}

/** A named group of a node's fields that the inspector shows as its own section and can pop
 *  out beside the entity's pin. Every field must be one the node serves (backend drift tests). */
export interface ScenarioSection {
  id: string;
  label: string;
  fields: string[];
}

/** Which row fields carry a business decision exported from the decisioning tool. `key` names the
 *  field a decision attaches by: a record carries the decision when its `key` field matches. `event`
 *  names the field holding the id of the queued event the decision worked, or a list of ids when
 *  one decision closed several. */
export interface DecisionMapping { status: string; outcome: string; note: string; actor: string; target: string; key: string; event: string; }

/** One entity kind as the manifest declares it: the displayMetadata half of
 *  the abstract entity shape. Every schema-driven surface renders from this. */
export interface ScenarioNode {
  kind: string;
  label: string;
  palette: string;
  source: string;
  query?: string;
  coords?: { lat: string; lng: string } | null;
  timestamp?: string;
  /** Field key for a row's headline value (e.g. merchant_name, device_fp). */
  primary?: string;
  /** Field key for a row's second line (e.g. amount, outcome). */
  secondary?: string;
  /** Field keys that open the Matches window when clicked. */
  pivotable?: string[];
  /** True when this kind's events draw a globe Path (e.g. a seat's console sign-ins). */
  path?: boolean;
  /** Field that groups a path kind's events into separate Paths (e.g. the seat), one per value. */
  pathBy?: string;
  /** False when this kind's Paths are routes, not a person's movements (e.g. where sign-ins came from):
   *  the walking-territory hull is not drawn under them. Default true. */
  territory?: boolean;
  /** Field groups shown as their own inspector sections, each able to pop out on the globe. */
  sections?: ScenarioSection[];
  /** Present when the node's rows are decisions: they draw as word capsules, not dots. */
  decision?: DecisionMapping;
  /** Field holding a row's size (e.g. an hour's spend). The globe sizes this kind's markers
   *  by it and the timeline draws it as a bar lane (lib/magnitude.ts). */
  magnitude?: string;
  /** The quantity's own name, shown in the magnitude lane's header; optional. */
  magnitudeLabel?: string;
  /** The magnitude's unit, shown in the lane's header and readout; optional. */
  magnitudeUnit?: string;
  /**
   * Declared by the manifest, read by `filterOf`, drawn by Layers: one field of this kind's rows whose
   * values become one switch each. The label is the field's own words (1 to 24 characters). The
   * backend keeps the manifest opaque, so this is not trusted until `filterOf` has read it.
   */
  filter?: { field: string; label: string };
}

/** The manifest's SUBJECT entity - the single account/card a case drills into.
 *  Present for a single-customer pack (card-fraud, priya); ABSENT for a
 *  population-scale pack (its absence is the
 *  signal the case-boot must not pull the unscoped whole table). */
export interface ScenarioFocal {
  card_id?: string;
  account_id?: string;
}

/** How the timeline's rows are formed, declared once for the whole pack. Each value is a field name;
 *  the words come from `fields`. Absent on a pack that draws no rows. */
export interface ScenarioRows {
  /** The field the rows group by: one row for each value. */
  by: string;
  /** The field that names a row, when the value alone is not its name. */
  name?: string;
  /** The field a row opens into: one member line for each value. */
  member?: string;
}

/** The words a pack gives one of its fields: a label (1 to 24 characters) and, optionally, a unit
 *  (1 to 16). A field with no entry is offered nowhere by name. */
export interface ScenarioFieldWords {
  label: string;
  unit?: string;
}

/** One lane of bars, declared over one or more kinds. The lane's identity is its `id`. */
export interface ScenarioLane {
  id: string;
  name: string;
  label: string;
  unit: string;
  /** The node kinds whose rows the lane reads. */
  kinds: string[];
  /** The field of those rows that the bars add up or take the largest of. */
  field: string;
  bucket: "hour";
  aggregate: "sum" | "max";
  /** A fixed top of the lane's scale, above 0, when the data's own should not set it. */
  top?: number;
  /** What the lane opens into. A node's own lane (a node with a `magnitude`) is declared by an
   *  entry that holds only its `id` and a `depth`; `validLaneDepths` reads it. */
  depth?: ScenarioLaneDepth;
}

/** What a lane opens into: a line for each value of one more field. Only `split` is declared; a line
 *  for each other measure was drawn and not picked, so it is not a key. */
export interface ScenarioLaneDepth {
  split?: string;
}

/** A lane's depth as it is fit to draw: the field it splits by and that field's label. */
export interface LaneDepth {
  split: string;
  label: string;
}

/** A bounded word: the value trimmed, when it is a string of 1 to `most` characters after trimming. */
function word(value: unknown, most: number): string | null {
  if (typeof value !== "string") return null;
  const text = value.trim();
  return text.length >= 1 && text.length <= most ? text : null;
}

/** One manifest lane, checked: null for anything the declaration's table does not allow. */
function readLane(entry: unknown, timed: ReadonlySet<string>): ScenarioLane | null {
  if (typeof entry !== "object" || entry === null || Array.isArray(entry)) return null;
  const e = entry as Record<string, unknown>;
  const name = word(e.name, 24);
  const label = word(e.label, 24);
  const unit = word(e.unit, 16);
  const field = word(e.field, 64);
  const kinds = e.kinds;
  const id = word(e.id, 64);
  const kindsOk =
    Array.isArray(kinds) && kinds.length >= 1 && kinds.every((k): k is string => typeof k === "string" && timed.has(k));
  const topOk = e.top === undefined || (typeof e.top === "number" && Number.isFinite(e.top) && e.top > 0);
  if (!id || !kindsOk || !topOk || !name || !label || !unit || !field) return null;
  if (e.bucket !== "hour" || (e.aggregate !== "sum" && e.aggregate !== "max")) return null;
  const lane: ScenarioLane = {
    id,
    name,
    label,
    unit,
    kinds: [...(kinds as string[])],
    field,
    bucket: e.bucket,
    aggregate: e.aggregate,
  };
  if (typeof e.top === "number") lane.top = e.top;
  return lane;
}

/** The lanes the manifest declares that are fit to draw, in declared order. The keys reach the app
 *  as the manifest has them; this is where they are checked, so that an invalid entry hides only
 *  itself and leaves the others, and the rows, alone. An entry is kept when its id is 1 to 64
 *  characters and not yet used (`taken` holds the ids of lanes drawn before these); its name and
 *  label are 1 to 24 characters and its unit 1 to 16 after trimming; each of its kinds is a node
 *  with a timestamp; its bucket is `hour`; its aggregate is `sum` or `max`; and a top, when it has
 *  one, is a finite number above zero. The id is read as trimmed, so ' a' and 'a' are one id. */
export function validLanes(raw: unknown, nodes: readonly ScenarioNode[], taken: readonly string[] = []): ScenarioLane[] {
  if (!Array.isArray(raw)) return [];
  const timed = new Set(nodes.filter((n) => typeof n.timestamp === "string" && n.timestamp !== "").map((n) => n.kind));
  const used = new Set(taken);
  const out: ScenarioLane[] = [];
  for (const entry of raw as unknown[]) {
    const lane = readLane(entry, timed);
    if (lane === null || used.has(lane.id)) continue;
    used.add(lane.id);
    out.push(lane);
  }
  return out;
}

const FIELD_NAME = /^[A-Za-z_][A-Za-z0-9_]{0,63}$/;

/**
 * The filter a node declares, fit to draw, or null. Valid when `field` is a field name that is not
 * the node's own timestamp field and not one of its coordinate fields, and `label` is 1 to 24
 * characters after trimming; the label comes back trimmed, in a new object. Anything else gives null
 * and the kind has no chevron. That the field is a key of every row is the backend's drift test.
 */
export function filterOf(node: ScenarioNode): { field: string; label: string } | null {
  const raw: unknown = node.filter;
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return null;
  const { field, label } = raw as Record<string, unknown>;
  if (typeof field !== "string" || !FIELD_NAME.test(field)) return null;
  if (field === node.timestamp || field === node.coords?.lat || field === node.coords?.lng) return null;
  const text = word(label, 24);
  return text === null ? null : { field, label: text };
}

/** The depth of each lane the manifest declares one for, by the lane's id. An entry is kept when its
 *  id is 1 to 64 characters, its `depth.split` is a field name, and `fields` gives that field a
 *  label of 1 to 24 characters after trimming; a field with no label is offered nowhere, so its
 *  lane has no depth. The first entry for an id wins. An entry may hold only an id and a depth (the
 *  lane of a node's own magnitude) or be a full lane, and this reader does not look at the rest of
 *  the entry, which `validLanes` reads and leaves alone here. That the split is a column of the
 *  lane's rows is the backend's drift test. */
export function validLaneDepths(raw: unknown, fields: unknown): Record<string, LaneDepth> {
  // No prototype, so an id such as "constructor" or "__proto__" is an ordinary key.
  const out: Record<string, LaneDepth> = Object.create(null) as Record<string, LaneDepth>;
  if (!Array.isArray(raw) || typeof fields !== "object" || fields === null || Array.isArray(fields)) return out;
  const words = fields as Record<string, unknown>;
  for (const entry of raw as unknown[]) {
    if (typeof entry !== "object" || entry === null || Array.isArray(entry)) continue;
    const { id: rawId, depth } = entry as Record<string, unknown>;
    const id = word(rawId, 64);
    if (!id || Object.prototype.hasOwnProperty.call(out, id) || typeof depth !== "object" || depth === null || Array.isArray(depth)) continue;
    const split = (depth as Record<string, unknown>).split;
    if (typeof split !== "string" || !FIELD_NAME.test(split) || !Object.prototype.hasOwnProperty.call(words, split)) continue;
    const entryWords = words[split];
    const label = word(typeof entryWords === "object" && entryWords !== null ? (entryWords as Record<string, unknown>).label : undefined, 24);
    if (label) out[id] = { split, label };
  }
  return out;
}

export interface ActiveScenario extends ScenarioSummary {
  home?: ScenarioHome;
  annotations?: ScenarioAnnotation[];
  nodes: ScenarioNode[];
  /** The manifest focal, or null when the pack declares none (population). */
  focal?: ScenarioFocal | null;
  /** The pack's grouping of the timeline into rows; undefined when it declares none. These three
   *  keys reach the app as the manifest has them: the code that reads one validates it there, so a
   *  bad entry hides only what it names. */
  rows?: ScenarioRows;
  /** The words of the fields that rows, member lines and lanes name, keyed by field name. */
  fields?: Record<string, ScenarioFieldWords>;
  /** The lanes the pack declares beyond those its nodes' own magnitudes give. */
  lanes?: ScenarioLane[];
}


/** Extract the field keys referenced by a manifest template string.
 * Used by ManifestFieldsSection to understand which fields a node's
 * primary/secondary templates reference.
 * Example: "${amount} · ${merchant_name}" -> ["amount", "merchant_name"] */
export function parseTemplateFields(template: string | undefined | null): readonly string[] {
  if (!template) return [];
  const fields: string[] = [];
  const re = /\$\{(\w+)\}/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(template)) !== null) {
    fields.push(m[1]);
  }
  return fields;
}
async function asJson<T>(res: Response, what: string): Promise<T> {
  if (!res.ok) {
    let detail = "";
    try {
      const body = (await res.json()) as { detail?: string };
      detail = body.detail ?? "";
    } catch {
      // non-JSON error body - fall through to the status-only message
    }
    throw new Error(detail || `${what} HTTP ${res.status}`);
  }
  return res.json() as Promise<T>;
}

export async function fetchScenarios(): Promise<ScenarioSummary[]> {
  return asJson<ScenarioSummary[]>(await fetch("/api/scenarios"), "scenarios");
}

/** The active scenario, reduced from its full manifest to id + label + home
 *  + annotations (the customer-reported story beats the timeline renders)
 *  + nodes (the declared entity kinds every schema-driven surface reads). */
export async function fetchActiveScenario(): Promise<ActiveScenario> {
  const manifest = await asJson<ActiveScenario>(await fetch("/api/scenario"), "scenario");
  return {
    id: manifest.id,
    label: manifest.label,
    home: manifest.home,
    annotations: manifest.annotations ?? [],
    nodes: manifest.nodes ?? [],
    // focal is present for a single-customer pack, absent for population; keep
    // the distinction (null vs a value) so the case-boot can bound accordingly.
    focal: manifest.focal ?? null,
    // The root keys of the timeline's rows and lanes: passed on as declared, undefined when the
    // pack declares none, so that a pack with none keeps today's bar.
    rows: manifest.rows,
    fields: manifest.fields,
    lanes: manifest.lanes,
  };
}

/** Hot-swap the active scenario; the backend repoints the DB. The choice is
 *  persisted (localStorage is sanctioned for UI preferences) so a backend
 *  restart, which resets the process-global active scenario to its default,
 *  cannot silently serve a different case under this tab's UI. */
export async function selectScenario(id: string): Promise<ScenarioSummary> {
  const manifest = await asJson<ScenarioSummary>(
    await fetch("/api/scenario/select", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    }),
    "scenario select",
  );
  rememberScenarioChoice(manifest.id);
  return { id: manifest.id, label: manifest.label };
}

const SCENARIO_PREF_KEY = "ffr.scenario";

export function rememberScenarioChoice(id: string): void {
  try {
    localStorage.setItem(SCENARIO_PREF_KEY, id);
  } catch {
    // storage unavailable (private mode) - the preference is best-effort
  }
}

/** True when this browser's stored choice is `id`: false when the write threw or did not stick. */
export function scenarioChoiceHeld(id: string): boolean {
  try {
    return localStorage.getItem(SCENARIO_PREF_KEY) === id;
  } catch {
    return false;
  }
}

/** Boot-time guard against the backend-restart scenario reset: when the
 *  server's active scenario differs from this browser's persisted choice,
 *  re-assert the choice and return the re-selected scenario. An unknown
 *  persisted id (a removed scenario) falls back to the server's active.
 *
 *  The POST (selectScenario) and the re-fetch (fetchActiveScenario)
 *  are in separate try/catch scopes. A successful POST whose re-fetch then
 *  fails now throws (surfaced to the caller) rather than silently returning
 *  the stale pre-switch manifest. Only a failed POST falls back to `active`. */
export async function ensureChosenScenario(): Promise<ActiveScenario & { reselected?: boolean }> {
  const active = await fetchActiveScenario();
  let chosen: string | null;
  try {
    chosen = localStorage.getItem(SCENARIO_PREF_KEY);
  } catch {
    return active;
  }
  if (!chosen || chosen === active.id) return active;
  // selectScenario throws on an unknown/removed id - fall back to the server's active.
  try {
    await selectScenario(chosen);
  } catch {
    return active;
  }
  // Re-fetch is intentionally outside the catch above: a successful POST whose
  // re-fetch fails should propagate rather than return stale pre-switch data.
  const now = await fetchActiveScenario();
  // reselected: the switch took, so data already loaded on mount belongs to the other pack
  return now.id === chosen ? { ...now, reselected: true } : now;
}

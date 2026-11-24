/**
 * The share link: the address bar as a description of what is on screen. Pure parse and build;
 * hooks/useShareLink applies a link and keeps the address bar in step.
 *
 *   scenario            scenario id
 *   t                   playhead, Unix ms (`playhead` is read as an alias: the capture harness uses it)
 *   sel                 id of the selected record
 *   a, b                the two marks, Unix ms
 *   w0, w1              the visible zoom window, Unix ms (both or neither)
 *   lng lat zoom pitch bearing   the camera, as lib/globe/deepLink reads them
 *   theme, color        written through unchanged; their stores read them
 *   map                 the shape of the map, globe or flat, written through unchanged; store/map-mode reads it
 *   by                  the field the rows are grouped by (a field name; the hook checks the manifest)
 *   solo                the soloed row's value, 1 to 128 characters, no control character
 *
 * A link is untrusted input. Reading is forgiving and strict at once: a value that does not
 * parse, or an id that is not a plain id, is dropped, never guessed at.
 */
import { parseDeepLink, type DeepLinkParams } from "./globe/deepLink";
import { isFieldName } from "./tracks";

export interface ShareLink extends DeepLinkParams {
  scenario?: string;
  sel?: string;
  a?: number;
  b?: number;
  window?: [number, number];
  /** The field the rows are grouped by. A field name only; the hook checks it against the manifest. */
  by?: string;
  /** The value of one row, soloed. It carries no field: it is read under the grouping in force. */
  solo?: string;
}

const SCENARIO_ID = /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/;
const RECORD_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;

/** The longest solo value a link may carry, in characters. */
export const SOLO_VALUE_MOST = 128;
// \p{Cc} is the C0 range, DEL and the C1 range; the `u` flag keeps a literal control range out of the source.
const CONTROL_CHARACTER = /\p{Cc}/u;

/** A solo value as a link may carry it: 1 to 128 characters, no control character. Not trimmed,
 *  because the solo matches the value exactly. */
function isSoloValue(value: string): boolean {
  return value.length > 0 && value.length <= SOLO_VALUE_MOST && !CONTROL_CHARACTER.test(value);
}

export function parseShareLink(search: string): ShareLink {
  const out: ShareLink = parseDeepLink(search);
  let q: URLSearchParams;
  try {
    q = new URLSearchParams(search || "");
  } catch {
    return out;
  }
  const num = (k: string): number | undefined => {
    const v = q.get(k);
    if (v === null || v.trim() === "") return undefined;
    const n = Number(v);
    return Number.isFinite(n) ? n : undefined;
  };

  const scenario = q.get("scenario");
  if (scenario !== null && SCENARIO_ID.test(scenario)) out.scenario = scenario;
  const sel = q.get("sel");
  if (sel !== null && RECORD_ID.test(sel)) out.sel = sel;

  const t = num("t");
  if (t !== undefined) out.playhead = t;

  const marks = [num("a"), num("b")].filter((m): m is number => m !== undefined).sort((x, y) => x - y);
  if (marks.length > 0) out.a = marks[0];
  if (marks.length > 1) out.b = marks[1];

  const w0 = num("w0");
  const w1 = num("w1");
  if (w0 !== undefined && w1 !== undefined && w0 < w1) out.window = [w0, w1];

  // Each read on its own: a bad one is dropped and the other keys stay.
  const by = q.get("by");
  if (by !== null && isFieldName(by)) out.by = by;
  const solo = q.get("solo");
  if (solo !== null && isSoloValue(solo)) out.solo = solo;
  return out;
}

export interface ShareCamera {
  center: [number, number];
  zoom: number;
  pitch?: number;
  bearing?: number;
}

/** What is on screen, as the address bar should say it. Absent and null fields are left out. */
export interface ShareState {
  scenario?: string | null;
  playhead?: number | null;
  sel?: string | null;
  a?: number | null;
  b?: number | null;
  window?: [number, number] | null;
  camera?: ShareCamera | null;
  theme?: string | null;
  color?: string | null;
  /** The shape of the map, globe or flat. */
  map?: string | null;
  /** The grouping in force when it is not the manifest's own. */
  by?: string | null;
  /** The soloed row's value. */
  solo?: string | null;
}

const isNum = (v: number | null | undefined): v is number => typeof v === "number" && Number.isFinite(v);
const fixed = (v: number, digits: number): number => Number(v.toFixed(digits));

/** The query string for a state, without the leading `?`. Whole milliseconds, four decimals
 *  of position, two of zoom, pitch and bearing; a level pitch or bearing is left out. */
export function buildShareLink(state: ShareState): string {
  const parts: string[] = [];
  const add = (key: string, value: string | number): void => {
    parts.push(`${key}=${encodeURIComponent(String(value))}`);
  };
  if (state.scenario) add("scenario", state.scenario);
  if (isNum(state.playhead)) add("t", Math.round(state.playhead));
  if (state.sel) add("sel", state.sel);
  if (isNum(state.a)) add("a", Math.round(state.a));
  if (isNum(state.b)) add("b", Math.round(state.b));
  if (state.window) {
    add("w0", Math.round(state.window[0]));
    add("w1", Math.round(state.window[1]));
  }
  if (state.camera) {
    add("lng", fixed(state.camera.center[0], 4));
    add("lat", fixed(state.camera.center[1], 4));
    add("zoom", fixed(state.camera.zoom, 2));
    if (state.camera.pitch) add("pitch", fixed(state.camera.pitch, 2));
    if (state.camera.bearing) add("bearing", fixed(state.camera.bearing, 2));
  }
  if (state.theme) add("theme", state.theme);
  if (state.color) add("color", state.color);
  if (state.map) add("map", state.map);
  if (state.by) add("by", state.by);
  if (state.solo) add("solo", state.solo);
  return parts.join("&");
}

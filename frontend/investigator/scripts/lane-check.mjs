/**
 * lane-check.mjs - the judgment half of the static crawl's check of the timeline's bar lanes.
 *
 * The crawl gathers facts from an open page; every decision about them is made here, by pure
 * functions with no import and no side effect, sharing no code with the app. That split lets a
 * test change one fact at a time and expect the matching rule (src/lib/lane-check.test.ts).
 * The only names it knows are the six record kinds the app has code of its own for.
 *
 * The lanes a page must show are the node lanes (a node of a kind outside the six that names a
 * magnitude field) and then the lanes the manifest declares at its root, by id. A root lane may
 * read any kind with a timestamp, the six included. Its rules are the app's own table for a
 * declared lane (scenarios.ts, readLane), restated here and not imported.
 */

const APP_KINDS = ['auth', 'fraud', 'login', 'place', 'account_event', 'transfer'];
const TOLERANCE = 0.006;
const EDGE_SLACK = 1;
const HOUR_MS = 3_600_000;

/** The window sizes the bar is judged at, as the crawl names them. */
export const BAR_SIZES = ['1440x900', '1280x720'];

// The app's own numbers, restated and not imported; the test holds each equal to the app's constant.
/** The open bar's share of the window's height, counting the bar's panel (bar-metrics.ts). */
export const SHARE = 0.42;
/** The least gap in px between a small version's label and its plot (bar-metrics-small.ts). */
export const LABEL_GAP_PX = 12;
/** The Timeline folded to one line, in px (the design, The folded Timeline). */
export const ONE_LINE_PX = 44;
const FIELD_NAME = /^[A-Za-z_][A-Za-z0-9_]{0,63}$/;

const isText = (v, max) => typeof v === 'string' && v.trim().length >= 1 && v.trim().length <= max;
const trimmed = (v, max) => (isText(v, max) ? v.trim() : null);

/** The manifest nodes that get a lane of their own. */
export function laneNodes(nodes) {
  return nodes.filter(
    (n) =>
      (n.source === 'sql' || n.source === 'json') &&
      !APP_KINDS.includes(n.kind) &&
      !('decision' in n) &&
      typeof n.magnitude === 'string' &&
      n.magnitude !== '',
  );
}

/** One root lane entry, checked as the app checks it; null for anything the table does not allow. */
function readLane(entry, timed) {
  if (typeof entry !== 'object' || entry === null || Array.isArray(entry)) return null;
  const id = trimmed(entry.id, 64);
  const name = trimmed(entry.name, 24);
  const label = trimmed(entry.label, 24);
  const unit = trimmed(entry.unit, 16);
  const field = trimmed(entry.field, 64);
  const kinds = entry.kinds;
  const kindsOk = Array.isArray(kinds) && kinds.length >= 1 && kinds.every((k) => typeof k === 'string' && timed.has(k));
  const topOk = entry.top === undefined || (typeof entry.top === 'number' && Number.isFinite(entry.top) && entry.top > 0);
  if (!id || !name || !label || !unit || !field || !kindsOk || !topOk) return null;
  if (entry.bucket !== 'hour' || (entry.aggregate !== 'sum' && entry.aggregate !== 'max')) return null;
  return { id, name, label, unit, kinds: [...kinds], field, bucket: 'hour', aggregate: entry.aggregate };
}

/**
 * The manifest's root lanes that are fit to draw, in declared order. An invalid entry hides only
 * itself, and an id used before it (`taken` holds the ids of the node lanes) hides the later one.
 */
export function declaredLanes(declared, nodes, taken = []) {
  if (!Array.isArray(declared)) return [];
  const timed = new Set(nodes.filter((n) => typeof n.timestamp === 'string' && n.timestamp !== '').map((n) => n.kind));
  const used = new Set(taken);
  const out = [];
  for (const entry of declared) {
    const lane = readLane(entry, timed);
    if (lane === null || used.has(lane.id)) continue;
    used.add(lane.id);
    out.push(lane);
  }
  return out;
}

/** The rows' instants and values: a finite time and a finite value above zero. */
function itemsOf(rows, timestamp, field) {
  const items = [];
  for (const row of rows) {
    const t = Date.parse(row[timestamp]);
    const v = row[field];
    if (Number.isFinite(t) && typeof v === 'number' && Number.isFinite(v) && v > 0) items.push({ t, v });
  }
  return items;
}

const keyOf = (t, step) => (step ? Math.floor(t / step) * step : t);

function bucketsFrom(items, step, aggregate) {
  const acc = new Map();
  for (const { t, v } of items) {
    const k = keyOf(t, step);
    const seen = acc.get(k);
    acc.set(k, seen === undefined ? v : aggregate === 'max' ? Math.max(seen, v) : seen + v);
  }
  return [...acc.entries()].sort((a, b) => a[0] - b[0]).map(([t, sum]) => ({ t, sum }));
}

/**
 * The value of the node's magnitude field per bucket, in time order. With no `step` a bucket is an
 * instant (a node's own lane); with a step it is the start of the step's window.
 */
export function bucketsOf(rows, node, step, aggregate = 'sum') {
  return bucketsFrom(itemsOf(rows, node.timestamp, node.magnitude), step, aggregate);
}

/** The smallest gap between two buckets; 0 for fewer than two. */
export function stepOf(buckets) {
  let step = 0;
  for (let i = 1; i < buckets.length; i += 1) {
    const gap = buckets[i].t - buckets[i - 1].t;
    if (step === 0 || gap < step) step = gap;
  }
  return step;
}

/** What the number at the line must say at an instant: empty, or the value of the bucket that holds it. */
export function expectedReadout(buckets, step, at) {
  if (!(step > 0)) return { empty: true };
  const hit = buckets.find((b) => b.t <= at && at < b.t + step);
  return hit ? { empty: false, value: hit.sum } : { empty: true };
}

/** The kinds whose rows the page's lanes read, once each, in lane order: what the crawl must fetch. */
export function kindsToFetch(nodes, declared) {
  const own = laneNodes(nodes);
  const kinds = [...own.map((n) => n.kind), ...declaredLanes(declared, nodes, own.map((n) => n.kind)).flatMap((l) => l.kinds)];
  return kinds.filter((k, i) => kinds.indexOf(k) === i);
}

/**
 * One entry per lane the page must show, in the order the app draws them: the node lanes in
 * manifest order, then the root lanes in declared order. `rowsDeclared` is whether the pack's
 * manifest declares rows, which decides from the manifest and not from the page whether the page
 * must draw them.
 */
export function expectedLanes(nodes, rowsByKind, declared = [], rowsDeclared = false) {
  const lanes = [];
  const add = (spec) => {
    const buckets = bucketsFrom(spec.items, spec.step, spec.aggregate);
    if (buckets.length === 0) return;
    const peak = buckets.reduce((best, b) => (b.sum > best.sum ? b : best), buckets[0]);
    const opening = Math.min(...spec.items.filter((i) => keyOf(i.t, spec.step) === peak.t).map((i) => i.t));
    lanes.push({
      id: spec.id,
      kind: spec.kind,
      nodeLabel: spec.nodeLabel,
      label: spec.label,
      unit: spec.unit,
      buckets,
      step: spec.step ?? stepOf(buckets),
      peak,
      opening,
      named: rowsDeclared === true,
    });
  };
  const own = laneNodes(nodes);
  for (const node of own) {
    add({
      id: node.kind,
      kind: node.kind,
      nodeLabel: typeof node.label === 'string' && node.label !== '' ? node.label : node.kind,
      label: trimmed(node.magnitudeLabel, 24),
      unit: trimmed(node.magnitudeUnit, 16),
      items: itemsOf(rowsByKind[node.kind] ?? [], node.timestamp, node.magnitude),
      step: undefined,
      aggregate: 'sum',
    });
  }
  for (const entry of declaredLanes(declared, nodes, own.map((n) => n.kind))) {
    add({
      id: entry.id,
      kind: entry.kinds[0],
      nodeLabel: entry.name,
      label: entry.label,
      unit: entry.unit,
      items: entry.kinds.flatMap((k) => itemsOf(rowsByKind[k] ?? [], nodes.find((n) => n.kind === k)?.timestamp, entry.field)),
      step: HOUR_MS,
      aggregate: entry.aggregate,
    });
  }
  return lanes;
}

/** Rule id to the one line that says what the rule demands. */
export const LANE_RULES = {
  'lanes-on-page': 'the lanes on the page are exactly the expected ones, by id, in order',
  'node-label': "the lane shows the lane's name",
  'quantity-label': "the lane shows the manifest's quantity label, or none when none is declared",
  unit: "the lane shows the manifest's unit, or none when none is declared",
  'readout-at-peak': "the number at the line at the opening instant equals the bucket's value; the first lane opens in its largest bucket",
  'readout-at-end': 'the number at the line at the end of the window is absent exactly when no bucket holds the instant',
  'aligned-with-track': "the plot's left edge and width are within 1 px of the track's, and of the rows' plot when the pack declares rows",
  'bars-inside-plot': 'no bar stands above the plot top or below its bottom',
  order: 'the document order is track, rows (when the pack declares rows), lane, date labels',
  'button-reachable': 'the fold button is in the tab order and takes focus',
  'fold-hides-plot': 'Enter folds the lane: aria-expanded is false and the open plot is not drawn; a pack with a name column draws the small version in its place, and a pack with none draws no small version',
  'fold-lowers-stack': 'folding lowers the bottom stack by what the lane lost in height',
  'fold-survives-reload': 'after a reload the lane is still folded',
  'unfold-restores': 'Enter again opens the lane and shows the plot',
  'lane-small': "the folded lane's small version has a plot in line with the track and the number at the line that the bucket holds; a pack with no name column draws none",
  'rows-small': "the folded rows have a small version after the rows, with a plot in line with the track, a number at the line, and a button that reads as not expanded; a pack with no rows draws none",
  'line-for-each-section': 'the Timeline folded once draws a line for each section, in order, and each plot starts and ends where the Timeline strip does; one more fold draws one line of 44 px with no section',
  'lane-depth': "the lane's depth opens at both window sizes into lines whose plots stand in line with the track and whose bar pieces stand inside their plots",
  'kinds-depth': 'the Timeline depth opens at both window sizes into a line for each kind of event, with plots in line with the track',
  'small-label-gap': "the label of every small version ends at least 12 px before the small version's plot",
  'bar-heights': 'each depth option, and the options together, has a panel height and a bottom stack height as numbers at both window sizes',
  'bar-covers-nothing': 'at 1440 by 900 and at 1280 by 720 the open bar covers neither the Inspector, the log, the selected marker nor the map credit, and the same holds with each depth open',
  'controls-exist': 'every aria-controls on the bar names an element that is in the document',
};

const num = (v) => typeof v === 'number' && Number.isFinite(v);

function readoutAgrees(r, exp) {
  if (!r || !num(r.at)) return false;
  const want = exp(r.at);
  if (want.empty) return r.empty === true;
  return r.empty === false && num(r.value) && Math.abs(r.value - want.value) <= TOLERANCE;
}

const sameBox = (a, b) =>
  !!a && !!b && num(a.left) && num(a.width) && num(b.left) && num(b.width) &&
  Math.abs(a.left - b.left) <= EDGE_SLACK && Math.abs(a.width - b.width) <= EDGE_SLACK;

const RULE_TESTS = {
  'node-label': (f, e) => f.nodeLabel === e.nodeLabel,
  'quantity-label': (f, e) => f.label === e.label,
  unit: (f, e) => f.unit === e.unit,
  // A lane of one hour or one instant: a lane with a declared step has a figure in its one bucket;
  // a node's own lane of one bucket has a step of 0, so no instant lies in its peak bucket.
  'readout-at-peak': (f, e, first) =>
    readoutAgrees(f.atPeak, (at) => expectedReadout(e.buckets, e.step, at)) &&
    (!first || (e.step > 0 && f.atPeak.at >= e.peak.t && f.atPeak.at < e.peak.t + e.step)),
  'readout-at-end': (f, e) => readoutAgrees(f.atEnd, (at) => expectedReadout(e.buckets, e.step, at)),
  // The plot stands inside the name gutter: its left edge is the track's, which is the gutter's
  // right edge, and with rows it is also the rows' plot's, which starts after the names.
  'aligned-with-track': (f, e) => sameBox(f.plot, f.track) && (!e.named || sameBox(f.rowsPlot, f.plot)),
  'bars-inside-plot': (f) => f.barsOutside === 0,
  order: (f, e) => f.order === (e.named ? 'track,rows,lane,axis' : 'track,lane,axis'),
  'button-reachable': (f) => num(f.tabIndex) && f.tabIndex >= 0 && f.focused === true,
  // plotHidden is true when the open plot is hidden or not in the document and something else stands
  // in its place (null when neither the plot nor a small version was found). `small` is whether the
  // small version's plot is drawn: it must be, exactly when the pack has a name column.
  'fold-hides-plot': (f, e) => !!f.fold && f.fold.expanded === false && f.fold.plotHidden === true && f.fold.small === (e.named === true),
  'lane-small': (f, e) => {
    const s = f.small;
    if (!s) return false;
    if (!e.named) return s.drawn === false;
    return s.drawn === true && sameBox(s.plot, f.track) && readoutAgrees(s.readout, (at) => expectedReadout(e.buckets, e.step, at));
  },
  'fold-lowers-stack': (f) =>
    !!f.fold && num(f.fold.stackDrop) && num(f.fold.laneDrop) && f.fold.stackDrop >= 1 &&
    Math.abs(f.fold.stackDrop - f.fold.laneDrop) <= 1,
  'fold-survives-reload': (f) => !!f.afterReload && f.afterReload.expanded === false,
  'unfold-restores': (f) => !!f.unfold && f.unfold.expanded === true && f.unfold.plotHidden === false,
};

const isRect = (r) => !!r && num(r.left) && num(r.top) && num(r.right) && num(r.bottom);
/** Two boxes share area; boxes that only touch do not. */
const overlaps = (a, b) => a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
const holds = (box, p) => p.x > box.left && p.x < box.right && p.y > box.top && p.y < box.bottom;

/**
 * The legs of a rule that are not judged yet, each with what it waits on. A waiting leg is neither
 * a failure nor a pass: the verdict carries it apart and the crawl prints it as WAITS. None waits
 * now. The marker leg waited until INT-3 mounted the camera's room and the map wrote the selected
 * record's screen point (`data-selected-point` on its container), which the crawl now reads. A leg
 * that cannot be judged yet goes in here with the name of what it waits on.
 */
export const WAITING_LEGS = Object.freeze({});

/** What the bar covers in one reading `b`, named `label`; null when it covers nothing. A fact not read is named. */
function coverOne(b, label, waits) {
  // The log is drawn only when the case has recent events: no box is a page without one, and
  // only a list that was not read at all is a fact missing.
  const unread = [
    ['bar', isRect(b.bar)],
    ['Inspector', isRect(b.inspector)],
    // A record with no place has no mark, so no point is a fact read; a record that has a place,
    // or whose place is not known, must give one. A point that is read is judged either way.
    ['selected marker', b.placed === false || (!!b.marker && num(b.marker.x) && num(b.marker.y))],
    ['map credit', isRect(b.credit)],
    ['log', Array.isArray(b.logs) && b.logs.every(isRect)],
  ].filter(([name, read]) => !read && !waits(name)).map(([name]) => name);
  if (unread.length > 0) return `${label}: ${unread.join(', ')} not read`;
  const hit = [];
  if (overlaps(b.bar, b.inspector)) hit.push('Inspector');
  if (b.logs.some((l) => overlaps(b.bar, l))) hit.push('log');
  if (!waits('selected marker') && !!b.marker && num(b.marker.x) && num(b.marker.y) && holds(b.bar, b.marker)) hit.push('selected marker');
  if (overlaps(b.bar, b.credit)) hit.push('map credit');
  return hit.length > 0 ? `${label}: the bar covers the ${hit.join(', ')}` : null;
}

/**
 * What the open bar covers at each window size, and with each depth open (`depths`, the readings
 * the crawl took with an option open); [] when it covers nothing. A reading that is missing for an
 * option is not named here: the heights rule names it.
 */
function coverings(bars, waiting, depths = []) {
  if (!Array.isArray(bars)) return ['the bar facts were not read'];
  const waits = (leg) => Object.hasOwn(waiting, leg);
  const found = [];
  for (const size of BAR_SIZES) {
    const b = bars.find((x) => x && x.size === size);
    const said = b ? coverOne(b, size, waits) : `${size}: not read`;
    if (said !== null) found.push(said);
  }
  for (const d of depths) {
    const said = d ? coverOne(d, `${d.size} with ${d.option} open`, waits) : null;
    if (said !== null) found.push(said);
  }
  return found;
}

const bounded = (v, low) => num(v) && v >= low;
const gapOk = (g) => num(g) && g >= LABEL_GAP_PX;
const depthRule = (option) => (option.startsWith('lane:') ? 'lane-depth' : 'kinds-depth');

/** What the manifest says each depth option's plot is read from: the lanes' depth declarations that are fit to draw. */
function depthLanes(declared, fields) {
  const ok = new Set();
  const seen = new Set();
  if (!Array.isArray(declared) || typeof fields !== 'object' || fields === null || Array.isArray(fields)) return ok;
  for (const entry of declared) {
    if (typeof entry !== 'object' || entry === null || Array.isArray(entry)) continue;
    const id = trimmed(entry.id, 64);
    if (!id || seen.has(id)) continue;
    seen.add(id);
    const split = typeof entry.depth === 'object' && entry.depth !== null ? entry.depth.split : undefined;
    if (typeof split !== 'string' || !FIELD_NAME.test(split) || !Object.hasOwn(fields, split)) continue;
    const words = fields[split];
    if (typeof words === 'object' && words !== null && trimmed(words.label, 24)) ok.add(id);
  }
  return ok;
}

/**
 * What the bar must offer, from the manifest alone: the rows' small version (a pack with rows), a
 * line for each section (a pack with rows or a lane), the depth of each lane that declares one (it
 * needs the name column, so a pack with rows), and the Timeline depth (a pack with rows and at
 * least two kinds of event that the track draws). `expected` is the lanes the page must show.
 */
export function expectedBar(expected, nodes, declared, fields, rowsDeclared) {
  const named = rowsDeclared === true;
  const lanes = expected.map((e) => e.id);
  const depths = [];
  if (named) {
    const fit = depthLanes(declared, fields);
    for (const id of lanes) if (fit.has(id)) depths.push(`lane:${id}`);
    const kinds = new Set(nodes.filter((n) => typeof n.timestamp === 'string' && n.timestamp !== '' && !('decision' in n)).map((n) => n.kind));
    if (kinds.size >= 2) depths.push('kinds');
  }
  return { rows: named, stack: named || lanes.length > 0, lanes, depths };
}

const optionName = (option) =>
  option === 'all' ? 'both depths open' : option === 'kinds' ? 'kind lines' : `lane depth ${option.slice('lane:'.length)}`;

/**
 * The printout of the bar's heights with each depth open, and what fails it: an option that was
 * not read, or a height that is not a number. An option over the share is named and not failed:
 * the limit is a design choice (the share counts the panel).
 */
export function barHeights(depths, options) {
  const lines = [];
  const problems = [];
  if (options.length === 0) return { lines, problems };
  const every = options.length > 1 ? [...options, 'all'] : options;
  const px = (v) => Number(v.toFixed(1));
  for (const size of BAR_SIZES) {
    const high = Number(size.split('x')[1]);
    const share = px(high * SHARE);
    for (const option of every) {
      const d = Array.isArray(depths) ? depths.find((x) => x && x.option === option && x.size === size) : undefined;
      if (!d) {
        problems.push(`${size} ${optionName(option)} not read`);
        continue;
      }
      if (!num(d.panel) || !num(d.stack)) {
        problems.push(`${size} ${optionName(option)}: a height is not a number`);
        continue;
      }
      const verdict = d.panel > share ? `OVER the share by ${px(d.panel - share)} px` : 'inside the share';
      lines.push(`  bar height  ${size}  ${optionName(option)}: panel ${px(d.panel)} px, bottom stack ${px(d.stack)} px; ${verdict} of ${share} px (${SHARE} of ${high} px)`);
    }
  }
  return { lines, problems };
}

/** The rules of the small versions and the depth, against what the manifest says the bar offers. */
function sectionProblems(facts, bar) {
  const out = [];
  const add = (rule, detail) => out.push({ rule, id: '', what: detail ? `${LANE_RULES[rule]} (${detail})` : LANE_RULES[rule] });
  const rowsFact = facts.sections?.rows ?? null;
  const rowsOk = bar.rows
    ? !!rowsFact && rowsFact.drawn === true && rowsFact.after === true && rowsFact.expanded === false && sameBox(rowsFact.plot, rowsFact.track) && rowsFact.figure === true
    : !rowsFact || rowsFact.drawn === false;
  if (!rowsOk) add('rows-small');

  const st = facts.sections?.stack ?? null;
  const one = st?.oneLine ?? null;
  const stackOk = bar.stack
    ? !!st && st.drawn === true && st.rows === (bar.rows ? 1 : 0) &&
      Array.isArray(st.lanes) && st.lanes.length === bar.lanes.length && st.lanes.every((id, i) => id === bar.lanes[i]) &&
      Array.isArray(st.plots) && st.plots.length === st.rows + bar.lanes.length && st.plots.every((p) => sameBox(p, st.strip)) &&
      !!one && one.stackGone === true && one.smalls === 0 && num(one.panel) && num(one.stackPanel) &&
      Math.abs(one.panel - ONE_LINE_PX) <= EDGE_SLACK && one.panel < one.stackPanel
    : !st || st.drawn === false;
  if (!stackOk) add('line-for-each-section');

  const depths = Array.isArray(facts.depths) ? facts.depths : [];
  const failed = { 'lane-depth': [], 'kinds-depth': [] };
  for (const option of bar.depths) {
    for (const size of BAR_SIZES) {
      const d = depths.find((x) => x && x.option === option && x.size === size);
      // An entry that was not read is the heights rule's to name.
      if (d && !(d.opened === true && bounded(d.lines, 1) && d.aligned === true && d.outside === 0)) failed[depthRule(option)].push(`${option} at ${size}`);
    }
  }
  for (const [rule, list] of Object.entries(failed)) if (list.length > 0) add(rule, list.join(', '));

  const gaps = [];
  if (bar.rows && rowsFact?.drawn === true) gaps.push(['the rows', rowsFact.gap]);
  if (bar.rows) for (const l of facts.lanes ?? []) if (l?.small?.drawn === true) gaps.push([`lane ${l.id}`, l.small.gap]);
  if (bar.stack && st?.drawn === true) (st.gaps ?? [null]).forEach((g, i) => gaps.push([`line ${i + 1} of the stack`, g]));
  const tight = gaps.filter(([, g]) => !gapOk(g)).map(([name]) => name);
  if (tight.length > 0) add('small-label-gap', tight.join(', '));

  const heights = barHeights(facts.depths ?? null, bar.depths);
  if (heights.problems.length > 0) add('bar-heights', heights.problems.join('; '));
  return out;
}

/**
 * The judgment of a page: the rules its facts break as { rule, id, what }, and apart from them the
 * legs that wait as { rule, leg, reason }. A leg in `waiting` is listed whatever its fact reads and
 * is never judged; pass {} to judge every leg. `bar` is what the manifest says the bar must offer
 * (`expectedBar`): with it the small versions, the depth and the heights are judged too; the crawl
 * always passes it, and a call with none judges the lanes and the page rules of GATE-1 alone.
 */
export function laneVerdict(facts, expected, waiting = WAITING_LEGS, bar = null) {
  const problems = [];
  const want = expected.map((e) => e.id);
  const got = Array.isArray(facts.ids) ? facts.ids : null;
  if (!got || got.length !== want.length || got.some((k, i) => k !== want[i])) {
    problems.push({
      rule: 'lanes-on-page',
      id: '',
      what: `${LANE_RULES['lanes-on-page']} (wanted [${want.join(', ')}], found [${(got ?? []).join(', ')}])`,
    });
  }
  expected.forEach((e, index) => {
    const f = (facts.lanes ?? []).find((l) => l && l.id === e.id);
    if (!f) return;
    for (const [rule, holdsRule] of Object.entries(RULE_TESTS)) {
      if (!holdsRule(f, e, index === 0)) problems.push({ rule, id: e.id, what: LANE_RULES[rule] });
    }
  });
  const covered = coverings(facts.bars, waiting, bar ? (facts.depths ?? []) : []);
  if (covered.length > 0) problems.push({ rule: 'bar-covers-nothing', id: '', what: `${LANE_RULES['bar-covers-nothing']} (${covered.join('; ')})` });
  const c = facts.controls;
  if (!c || !num(c.total) || c.total < 1 || !Array.isArray(c.missing) || c.missing.length > 0) {
    const detail = !c ? 'not read' : !(c.total >= 1) ? 'none found on the bar' : `missing: ${(c.missing ?? []).join(', ')}`;
    problems.push({ rule: 'controls-exist', id: '', what: `${LANE_RULES['controls-exist']} (${detail})` });
  }
  if (bar) problems.push(...sectionProblems(facts, bar));
  const waits = Object.entries(waiting).map(([leg, reason]) => ({ rule: 'bar-covers-nothing', leg, reason }));
  return { problems, waits };
}

/** The rules the facts break, as { rule, id, what }; [] when the page is right. */
export function laneProblems(facts, expected, waiting = WAITING_LEGS, bar = null) {
  return laneVerdict(facts, expected, waiting, bar).problems;
}

/**
 * Whether the record `sel` names has a place on the map: true, false, or null when its row is in
 * none of the lists read. The coordinate fields are the app's own for the concrete kinds and the
 * manifest's `coords` for the others. The Places list is not read: it is a live context layer, and
 * a place is not chosen by the step key. The crawl passes this to `page.evaluate`, so it uses
 * nothing outside itself.
 */
export async function findPlace({ sel, nodes }) {
  const get = (url) => fetch(url).then((r) => (r.ok ? r.json() : [])).then((rows) => (Array.isArray(rows) ? rows : []));
  const lists = [
    ['/api/transactions', 'merchant_lat', 'merchant_lng'],
    ['/api/logins', 'ip_lat', 'ip_lng'],
    ['/api/account_events', null, null],
    ['/api/transfers', null, null],
    // A declared kind with no coords is read as well: its record is found and has no place, which a pack with no place needs.
    ...nodes.filter((n) => n.source === 'json').map((n) => [`/api/entities?kind=${encodeURIComponent(n.kind)}`, n.coords?.lat ?? null, n.coords?.lng ?? null]),
  ];
  for (const [url, lat, lng] of lists) {
    const row = (await get(url)).find((r) => String(r.id) === sel);
    if (row) return lat !== null && Number.isFinite(row[lat]) && Number.isFinite(row[lng]);
  }
  return null;
}

// ---- a pack with no place (C1) ---------------------------------------------------------------
// A pack none of whose nodes declare coords draws no capsule and no flag, so at the opening moment the
// crawl asks, in their place, for the decision as a node on the track (the node carries its kind) and,
// when the manifest declares rows, for one row or more. A pack that has a place is judged as before.

export const PLACE_RULES = {
  'place-decision-node': 'no track node of a decision kind is drawn at the opening moment',
  'place-rows': 'the manifest declares rows and the rows section draws none at the opening moment',
  'place-no-decision': 'the manifest places no record and declares no decision, so nothing is drawn at the opening moment',
};

/** What the manifest says the opening moment must show: whether a node has a place, the decision kinds, and rows. */
export function expectedPlace(nodes, rowsDeclared) {
  const placed = nodes.some((n) => Boolean(n.coords));
  return { placed, decisions: placed ? [] : nodes.filter((n) => n.decision).map((n) => n.kind), rows: !placed && rowsDeclared };
}

/** The rules the page breaks at the opening moment: `facts` is what readPlace gives. A placed pack is not judged here. */
export function placeProblems(facts, expected) {
  if (expected.placed) return [];
  const problem = (rule, what) => ({ rule, id: '', what });
  if (expected.decisions.length === 0) return [problem('place-no-decision', PLACE_RULES['place-no-decision'])];
  const out = [];
  if (!(facts?.kinds ?? []).some((k) => expected.decisions.includes(k))) {
    out.push(problem('place-decision-node', PLACE_RULES['place-decision-node'].replace('a decision kind', `a decision kind (${expected.decisions.join(', ')})`)));
  }
  if (expected.rows && !(facts?.rows > 0)) out.push(problem('place-rows', PLACE_RULES['place-rows']));
  return out;
}

/** What the section's PASS line says for a pack with no place: the decision's nodes and the rows drawn. */
export function placeNote(facts, expected) {
  const nodes = facts.kinds.filter((k) => expected.decisions.includes(k)).length;
  const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;
  return `no place: ${plural(nodes, 'decision node')}${expected.rows ? `, ${plural(facts.rows, 'row')}` : ''}`;
}

// ---- a pack with no rule: its decision is owed once the playhead reaches it -------------------------
// A decision's capsule is drawn only for a decision the playhead has reached. A pack with no rule opens
// on a record before its decision, so the crawl presses End first, and only when every fact that says the
// decision lies ahead was read. A fact that was not read keeps the wait at the opening moment as it was.

/** The two failure texts of the capsule-or-flag wait, by the reading `markDue` gives. */
export const MARK_RULES = {
  opening: 'no decision or queued event is drawn at the opening moment',
  end: 'no decision is drawn once the playhead has reached it',
};

/**
 * 'end' only when the pack declares no rule (an array of length 0), at least one decision time was read
 * (each a finite number of milliseconds), the playhead's number was read, and every decision is later
 * than it (a decision at the playhead's own time is reached). Otherwise 'opening'.
 */
export function markDue(facts) {
  const { rules, decided, now } = facts ?? {};
  const ahead = num(now) && Array.isArray(decided) && decided.length > 0 && decided.every((t) => num(t) && t > now);
  return Array.isArray(rules) && rules.length === 0 && ahead ? 'end' : 'opening';
}

/** What the section's PASS line says when the crawl pressed End first; nothing for the opening reading. */
export function markNote(due) {
  return due === 'end' ? 'the decision is drawn once the playhead reaches it' : undefined;
}

/**
 * Runs in the page: the time of each row of each kind whose node has a `decision` mapping, from the
 * field the node names under `timestamp`, in milliseconds (a row whose time is missing or does not parse
 * gives NaN, and a list that cannot be read gives none), and the slider's number (NaN when it has none).
 * The crawl passes this to `page.evaluate`, so it uses nothing outside itself.
 */
export async function readDecided({ nodes, slider }) {
  const decided = [];
  for (const n of nodes.filter((x) => x.decision)) {
    const rows = await fetch(`/api/entities?kind=${encodeURIComponent(n.kind)}`)
      .then((r) => (r.ok ? r.json() : []))
      .then((list) => (Array.isArray(list) ? list : []))
      .catch(() => []);
    for (const row of rows) decided.push(typeof row?.[n.timestamp] === 'string' ? Date.parse(row[n.timestamp]) : NaN);
  }
  return { decided, now: Number.parseFloat(document.querySelector(slider)?.getAttribute('aria-valuenow') ?? '') };
}

const COUNT_WORDS =['no', 'one', 'two', 'three', 'four'];
const BAR_LEG_COUNT = 4;

/** The line the crawl prints for one waiting leg of one scenario and theme. */
export function waitLine(where, wait) {
  return `  WAITS  ${where}: ${wait.rule}, ${wait.leg}, waits on ${wait.reason}`;
}

/**
 * The legs of the bar rule that the page cannot give, each with its reason: the selected marker, when
 * every reading is of a record with no place (a pack with no place). A reading with a place, or one
 * whose place is not known, keeps the leg judged; so does a section that read nothing.
 */
export function inapplicableLegs(readings) {
  const read = Array.isArray(readings) ? readings : [];
  return read.length > 0 && read.every((b) => !!b && b.placed === false) ? [{ leg: 'selected marker', reason: 'the selected record has no place' }] : [];
}

/** What the section's PASS line says about the bar rule: the legs that held, how many wait, and each leg that does not apply. */
export function passNote(waits, skipped = []) {
  const held = COUNT_WORDS[BAR_LEG_COUNT - waits.length - skipped.length];
  const wait = waits.length === 0 ? '' : `, ${COUNT_WORDS[waits.length]} ${waits.length === 1 ? 'waits' : 'wait'}`;
  const apart = skipped.map((s) => `, the ${s.leg} leg does not apply (${s.reason})`).join('');
  return `bar covers: ${held} legs held${wait}${apart}`;
}

/**
 * The key that chooses a record in the lanes reader: the step key `,` only when nothing can be stepped
 * to (the playhead is on the last instant of the case and no record is selected, as a pack with no
 * place opens), else `.`. A number that was not read keeps `.`.
 */
export function stepKey({ now, max, selected }) {
  return !selected && num(now) && num(max) && now >= max ? ',' : '.';
}

/** The crawl's last line: a failure count and a waiting count; "every check passed" only when none waits. */
export function summaryLine(failureCount, waitCount) {
  const legs = `${waitCount} waiting ${waitCount === 1 ? 'leg' : 'legs'}`;
  if (failureCount > 0) return `static-crawl: ${failureCount} failure(s), ${legs}`;
  return `static-crawl: ${waitCount === 0 ? 'every check passed' : 'no check failed'}, ${legs}`;
}

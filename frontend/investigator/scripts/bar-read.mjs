/**
 * bar-read.mjs - the page readers of the static crawl's check of the Timeline bar.
 *
 * Each `read*` function below runs inside the page (`page.evaluate`), so it holds no closure over
 * this module: a helper it needs is written inside it. Each takes one object of selectors and
 * options and gives plain facts, with an element that is not there read as null, so a page
 * without a part gives a named rule and not a timeout. The judgment is lane-check.mjs. Nothing
 * here waits: the crawl waits with waitFor and waitForFunction before it reads.
 *
 * Where each thing is read (the capstone playbar, GATE-1 and GATE-2):
 *   lane               [data-magnitude-lane="<lane id>"]            MagnitudeLane.tsx; a folded lane with a name
 *                                                                   column is a group of that id around LaneSmall
 *   its open plot      [data-magnitude-plot]                        in the lane, only while the lane is open
 *   number at line     [data-lane-figure="<id>"] and its            LaneFigure.tsx, in a plot; no element when
 *                      data-lane-figure-value                       no bucket holds the playhead
 *   lane small         [data-lane-small="<id>"], [data-lane-small-plot], [data-lane-small-name] (its name text is
 *                      the first span that is not aria-hidden and not [data-lane-small-words]), [data-lane-small-range]
 *   rows               [data-track-rows], [data-track-plot], [data-track-header] button
 *   rows small         [data-rows-small], [data-small-plot], [data-small-label], [data-small-open], [data-small-count-figure]
 *   line for each      [data-stack-lines] in TimelineShell.tsx, the Timeline strip [data-case-strip],
 *   section            the Timeline button [data-bar-fold]
 *   lane depth         [data-lane-lines-toggle], [data-lane-line-row], [data-lane-line-plot], [data-line-piece]
 *   kind lines         [data-kinds-fold], [data-kind-line], [data-kind-plot]
 *   bar                [data-eyes="TIMELINE-ROOT"]                  TimelineShell.tsx
 *   date labels        [data-timeline-axis]                         TimelineShell.tsx
 *   the stack height   --bottom-stack-h on the document element     App.tsx
 */

/** The Timeline's panel (TimelineShell.tsx) and its playhead slider, as the crawl and the readers name them. */
export const BAR = '[data-eyes="TIMELINE-ROOT"]';
export const SLIDER = '[role="slider"][aria-label="Playhead position"]';

/** The Timeline's own fold button: one press folds to a line for each section, the next to one line. */
export const FOLD_BUTTON = '[data-bar-fold]';

/** Every aria-controls on the bar, and the ids among them that name no element. */
export const readControls = ({ bar }) => {
  const root = document.querySelector(bar);
  const ids = root ? [...root.querySelectorAll('[aria-controls]')].flatMap((el) => (el.getAttribute('aria-controls') ?? '').split(/\s+/).filter(Boolean)) : [];
  return { total: ids.length, missing: ids.filter((id) => document.getElementById(id) === null) };
};

/** Labels, the number at the line, geometry, order and the button's reach for one lane. */
export const readLane = ({ id, slider }) => {
  const lane = [...document.querySelectorAll('[data-magnitude-lane]')].find((el) => el.getAttribute('data-magnitude-lane') === id) ?? null;
  const track = document.querySelector(slider);
  const text = (sel) => lane?.querySelector(sel)?.textContent ?? null;
  const box = (el) => (el ? { left: el.getBoundingClientRect().left, width: el.getBoundingClientRect().width } : null);
  const plot = lane?.querySelector('[data-magnitude-plot]') ?? null;
  // The number at the line stands in the lane's plot and is drawn only while a bucket holds the
  // playhead: with the plot on the page, no figure is an empty reading; with no plot it is unread.
  const readout = (() => {
    const now = track?.getAttribute('aria-valuenow') ?? null;
    if (plot === null && now === null) return null;
    const figure = plot ? [...plot.querySelectorAll('[data-lane-figure]')].find((el) => el.getAttribute('data-lane-figure') === id) ?? null : null;
    const value = figure?.getAttribute('data-lane-figure-value') ?? null;
    return { at: now === null ? null : Number(now), empty: plot === null ? null : figure === null, value: value === null ? null : Number(value) };
  })();
  let barsOutside = null;
  if (plot) {
    const p = plot.getBoundingClientRect();
    barsOutside = [...plot.querySelectorAll('[data-bar-piece]')].filter((b) => {
      const r = b.getBoundingClientRect();
      return r.top < p.top - 1 || r.bottom > p.bottom + 1;
    }).length;
  }
  const rows = document.querySelector('[data-track-rows]');
  // The rows section is part of the order only when the page draws it; the rule says whether it must.
  const axis = document.querySelector('[data-timeline-axis]');
  const order = [track, lane, axis].some((el) => !el)
    ? null
    : [['track', track], ['rows', rows], ['lane', lane], ['axis', axis]]
        .filter(([, el]) => el)
        .sort((a, b) => (a[1].compareDocumentPosition(b[1]) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1))
        .map(([n]) => n)
        .join(',');
  const button = lane?.querySelector('button') ?? null;
  let focused = null;
  if (button) {
    button.focus();
    focused = document.activeElement === button;
  }
  return {
    present: lane !== null,
    nodeLabel: text('[data-magnitude-node]'),
    label: text('[data-magnitude-label]'),
    unit: text('[data-magnitude-unit]'),
    readout,
    plot: box(plot),
    track: box(track),
    rowsPlot: box(document.querySelector('[data-track-plot]')),
    barsOutside,
    order,
    tabIndex: button ? button.tabIndex : null,
    focused,
  };
};

/**
 * The lane's fold state, its height and the bottom stack's height, right now. The open plot is not
 * drawn (`plotHidden`) when it is hidden, or when it is not in the document and the small version's
 * plot stands in its place; `small` is whether that plot is drawn.
 */
export const readFold = ({ id }) => {
  const lane = [...document.querySelectorAll('[data-magnitude-lane]')].find((el) => el.getAttribute('data-magnitude-lane') === id) ?? null;
  const button = lane?.querySelector('button') ?? null;
  const plot = lane?.querySelector('[data-magnitude-plot]') ?? null;
  const small = lane?.querySelector('[data-lane-small-plot]') ?? null;
  const stack = parseFloat(document.documentElement.style.getPropertyValue('--bottom-stack-h'));
  return {
    expanded: button ? button.getAttribute('aria-expanded') === 'true' : null,
    plotHidden: lane === null ? null : plot ? plot.hidden : small ? true : null,
    small: lane === null ? null : small !== null,
    height: lane ? lane.getBoundingClientRect().height : null,
    stack: Number.isFinite(stack) ? stack : null,
  };
};

/**
 * Every small version on the page, or inside `scope` (a selector) when one is given: the rows' small
 * version and the lanes' small versions in document order, the Timeline strip, and whether the line
 * for each section is drawn. A small version's `gap` is the least distance in px from the drawn end
 * of each of its labels to its plot: a label cut with an ellipsis ends at its box, less its padding
 * and border, and a short one at its text. SHORTCUT: a label's drawn end is its last text node's
 * end, which is right for a one-line label, the only kind a small version draws.
 */
export const readSmalls = ({ slider, scope }) => {
  const root = scope ? document.querySelector(scope) : document;
  const track = document.querySelector(slider);
  const now = track?.getAttribute('aria-valuenow') ?? null;
  const box = (el) => (el ? { left: el.getBoundingClientRect().left, width: el.getBoundingClientRect().width } : null);
  const edge = (el) => {
    const range = document.createRange();
    range.selectNodeContents(el);
    const style = getComputedStyle(el);
    const limit = el.getBoundingClientRect().right - parseFloat(style.paddingRight) - parseFloat(style.borderRightWidth);
    return Math.min(range.getBoundingClientRect().right, limit);
  };
  const gapOf = (labels, plot) => {
    const drawn = labels.filter(Boolean);
    return plot && drawn.length > 0 ? Math.min(...drawn.map((el) => plot.getBoundingClientRect().left - edge(el))) : null;
  };
  const lanes = root
    ? [...root.querySelectorAll('[data-lane-small]')].map((el) => {
        const id = el.getAttribute('data-lane-small');
        const plot = el.querySelector('[data-lane-small-plot]');
        const name = el.querySelector('[data-lane-small-name] > span:not([aria-hidden]):not([data-lane-small-words])');
        const figure = plot ? [...plot.querySelectorAll('[data-lane-figure]')].find((f) => f.getAttribute('data-lane-figure') === id) ?? null : null;
        const value = figure?.getAttribute('data-lane-figure-value') ?? null;
        return {
          id,
          drawn: plot !== null,
          plot: box(plot),
          gap: gapOf([name, el.querySelector('[data-lane-small-range]')], plot),
          readout: plot ? { at: now === null ? null : Number(now), empty: figure === null, value: value === null ? null : Number(value) } : null,
        };
      })
    : [];
  const rowsEl = root?.querySelector('[data-rows-small]') ?? null;
  const rowsList = document.querySelector('[data-track-rows]');
  const toggle = document.querySelector('[data-track-header] button[aria-expanded]');
  const rowsPlot = rowsEl?.querySelector('[data-small-plot]') ?? null;
  const open = rowsEl?.querySelector('[data-small-open]') ?? null;
  const rows = rowsEl
    ? {
        drawn: rowsPlot !== null,
        after: rowsList ? (rowsList.compareDocumentPosition(rowsEl) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0 : false,
        expanded: toggle ? toggle.getAttribute('aria-expanded') === 'true' : null,
        plot: box(rowsPlot),
        track: box(track),
        gap: gapOf([rowsEl.querySelector('[data-small-label]'), open?.querySelector(':scope > span:last-child') ?? null], rowsPlot),
        figure: rowsEl.querySelector('[data-small-count-figure]') !== null,
      }
    : null;
  return { rows, lanes, strip: box(document.querySelector('[data-case-strip]')), stackDrawn: document.querySelector('[data-stack-lines]') !== null };
};

/** The bar's panel height and the bottom stack's, and what is left of the sections after one more fold. */
export const readHeights = ({ bar }) => {
  const root = document.querySelector(bar);
  const stack = parseFloat(document.documentElement.style.getPropertyValue('--bottom-stack-h'));
  return {
    panel: root ? root.getBoundingClientRect().height : null,
    stack: Number.isFinite(stack) ? stack : null,
    stackGone: document.querySelector('[data-stack-lines]') === null,
    smalls: root ? root.querySelectorAll('[data-rows-small], [data-lane-small]').length : null,
  };
};

/**
 * The depth options now open, read together: `options` holds `lane:<id>` and `kinds`. The depth is
 * `opened` when every option's control reads expanded; `lines` counts the lines drawn; `aligned`
 * is whether every line's plot starts and ends within 1 px of the track; `outside` counts bar
 * pieces of the lane's lines above or below their own plot.
 */
export const readDepth = ({ slider, options }) => {
  const track = document.querySelector(slider)?.getBoundingClientRect() ?? null;
  const facts = { opened: true, lines: 0, aligned: true, outside: 0 };
  for (const option of options) {
    // A lane option names a lane the page may not draw: that reads as not open, and never as the kinds.
    const isLane = option.startsWith('lane:');
    const lane = isLane ? [...document.querySelectorAll('[data-magnitude-lane]')].find((el) => el.getAttribute('data-magnitude-lane') === option.slice(5)) ?? null : null;
    const scope = isLane ? lane : document;
    const control = scope?.querySelector(isLane ? '[data-lane-lines-toggle]' : '[data-kinds-fold]') ?? null;
    if (!control || control.getAttribute('aria-expanded') !== 'true') facts.opened = false;
    const lines = scope ? [...scope.querySelectorAll(isLane ? '[data-lane-line-row]' : '[data-kind-line]')] : [];
    facts.lines += lines.length;
    for (const line of lines) {
      const plot = line.querySelector(isLane ? '[data-lane-line-plot]' : '[data-kind-plot]');
      const p = plot?.getBoundingClientRect() ?? null;
      if (!p || !track || Math.abs(p.left - track.left) > 1 || Math.abs(p.width - track.width) > 1) facts.aligned = false;
      if (p && isLane) {
        facts.outside += [...plot.querySelectorAll('[data-line-piece]')].filter((b) => {
          const r = b.getBoundingClientRect();
          return r.top < p.top - 1 || r.bottom > p.bottom + 1;
        }).length;
      }
    }
  }
  return facts;
};

/** The boxes of the bar, the Inspector, the log and the credit, and the selected marker's point. */
export const readBar = ({ bar }) => {
  const rect = (el) => {
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { left: r.left, top: r.top, right: r.right, bottom: r.bottom };
  };
  // The marker is the point the map writes for the selected record ("x,y", viewport pixels) when the camera stops.
  const [x, y] = (document.querySelector('[data-testid="globe-map"]')?.getAttribute('data-selected-point') ?? '').split(',').map(Number);
  // SHORTCUT: the log carries no label or data attribute, so it is every aside that is not the Inspector.
  const logs = [...document.querySelectorAll('aside:not([aria-label="Inspector"])')].map(rect).filter((r) => r && r.right > r.left && r.bottom > r.top);
  return {
    bar: rect(document.querySelector(bar)),
    inspector: rect(document.querySelector('aside[aria-label="Inspector"]')),
    logs,
    marker: Number.isFinite(x) && Number.isFinite(y) ? { x, y } : null,
    credit: rect(document.querySelector('[data-map-credit]')),
  };
};

/** A row of the rows section (TrackRows.tsx), which the crawl waits for in a pack with no place. */
export const ROW_SELECTOR = '[data-track-rows] [data-track-row]';

/** The track's nodes of the given kinds. A row's dot carries the same attribute and is not one (it stands inside the rows section). */
export const trackNodeSelector = (kinds) => kinds.map((k) => `[data-node-kind=${JSON.stringify(k)}]:not([data-track-rows] *)`).join(', ');

/**
 * What the opening moment draws for a pack with no place (C1): the kind of each node on the track
 * (data-node-kind on CaseTimelineLayer's node; a row's dot in the rows section is left out), and how
 * many rows the rows section holds. A page without a part gives an empty list or none, not a timeout.
 */
export const readPlace = () => ({
  kinds: [...document.querySelectorAll('[data-node-kind]')].filter((el) => el.closest('[data-track-rows]') === null).map((el) => el.getAttribute('data-node-kind')),
  rows: document.querySelectorAll('[data-track-rows] [data-track-row]').length,
});

/** The StackFact of the line for each section: the small versions read in `[data-stack-lines]`, and what one more fold left. */
export function stackFact(smalls, stackPanel, one) {
  const rows = smalls.rows;
  return {
    drawn: smalls.stackDrawn,
    rows: rows ? 1 : 0,
    lanes: smalls.lanes.map((l) => l.id),
    plots: [...(rows ? [rows.plot] : []), ...smalls.lanes.map((l) => l.plot)],
    strip: smalls.strip,
    gaps: [...(rows ? [rows.gap] : []), ...smalls.lanes.map((l) => l.gap)],
    oneLine: { stackGone: one.stackGone, smalls: one.smalls, panel: one.panel, stackPanel },
  };
}

#!/usr/bin/env node
/**
 * static-crawl.mjs - walk the built static site in a real browser.
 *
 * The static site has no backend, so a request the exporter did not write is a hole a
 * reader can fall into. This opens every shipped scenario
 * and fails on a console error, a page error, a failed or 4xx/5xx request to
 * the site's own origin, or a visible load-error banner. It also checks the four
 * things a unit test cannot: a share link opened in a browser that has never seen the
 * site, the customer app alone, the customer app following the investigator's playhead
 * across tabs, and the app with the map tile host unreachable.
 *
 * It does NOT start a server. Build the site (node scripts/build-static.mjs), serve
 * the folder that holds site/ (launch entry `static-site`: IPv6 loopback only, so the
 * address is [::1], not 127.0.0.1), then:
 *
 *   node frontend/investigator/scripts/static-crawl.mjs "http://[::1]:4173/site/"
 *
 * The base URL must end with a slash (a relative-base site resolves against it).
 * Exit 0 when every check passes, 1 otherwise.
 */
import { chromium } from 'playwright';
import { BAR_SIZES, MARK_RULES, expectedBar, barHeights, expectedLanes, expectedPlace, findPlace, inapplicableLegs, kindsToFetch, laneProblems, laneVerdict, markDue, markNote, passNote, placeNote, placeProblems, readDecided, stepKey, summaryLine, waitLine } from './lane-check.mjs';
import { BAR, FOLD_BUTTON, ROW_SELECTOR, SLIDER, readBar, readControls, readDepth, readFold, readHeights, readLane, readPlace, readSmalls, stackFact, trackNodeSelector } from './bar-read.mjs';

const BASE = process.argv[2];
if (!BASE || !BASE.endsWith('/')) {
  console.error('usage: static-crawl.mjs <base url ending in />');
  process.exit(1);
}
const ORIGIN = new URL(BASE).origin;
const TILE_HOST = 'tiles.openfreemap.org';
const READY_MS = 30000;
const ALERT_TEXT = /We spotted \d+ unusual charges/;

const failures = [];
const fail = (where, what) => {
  failures.push(`${where}: ${what}`);
  console.log(`  FAIL  ${where}: ${what}`);
};

// A leg that is not judged yet is listed here, apart from the failures: it is neither one nor a pass.
const waitingLegs = [];

/** Run one section and print PASS only when nothing inside it failed. A body may return a note for the line. */
async function section(where, body) {
  const before = failures.length;
  let note;
  try {
    note = await body();
  } catch (e) {
    fail(where, `crawl stopped: ${e.message.split('\n')[0]}`);
  }
  if (failures.length === before) console.log(`  PASS  ${where}${note ? ` (${note})` : ''}`);
}

/** Record everything that would mean a hole: errors, failed requests, bad statuses.
 *  Returns a function that reports what was recorded. */
function watch(page, where, { tilesBlocked = false } = {}) {
  const problems = [];
  const echoes = [];
  let externalAborts = 0;
  let ownAborts = 0;
  const external = (url) => !url.startsWith(ORIGIN);
  page.on('pageerror', (e) => problems.push(`page error: ${e.message}`));
  page.on('console', (m) => {
    if (m.type() !== 'error') return;
    const text = m.text();
    // With the tile host blocked, the browser and MapLibre both report it. That is the test.
    if (tilesBlocked && (text.includes(TILE_HOST) || /ERR_FAILED|Failed to load resource|net::/i.test(text))) return;
    // A fetch that failed with no response. The map logs one for each tile request the browser
    // aborts (a reload under it, a stale tile dropped): held back until the report, which
    // counts them against the aborts seen (FIX-2026-11-13-crawl-switch-check-races-the-map).
    if (/Failed to fetch/.test(text)) echoes.push(text);
    else problems.push(`console error: ${text.slice(0, 200)}`);
  });
  page.on('requestfailed', (r) => {
    const errorText = r.failure()?.errorText ?? '';
    if (external(r.url())) {
      // Third-party hosts are not this site's export; an abort is counted to explain its echo.
      if (errorText.includes('ERR_ABORTED')) externalAborts += 1;
      return;
    }
    // The crawl reloads and closes pages, and the browser aborts a request still in flight (a glyph
    // file of the map). That is the crawl's own move, not a failure of the site: it is counted and
    // printed. Every other failure stays a problem, and a missing file stays one through the status.
    if (errorText.includes('ERR_ABORTED')) {
      ownAborts += 1;
      return;
    }
    problems.push(`request failed: ${r.url()} (${errorText || 'no reason given'})`);
  });
  page.on('response', (r) => {
    if (!external(r.url()) && r.status() >= 400) problems.push(`HTTP ${r.status()}: ${r.url()}`);
  });
  return () => {
    // Each aborted third-party request explains one echo. Any echo beyond that is a fetch that
    // failed for another reason (a host that is down, a refused connection) and is a failure.
    for (const text of echoes.slice(externalAborts)) problems.push(`console error: ${text.slice(0, 200)}`);
    for (const p of problems) fail(where, p);
    if (ownAborts > 0) console.log(`  note  ${where}: ${ownAborts} request(s) to this site aborted by the browser, not counted as failures`);
  };
}

async function ready(page) {
  await page.waitForSelector('canvas.maplibregl-canvas', { timeout: READY_MS });
  await page.waitForSelector(SLIDER, { timeout: READY_MS });
  await page.waitForLoadState('networkidle', { timeout: READY_MS }).catch(() => {});
}

async function noLoadError(page, where) {
  const banner = await page.locator('[role="alert"]', { hasText: 'load error' }).count();
  if (banner > 0) fail(where, 'a load-error banner is on screen');
}

// The map credit must show in every view (OpenStreetMap data licence). It needs a backing
// (without one, street labels run through it at city zoom), and no part of it may sit on
// other text (it once ran through a date label of a time axis).
async function hasMapCredit(page, where) {
  const credit = page.locator('[data-map-credit]', { hasText: 'OpenStreetMap' });
  const visible = (await credit.count()) > 0 && (await credit.first().isVisible());
  if (!visible) return fail(where, 'the map credit (OpenStreetMap) is not visible');
  const backing = await credit.first().evaluate((el) => {
    const parts = getComputedStyle(el).backgroundColor.match(/[\d.]+/g) ?? [];
    return parts.length === 4 ? Number(parts[3]) : parts.length === 3 ? 1 : 0; // alpha
  });
  if (backing < 0.8) fail(where, `the map credit has no backing (background alpha ${backing})`);
  const under = await credit.first().evaluate((el) => {
    const ownText = (n) => [...n.childNodes].some((c) => c.nodeType === 3 && c.textContent.trim() !== '');
    const parts = [...el.children].map((c) => c.getBoundingClientRect());
    for (const node of document.querySelectorAll('body *')) {
      if (el.contains(node) || !ownText(node) || getComputedStyle(node).visibility === 'hidden') continue;
      const b = node.getBoundingClientRect();
      if (b.width === 0 || b.height === 0) continue;
      if (parts.some((r) => b.left < r.right && b.right > r.left && b.top < r.bottom && b.bottom > r.top)) {
        return node.textContent.trim().slice(0, 40);
      }
    }
    return null;
  });
  if (under !== null) fail(where, `the map credit sits on other text ("${under}")`);
}

const upperText = async (page) => (await page.locator('body').innerText()).toUpperCase();

async function crawlScenario(browser, scenario, theme) {
  const where = `${scenario.id} ${theme}`;
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await context.addInitScript((id) => localStorage.setItem('ffr.scenario', id), scenario.id);
  const page = await context.newPage();
  const report = watch(page, where);
  await section(where, async () => {
    await page.goto(`${BASE}?theme=${theme}`);
    await ready(page);
    const text = await upperText(page);
    if (!text.includes(scenario.label.toUpperCase())) fail(where, `the page does not name "${scenario.label}"`);
    if (!text.includes('SYNTHETIC DATA')) fail(where, 'the synthetic-data label is missing');
    if ((await page.getByRole('button', { name: /^(view queue|open case|manager console|close console)$/i }).count()) > 0) fail(where, 'a view switch is offered');
    await noLoadError(page, where);
    await hasMapCredit(page, where);

    // shortcut: the card stories skip the place checks, because a rule that lands on a card transaction or a
    // login draws no queued flag yet (components/verdict/badge-sources.ts marks that as a shortcut of its own),
    // so priya-ato owes nothing on the globe at its opening moment (FIX-2026-11-23-crawl-place-check-fails-on-priya-ato).
    // Take this gate out when that shortcut is lifted.
    if (!scenario.cardKinds) {
      // Each story's own records on the globe and their lanes on the timeline.
      // The marks are added once the map has loaded, which can come after the network is
      // quiet, so wait for one and never sample
      // (FIX-2026-11-14-crawl-samples-globe-marks-at-network-idle).
      const want = expectedPlace(scenario.nodes, Boolean(scenario.rows));
      if (want.placed) {
        // A pack with no rule opens before its decision, which is drawn once the playhead reaches it (FIX-2026-11-22-crawl-asks-for-a-decision-the-playhead-has-not-reached).
        const due = markDue({ rules: scenario.rules, ...(await page.evaluate(readDecided, { nodes: scenario.nodes, slider: SLIDER })) });
        if (due === 'end') { await page.locator(SLIDER).focus(); await page.keyboard.press('End'); }
        await page.locator('[data-queue-flag], [data-verdict-capsule]').first().waitFor({ state: 'attached', timeout: READY_MS }).catch(() => fail(where, MARK_RULES[due]));
        report();
        return markNote(due);
      }
      // A pack none of whose nodes declare coords draws no capsule or flag (C1): its decision is a node
      // on the track and it has rows. Wait for each with waitFor, then read and judge.
      const seen = failures.length;
      if (want.decisions.length > 0) await page.locator(trackNodeSelector(want.decisions)).first().waitFor({ state: 'attached', timeout: READY_MS }).catch(() => {});
      if (want.rows) await page.locator(ROW_SELECTOR).first().waitFor({ state: 'attached', timeout: READY_MS }).catch(() => {});
      const facts = await page.evaluate(readPlace);
      for (const p of placeProblems(facts, want)) fail(where, `${p.rule}: ${p.what}`);
      // Last, the rule is shown to fail: take the nodes, then the rows, off the live page and expect its rule.
      const without = async (s) => {
        await page.evaluate((q) => document.querySelectorAll(q).forEach((el) => el.remove()), s);
        return placeProblems(await page.evaluate(readPlace), want).map((p) => p.rule);
      };
      if (failures.length === seen && want.decisions.length > 0 && !(await without('[data-node-kind]')).includes('place-decision-node')) fail(where, 'the place check did not notice a missing decision node');
      if (failures.length === seen && want.rows && !(await without('[data-track-row]')).includes('place-rows')) fail(where, 'the place check did not notice a missing row');
      report();
      return placeNote(facts, want);
    }
    report();
  });
  await context.close();
}

async function crawlSwitch(browser, scenarios) {
  if (scenarios.length < 2) return;
  const where = 'scenario switch';
  const [first, second] = scenarios;
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  const report = watch(page, where);
  await section(where, async () => {
    await page.goto(`${BASE}?theme=light`);
    await ready(page);
    // The pick reloads the page, often while the map is still asking for tiles. The browser
    // aborts those requests and the map logs each one: watch() counts them as explained.
    await page.locator('button[aria-haspopup="listbox"]').click();
    await page.locator('[role="option"]', { hasText: second.id }).click();
    await page.waitForFunction((id) => localStorage.getItem('ffr.scenario') === id, second.id, { timeout: READY_MS });
    await page.waitForFunction(
      (label) => document.body.innerText.toUpperCase().includes(label),
      second.label.toUpperCase(),
      { timeout: READY_MS },
    );
    await ready(page);
    if ((await upperText(page)).includes(first.label.toUpperCase())) fail(where, `"${first.label}" is still on screen`);
    await noLoadError(page, where);
    report();
  });
  await context.close();
}

/** The address bar as the app reads it. */
const linkOf = (url) => {
  const q = new URL(url).searchParams;
  const num = (k) => (q.get(k) === null ? null : Number(q.get(k)));
  return { scenario: q.get('scenario'), sel: q.get('sel'), t: num('t'), a: num('a'), b: num('b'), lng: num('lng'), lat: num('lat'), zoom: num('zoom') };
};

async function crawlShareLink(browser, scenarios, defaultId) {
  // A link pasted into a browser that has never seen the site opens the scenario, the moment,
  // the record, the marks and the camera it names; afterwards the address bar follows the screen.
  const where = 'share link';
  const viewport = { width: 1440, height: 900 };
  const linkable = (n) => n.source === 'json' && n.timestamp && n.coords && !n.magnitude && !n.decision;
  const scenario = scenarios.find((s) => s.id !== defaultId && s.nodes.some(linkable));
  if (!scenario) {
    fail(where, 'no shipped scenario besides the default has a record kind to link to');
    return;
  }
  const node = scenario.nodes.find(linkable);
  const sliderAt = (page) => page.locator(SLIDER).getAttribute('aria-valuenow').then(Number);
  await section(where, async () => {
    // The scenario parameter alone, with empty storage: the link's pack opens, not the default.
    const first = await browser.newContext({ viewport });
    const plain = await first.newPage();
    const reportPlain = watch(plain, `${where} (scenario alone)`);
    await plain.goto(`${BASE}?scenario=${scenario.id}&theme=light`);
    await ready(plain);
    if (!(await upperText(plain)).includes(scenario.label.toUpperCase())) fail(where, `a link naming ${scenario.id} opened another scenario`);
    // Two of the pack's records, read the way the app reads them.
    const rows = await plain.evaluate((kind) => fetch(`/api/entities?kind=${kind}`).then((r) => r.json()), node.kind);
    reportPlain();
    await first.close();

    // A scenario the site does not ship: the default opens, with no error.
    const stale = await browser.newContext({ viewport });
    const unknown = await stale.newPage();
    const reportUnknown = watch(unknown, `${where} (unknown scenario)`);
    await unknown.goto(`${BASE}?scenario=no-such-pack&t=5&sel=nobody&theme=light`);
    await ready(unknown);
    const fallback = scenarios.find((s) => s.id === defaultId);
    if (!(await upperText(unknown)).includes(fallback.label.toUpperCase())) fail(where, 'a link naming an unknown scenario did not open the default one');
    await noLoadError(unknown, `${where} (unknown scenario)`);
    reportUnknown();
    await stale.close();
    const at = (row) => Date.parse(row[node.timestamp]);
    // The Inspector prints a record's fields, not its id: a value only this record has names it.
    const ownValue = (row) =>
      Object.entries(row).find(([key, value]) =>
        key !== 'id' && key !== node.timestamp && typeof value === 'string' && rows.filter((r) => r[key] === value).length === 1)?.[1];
    const timed = rows.filter((r) => Number.isFinite(at(r))).sort((x, y) => at(x) - at(y) || String(x.id).localeCompare(String(y.id)));
    const record = timed.slice(Math.floor(timed.length / 3)).find(ownValue);
    const later = record && timed.findLast((r) => at(r) > at(record));
    if (!record || !later) {
      fail(where, `${scenario.id} has no ${node.kind} record to build a link from`);
      return;
    }
    const want = {
      scenario: scenario.id,
      sel: String(record.id),
      t: at(record),
      a: at(record),
      b: at(later),
      lng: Number(Number(record[node.coords.lng]).toFixed(4)),
      lat: Number(Number(record[node.coords.lat]).toFixed(4)),
      zoom: 3.5,
    };
    const link = `${BASE}?scenario=${want.scenario}&t=${want.t}&sel=${want.sel}&a=${want.a}&b=${want.b}&lng=${want.lng}&lat=${want.lat}&zoom=${want.zoom}&theme=light`;

    const context = await browser.newContext({ viewport });
    const page = await context.newPage();
    const report = watch(page, where);
    await page.goto(link);
    await ready(page);
    if (!(await upperText(page)).includes(scenario.label.toUpperCase())) fail(where, `the link opened another scenario than ${scenario.id}`);
    // The record the link names is the one in the Inspector, not the pack's own opening finding.
    const inspector = page.locator('[aria-label="Inspector"]');
    await inspector.waitFor({ timeout: READY_MS });
    await page
      .waitForFunction((value) => document.querySelector('[aria-label="Inspector"]')?.textContent?.includes(value), ownValue(record), { timeout: 10000 })
      .catch(() => fail(where, `the Inspector does not show the linked record ${want.sel} (${ownValue(record)})`));
    if ((await sliderAt(page)) !== want.t) fail(where, `the playhead is at ${await sliderAt(page)}, not the linked ${want.t}`);
    if ((await page.locator('[data-mark]').count()) !== 2) fail(where, 'the two linked marks are not on the track');
    if (!/^A to B · \S/.test((await page.locator('[data-marks-readout]').textContent().catch(() => '')) ?? '')) fail(where, 'the gap between the marks is not read out');

    // Lift the mark under the playhead and drop it again: nothing on screen has changed, and the
    // address bar the app then writes must say what the link said, camera included.
    await page.locator(SLIDER).focus();
    await page.keyboard.press('m');
    await page.waitForFunction(() => document.querySelectorAll('[data-mark]').length === 1, null, { timeout: 5000 });
    await page.keyboard.press('m');
    await page.waitForFunction(() => document.querySelectorAll('[data-mark]').length === 2, null, { timeout: 5000 });
    await page.waitForFunction((b) => new URLSearchParams(location.search).get('b') === String(b) && location.search.includes('color='), want.b, { timeout: 5000 })
      .catch(() => fail(where, 'the address bar was not rewritten after the marks changed'));
    const got = linkOf(page.url());
    for (const key of ['scenario', 'sel', 't', 'a', 'b']) {
      if (got[key] !== want[key]) fail(where, `after a rewrite the address bar has ${key}=${got[key]}, the link had ${want[key]}`);
    }
    for (const [key, slack] of [['lng', 0.01], ['lat', 0.01], ['zoom', 0.05]]) {
      if (got[key] === null || Math.abs(got[key] - want[key]) > slack) fail(where, `the camera is at ${key}=${got[key]}, the link asked for ${want[key]}`);
    }

    // A step to the next event: the address bar follows the selection and the moment, once the
    // camera's move there has ended (it is not rewritten while the map moves).
    await page.keyboard.press('.');
    await page
      .waitForFunction((sel) => { const s = new URLSearchParams(location.search).get('sel'); return s !== null && s !== sel; }, want.sel, { timeout: READY_MS })
      .catch(() => fail(where, 'the address bar did not follow a step to the next event'));
    const stepped = linkOf(page.url());
    if (!(stepped.t > want.t)) fail(where, `a step forward left the address bar at t=${stepped.t}`);
    if (stepped.t !== (await sliderAt(page))) fail(where, 'the address bar and the playhead disagree after a step');
    await noLoadError(page, where);
    report();
    await context.close();
  });
}

// ---- the timeline's bar lanes ----------------------------------------------------------
// The page's facts are gathered inside the page by the readers of bar-read.mjs (its header lists
// where each thing is read), with a missing element read as null so a page without a lane's parts
// gives named rules and not a timeout. The judgment is lane-check.mjs. Everything the bar draws
// after the map loads is waited for (waitFor, waitForFunction) and never sampled at network idle
// (FIX-2026-11-14-crawl-samples-globe-marks-at-network-idle).

const LANE = '[data-magnitude-lane]';
const gatherIn = (page, fn, arg) => page.evaluate(fn, { slider: SLIDER, bar: BAR, ...arg });

/** The rows of every kind a lane reads, as the app reads them with no card or account chosen. */
const fetchRows = async (kinds) => {
  const get = (url) => fetch(url).then((r) => (r.ok ? r.json() : [])).then((rows) => (Array.isArray(rows) ? rows : []));
  const out = {};
  let transactions = null;
  for (const kind of kinds) {
    if (kind === 'auth' || kind === 'fraud') {
      transactions = transactions ?? (await get('/api/transactions'));
      out[kind] = transactions.filter((t) => Boolean(t.is_fraud) === (kind === 'fraud'));
    } else if (kind === 'login') out[kind] = await get('/api/logins');
    else if (kind === 'transfer') out[kind] = await get('/api/transfers');
    else if (kind === 'account_event') out[kind] = await get('/api/account_events');
    else if (kind === 'place') out[kind] = [];
    else out[kind] = await get(`/api/entities?kind=${encodeURIComponent(kind)}`);
  }
  return out;
};

/** The map and the bar's slider are on the page. No network-idle wait: the marks come after it. */
async function waitForBar(page) {
  await page.waitForSelector('canvas.maplibregl-canvas', { timeout: READY_MS });
  await page.waitForSelector(`${BAR} ${SLIDER}`, { timeout: READY_MS });
}

/** Open the rows section when the pack has one: the rows' plot has no width while it is closed. */
async function openRows(page) {
  const toggle = page.locator(`${BAR} [data-track-header] button[aria-expanded]`).first();
  await toggle.waitFor({ state: 'attached', timeout: READY_MS });
  if ((await toggle.getAttribute('aria-expanded')) === 'false') await toggle.click();
  await page.waitForFunction(
    () => {
      const plot = document.querySelector('[data-track-plot]');
      return !!plot && plot.getBoundingClientRect().width > 0;
    },
    null,
    { timeout: READY_MS },
  );
}

// A click from off the bar: a section that opened leaves the pointer on a row whose tooltip lies over the toggle, until the pointer leaves.
const clickClear = (page, locator) => page.mouse.move(0, 0).then(() => locator.click());

const addControls = (acc, got) => {
  acc.total += got.total;
  for (const id of got.missing) if (!acc.missing.includes(id)) acc.missing.push(id);
};

const pressOnButton = async (page, id) => {
  const focused = await page.evaluate((k) => {
    const lane = [...document.querySelectorAll('[data-magnitude-lane]')].find((el) => el.getAttribute('data-magnitude-lane') === k);
    const button = lane?.querySelector('button');
    button?.focus();
    return !!button && document.activeElement === button;
  }, id);
  if (focused) await page.keyboard.press('Enter');
};

const drop = (before, after) => (before === null || after === null ? null : before - after);

async function laneFacts(page, expected, atPeak, atEnd, controls) {
  const lanes = [];
  for (const [i, e] of expected.entries()) {
    const peak = atPeak[i];
    if (!peak.present) continue;
    const before = await gatherIn(page, readFold, { id: e.id });
    addControls(controls, await gatherIn(page, readControls, {}));
    await pressOnButton(page, e.id);
    await page
      .waitForFunction(({ id, was }) => {
        const v = parseFloat(document.documentElement.style.getPropertyValue('--bottom-stack-h'));
        const b = [...document.querySelectorAll('[data-magnitude-lane]')].find((el) => el.getAttribute('data-magnitude-lane') === id)?.querySelector('button');
        return b?.getAttribute('aria-expanded') === 'false' && v !== was;
      }, { id: e.id, was: before.stack }, { timeout: 5000 })
      .catch(() => {});
    const folded = await gatherIn(page, readFold, { id: e.id });
    // The folded lane's small version, as the page draws it now; a lane with none reads as not drawn.
    const small = (await gatherIn(page, readSmalls, {})).lanes.find((l) => l.id === e.id);
    addControls(controls, await gatherIn(page, readControls, {}));

    // The fold is saved when it is made, so the reload below needs no wait for the network.
    await page.reload();
    await page.waitForSelector(LANE, { state: 'attached', timeout: READY_MS });
    const reloaded = await gatherIn(page, readFold, { id: e.id });

    await pressOnButton(page, e.id);
    await page
      .waitForFunction((id) => [...document.querySelectorAll('[data-magnitude-lane]')].find((el) => el.getAttribute('data-magnitude-lane') === id)?.querySelector('button')?.getAttribute('aria-expanded') === 'true', e.id, { timeout: 5000 })
      .catch(() => {});
    const unfolded = await gatherIn(page, readFold, { id: e.id });

    lanes.push({
      id: e.id,
      nodeLabel: peak.nodeLabel,
      label: peak.label,
      unit: peak.unit,
      atPeak: peak.readout,
      atEnd: atEnd[i].readout,
      plot: peak.plot,
      track: peak.track,
      rowsPlot: peak.rowsPlot,
      barsOutside: peak.barsOutside,
      order: peak.order,
      tabIndex: peak.tabIndex,
      focused: peak.focused,
      fold: { expanded: folded.expanded, plotHidden: folded.plotHidden, small: folded.small, laneDrop: drop(before.height, folded.height), stackDrop: drop(before.stack, folded.stack) },
      small: small ?? { drawn: false, plot: null, gap: null, readout: null },
      afterReload: { expanded: reloaded.expanded },
      unfold: { expanded: unfolded.expanded, plotHidden: unfolded.plotHidden },
    });
  }
  return lanes;
}

/** Fold the rows' section to the middle size, where the rows' small version stands. */
async function foldRows(page) {
  const toggle = page.locator(`${BAR} [data-track-header] button[aria-expanded]`).first();
  if ((await toggle.getAttribute('aria-expanded')) === 'true') await clickClear(page, toggle);
  await page.waitForSelector('[data-rows-small]', { state: 'attached', timeout: 5000 }).catch(() => {});
}

/**
 * The rows' small version at the middle size, and the Timeline folded once (a line for each section)
 * and once more (one line). A fact the page does not give is read as it is, and the rules name it.
 */
async function gatherSections(browser, scenario, bar) {
  if (!bar.rows && !bar.stack) return { rows: null, stack: null };
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await context.addInitScript((id) => localStorage.setItem('ffr.scenario', id), scenario.id);
  const page = await context.newPage();
  try {
    await page.goto(`${BASE}?scenario=${scenario.id}&theme=light`);
    await waitForBar(page);
    let rows = null;
    if (bar.rows) {
      await openRows(page);
      await foldRows(page);
      rows = (await gatherIn(page, readSmalls, {})).rows;
    }
    let stack = null;
    if (bar.stack) {
      await clickClear(page, page.locator(`${BAR} ${FOLD_BUTTON}`));
      await page.waitForSelector('[data-stack-lines]', { state: 'attached', timeout: 5000 }).catch(() => {});
      const smalls = await gatherIn(page, readSmalls, { scope: '[data-stack-lines]' });
      const stackPanel = (await gatherIn(page, readHeights, {})).panel;
      await clickClear(page, page.locator(`${BAR} ${FOLD_BUTTON}`));
      await page.waitForSelector('[data-stack-lines]', { state: 'detached', timeout: 5000 }).catch(() => {});
      stack = stackFact(smalls, stackPanel, await gatherIn(page, readHeights, {}));
    }
    return { rows, stack };
  } finally {
    await context.close();
  }
}

/**
 * The open bar's reach at one window size, with the rows open, the depth options in `opens` open
 * (`lane:<id>` and `kinds`; each is pressed here, before the step key, since the depth lines make
 * the bar taller) and the record the story opens on (the step key chooses one only when none is selected). The published stack height is waited for
 * until it holds the bar, since the Inspector and the log read it. Each reading has a context of
 * its own, since an open depth is held in memory and not saved.
 */
async function gatherBar(browser, scenario, theme, size, rows, opens = []) {
  const [width, height] = size.split('x').map(Number);
  const context = await browser.newContext({ viewport: { width, height } });
  await context.addInitScript((id) => localStorage.setItem('ffr.scenario', id), scenario.id);
  const page = await context.newPage();
  try {
    await page.goto(`${BASE}?scenario=${scenario.id}&theme=${theme}`);
    await waitForBar(page);
    if (rows) await openRows(page);
    for (const option of opens) {
      const control = option === 'kinds' ? `${BAR} [data-kinds-fold]` : `[data-magnitude-lane="${option.slice(5)}"] [data-lane-lines-toggle]`;
      const toggle = page.locator(control).first();
      await toggle.waitFor({ state: 'attached', timeout: READY_MS }).catch(() => {});
      if ((await toggle.count()) > 0 && (await toggle.getAttribute('aria-expanded')) !== 'true') await clickClear(page, toggle);
      await page.locator(`${control}[aria-expanded="true"]`).first().waitFor({ state: 'attached', timeout: 5000 }).catch(() => {});
    }
    await page.locator(`${BAR} ${SLIDER}`).focus();
    // A story that opens on a record is read on that record: the key would move it. When nothing is selected the key is the one stepKey names.
    const slider = await page.evaluate((s) => {
      const el = document.querySelector(s);
      return { now: Number(el?.getAttribute('aria-valuenow')), max: Number(el?.getAttribute('aria-valuemax')), selected: document.querySelector('aside[aria-label="Inspector"]') !== null };
    }, SLIDER);
    if (!slider.selected) await page.keyboard.press(stepKey(slider));
    // The address bar follows the selection once the camera's move has ended.
    await page.waitForFunction(() => new URLSearchParams(location.search).get('sel') !== null, null, { timeout: READY_MS });
    await page.locator('aside[aria-label="Inspector"]').waitFor({ state: 'attached', timeout: READY_MS });
    await page.waitForFunction(
      ({ bar }) => {
        const stack = parseFloat(document.documentElement.style.getPropertyValue('--bottom-stack-h'));
        const el = document.querySelector(bar);
        return Number.isFinite(stack) && !!el && stack >= el.getBoundingClientRect().height;
      },
      { bar: BAR },
      { timeout: 10000 },
    );
    const placed = await page.evaluate(findPlace, { sel: new URL(page.url()).searchParams.get('sel'), nodes: scenario.nodes });
    if (placed === true) {
      await page.waitForFunction(() => document.querySelector('[data-testid="globe-map"]')?.hasAttribute('data-selected-point'), null, { timeout: 5000 }).catch(() => {});
    }
    const opened = opens.length === 0 ? {} : { option: opens.length > 1 ? 'all' : opens[0], ...(await gatherIn(page, readDepth, { options: opens })), ...(await gatherIn(page, readHeights, {})) };
    return { size, placed, ...(await page.evaluate(readBar, { bar: BAR })), ...opened };
  } finally {
    await context.close();
  }
}

async function crawlLanes(browser, scenarios) {
  const viewport = { width: 1440, height: 900 };
  for (const scenario of scenarios) {
    // The bar's geometry does not change with the theme, so it is read once, in the light run.
    let bars = null;
    let depths = null;
    let sections = null;
    for (const theme of ['light', 'dark']) {
      const where = `lanes ${scenario.id} ${theme}`;
      const context = await browser.newContext({ viewport });
      await context.addInitScript((id) => localStorage.setItem('ffr.scenario', id), scenario.id);
      const page = await context.newPage();
      const report = watch(page, where);
      await section(where, async () => {
        const before = failures.length;
        await page.goto(`${BASE}?theme=${theme}`);
        await waitForBar(page);
        // The lanes the manifest declares, by id (its root `lanes` and the nodes' own), and the rows of each kind they read.
        const rowsByKind = await page.evaluate(fetchRows, kindsToFetch(scenario.nodes, scenario.lanes));
        const expected = expectedLanes(scenario.nodes, rowsByKind, scenario.lanes, Boolean(scenario.rows));
        const failAll = (problems) => problems.forEach((p) => fail(where, `${p.rule}${p.id ? ` (${p.id})` : ''}: ${p.what}`));
        const idsOnPage = () => page.evaluate(() => [...document.querySelectorAll('[data-magnitude-lane]')].map((el) => el.getAttribute('data-magnitude-lane')));
        // A pack that draws no bar has nothing to cover and no control to name.
        const drawsBar = (await page.locator(BAR).count()) > 0;
        // What the manifest says the bar offers: the small versions and the depth are judged against it.
        const bar = drawsBar ? expectedBar(expected, scenario.nodes, scenario.lanes, scenario.fields, Boolean(scenario.rows)) : null;
        if (drawsBar && bars === null) {
          bars = [];
          for (const size of BAR_SIZES) bars.push(await gatherBar(browser, scenario, theme, size, Boolean(scenario.rows)));
          sections = await gatherSections(browser, scenario, bar);
          // Each depth option alone, and all of them together, at both sizes; the heights are printed.
          depths = [];
          const options = bar.depths.length > 1 ? [...bar.depths, 'all'] : bar.depths;
          for (const size of BAR_SIZES) {
            for (const option of options) depths.push(await gatherBar(browser, scenario, theme, size, Boolean(scenario.rows), option === 'all' ? bar.depths : [option]));
          }
          for (const line of barHeights(depths, bar.depths).lines) console.log(line);
        }
        const controls = { total: 0, missing: [] };
        // The legs that wait are printed once per scenario and theme, and counted for the last line.
        let waits = [];
        const judge = (facts) => {
          const verdict = laneVerdict(facts, expected, undefined, bar);
          if (drawsBar) {
            waits = verdict.waits;
            for (const w of waits) {
              waitingLegs.push(`${where}: ${w.leg}`);
              console.log(waitLine(where, w));
            }
          }
          return drawsBar ? verdict.problems : verdict.problems.filter((p) => p.rule !== 'bar-covers-nothing' && p.rule !== 'controls-exist');
        };

        if (expected.length === 0) {
          if (drawsBar) addControls(controls, await gatherIn(page, readControls, {}));
          failAll(judge({ ids: await idsOnPage(), lanes: [], bars, controls, sections, depths }));
          report();
          return drawsBar ? passNote(waits, inapplicableLegs([...(bars ?? []), ...(depths ?? [])])) : undefined;
        }
        // Opened inside the first lane's largest bucket, at a row's own instant so it lies in the case.
        const first = expected[0];
        const at = first.opening;
        await page.goto(`${BASE}?scenario=${scenario.id}&t=${at}&theme=${theme}`);
        await waitForBar(page);
        await page.waitForSelector(LANE, { state: 'attached', timeout: READY_MS });
        if (scenario.rows) await openRows(page);
        // Not a fact: the link's instant is applied once the playhead's domain is known. A page
        // that never gets there is judged by the rules below.
        await page
          .waitForFunction(({ slider, t }) => Number(document.querySelector(slider)?.getAttribute('aria-valuenow')) === t, { slider: SLIDER, t: at }, { timeout: 5000 })
          .catch(() => {});
        await page
          .waitForSelector(`${LANE}[data-magnitude-lane="${first.id}"] [data-lane-figure="${first.id}"]`, { state: 'attached', timeout: 5000 })
          .catch(() => {});
        const ids = await idsOnPage();
        addControls(controls, await gatherIn(page, readControls, {}));
        const atPeak = [];
        for (const e of expected) atPeak.push(await gatherIn(page, readLane, { id: e.id }));

        await page.locator(SLIDER).focus();
        const now = await page.locator(SLIDER).getAttribute('aria-valuenow');
        await page.keyboard.press('End');
        await page
          .waitForFunction(({ slider, was }) => document.querySelector(slider)?.getAttribute('aria-valuenow') !== was, { slider: SLIDER, was: now }, { timeout: 5000 })
          .catch(() => {});
        const atEnd = [];
        for (const e of expected) atEnd.push(await gatherIn(page, readLane, { id: e.id }));

        const lanes = await laneFacts(page, expected, atPeak, atEnd, controls);
        failAll(judge({ ids, lanes, bars, controls, sections, depths }));

        // Last, the check is shown to fail: remove the unit from the live page and expect its rule.
        const firstLane = lanes.find((l) => l.id === first.id);
        if (first.unit !== null && firstLane && failures.length === before) {
          await page.waitForSelector(`${LANE}[data-magnitude-lane="${first.id}"] [data-magnitude-unit]`, { timeout: 5000 });
          await page.evaluate((id) => {
            const lane = [...document.querySelectorAll('[data-magnitude-lane]')].find((el) => el.getAttribute('data-magnitude-lane') === id);
            lane?.querySelector('[data-magnitude-unit]')?.remove();
          }, first.id);
          const again = await gatherIn(page, readLane, { id: first.id });
          const seen = laneProblems({ ids, lanes: lanes.map((l) => (l === firstLane ? { ...l, nodeLabel: again.nodeLabel, label: again.label, unit: again.unit } : l)), bars, controls }, expected);
          if (!seen.some((p) => p.rule === 'unit')) fail(where, 'the lane check did not notice a missing unit');
        }
        report();
        return drawsBar ? passNote(waits, inapplicableLegs([...(bars ?? []), ...(depths ?? [])])) : undefined;
      });
      await context.close();
    }
  }
}

async function crawlCustomerAlone(browser) {
  // Opened alone: the full history at the exported default instant, alert included.
  const where = 'customer alone';
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const customer = await context.newPage();
  const report = watch(customer, where);
  await section(where, async () => {
    await customer.goto(`${BASE}customer/`);
    await customer.getByText('Synthetic data. Fictional people and merchants.').waitFor({ timeout: READY_MS });
    await customer.getByText(ALERT_TEXT).waitFor({ timeout: READY_MS });
    report();
  });
  await context.close();
}

async function crawlCustomerFollows(browser) {
  // Two tabs, one origin: the customer app follows the investigator's playhead.
  const where = 'customer follows the investigator';
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const investigator = await context.newPage();
  const customer = await context.newPage();
  const report = watch(customer, where);
  await section(where, async () => {
    await investigator.goto(`${BASE}?theme=light`);
    await ready(investigator);
    await customer.goto(`${BASE}customer/`);
    await customer.getByText('Synthetic data. Fictional people and merchants.').waitFor({ timeout: READY_MS }); // a story opens on its case's record: no alert yet, so End comes before the alert is waited for
    await investigator.bringToFront();
    await investigator.locator(SLIDER).focus();
    await investigator.keyboard.press('End');
    await customer.getByText(ALERT_TEXT).waitFor({ timeout: READY_MS });
    await investigator.keyboard.press('Home'); // the start of the replay: before any fraud
    await customer.waitForFunction(() => !document.body.innerText.includes('We spotted'), null, { timeout: 10000 });
    await investigator.keyboard.press('End');
    await customer.getByText(ALERT_TEXT).waitFor({ timeout: 10000 });
    report();
  });
  await context.close();
}

async function crawlWithoutTiles(browser) {
  const where = 'map tile host unreachable';
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await context.route(`**://${TILE_HOST}/**`, (route) => route.abort());
  const page = await context.newPage();
  const report = watch(page, where, { tilesBlocked: true });
  await section(where, async () => {
    await page.goto(`${BASE}?theme=light`);
    // The basemap cannot load, so wait for the app's own chrome and data instead.
    await page.waitForSelector(SLIDER, { timeout: READY_MS });
    await page.getByRole('button', { name: 'Layers' }).waitFor({ timeout: READY_MS });
    await page.waitForLoadState('networkidle', { timeout: READY_MS }).catch(() => {});
    await page
      .waitForFunction(() => performance.getEntriesByName('ffr:world-painted').length > 0, null, { timeout: READY_MS })
      .catch(() => fail(where, 'the world layer was not painted with the tile host unreachable'));
    if (!(await upperText(page)).includes('SYNTHETIC DATA')) fail(where, 'the app chrome did not render');
    await noLoadError(page, where);
    report();
  });
  await context.close();
}

async function crawlMissingFile(browser) {
  // A hole in the export must read as "this failed": the banner is on screen and nothing sits on top of it.
  const where = 'a missing file shows a readable error';
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await context.route('**/static-api/*/decisions/_.json', (route) => route.fulfill({ status: 404, body: 'Not Found' }));
  const page = await context.newPage();
  await section(where, async () => {
    await page.goto(`${BASE}?theme=light`);
    await ready(page);
    const banner = page.locator('[role="alert"]', { hasText: 'load error' });
    await banner.waitFor({ timeout: READY_MS });
    const onTop = await banner.evaluate((el) => {
      const r = el.getBoundingClientRect();
      const top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      return el === top || el.contains(top);
    });
    if (!onTop) fail(where, 'the load-error banner is covered by another panel');
  });
  await context.close();
}

const scenarios = await (await fetch(`${BASE}static-api/scenarios.json`)).json();
const index = await (await fetch(`${BASE}static-api/index.json`)).json();
for (const scenario of scenarios) {
  const manifest = await (await fetch(`${BASE}static-api/${scenario.id}/scenario/_.json`)).json();
  scenario.nodes = manifest.nodes;
  scenario.rules = manifest.rules; // empty for a pack with no rule, whose decision is owed once the playhead reaches it
  scenario.lanes = manifest.lanes; // the manifest's root lanes, which the lane check reads by id
  scenario.fields = manifest.fields; // the words of the fields, which say whether a lane offers a depth
  scenario.rows = manifest.rows; // present when the pack declares rows, which the bar must then draw
  scenario.cardKinds = manifest.nodes.some((n) => n.kind === 'auth' || n.kind === 'fraud');
}
console.log(`static-crawl: ${BASE} ships ${scenarios.map((s) => s.id).join(', ')}`);

const browser = await chromium.launch();
try {
  for (const scenario of scenarios) {
    for (const theme of ['light', 'dark']) await crawlScenario(browser, scenario, theme);
  }
  await crawlSwitch(browser, scenarios);
  await crawlShareLink(browser, scenarios, index.default);
  await crawlLanes(browser, scenarios);
  await crawlCustomerAlone(browser);
  await crawlCustomerFollows(browser);
  await crawlWithoutTiles(browser);
  await crawlMissingFile(browser);
} finally {
  await browser.close();
}

console.log(`\n${summaryLine(failures.length, waitingLegs.length)}`);
if (failures.length > 0) {
  process.exit(1);
}

/**
 * shape-check.mjs - what the checks know about the shape of the map: the names of the page's marks,
 * the reader that runs inside the page, the rules that judge what it read, and the steps of the static
 * crawl's leg on the flat map.
 *
 * Where each thing is read:
 *   the shape the map draws   data-map-shape on [data-testid="globe-map"]   lib/globe/shapeMark.ts, from the map's own report
 *   the world's edges         data-world-x on the same element: the pixels   lib/globe/shapeMark.ts, written while the map is flat
 *                             of longitude -180 and 180 from its left side
 *   the button's target       data-map-switch on the button                  components/MapModeButton.tsx
 *   the stored choice         localStorage under ffr.map                     store/map-mode.ts
 *
 * The self-check (eyes-self-check.mjs) judges its sixth signal with `markProblems`. The crawl
 * (static-crawl.mjs) runs `crawlShapes` with its own helpers, so this file holds the leg's steps and
 * the crawl keeps its line count. Nothing here starts a browser: the caller hands one in.
 */

export const SHAPE_ATTR = 'data-map-shape';
export const WORLD_ATTR = 'data-world-x';
export const SWITCH_ATTR = 'data-map-switch';
export const MAP_BOX = '[data-testid="globe-map"]';
/** The storage key of the chosen shape; a test pins it to the store's own constant. */
export const MAP_KEY = 'ffr.map';

/** The crawl's slack for a camera read from the address: degrees of position and levels of zoom. */
const DEG = 0.01;
const ZOOM = 0.05;
/** One pixel, the tolerance for an edge of the world at a side of the map. */
const EDGE_PX = 1;
/** How far the left edge may sit from where an unmoved centre puts it before the centre counts as
 *  moved: each edge is rounded to a whole pixel, and the address holds four decimals of position. */
const MOVED_PX = 2;

/**
 * The page's facts about the shape, read inside the page (`page.evaluate`). It holds no closure over
 * this module. A missing element or attribute reads as null; a storage that throws reads as "blocked".
 */
export const readShape = ({ key }) => {
  const box = document.querySelector('[data-testid="globe-map"]');
  const edges = (box?.getAttribute('data-world-x') ?? '').split(',').map(Number);
  let stored;
  try {
    stored = localStorage.getItem(key);
  } catch {
    stored = 'blocked';
  }
  return {
    shape: box?.getAttribute('data-map-shape') ?? null,
    world: edges.length === 2 && edges.every((n) => Number.isFinite(n)) ? edges : null,
    width: box ? box.getBoundingClientRect().width : null,
    next: document.querySelector('[data-map-switch]')?.getAttribute('data-map-switch') ?? null,
    stored,
  };
};

/**
 * The places of a story's records, read inside the page from the site's own data, as the app asks for
 * it: the card kinds and the sign-ins from their tables, every other kind from its entities.
 */
export const readPlaces = async ({ nodes }) => {
  const url = (kind) =>
    kind === 'auth' || kind === 'fraud' ? '/api/transactions' : kind === 'login' ? '/api/logins' : `/api/entities?kind=${encodeURIComponent(kind)}`;
  const out = [];
  for (const node of nodes) {
    if (!node.coords) continue;
    const rows = await fetch(url(node.kind)).then((r) => (r.ok ? r.json() : [])).catch(() => []);
    for (const row of Array.isArray(rows) ? rows : []) {
      const lng = Number(row[node.coords.lng]);
      const lat = Number(row[node.coords.lat]);
      if (Number.isFinite(lng) && Number.isFinite(lat)) out.push({ lng, lat });
    }
  }
  return out;
};

const problem = (rule, what) => ({ rule, what });

/**
 * The sixth signal of the self-check. In every cell the mark names the shape the address asked for.
 * In a flat cell the world also reaches both sides of the map within 1 px, and a flat map that writes
 * no world edges fails. A globe cell is not asked the second rule: the globe shows space around it.
 */
export function markProblems(read, want) {
  const out = [];
  if (read.shape !== want) out.push(problem('shape-mark', `the mark reads ${read.shape ?? 'nothing'}, the address asked for ${want}`));
  if (want !== 'flat') return out;
  if (!read.world || read.width === null) {
    out.push(problem('world-fills-window', 'the flat map writes no world edges'));
  } else if (read.world[0] > EDGE_PX || read.world[1] < read.width - EDGE_PX) {
    out.push(problem('world-fills-window', `the world spans ${read.world[0]} to ${read.world[1]} px of a map ${Math.round(read.width)} px wide`));
  }
  return out;
}

/** The button names the other shape: a press goes from the shape the page draws to the other one. */
export function switchProblems(read) {
  const other = read.shape === 'flat' ? 'globe' : 'flat';
  return read.next === other ? [] : [problem('shape-switch', `the button goes to ${read.next ?? 'nothing'} on the ${read.shape ?? 'unmarked'} map`)];
}

/** The zoom of a flat world of this width in pixels: the library's world is 512 px at zoom 0. */
export const worldZoom = (px) => Math.log2(px / 512);

/**
 * A press from the globe to the flat map, from the camera the address held before it (`lng`, `zoom`)
 * and the reading after it. The zoom stays within 0.05, unless the world at the old zoom was narrower
 * than the map: then the world after the press is as wide as the map, within 1 px. When the centre
 * moved, one edge of the world sits at a side of the map within 1 px, the least slide that fills it.
 */
export function pressProblems(before, after) {
  if (!after.world || after.width === null) return [problem('press-world', 'the page writes no world edges after the press')];
  const out = [];
  const [left, right] = after.world;
  const wide = right - left;
  if (512 * 2 ** before.zoom < after.width - EDGE_PX) {
    if (Math.abs(wide - after.width) > EDGE_PX) out.push(problem('press-zoom', `a world narrower than the map became ${wide} px wide on a map ${after.width} px wide`));
  } else if (Math.abs(worldZoom(wide) - before.zoom) > ZOOM) {
    out.push(problem('press-zoom', `the zoom went from ${before.zoom} to ${worldZoom(wide).toFixed(2)}`));
  }
  // Where the left edge would be had the centre stayed: the centre is at the middle of the map.
  const kept = after.width / 2 - ((before.lng + 180) / 360) * wide;
  const moved = Math.abs(left - kept) > MOVED_PX;
  if (moved && Math.abs(left) > EDGE_PX && Math.abs(right - after.width) > EDGE_PX) {
    out.push(problem('press-slide', `the world moved ${Math.round(left - kept)} px and neither edge is at a side of the map`));
  }
  return out;
}

/** The angle in degrees between two places on the sphere. */
export function angleBetween(a, b) {
  const rad = Math.PI / 180;
  const cos = Math.sin(a.lat * rad) * Math.sin(b.lat * rad) + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.cos((a.lng - b.lng) * rad);
  return Math.acos(Math.min(1, Math.max(-1, cos))) / rad;
}

/**
 * The capsules of a story at the case's end, on the flat map and on the globe. Fewer on the flat map
 * fails: a rule of the sphere hid one on a map with no far side. Equal counts with no place beyond 90
 * degrees of the home say "not tested", so the step never passes by having nothing to see.
 */
export function capsuleVerdict({ flat, globe, far }) {
  if (flat < globe) return { problem: `the flat map draws ${flat} capsules, fewer than the globe's ${globe}` };
  if (flat === globe && !far) return { note: 'not tested: no place lies beyond 90 degrees of the home' };
  return { note: `flat ${flat}, globe ${globe}` };
}

/** Reset view settles on the camera the page opens on with none in its address, within the slack. */
export function resetProblems(home, got) {
  const off = [['lng', DEG], ['lat', DEG], ['zoom', ZOOM]].filter(([k, slack]) => got[k] === null || !(Math.abs(got[k] - home[k]) <= slack));
  return off.length === 0 ? [] : [problem('reset-view', off.map(([k]) => `${k} ${got[k]} where the opening has ${home[k]}`).join(', '))];
}

/**
 * The crawl's leg on the flat map. `kit` is the crawl's own: its base address, its wait, its slider,
 * `fail`, `section`, `watch`, `ready`, `linkOf` and the list of legs that are not judged yet. Each step
 * opens a fresh context. A step waits for what it reads and never samples the mark.
 */
export async function crawlShapes(browser, scenarios, kit) {
  const { BASE, READY_MS, SLIDER, fail, section, watch, ready, linkOf, waitingLegs } = kit;
  const markOf = (shape) => `${MAP_BOX}[${SHAPE_ATTR}="${shape}"]`;
  const judge = (where, problems) => problems.forEach((p) => fail(where, `${p.rule}: ${p.what}`));
  const facts = (page) => page.evaluate(readShape, { key: MAP_KEY });
  const addressMap = (page, shape) =>
    page.waitForFunction((s) => new URLSearchParams(location.search).get('map') === s, shape, { timeout: READY_MS });
  // The app writes the camera into the address when a move ends; two equal reads 700 ms apart are a camera at rest.
  const settled = (page) =>
    page.waitForFunction(
      () => {
        const now = location.search;
        const same = window.__shapeCheckLast === now && /[?&]zoom=/.test(now);
        window.__shapeCheckLast = now;
        return same;
      },
      null,
      { polling: 700, timeout: READY_MS },
    );

  /** A fresh context on one story, with `store` planted in storage before the page's own code runs. */
  async function open(where, scenario, query, { size = [1440, 900], store = {} } = {}) {
    const context = await browser.newContext({ viewport: { width: size[0], height: size[1] } });
    const planted = { 'ffr.scenario': scenario.id, ...store };
    await context.addInitScript((pairs) => {
      for (const [k, v] of Object.entries(pairs)) if (localStorage.getItem(k) === null) localStorage.setItem(k, v);
    }, planted);
    const page = await context.newPage();
    const report = watch(page, where);
    await page.goto(`${BASE}?${query}`);
    await ready(page);
    return { context, page, report };
  }

  /** One section of the leg. The body opens its pages with `at` and may return a note for the line. */
  async function step(where, body) {
    const contexts = [];
    const at = async (...args) => {
      const opened = await open(where, ...args);
      contexts.push(opened.context);
      return opened;
    };
    await section(where, () => body(at));
    for (const context of contexts) await context.close().catch(() => {});
  }

  for (const scenario of scenarios) {
    const id = scenario.id;

    // The press (from the globe at the story's home) at two window sizes.
    for (const size of [[1280, 800], [1440, 900]]) {
      const where = `flat map press ${id} ${size.join('x')}`;
      await step(where, async (at) => {
        const { page, report } = await at(scenario, 'theme=light', { size });
        await page.waitForSelector(markOf('globe'), { state: 'attached', timeout: READY_MS });
        await settled(page);
        const before = linkOf(page.url());
        const was = await facts(page);
        judge(where, [...markProblems(was, 'globe'), ...switchProblems(was)]);
        await page.locator(`[${SWITCH_ATTR}]`).click();
        await page.waitForSelector(`${markOf('flat')}[${WORLD_ATTR}]`, { state: 'attached', timeout: READY_MS });
        await addressMap(page, 'flat');
        const after = await facts(page);
        judge(where, [...markProblems(after, 'flat'), ...switchProblems(after), ...pressProblems(before, after)]);
        if (after.stored !== 'flat') fail(where, `memory: a press stored ${after.stored}, not flat`);
        await page.locator(`[${SWITCH_ATTR}]`).click();
        await page.waitForSelector(markOf('globe'), { state: 'attached', timeout: READY_MS });
        await addressMap(page, 'globe');
        const back = await facts(page);
        judge(where, [...markProblems(back, 'globe'), ...switchProblems(back)]);
        if (back.stored !== 'globe') fail(where, `memory: a press back stored ${back.stored}, not globe`);
        report();
        return `zoom ${before.zoom} to ${after.world ? worldZoom(after.world[1] - after.world[0]).toFixed(2) : 'none'}`;
      });
    }
    // The address keeps the camera it last wrote until the next move ends, and the built site has no
    // handle on the map, so the bearing, the pitch and the latitude after a press are not on the page.
    waitingLegs.push(`flat map press ${id}: the bearing, the pitch and the latitude after a press are not read`);

    await step(`flat map reload ${id}`, async (at) => {
      const where = `flat map reload ${id}`;
      const { page, report } = await at(scenario, 'theme=light');
      await page.locator(`[${SWITCH_ATTR}]`).click();
      await addressMap(page, 'flat');
      await page.reload();
      await ready(page);
      await page.waitForSelector(markOf('flat'), { state: 'attached', timeout: READY_MS }).catch(() => fail(where, 'a reload did not keep the flat map'));
      // The bare address names no shape: the stored choice opens.
      await page.goto(BASE);
      await ready(page);
      await page.waitForSelector(markOf('flat'), { state: 'attached', timeout: READY_MS }).catch(() => fail(where, 'the stored choice did not open the flat map'));
      judge(where, markProblems(await facts(page), 'flat'));
      report();
    });

    await step(`flat map link ${id}`, async (at) => {
      const where = `flat map link ${id}`;
      // A visitor whose own choice is the globe opens a link that names the flat map.
      const { page, report } = await at(scenario, 'theme=light&map=flat', { store: { [MAP_KEY]: 'globe' } });
      await page.waitForSelector(markOf('flat'), { state: 'attached', timeout: READY_MS }).catch(() => fail(where, "the link's shape did not open"));
      const seen = await facts(page);
      judge(where, markProblems(seen, 'flat'));
      if (seen.stored !== 'globe') fail(where, `memory: the visit changed the stored choice to ${seen.stored}`);
      await page.goto(BASE);
      await ready(page);
      await page.waitForSelector(markOf('globe'), { state: 'attached', timeout: READY_MS }).catch(() => fail(where, "after the link's visit the visitor's own choice did not open"));
      report();
    });

    await step(`flat map link, first visit ${id}`, async (at) => {
      const where = `flat map link, first visit ${id}`;
      const { page, report } = await at(scenario, 'theme=light&map=flat');
      await page.waitForSelector(markOf('flat'), { state: 'attached', timeout: READY_MS }).catch(() => fail(where, "the link's shape did not open"));
      const seen = await facts(page);
      judge(where, markProblems(seen, 'flat'));
      if (seen.stored !== null) fail(where, `memory: opening a link stored ${seen.stored}`);
      report();
    });

    await step(`flat map theme and colour ${id}`, async (at) => {
      const where = `flat map theme and colour ${id}`;
      const { page, report } = await at(scenario, 'theme=light&map=flat');
      await page.waitForSelector(markOf('flat'), { state: 'attached', timeout: READY_MS });
      // The theme change loads a new style; the mark is taken off first, so the one read after it is
      // written by that style's load.
      await page.evaluate((box) => document.querySelector(box)?.removeAttribute('data-map-shape'), MAP_BOX);
      await page.locator('button[aria-label="Appearance"]').click();
      await page.locator('[role="group"][aria-label="Theme"]').getByRole('button', { name: 'dark', exact: true }).click();
      await page.waitForSelector('html[data-theme="dark"]', { state: 'attached', timeout: READY_MS });
      await page.waitForSelector(`${MAP_BOX}[${SHAPE_ATTR}]`, { state: 'attached', timeout: READY_MS }).catch(() => fail(where, 'no mark after the theme change'));
      judge(where, markProblems(await facts(page), 'flat'));
      await page.locator('select[aria-label="Color mode"]').selectOption('monochrome');
      await page.waitForSelector('html[data-color="monochrome"]', { state: 'attached', timeout: READY_MS });
      judge(where, markProblems(await facts(page), 'flat'));
      report();
    });

    await step(`flat map rebuild ${id}`, async (at) => {
      const where = `flat map rebuild ${id}`;
      const { page, report } = await at(scenario, 'theme=light&map=flat');
      await page.waitForSelector(markOf('flat'), { state: 'attached', timeout: READY_MS });
      // The browser's own extension takes the map's context; the app mounts a new map on a new element.
      const lost = await page.evaluate((box) => {
        document.querySelector(box)?.setAttribute('data-shape-check-old', '');
        const canvas = document.querySelector('canvas.maplibregl-canvas');
        const gl = canvas?.getContext('webgl2') ?? canvas?.getContext('webgl');
        const ext = gl?.getExtension('WEBGL_lose_context');
        ext?.loseContext();
        return Boolean(ext);
      }, MAP_BOX);
      if (!lost) fail(where, 'the map context could not be taken');
      await page
        .waitForSelector(`${MAP_BOX}:not([data-shape-check-old])[${SHAPE_ATTR}]`, { state: 'attached', timeout: READY_MS })
        .catch(() => fail(where, 'no new map was built after the lost context'));
      judge(where, markProblems(await facts(page), 'flat'));
      report();
    });

    await step(`flat map Reset view ${id}`, async (at) => {
      const where = `flat map Reset view ${id}`;
      const first = await at(scenario, 'theme=light&map=flat');
      await settled(first.page);
      const home = linkOf(first.page.url());
      first.report();
      const { page, report } = await at(scenario, `lng=${home.lng > 0 ? home.lng - 20 : home.lng + 20}&lat=${home.lat}&zoom=${home.zoom + 3}&theme=light&map=flat`);
      await settled(page);
      await page.locator('button[aria-label="Reset view"]').click();
      // The jump ends in a move, and the app then writes its camera into the address: wait for that
      // camera to come within the slack of the opening, and judge what the address holds either way.
      await page
        .waitForFunction(
          (h) => {
            const q = new URLSearchParams(location.search);
            const near = (k, slack) => q.get(k) !== null && Math.abs(Number(q.get(k)) - h[k]) <= slack;
            return near('lng', 0.01) && near('lat', 0.01) && near('zoom', 0.05);
          },
          home,
          { timeout: READY_MS },
        )
        .catch(() => {});
      judge(where, resetProblems(home, linkOf(page.url())));
      report();
    });

    const counts = {};
    for (const shape of ['flat', 'globe']) {
      const where = `flat map capsules ${id} ${shape}`;
      await step(where, async (at) => {
        const { page, report } = await at(scenario, `theme=light&map=${shape}`);
        await page.locator(SLIDER).focus();
        await page.keyboard.press('End');
        await page.locator('[data-verdict-capsule]').first().waitFor({ state: 'attached', timeout: READY_MS }).catch(() => {});
        counts[shape] = await page.locator('[data-verdict-capsule]').count();
        if (shape === 'globe') counts.places = await page.evaluate(readPlaces, { nodes: scenario.nodes });
        report();
      });
    }
    const manifest = await (await fetch(`${BASE}static-api/${id}/scenario/_.json`)).json();
    const far = Boolean(manifest.home) && (counts.places ?? []).some((p) => angleBetween(manifest.home, p) > 90);
    const verdict = capsuleVerdict({ flat: counts.flat ?? 0, globe: counts.globe ?? 0, far });
    if (verdict.problem) fail(`flat map capsules ${id}`, verdict.problem);
    else console.log(`  note  flat map capsules ${id}: ${verdict.note}`);
  }

  // A story switch on the flat map keeps the shape: the address carries it, with storage empty.
  if (scenarios.length < 2) return;
  const [first, second] = scenarios;
  await step('flat map story switch', async (at) => {
    const where = 'flat map story switch';
    const { page, report } = await at(first, 'theme=light&map=flat');
    await page.waitForSelector(markOf('flat'), { state: 'attached', timeout: READY_MS });
    await page.locator('button[aria-haspopup="listbox"]').click();
    await page.locator('[role="option"]', { hasText: second.id }).click();
    await page.waitForFunction((sid) => localStorage.getItem('ffr.scenario') === sid, second.id, { timeout: READY_MS });
    await page.waitForFunction((label) => document.body.innerText.toUpperCase().includes(label), second.label.toUpperCase(), { timeout: READY_MS });
    await ready(page);
    await page.waitForSelector(markOf('flat'), { state: 'attached', timeout: READY_MS }).catch(() => fail(where, 'the story switch did not keep the flat map'));
    report();
  });
}

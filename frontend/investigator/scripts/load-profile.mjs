#!/usr/bin/env node
/**
 * load-profile.mjs - what a cold first open of the static site asks the network for,
 * and when.
 *
 * For two opening views (the globe, and a street-level city view) it measures, in
 * milliseconds from navigation start and with an empty browser cache (after one
 * throwaway load that warms the local server):
 *   - when the bundled world layer has painted (the app sets the performance mark
 *     "ffr:world-painted" once oceans, borders and names are all in and the layer is
 *     shown; the city view opens above the layer's top zoom, so it has no such time);
 *   - when the first answer from the map tile host arrives;
 *   - when the first tile request that is kept (not aborted) leaves;
 *   - how many tile requests are aborted;
 *   - how many requests go to the tile host for files the site serves itself (the
 *     style, the sprite sheet, the bundled glyph ranges);
 *   - how many other glyph ranges the tile host is asked for (reported only: labels in
 *     scripts the site does not bundle);
 *   - when the network goes quiet (reported only: it depends on the tile host).
 *
 * It does NOT start a server. Build and serve the static site as for static-crawl.mjs,
 * then:
 *
 *   node frontend/investigator/scripts/load-profile.mjs "http://[::1]:4173/site/"
 *   node frontend/investigator/scripts/load-profile.mjs "http://[::1]:4173/site/" --assert
 *   node frontend/investigator/scripts/load-profile.mjs --self-check
 *
 * --assert exits 1 unless every view meets BARS. --json prints one JSON line per view.
 * --self-check tests the URL classifier and the bar check without a browser.
 */
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const TILE_HOST = 'tiles.openfreemap.org';
export const WORLD_MARK = 'ffr:world-painted';

/** The glyph files the site serves itself: public/basemap/fonts/<font>/<range>.pbf. */
export const BUNDLED_FONTS = ['Noto Sans Regular', 'Noto Sans Bold', 'Noto Sans Italic'];
export const BUNDLED_RANGES = ['0-255', '256-511', '512-767', '8192-8447'];

/** The bars a cold open must meet. Times are milliseconds from navigation start. */
export const BARS = {
  worldPaintedMs: 1500,
  firstKeptTileRequestMs: 1500,
  abortedTileRequests: 5,
  bundledRequestsToTileHost: 0,
};

export const VIEWS = [
  { name: 'globe', query: 'theme=light', worldLayer: true },
  // Street level sits above the world layer's top zoom: that layer is not drawn, so it has no bar here.
  { name: 'city', query: 'theme=light&lng=-95.3698&lat=29.7604&zoom=14&pitch=55&bearing=18', worldLayer: false },
];

/** What a request to the tile host is for; null for any other host. */
export function classify(url) {
  const u = new URL(url);
  if (u.host !== TILE_HOST) return null;
  const p = u.pathname;
  if (p.startsWith('/styles/')) return 'style';
  if (p.startsWith('/sprites/')) return 'sprite';
  if (p.startsWith('/fonts/')) {
    const [font, file = ''] = decodeURIComponent(p.slice('/fonts/'.length)).split('/');
    const bundled = BUNDLED_FONTS.includes(font) && BUNDLED_RANGES.includes(file.replace(/\.pbf$/, ''));
    return bundled ? 'glyphs-bundled' : 'glyphs-other';
  }
  if (/\.(pbf|png|jpe?g|webp)$/.test(p)) return 'tile';
  return 'index';
}

/** True for a request the site could have answered itself. */
const isBundled = (kind) => kind === 'style' || kind === 'sprite' || kind === 'glyphs-bundled';

/** The list of bars a measurement misses; empty when it meets them all. */
export function misses(m) {
  const out = [];
  if (!m.worldLayerExpected) {
    // No bar: the view opens above the zoom at which the world layer draws.
  } else if (m.worldPaintedAt === null) out.push('no world layer painted (no performance mark)');
  else {
    if (m.worldPaintedAt > BARS.worldPaintedMs) out.push(`world painted at ${m.worldPaintedAt} ms, bar ${BARS.worldPaintedMs}`);
    if (m.firstTileHostAnswerAt !== null && m.worldPaintedAt >= m.firstTileHostAnswerAt) {
      out.push(`world painted at ${m.worldPaintedAt} ms, after the tile host's first answer at ${m.firstTileHostAnswerAt} ms`);
    }
  }
  if (m.firstKeptTileRequestAt === null) out.push('no tile request was kept');
  else if (m.firstKeptTileRequestAt > BARS.firstKeptTileRequestMs) {
    out.push(`first kept tile request left at ${m.firstKeptTileRequestAt} ms, bar ${BARS.firstKeptTileRequestMs}`);
  }
  if (m.abortedTileRequests > BARS.abortedTileRequests) out.push(`${m.abortedTileRequests} tile requests aborted, bar ${BARS.abortedTileRequests}`);
  if (m.bundledRequestsToTileHost > BARS.bundledRequestsToTileHost) {
    out.push(`${m.bundledRequestsToTileHost} requests for the style, the sprites or a bundled glyph range went to the tile host, bar ${BARS.bundledRequestsToTileHost}`);
  }
  return out;
}

async function measure(chromium, base, view) {
  const browser = await chromium.launch();
  try {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await context.newPage();
    const started = new Map();
    const finished = [];
    let aborted = 0;
    let bundledToTileHost = 0;
    let otherGlyphRanges = 0;
    let total = 0;
    page.on('request', (r) => {
      total += 1;
      const kind = classify(r.url());
      if (kind === null) return;
      started.set(r, { kind, at: Date.now() });
      if (isBundled(kind)) bundledToTileHost += 1;
      if (kind === 'glyphs-other') otherGlyphRanges += 1;
    });
    page.on('requestfinished', (r) => {
      const s = started.get(r);
      if (s) finished.push({ ...s, end: Date.now() });
    });
    page.on('requestfailed', (r) => {
      const s = started.get(r);
      if (s && s.kind === 'tile' && /ERR_ABORTED/.test(r.failure()?.errorText ?? '')) aborted += 1;
    });

    await page.goto(`${base}?${view.query}`);
    await page.waitForSelector('canvas.maplibregl-canvas', { timeout: 60000 });
    await page.waitForLoadState('networkidle', { timeout: 120000 }).catch(() => {});
    const origin = await page.evaluate(() => performance.timeOrigin);
    const quietAt = Math.round(Date.now() - origin);
    const mark = await page.evaluate((name) => performance.getEntriesByName(name)[0]?.startTime ?? null, WORLD_MARK);

    const since = (t) => Math.round(t - origin);
    const keptTiles = finished.filter((f) => f.kind === 'tile');
    return {
      view: view.name,
      worldLayerExpected: view.worldLayer,
      worldPaintedAt: mark === null ? null : Math.round(mark),
      firstTileHostAnswerAt: finished.length ? since(Math.min(...finished.map((f) => f.end))) : null,
      firstKeptTileRequestAt: keptTiles.length ? since(Math.min(...keptTiles.map((f) => f.at))) : null,
      abortedTileRequests: aborted,
      bundledRequestsToTileHost: bundledToTileHost,
      otherGlyphRangesFromTileHost: otherGlyphRanges,
      networkQuietAt: quietAt,
      requests: total,
    };
  } finally {
    await browser.close();
  }
}

function selfCheck() {
  assert.equal(classify('https://tiles.openfreemap.org/styles/liberty'), 'style');
  assert.equal(classify('https://tiles.openfreemap.org/sprites/ofm_f384/ofm@2x.png'), 'sprite');
  assert.equal(classify('https://tiles.openfreemap.org/fonts/Noto%20Sans%20Regular/0-255.pbf'), 'glyphs-bundled');
  assert.equal(classify('https://tiles.openfreemap.org/fonts/Noto Sans Bold/8192-8447.pbf'), 'glyphs-bundled');
  assert.equal(classify('https://tiles.openfreemap.org/fonts/Noto%20Sans%20Regular/1536-1791.pbf'), 'glyphs-other');
  assert.equal(classify('https://tiles.openfreemap.org/fonts/Noto%20Sans%20Regular,Noto%20Sans%20Bold/0-255.pbf'), 'glyphs-other');
  // The lists above must match the files the site ships.
  const fonts = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'basemap', 'fonts');
  for (const font of BUNDLED_FONTS) {
    for (const range of BUNDLED_RANGES) assert.ok(existsSync(resolve(fonts, font, `${range}.pbf`)), `${font}/${range}.pbf is not in public/basemap/fonts`);
  }
  assert.equal(classify('https://tiles.openfreemap.org/planet/20261101_080013_pt/4/1/5.pbf'), 'tile');
  assert.equal(classify('https://tiles.openfreemap.org/natural_earth/ne2sr/3/1/2.png'), 'tile');
  assert.equal(classify('https://tiles.openfreemap.org/planet'), 'index');
  assert.equal(classify('http://[::1]:4173/site/basemap/fonts/Noto%20Sans%20Regular/0-255.pbf'), null);
  const good = {
    worldLayerExpected: true, worldPaintedAt: 400, firstTileHostAnswerAt: 900, firstKeptTileRequestAt: 700,
    abortedTileRequests: 0, bundledRequestsToTileHost: 0,
  };
  assert.deepEqual(misses(good), []);
  assert.equal(misses({ ...good, worldPaintedAt: null }).length, 1);
  assert.deepEqual(misses({ ...good, worldLayerExpected: false, worldPaintedAt: null }), []); // no bar above its top zoom
  assert.equal(misses({ ...good, worldLayerExpected: false, firstKeptTileRequestAt: 4700 }).length, 1);
  assert.equal(misses({ ...good, worldPaintedAt: 950 }).length, 1); // after the tile host's first answer
  assert.equal(misses({ ...good, worldPaintedAt: 1600, firstTileHostAnswerAt: 2000 }).length, 1);
  assert.equal(misses({ ...good, firstKeptTileRequestAt: 4700 }).length, 1);
  assert.equal(misses({ ...good, firstKeptTileRequestAt: null }).length, 1);
  assert.equal(misses({ ...good, abortedTileRequests: 6 }).length, 1);
  assert.equal(misses({ ...good, bundledRequestsToTileHost: 1 }).length, 1);
  console.log('load-profile: self-check passed');
}

async function main() {
  const args = process.argv.slice(2);
  if (args.includes('--self-check')) return selfCheck();
  const base = args.find((a) => !a.startsWith('--'));
  if (!base || !base.endsWith('/')) {
    console.error('usage: load-profile.mjs <base url ending in /> [--assert] [--json] | --self-check');
    process.exit(1);
  }
  const { chromium } = await import('playwright');
  // One throwaway load first: the first hit on a cold local server is slow, and that is the
  // server's cost, not the app's. Every measured run still starts with an empty browser cache.
  await measure(chromium, base, VIEWS[0]);
  let failed = false;
  for (const view of VIEWS) {
    const m = await measure(chromium, base, view);
    if (args.includes('--json')) console.log(JSON.stringify(m));
    else {
      console.log(
        `${m.view.padEnd(6)} world painted: ${m.worldLayerExpected ? `${m.worldPaintedAt ?? 'none'} ms` : 'not drawn at this zoom'}` +
          ` | tile host's first answer: ${m.firstTileHostAnswerAt ?? 'none'} ms` +
          ` | first kept tile request: ${m.firstKeptTileRequestAt ?? 'none'} ms | aborted tile requests: ${m.abortedTileRequests}` +
          ` | style, sprite and bundled glyph requests to the tile host: ${m.bundledRequestsToTileHost}` +
          ` | other glyph ranges from the tile host: ${m.otherGlyphRangesFromTileHost}` +
          ` | network quiet: ${m.networkQuietAt} ms | requests: ${m.requests}`,
      );
    }
    const missed = misses(m);
    for (const line of missed) console.log(`  ${args.includes('--assert') ? 'FAIL' : 'miss'}  ${m.view}: ${line}`);
    if (missed.length) failed = true;
  }
  if (args.includes('--assert') && failed) process.exit(1);
}

main().catch((e) => {
  console.error(`load-profile: ${e.message.split('\n')[0]}`);
  process.exit(1);
});

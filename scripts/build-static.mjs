#!/usr/bin/env node
/**
 * build-static.mjs - build the static site under site/.
 *
 *   node scripts/build-static.mjs [--scenarios <ids, comma separated>] [--default card-fraud]
 *
 * With no --scenarios the build holds eight, in this order: card-fraud, priya-ato, platform-access,
 * key-many-networks, agent-runs-shared-key, seats-two-networks, volume-step, seat-failed-signins.
 * The first one listed is the default unless --default names another.
 *
 * Layout written:
 *   site/              the investigator app
 *   site/customer/     the customer app
 *   site/static-api/   every response the apps request (backend/export_static.py)
 *
 * Both apps are built with VITE_STATIC=1 and a relative base, so the folder works from
 * any static host and under any sub-path. No server is started. Node built-ins only.
 * Needs backend/.venv and both frontends' node_modules (see the README).
 */
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SITE = join(ROOT, "site");
const BACKEND = join(ROOT, "backend");

function option(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}
const scenarios = option(
  "scenarios",
  [
    "card-fraud",
    "priya-ato",
    "platform-access",
    "key-many-networks",
    "agent-runs-shared-key",
    "seats-two-networks",
    "volume-step",
    "seat-failed-signins",
  ].join(","),
);
const defaultId = option("default", scenarios.split(",")[0]);

function fail(message) {
  console.error(`build-static: ${message}`);
  process.exit(1);
}

function run(label, command, args, cwd, env = process.env) {
  console.log(`\n=== ${label} ===`);
  const result = spawnSync(command, args, { cwd, env, stdio: "inherit" });
  if (result.status !== 0) fail(`${label} failed (exit ${result.status ?? "signal"})`);
}

/** Type-check and build one app straight into its place under site/. Vite empties the
 *  target itself; nothing here deletes anything. */
function buildApp(name, outDir) {
  const app = join(ROOT, "frontend", name);
  const bin = (...parts) => join(app, "node_modules", ...parts);
  if (!existsSync(bin("vite", "bin", "vite.js"))) fail(`frontend/${name} has no node_modules; run npm ci there`);
  const env = { ...process.env, VITE_STATIC: "1", VITE_BASE: "./" };
  run(`${name}: type check`, process.execPath, [bin("typescript", "bin", "tsc"), "-b"], app, env);
  run(
    `${name}: build`,
    process.execPath,
    [bin("vite", "bin", "vite.js"), "build", "--outDir", outDir, "--emptyOutDir"],
    app,
    env,
  );
}

const python = [
  join(BACKEND, ".venv", "Scripts", "python.exe"),
  join(BACKEND, ".venv", "bin", "python"),
].find(existsSync);
if (!python) fail("backend/.venv not found; create it and install backend/requirements.txt");

// Order matters: the investigator build empties site/, so it goes first.
buildApp("investigator", SITE);
buildApp("customer", join(SITE, "customer"));
run(
  "export",
  python,
  ["-m", "export_static", "--out", join(SITE, "static-api"), "--scenarios", scenarios, "--default", defaultId],
  BACKEND,
);

// A relative base must leave no root-absolute reference behind, or a sub-path host breaks.
for (const page of [join(SITE, "index.html"), join(SITE, "customer", "index.html")]) {
  if (!existsSync(page)) fail(`${page} was not written`);
  const absolute = readFileSync(page, "utf8").match(/(?:src|href)="\/[^"]*"/g);
  if (absolute) fail(`${page} still has root-absolute references: ${absolute.join(", ")}`);
}

// The basemap's own files (src/lib/globe/basemap.ts) and the world layer's data must ship.
const FONTS = ["Noto Sans Regular", "Noto Sans Bold", "Noto Sans Italic"];
const RANGES = ["0-255", "256-511", "512-767", "8192-8447"];
const required = [
  ...["ofm", "ofm@2x"].flatMap((n) => [`basemap/sprites/${n}.json`, `basemap/sprites/${n}.png`]),
  ...FONTS.flatMap((f) => RANGES.map((r) => `basemap/fonts/${f}/${r}.pbf`)),
  "data/world/world.json",
];
const missing = required.filter((p) => !existsSync(join(SITE, p)));
if (missing.length) fail(`site/ is missing basemap files: ${missing.join(", ")}`);

function measure(dir) {
  let files = 0;
  let bytes = 0;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      const inner = measure(path);
      files += inner.files;
      bytes += inner.bytes;
    } else {
      files += 1;
      bytes += statSync(path).size;
    }
  }
  return { files, bytes };
}

const total = measure(SITE);
console.log(`\nsite/: ${total.files} files, ${(total.bytes / 1048576).toFixed(1)} MB`);
console.log("Serve the folder that holds site/ and open /site/ (the trailing slash matters).");

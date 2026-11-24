/**
 * The crawl's request watch (scripts/static-crawl.mjs, watch()) counts a request to this site's own
 * host that the browser aborted apart from the failures. The crawl reloads and closes pages many times,
 * and a glyph request still in flight at a reload is aborted by the browser: that is the crawl's own
 * move, not a hole in the site.
 * Every other failure of an own-host request stays a problem, and a missing file stays a problem
 * through the response handler's HTTP status.
 *
 * The crawl needs a served site and is run separately. These tests read code lines only (the
 * crawl's header and comments name the same words) and run the watch() function from its own source
 * against a fake page, so no browser and no server is used.
 */
import { describe, expect, it, vi } from "vitest";
import crawlSource from "../../scripts/static-crawl.mjs?raw";

const ORIGIN = "http://[::1]:4173";
const code = (text: string) => text.split("\n").filter((l) => !/^\s*(\/\/|\/\*|\*)/.test(l));
const between = (from: string, to: string) => crawlSource.slice(crawlSource.indexOf(from), crawlSource.indexOf(to));
const failedHandler = () => between("page.on('requestfailed'", "page.on('response'");
const watchSource = () => between("function watch(", "async function ready(");

type Handler = (arg: unknown) => void;

/** Build watch() from the crawl's own text and drive it with a fake page; returns what it reported. */
function run(events: { name: string; arg: unknown }[]) {
  const failures: string[] = [];
  const handlers: Record<string, Handler> = {};
  const page = { on: (name: string, fn: Handler) => (handlers[name] = fn) };
  const build = new Function("ORIGIN", "TILE_HOST", "fail", `${watchSource()}\nreturn watch;`);
  const watch = build(ORIGIN, "tiles.example.test", (where: string, what: string) => failures.push(`${where}: ${what}`));
  const log = vi.spyOn(console, "log").mockImplementation(() => {});
  const report = watch(page, "section");
  for (const e of events) handlers[e.name](e.arg);
  report();
  const printed = log.mock.calls.map((c) => String(c[0]));
  log.mockRestore();
  return { failures, printed };
}

const failed = (url: string, errorText: string | null) => ({
  name: "requestfailed",
  arg: { url: () => url, failure: () => (errorText === null ? null : { errorText }) },
});
const responded = (url: string, status: number) => ({ name: "response", arg: { url: () => url, status: () => status } });
const font = `${ORIGIN}/site/basemap/fonts/Noto%20Sans%20Bold/0-255.pbf`;

describe("the crawl's request watch, read as code", () => {
  it("branches on the failure's errorText for an own-host request, after the third-party branch", () => {
    const handler = code(failedHandler());
    const external = handler.findIndex((l) => /externalAborts \+= 1/.test(l));
    const own = handler.findIndex((l) => /\bownAborts \+= 1/.test(l));
    const push = handler.findIndex((l) => /problems\.push\(`request failed:/.test(l));
    expect(external).toBeGreaterThan(-1);
    expect(own).toBeGreaterThan(external);
    expect(push).toBeGreaterThan(own);
    expect(handler.filter((l) => /ERR_ABORTED/.test(l)).length).toBeGreaterThan(0);
  });

  it("still pushes an own-host failure that is not an abort as a problem, and names its reason", () => {
    const handler = code(failedHandler());
    expect(handler.some((l) => /problems\.push\(`request failed: \$\{r\.url\(\)\} \(\$\{errorText/.test(l))).toBe(true);
  });

  it("keeps the response handler's rule: an own-host status of 400 or more is a problem", () => {
    const response = code(between("page.on('response'", "return () => {"));
    expect(response.some((l) => /if \(!external\(r\.url\(\)\) && r\.status\(\) >= 400\) problems\.push\(`HTTP \$\{r\.status\(\)\}: \$\{r\.url\(\)\}`\);/.test(l))).toBe(true);
  });

  it("prints the count of own-host aborts when there are any", () => {
    expect(code(watchSource()).some((l) => /console\.log\(.*ownAborts/.test(l))).toBe(true);
  });
});

describe("the crawl's request watch, run against a fake page", () => {
  it("does not fail the site for an own-host request the browser aborted, and prints the count", () => {
    const { failures, printed } = run([failed(font, "net::ERR_ABORTED"), failed(`${ORIGIN}/site/x.js`, "net::ERR_ABORTED")]);
    expect(failures).toEqual([]);
    expect(printed.some((l) => /section/.test(l) && /\b2\b/.test(l))).toBe(true);
  });

  it("prints no abort line when nothing was aborted", () => {
    expect(run([]).printed).toEqual([]);
  });

  it.each(["net::ERR_CONNECTION_REFUSED", "net::ERR_CONNECTION_RESET", "net::ERR_TIMED_OUT", "net::ERR_NAME_NOT_RESOLVED"])(
    "still fails an own-host request that failed with %s",
    (errorText) => {
      const { failures } = run([failed(font, errorText)]);
      expect(failures).toHaveLength(1);
      expect(failures[0]).toContain(`request failed: ${font}`);
      expect(failures[0]).toContain(errorText);
    },
  );

  it("still fails an own-host request that failed with no reason given", () => {
    const { failures } = run([failed(font, null)]);
    expect(failures).toHaveLength(1);
    expect(failures[0]).toContain(`request failed: ${font}`);
  });

  it("still fails a missing file through the response status, and passes a found one", () => {
    expect(run([responded(font, 404)]).failures).toEqual([`section: HTTP 404: ${font}`]);
    expect(run([responded(font, 500)]).failures).toHaveLength(1);
    expect(run([responded(font, 200)]).failures).toEqual([]);
  });

  it("does not count a third-party failure as the site's", () => {
    expect(run([failed("https://tiles.example.test/a/1/2/3.pbf", "net::ERR_ABORTED")]).failures).toEqual([]);
  });
});

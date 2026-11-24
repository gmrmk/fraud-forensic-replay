/**
 * The crawl's check that the customer app follows the investigator.
 * The check once waited for the alert before it pressed any key, which assumed a story opens at its end. A story that
 * opens on its case's record has the playhead earlier, where the customer page prints a singular alert or none, so the
 * order is: the customer page is waited for by its own label, End is pressed, and only then is the alert waited for.
 * The crawl itself needs a served site and is run separately; these pins read code lines only.
 */
import { describe, expect, it } from "vitest";
import crawlSource from "../../scripts/static-crawl.mjs?raw";
import { codeOf } from "./code-text";

const body = (from: string, to: string) => codeOf(crawlSource.slice(crawlSource.indexOf(from), crawlSource.indexOf(to)));
const follows = body("async function crawlCustomerFollows", "async function crawlWithoutTiles");
const at = (needle: string, from = 0) => follows.indexOf(needle, from);

describe("the customer check's order", () => {
  it("waits for the customer page by its own label before it presses any key", () => {
    const label = at("Synthetic data. Fictional people and merchants.");
    expect(label).toBeGreaterThan(-1);
    expect(label).toBeLessThan(at("press('End')"));
  });

  it("waits for no alert before the first End", () => {
    const firstEnd = at("press('End')");
    expect(firstEnd).toBeGreaterThan(-1);
    expect(follows.slice(0, firstEnd)).not.toContain("ALERT_TEXT");
  });

  it("then waits for the alert with the page's own ready time", () => {
    const firstEnd = at("press('End')");
    expect(follows.slice(firstEnd)).toMatch(/getByText\(ALERT_TEXT\)\.waitFor\(\{ timeout: READY_MS \}\)/);
  });

  it("goes Home and waits for no alert, then End and the alert again", () => {
    const firstEnd = at("press('End')");
    const home = at("press('Home')", firstEnd);
    expect(home).toBeGreaterThan(firstEnd);
    const absent = at("!document.body.innerText.includes('We spotted')", home);
    expect(absent).toBeGreaterThan(home);
    const secondEnd = at("press('End')", home);
    expect(secondEnd).toBeGreaterThan(absent);
    expect(follows.slice(secondEnd)).toMatch(/getByText\(ALERT_TEXT\)\.waitFor\(\{ timeout: 10000 \}\)/);
  });

  it("keeps the alert's pattern the strict plural form", () => {
    const line = crawlSource.split("\n").find((l) => l.startsWith("const ALERT_TEXT"));
    expect(line?.trimEnd()).toBe("const ALERT_TEXT = /We spotted \\d+ unusual charges/;");
  });
});

// frontend/investigator/src/theme/readout-colour.source.test.ts
//
// Pins the two call sites by their source, so a later edit that changes
// either colour turns this red. The elements are found by anchor, not by a line number.
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const here = dirname(fileURLToPath(import.meta.url));
const read = (rel: string) => readFileSync(resolve(here, rel), "utf8");

describe("readout colour call sites", () => {
  it("the clock readout span takes --r1-readout and not text-accent", () => {
    const source = read("../components/Timeline.tsx");
    const anchor = source.indexOf("{span > 0 ? formatDelta(");
    expect(anchor, "the formatDelta anchor in Timeline.tsx").toBeGreaterThan(-1);
    const open = source.lastIndexOf("<span", anchor);
    const tag = source.slice(open, anchor);
    expect(tag).toContain("--r1-readout");
    expect(tag).not.toContain("text-accent");
  });

  it("the FFR mark takes var(--r1-on-panel)", () => {
    const source = read("../App.tsx");
    // Tempered pattern: the attributes of one span, never crossing into another span.
    const m = /<span\b((?:(?!<span)[\s\S])*?)>\s*FFR\s*<\/span>/.exec(source);
    expect(m, "the span that holds FFR in App.tsx").not.toBeNull();
    const color = /color:\s*"([^"]+)"/.exec((m as RegExpExecArray)[1]);
    expect(color, "an inline color on the FFR span").not.toBeNull();
    expect((color as RegExpExecArray)[1]).toBe("var(--r1-on-panel)");
  });
});

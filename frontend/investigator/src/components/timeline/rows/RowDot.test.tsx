/**
 * A row's dot: the track's own node, drawn again on its row. A copy is out of the Tab order and out
 * of the screen reader's list, and carries the same words as its original.
 */
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { fireEvent, render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { RowTick } from "../../../lib/row-ticks";
import { RowDot } from "./RowDot";

const T = Date.parse("2026-06-08T17:00:00-05:00");
const tick = (extra: Partial<RowTick> = {}): RowTick => ({
  id: "e1",
  kind: "stop",
  label: "Alpha",
  secondary: "Second line",
  facts: [],
  t: T,
  session: null,
  challengeVar: null,
  newDevice: false,
  blocked: false,
  ...extra,
});

function dot(props: { mirror: boolean; tick?: RowTick; form?: "12h" | "24h"; selectedSessionId?: string | null; onActivate?: (id: string) => void }) {
  return (
    <div style={{ position: "relative" }}>
      <RowDot
        tick={props.tick ?? tick()}
        left={40}
        prominence={0.5}
        mirror={props.mirror}
        paint={(k, a) => `rgb(var(--${k}-rgb) / ${a ?? 1})`}
        onPanel={(k) => `var(--${k}-on-panel)`}
        kindFor={(k) => k}
        kindLabel={(k) => (k === "stop" ? "Stop" : k)}
        selectedSessionId={props.selectedSessionId ?? null}
        form={props.form ?? "12h"}
        onActivate={props.onActivate ?? (() => {})}
      />
    </div>
  );
}

describe("RowDot", () => {
  it("is an original that a keyboard reaches: a named button in the Tab order", () => {
    const { container } = render(dot({ mirror: false }));
    const button = container.querySelector("button[data-row-dot]") as HTMLButtonElement;
    expect(button.getAttribute("aria-label")).toBe("Jump to Stop: Alpha · Mon Jun 8 · 5:00p");
    expect(button.getAttribute("aria-hidden")).toBeNull();
    expect(button.hasAttribute("tabindex")).toBe(false);
  });

  it("is a copy that is tabindex -1 and aria-hidden, with no name of its own", () => {
    const { container } = render(dot({ mirror: true }));
    const button = container.querySelector("button[data-row-dot]") as HTMLButtonElement;
    expect(button.getAttribute("tabindex")).toBe("-1");
    expect(button.getAttribute("aria-hidden")).toBe("true");
    expect(button.getAttribute("aria-label")).toBeNull();
  });

  // C0: the dot carries its record's own kind, an original and a copy alike, so a reader of the page
  // can tell a decision's dot from another.
  it("carries its record's kind, as the record has it", () => {
    for (const mirror of [false, true]) {
      const { container } = render(dot({ mirror, tick: tick({ kind: "ruling" }) }));
      expect(container.querySelector("button[data-row-dot]")?.getAttribute("data-node-kind")).toBe("ruling");
    }
  });

  it("gives a copy the same words as its original, so the original is found by them", () => {
    const a = render(dot({ mirror: false })).container.querySelector("button[data-row-dot]") as HTMLElement;
    const b = render(dot({ mirror: true })).container.querySelector("button[data-row-dot]") as HTMLElement;
    expect(b.getAttribute("data-tip")).toBe(a.getAttribute("data-tip"));
    expect(b.getAttribute("data-tip-node")).toBe(a.getAttribute("data-tip-node"));
    expect(a.getAttribute("data-tip")?.split("\n")).toEqual(["Stop", "Alpha", "Second line", "Mon Jun 8 · 5:00p"]);
  });

  it("writes the time in the clock's form, in the words and in the name", () => {
    const { container } = render(dot({ mirror: false, form: "24h" }));
    const button = container.querySelector("button[data-row-dot]") as HTMLElement;
    expect(button.getAttribute("data-tip")).toContain("Mon Jun 8 · 17:00");
    expect(button.getAttribute("aria-label")).toContain("17:00");
  });

  it("keeps a ring word out of the name and puts the field line in the words", () => {
    const { container } = render(dot({ mirror: false, tick: tick({ newDevice: true, facts: ["Device trust: new"] }) }));
    const button = container.querySelector("button[data-row-dot]") as HTMLElement;
    expect(button.getAttribute("aria-label")).not.toMatch(/new device|challenge|blocked/i);
    expect(button.getAttribute("data-tip")).toContain("Device trust: new");
  });

  it("presses through to the record and does not press the plot under it", () => {
    const onActivate = vi.fn();
    const plotDown = vi.fn();
    const { container } = render(
      <div onMouseDown={plotDown}>{dot({ mirror: true, onActivate })}</div>,
    );
    const button = container.querySelector("button[data-row-dot]") as HTMLElement;
    fireEvent.mouseDown(button);
    fireEvent.click(button);
    expect(onActivate).toHaveBeenCalledWith("e1");
    expect(plotDown).not.toHaveBeenCalled();
  });

  it("rings a node of the selected session and dims every other", () => {
    const lit = render(dot({ mirror: true, tick: tick({ session: "s-1" }), selectedSessionId: "s-1" })).container;
    expect(lit.querySelectorAll("button[data-row-dot] > span[aria-hidden]").length).toBeGreaterThan(1);
    const dim = render(dot({ mirror: true, tick: tick({ session: "s-2" }), selectedSessionId: "s-1" })).container;
    expect((dim.querySelector("button[data-row-dot]") as HTMLElement).style.filter).toContain("saturate");
  });

  it("draws a blocked transfer as a hollow mark", () => {
    const { container } = render(dot({ mirror: true, tick: tick({ blocked: true, facts: ["Status: blocked"] }) }));
    const mark = container.querySelector("button[data-row-dot] > span[aria-hidden]") as HTMLElement;
    expect(mark.style.background).toBe("transparent");
  });
});

// The en and em dash, built from their code points.
const DASHES = new RegExp(`[${String.fromCharCode(0x2013, 0x2014)}]`);

describe("the rows' files", () => {
  const here = dirname(fileURLToPath(import.meta.url));
  const lib = resolve(here, "../../../lib");
  const sources = [
    ...readdirSync(here).filter((f) => /\.tsx?$/.test(f)).map((f) => join(here, f)),
    ...["row-ticks.ts", "row-ticks.test.ts", "tooltip-words/solo.ts", "tooltip-words/solo.test.ts"].map((f) => join(lib, f)),
  ];
  const code = sources.filter((f) => !/\.test\./.test(f));

  it("holds each new file under 400 lines", () => {
    for (const f of sources) expect(readFileSync(f, "utf8").split("\n").length, f).toBeLessThan(400);
  });

  it("reads no clock, sets no timer and has no motion, so a reduced-motion branch has nothing to guard", () => {
    for (const f of code) {
      expect(readFileSync(f, "utf8"), f).not.toMatch(/Date\.now|setInterval|setTimeout|requestAnimationFrame|transition|animate|America\/Chicago/);
    }
  });

  it("names no pack field or word, and holds no colour literal outside a token lookup or a dash", () => {
    for (const f of code) {
      const text = readFileSync(f, "utf8");
      expect(text, f).not.toMatch(/org_id|org_name|merchant_name|credential_id|API key|Organisation|Merchant|network/);
      expect(text, f).not.toMatch(/rgb\((?!var\()/);
      expect(text, f).not.toMatch(DASHES);
    }
  });
});

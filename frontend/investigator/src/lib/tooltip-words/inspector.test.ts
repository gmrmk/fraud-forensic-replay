import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  recordRefName,
  recordRefWords,
  SHARED_VALUES,
  sharedRowName,
  sharedRowWords,
  sharedDecisionWords,
  sectionFoldName,
  sectionFoldWords,
  fieldRowWords,
} from "./inspector";
import { when, when24 } from "../time-words";

const T = Date.parse("2026-06-08T17:00:00-05:00");

describe("the words of a record link in the Inspector", () => {
  it("names the control for what a press opens: the kind's label and the record's name, which the button prints", () => {
    expect(recordRefName("Member", "Dana Whitlow")).toBe("Open Member Dana Whitlow");
    // WCAG 2.5.3: the accessible name holds the visible text.
    expect(recordRefName("Member", "Dana Whitlow")).toContain("Dana Whitlow");
  });

  it("prints the kind's label as the manifest has it, with its own capitals and words", () => {
    expect(recordRefName("API key event", "Varnholt Labs")).toBe("Open API key event Varnholt Labs");
    expect(recordRefWords("Fraud", "tx-1", null)[0]).toBe("Fraud");
  });

  it("gives the tooltip's lines in order: the kind, the id, the time when the record has one, then what a press does", () => {
    expect(recordRefWords("Member", "mem-5169", T)).toEqual([
      "Member",
      `Record mem-5169`,
      `Time ${when(T)}`,
      "Press to open this record.",
    ]);
  });

  it("leaves the time line out for a record with no time", () => {
    expect(recordRefWords("Organisation", "org-6861", null)).toEqual([
      "Organisation",
      "Record org-6861",
      "Press to open this record.",
    ]);
  });

  it("prints the time in the clock's form", () => {
    expect(recordRefWords("Member", "mem-5169", T, "24h")[2]).toBe(`Time ${when24(T)}`);
    expect(recordRefWords("Member", "mem-5169", T, "12h")[2]).toBe(`Time ${when(T)}`);
  });

  it("keeps the id in the second line whole: it is the only place the app prints it for such a value", () => {
    expect(recordRefWords("Member", "mem-5169", null)[1]).toBe("Record mem-5169");
  });

  it("gives each sentence one verb, in the simple present or the imperative, in 20 words or fewer", () => {
    const press = recordRefWords("Member", "m", null).at(-1) as string;
    expect(press).toBe("Press to open this record.");
    expect(press.split(/\s+/).length).toBeLessThanOrEqual(20);
    // R5 R6: no auxiliary verb, no -ing form.
    expect(press).not.toMatch(/\b(is|are|was|were|be|been|can|will|may|must|should|would|could)\b|ing\b/i);
  });

  it("holds no dash of the long kind, and no word that names a verdict or a pack", () => {
    const all = [...recordRefWords("Member", "m", T), recordRefName("Member", "n")].join(" ");
    expect(all).not.toMatch(new RegExp(`[${String.fromCharCode(0x2013, 0x2014)}]`));
    expect(all).not.toMatch(/\b(fraud|fail|pass|waiting|alarm|suspect|risk)\b/i);
  });

  describe("the Shared values section", () => {
    it("titles the section", () => {
      expect(SHARED_VALUES).toBe("Shared values");
    });

    it("names a row for its text: the kind's label, the field's label and 'r of n'", () => {
      expect(sharedRowName("Network seen", "Principal ID", 3, 3)).toBe("Network seen Principal ID 3 of 3");
      // WCAG 2.5.3: the accessible name holds the visible words (the row prints "3 / 3" for "3 of 3").
      expect(sharedRowName("Request", "Network ID", 0, 2)).toContain("Request");
      expect(sharedRowName("Request", "Network ID", 0, 2)).toContain("Network ID");
    });

    it("gives a pivot row's tooltip lines in order: the kind, the field and value, the count, what a press does", () => {
      expect(sharedRowWords("Key event", "Principal ID", "pr-0001", 2, 3)).toEqual([
        "Key event",
        "Principal ID pr-0001",
        "Before the playhead: 2 of 3",
        "Press to find the matches.",
      ]);
    });

    it("gives a decision row's lines: the kind, the field and the record's id, then the record words without their first line", () => {
      expect(sharedDecisionWords("Decision", "Event IDs", "nw-0004", "dc-0001", T)).toEqual([
        "Decision",
        "Event IDs nw-0004",
        "Record dc-0001",
        `Time ${when(T)}`,
        "Press to open this record.",
      ]);
      expect(sharedDecisionWords("Decision", "Event IDs", "nw-0004", "dc-0001", T, "24h")[3]).toBe(`Time ${when24(T)}`);
      expect(sharedDecisionWords("Decision", "Event IDs", "nw-0004", "dc-0001", null)).toEqual([
        "Decision",
        "Event IDs nw-0004",
        "Record dc-0001",
        "Press to open this record.",
      ]);
    });

    it("names a foldable section's title control for what a press does, 'fold' or 'open'", () => {
      expect(sectionFoldName("Geo", true)).toBe("Fold the Geo section");
      expect(sectionFoldName("Geo", false)).toBe("Open the Geo section");
      expect(sectionFoldWords("Geo", true)).toEqual(["Geo", "Press to fold this section."]);
      expect(sectionFoldWords("Geo", false)).toEqual(["Geo", "Press to open this section."]);
    });

    it("keeps each sentence to one imperative with no auxiliary and no -ing form, and holds no long dash", () => {
      const sentences = [
        sharedRowWords("K", "F", "v", 1, 2).at(-1) as string,
        sharedDecisionWords("K", "F", "r", "d", null).at(-1) as string,
        sectionFoldWords("T", true)[1],
        sectionFoldWords("T", false)[1],
      ];
      for (const s of sentences) {
        expect(s.split(/\s+/).length).toBeLessThanOrEqual(20);
        expect(s).not.toMatch(/\b(is|are|was|were|be|been|can|will|may|must|should|would|could)\b|ing\b/i);
      }
      const all = [
        SHARED_VALUES,
        sharedRowName("K", "F", 1, 2),
        ...sharedRowWords("K", "F", "v", 1, 2),
        ...sharedDecisionWords("K", "F", "r", "d", T),
        sectionFoldName("T", true),
        ...sectionFoldWords("T", false),
      ].join(" ");
      expect(all).not.toMatch(new RegExp(`[${String.fromCharCode(0x2013, 0x2014)}]`));
      // "unfold" is retired from the vocabulary of a section (retired-words.test.ts).
      expect(all).not.toMatch(/unfold/i);
    });
  });

  describe("an attribute row's label", () => {
    it("names the attribute as the row prints its label, on one line", () => {
      expect(fieldRowWords("IP Address")).toEqual(["IP Address"]);
      expect(fieldRowWords("Latitude, longitude")).toEqual(["Latitude, longitude"]);
    });

    it("adds no sentence, no full stop, no long dash and no verdict word", () => {
      const dash = new RegExp(`[${String.fromCharCode(0x2013, 0x2014)}]`);
      for (const label of ["Acquirer", "Model Version", "Latitude, longitude"]) {
        const lines = fieldRowWords(label);
        expect(lines).toHaveLength(1);
        expect(lines[0]).not.toMatch(/\.$/);
        expect(lines[0]).not.toMatch(dash);
        expect(lines[0]).not.toMatch(/\b(fraud|fail|pass|waiting|alarm|suspect|risk)\b/i);
      }
    });
  });

  it("names no field or kind of any pack and holds no clock", () => {
    const here = dirname(fileURLToPath(import.meta.url));
    const source = readFileSync(resolve(here, "inspector.ts"), "utf8");
    expect(source).not.toMatch(/org_id|event_ids|key_event|Date\.now|new Date\(\)|setTimeout|requestAnimationFrame/);
  });
});

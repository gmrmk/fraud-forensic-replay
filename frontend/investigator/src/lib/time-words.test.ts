// frontend/investigator/src/lib/time-words.test.ts
// Golden strings for the words the bar calls. The expected values are worked out by hand from the
// instants (Houston is UTC-5 in June and UTC-6 in January), not copied from the code's output.
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  amount,
  clock,
  fact,
  nodeBrief,
  recordLines,
  remaining,
  ringFacts,
  span,
  when,
  when24,
} from "./time-words";

// Mon Jun 8 2026, 5:00 PM in Houston (CDT, UTC-5).
const EVENING = Date.parse("2026-06-08T22:00:00Z");
// Tue Jun 9 2026, midnight in Houston.
const MIDNIGHT = Date.parse("2026-06-09T05:00:00Z");
// Mon Jun 8 2026, noon in Houston.
const NOON = Date.parse("2026-06-08T17:00:00Z");
// Thu Jan 15 2026, 5:00 PM in Houston (CST, UTC-6): the zone resolves winter time too.
const WINTER = Date.parse("2026-01-15T23:00:00Z");
const HOUR = 3_600_000;

describe("when", () => {
  it("writes the Houston day and the 12 hour time", () => {
    expect(when(EVENING)).toBe("Mon Jun 8 · 5:00p");
    expect(when(MIDNIGHT)).toBe("Tue Jun 9 · 12:00a");
  });
  it("follows the winter offset", () => {
    expect(when(WINTER)).toBe("Thu Jan 15 · 5:00p");
  });
});

// An invalid time is handed back as it came, the way formatHoustonDateTime hands back a date that
// is impossible: no throw. The number's own text is what comes back.
describe("an invalid time", () => {
  const INVALID = [Number.NaN, Number.POSITIVE_INFINITY, 8.64e15 + 1];
  it("is given back as text by when, and does not throw", () => {
    for (const ms of INVALID) expect(when(ms)).toBe(String(ms));
  });
  it("is given back as text by when24, and does not throw", () => {
    for (const ms of INVALID) expect(when24(ms)).toBe(String(ms));
  });
  it("is given back as text by clock, and does not throw", () => {
    for (const ms of INVALID) expect(clock(ms)).toBe(String(ms));
  });
  it("is given back as text by span, and does not throw", () => {
    // The start comes back as its own text and the end is the sum's own text: "NaN to NaN".
    expect(span(Number.NaN, 3_600_000)).toBe("NaN to NaN");
    expect(span(Number.POSITIVE_INFINITY, 3_600_000)).toBe("Infinity to Infinity");
    expect(span(8.64e15 + 1, 3_600_000)).toBe(`${8.64e15 + 1} to ${8.64e15 + 1 + 3_600_000}`);
    expect(span(Number.NaN, 0)).toBe("NaN");
  });
});

describe("when24", () => {
  it("writes the same moment in 24 hour form", () => {
    expect(when24(EVENING)).toBe("Mon Jun 8 · 17:00");
  });
  it("never prints 24:00 at midnight", () => {
    expect(when24(MIDNIGHT)).toBe("Tue Jun 9 · 00:00");
  });
});

describe("clock", () => {
  it("writes a short 12 hour time", () => {
    expect(clock(EVENING)).toBe("5:00p");
    expect(clock(MIDNIGHT)).toBe("12:00a");
    expect(clock(NOON)).toBe("12:00p");
  });
});

describe("span", () => {
  it("names the start and the end of a step", () => {
    expect(span(EVENING, HOUR)).toBe("Mon Jun 8 · 5:00p to 6:00p");
  });
  it("falls back to the moment when the step is zero", () => {
    expect(span(EVENING, 0)).toBe("Mon Jun 8 · 5:00p");
  });
});

describe("amount", () => {
  it("groups thousands and keeps cents on a fraction", () => {
    expect(amount(4061.71, "USD")).toBe("4,061.71 USD");
    expect(amount(0.5, "USD")).toBe("0.50 USD");
  });
  it("prints a whole number without cents", () => {
    expect(amount(1000, "USD")).toBe("1,000 USD");
  });
  it("leaves the unit off when there is none", () => {
    expect(amount(12, "")).toBe("12");
  });
});

describe("remaining", () => {
  it("prints days, hours, minutes and seconds", () => {
    expect(remaining((17 * 3600 + 24 * 60) * 1000)).toBe("0 days, 17 hours, 24 minutes, 0 seconds");
    expect(remaining(86_400_000 + 5000)).toBe("1 day, 0 hours, 0 minutes, 5 seconds");
  });
  it("reads zero at the end of the case and never goes below it", () => {
    expect(remaining(0)).toBe("0 days, 0 hours, 0 minutes, 0 seconds");
    expect(remaining(-4000)).toBe("0 days, 0 hours, 0 minutes, 0 seconds");
  });
});

describe("recordLines", () => {
  it("lists the kind, the two lines, the time and then any facts", () => {
    expect(recordLines("Kind A", "Head", "Second", EVENING)).toEqual([
      "Kind A",
      "Head",
      "Second",
      "Mon Jun 8 · 5:00p",
    ]);
    expect(recordLines("Kind A", "Head", "Second", EVENING, ["Status: blocked"]).at(-1)).toBe("Status: blocked");
  });
});

describe("nodeBrief", () => {
  it("joins the headline and the time", () => {
    expect(nodeBrief("Head", EVENING)).toBe("Head · Mon Jun 8 · 5:00p");
  });
});

describe("fact", () => {
  it("capitalises the field and drops underscores in both parts", () => {
    expect(fact("device_trust", "new")).toBe("Device trust: new");
    expect(fact("outcome", "challenge_failed")).toBe("Outcome: challenge failed");
  });
});

describe("ringFacts", () => {
  it("names the field behind each ring", () => {
    expect(ringFacts({ deviceTrust: "new", outcome: "challenge_passed", status: "blocked" })).toEqual([
      "Device trust: new",
      "Outcome: challenge passed",
      "Status: blocked",
    ]);
  });
  it("says nothing for an unremarkable record", () => {
    expect(ringFacts({ deviceTrust: "known", outcome: "success", status: "ok" })).toEqual([]);
    expect(ringFacts({ deviceTrust: null, outcome: null })).toEqual([]);
    expect(ringFacts({})).toEqual([]);
  });
});

describe("the zone", () => {
  it("comes from the one exported constant and is not written here", () => {
    const here = dirname(fileURLToPath(import.meta.url));
    const source = readFileSync(resolve(here, "time-words.ts"), "utf8");
    expect(source).not.toContain("America/Chicago");
    expect(source).toMatch(/HOU_TZ/);
  });
});

// Answer 43: the times inside tooltips follow the clock's switch. The words take the form as an
// argument ("12h" or "24h"), 12 hour when none is passed. Worked by hand from the instants above.
describe("the form argument", () => {
  // Mon Jun 8 2026, 11:00 PM in Houston (CDT): an hour from here crosses midnight.
  const LATE = Date.parse("2026-06-09T04:00:00Z");

  describe("clock", () => {
    it("writes the 24 hour time with two-digit hours, and 00:00 at midnight", () => {
      expect(clock(EVENING, "24h")).toBe("17:00");
      expect(clock(MIDNIGHT, "24h")).toBe("00:00");
      expect(clock(NOON, "24h")).toBe("12:00");
      expect(clock(WINTER, "24h")).toBe("17:00");
    });
    it("writes the 12 hour time for 12h and for no form", () => {
      expect(clock(EVENING, "12h")).toBe("5:00p");
      expect(clock(EVENING)).toBe(clock(EVENING, "12h"));
    });
  });

  describe("span", () => {
    it("names the start and the end in 24 hour form", () => {
      expect(span(EVENING, HOUR, "24h")).toBe("Mon Jun 8 · 17:00 to 18:00");
      expect(span(WINTER, HOUR, "24h")).toBe("Thu Jan 15 · 17:00 to 18:00");
    });
    it("ends at 00:00 when the step crosses midnight", () => {
      expect(span(LATE, HOUR, "24h")).toBe("Mon Jun 8 · 23:00 to 00:00");
      expect(span(LATE, HOUR, "12h")).toBe("Mon Jun 8 · 11:00p to 12:00a");
    });
    it("falls back to the moment when the step is zero", () => {
      expect(span(EVENING, 0, "24h")).toBe("Mon Jun 8 · 17:00");
    });
    it("prints as before with 12h and with no form", () => {
      expect(span(EVENING, HOUR, "12h")).toBe("Mon Jun 8 · 5:00p to 6:00p");
      expect(span(EVENING, HOUR)).toBe(span(EVENING, HOUR, "12h"));
    });
  });

  describe("recordLines", () => {
    it("puts the 24 hour moment on its own line, and keeps the facts after it", () => {
      expect(recordLines("Kind A", "Head", "Second", EVENING, ["Status: blocked"], "24h")).toEqual([
        "Kind A",
        "Head",
        "Second",
        "Mon Jun 8 · 17:00",
        "Status: blocked",
      ]);
      expect(recordLines("Kind A", "Head", "Second", MIDNIGHT, [], "24h")[3]).toBe("Tue Jun 9 · 00:00");
    });
    it("prints as before with 12h and with no form, facts or not", () => {
      expect(recordLines("Kind A", "Head", "Second", EVENING, [], "12h")[3]).toBe("Mon Jun 8 · 5:00p");
      expect(recordLines("Kind A", "Head", "Second", EVENING)).toEqual(
        recordLines("Kind A", "Head", "Second", EVENING, [], "12h"),
      );
    });
  });

  describe("nodeBrief", () => {
    it("joins the headline and the 24 hour moment", () => {
      expect(nodeBrief("Head", EVENING, "24h")).toBe("Head · Mon Jun 8 · 17:00");
      expect(nodeBrief("Head", MIDNIGHT, "24h")).toBe("Head · Tue Jun 9 · 00:00");
    });
    it("prints as before with 12h and with no form", () => {
      expect(nodeBrief("Head", EVENING, "12h")).toBe("Head · Mon Jun 8 · 5:00p");
      expect(nodeBrief("Head", EVENING)).toBe(nodeBrief("Head", EVENING, "12h"));
    });
  });

  describe("an invalid time in 24 hour form", () => {
    it("is given back as text by each, and none throws", () => {
      expect(clock(Number.NaN, "24h")).toBe("NaN");
      expect(span(Number.NaN, HOUR, "24h")).toBe("NaN to NaN");
      expect(span(Number.NaN, 0, "24h")).toBe("NaN");
      expect(nodeBrief("Head", Number.NaN, "24h")).toBe("Head · NaN");
      expect(recordLines("Kind A", "Head", "Second", Number.POSITIVE_INFINITY, [], "24h")[3]).toBe("Infinity");
    });
  });
});

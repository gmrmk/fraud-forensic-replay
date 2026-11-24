/**
 * The card number guard: the shared vectors, the stated limits, the digit table, and the typing
 * rule (a pure function of the text and the caret). Every digit run in this file is a published
 * test number or a number made for the test.
 */
import { describe, it, expect } from "vitest";
import { digitValue, isFormatCp } from "./digits";
import {
  BRAND_TABLE,
  acceptEdit,
  findRuns,
  holdsCardNumber,
  luhnValid,
  refusedClosedCount,
  refusesBody,
  refusesText,
  runRefused,
  SEPARATORS,
  type EditState,
} from "./guard";
import { VECTORS, VISA, doc, para, text } from "./test-fixtures";

const VISA_GROUPED = "4111 1111 1111 1111";

/** A vector may carry a note and, for an id vector, the limit flag (test-fixtures.ts types neither). */
type Noted = { id: string; expect: string; note?: string; limit?: boolean; label?: string };
const noted = (v: unknown): Noted => v as Noted;

// the brand table as the rule states it (checked 2026-11-19 against the issuer identification number
// table of https://en.wikipedia.org/wiki/Payment_card_number): per brand the prefix ranges as
// [digits in the prefix, lowest, highest] and the lengths the same row uses
const EXPECTED_TABLE = [
  ["Visa", [[1, 4, 4]], [13, 16, 19]],
  ["Mastercard", [[2, 51, 55], [4, 2221, 2720]], [16]],
  ["American Express", [[2, 34, 34], [2, 37, 37]], [15]],
  ["Discover", [[4, 6011, 6011], [3, 644, 649], [2, 65, 65]], [16, 17, 18, 19]],
  ["JCB", [[4, 3528, 3589]], [16, 17, 18, 19]],
  ["Diners Club", [[3, 300, 305], [2, 36, 36], [2, 38, 38], [2, 39, 39]], [14, 15, 16, 17, 18, 19]],
  ["UnionPay", [[2, 62, 62]], [16, 17, 18, 19]],
  [
    "Maestro",
    [5018, 5020, 5038, 5893, 6304, 6759, 6761, 6762, 6763].map((p) => [4, p, p]),
    [13, 14, 15, 16, 17, 18, 19],
  ],
];

// the same brands as one regular expression each (a different shape from the guard's table), for the
// independent brute force below
const BRAND_RE = new RegExp(
  "^(?:" +
    [
      "4(?:[0-9]{12}|[0-9]{15}|[0-9]{18})",
      "(?:5[1-5][0-9]{14}|(?:222[1-9]|22[3-9][0-9]|2[3-6][0-9]{2}|27[01][0-9]|2720)[0-9]{12})",
      "3[47][0-9]{13}",
      "(?:6011[0-9]{12,15}|64[4-9][0-9]{13,16}|65[0-9]{14,17})",
      "35(?:2[89]|[3-8][0-9])[0-9]{12,15}",
      "(?:30[0-5][0-9]{11,16}|3[689][0-9]{12,17})",
      "62[0-9]{14,17}",
      "(?:5018|5020|5038|5893|6304|6759|676[1-3])[0-9]{9,15}",
    ].join("|") +
    ")$",
);

const HONEST_NARROWED = [
  "honest-two-unix-times", "honest-phone-then-date", "honest-date-range-count", "honest-dates-clocks-count",
  "honest-small-counts", "honest-two-amounts", "honest-record-ids-date-count",
];
const LET_THROUGH = [
  "layout-pairs-of-2", "off-table-prefix-with-code", "same-row-visa-prefix-15-digits",
  "same-row-amex-prefix-16-digits", "same-row-mastercard-prefix-15-digits",
];
// card lines the cure of the spacing slip (2026-11-19) turned from allowed to refused
const CURED = ["layout-groups-of-8", "layout-first-digit-split", "layout-last-digit-split"];

describe("shared vectors (backend/tests/note_vectors.json)", () => {
  it("the file opens with the test number notice and holds the cases the design lists", () => {
    expect(VECTORS._about).toMatch(/published test card number/);
    expect(VECTORS._about).toMatch(/No real card number/);
    const refused = VECTORS.text_vectors.filter((v) => v.expect === "refused").length;
    const allowed = VECTORS.text_vectors.filter((v) => v.expect === "allowed").length;
    expect(refused).toBeGreaterThanOrEqual(25);
    expect(allowed).toBeGreaterThanOrEqual(25);
  });

  it.each(VECTORS.text_vectors.map((v) => [v.id, v] as const))("text vector %s", (_id, v) => {
    expect(refusesText(v.text) ? "refused" : "allowed").toBe(v.expect);
  });

  it.each(VECTORS.multi_vectors.map((v) => [v.id, v] as const))("multi vector %s: each note is judged alone", (_id, v) => {
    for (const t of v.texts) expect(refusesText(t)).toBe(false);
  });

  it.each(VECTORS.body_vectors.map((v) => [v.id, v] as const))("body vector %s", (_id, v) => {
    expect(refusesBody(v.body) ? "refused" : "allowed").toBe(v.expect);
  });

  it.each(VECTORS.id_vectors.map((v) => [v.id, v] as const))("id vector %s", (_id, v) => {
    expect(refusesText(v.value) ? "refused" : "allowed").toBe(v.expect);
  });
});

describe("the design's table of cases, written out here as well as in the vectors", () => {
  const refused = [
    "4111 1111 1111 1111",
    "4111-1111-1111-1111",
    "4111 1111\n1111 1111",
    "378282246310005",
    "4222222222222",
    "Amount 4111111111111111.00",
  ];
  const allowed = [
    "1234567890123456",
    "1234 5678 9012 3456",
    "411111111116",
    "4111 a 1111 1111 1111",
    "+1 713-555-0142",
    "+86 138 0013 8000",
    "$1,234,567.89",
    "2026-11-01 2026-11-19",
    "2026-11-01 to 2026-11-19",
    "2026-11-19 12:27",
    "tx-0001042",
    "note-0123456789abcdef0123456789abcdef",
    "1763556003600",
  ];
  it.each(refused)("refuses %j", (t) => expect(refusesText(t)).toBe(true));
  it.each(allowed)("allows %j", (t) => expect(refusesText(t)).toBe(false));

  it("refuses the false positives the design states (a 13 digit Unix time, a date range)", () => {
    expect(refusesText("1763556000000")).toBe(true);
    expect(refusesText("2026-11-01 2026-11-05")).toBe(true);
  });

  it("refuses a number in other digit scripts, and one split by a zero width space", () => {
    const zero = (z: number) => [...VISA].map((d) => String.fromCodePoint(z + Number(d))).join("");
    expect(refusesText(zero(0xff10))).toBe(true); // fullwidth
    expect(refusesText(zero(0x0660))).toBe(true); // Arabic-Indic
    expect(refusesText(zero(0x10d40))).toBe(true); // Garay, new in Unicode 16
    const zwsp = String.fromCodePoint(0x200b);
    expect(refusesText(["4111", "1111", "1111", "1111"].join(zwsp))).toBe(true);
  });

  it("refuses one number split across marks, paragraphs, hard breaks and list items", () => {
    expect(refusesBody(doc(para(text("4111 11", "bold"), text("11 1111 1111"))))).toBe(true);
    expect(refusesBody(doc(para(text("4111 1111 1111")), para(text("1111"))))).toBe(true);
    expect(refusesBody(doc(para(text("4111 1111"), { type: "hard_break" }, text("1111 1111"))))).toBe(true);
  });
});

describe("what the guard does NOT refuse (stated limits, pinned so nobody believes otherwise)", () => {
  const groups = ["4111", "1111", "1111", "1111"];
  it.each([
    ["a full stop", "."],
    ["a slash", "/"],
    ["an underscore", "_"],
    ["a comma", ","],
    ["a colon", ":"],
    ["four spaces", "    "],
    ["four line feeds (three blank paragraphs)", "\n\n\n\n"],
  ])("groups split by %s are allowed", (_name, sep) => {
    expect(refusesText(groups.join(sep))).toBe(false);
  });

  it("three blank paragraphs between groups are allowed; two are refused", () => {
    const g1 = para(text("4111 1111"));
    const g2 = para(text("1111 1111"));
    expect(refusesBody(doc(g1, para(), para(), para(), g2))).toBe(false);
    expect(refusesBody(doc(g1, para(), para(), g2))).toBe(true);
  });

  it("a first group in parentheses is allowed", () => {
    expect(refusesText("(4111) 1111 1111 1111")).toBe(false);
  });

  it("a number with its digits reversed is allowed", () => {
    const v3 = "4012888888881881";
    expect(refusesText(v3)).toBe(true);
    expect(refusesText([...v3].reverse().join(""))).toBe(false);
  });

  it("a number written in words is allowed", () => {
    expect(refusesText("four one one one one one one one one one one one one one one one")).toBe(false);
  });

  it("a number split across two notes is allowed (each note is judged alone)", () => {
    expect(refusesText("4111 1111")).toBe(false);
    expect(refusesText("1111 1111")).toBe(false);
  });

  it("digits run on to a valid number with no separator, in a group of 19 digits or fewer, are allowed", () => {
    // stated limit: the group is judged whole, so a code written straight after the number is not caught
    expect(refusesText(VISA + "123")).toBe(false);
    expect(refusesText(VISA + "12")).toBe(false);
    expect(refusesText(VISA + "1")).toBe(false);
    // the same when the number is in groups and the digits are glued to its first or last group
    expect(refusesText(VISA_GROUPED + "123")).toBe(false);
    expect(refusesText("123" + VISA_GROUPED)).toBe(false);
    expect(refusesText(VISA_GROUPED + " 123")).toBe(true); // with a separator it is refused
  });

  it("every stated limit in the vectors file is a vector that expects allowed", () => {
    const limits = [
      ...VECTORS.text_vectors.filter((v) => v.limit),
      ...VECTORS.multi_vectors.filter((v) => v.limit),
      ...VECTORS.body_vectors.filter((v) => v.limit),
    ];
    expect(limits.length).toBeGreaterThanOrEqual(14);
    expect(limits.every((v) => v.expect === "allowed")).toBe(true);
    const ids = limits.map((v) => v.id);
    for (const id of [
      "limit-period", "limit-slash", "limit-underscore", "limit-comma", "limit-colon",
      "limit-four-spaces", "limit-four-line-feeds", "limit-parenthesis", "limit-reversed",
      "limit-words", "limit-two-notes", "limit-run-on-code", "limit-grouped-run-on-last",
      "limit-grouped-run-on-first", "three-blank-paragraphs",
    ]) {
      expect(ids).toContain(id);
    }
  });

  it("the three vectors the strict rule flipped take the narrowed rule's verdict and say so", () => {
    const flipped = VECTORS.text_vectors.filter((v) => v.id.startsWith("flipped-"));
    expect(flipped.map((v) => v.id).sort()).toEqual(["flipped-20-digits", "flipped-21-digits", "flipped-24-digits"]);
    for (const v of flipped) {
      expect(noted(v).note).toMatch(/safety review flipped/);
      expect(noted(v).note).toMatch(/narrowing of 2026-11-19/);
    }
    // the first group of this one is a 16 digit Visa number: still refused
    const v21 = flipped.find((v) => v.id === "flipped-21-digits")!;
    expect(v21.expect).toBe("refused");
    expect(v21.limit).toBeUndefined();
    expect(refusesText(v21.text)).toBe(true);
    // a group of more than 19 digits is never refused: both are allowed again, as stated limits
    for (const v of flipped.filter((f) => f.id !== "flipped-21-digits")) {
      expect(v.expect).toBe("allowed");
      expect(v.limit).toBe(true);
      expect(refusesText(v.text)).toBe(false);
    }
  });

  it("the id vector the strict rule refused is allowed again and says so", () => {
    const v = VECTORS.id_vectors.find((x) => x.id === "id-crafted-run-on")!;
    expect(v.expect).toBe("allowed");
    expect(noted(v).limit).toBe(true);
    expect(noted(v).note).toMatch(/narrowing of 2026-11-19/);
    expect(refusesText(v.value)).toBe(false);
  });

  it("every honest line the strict rule refused is allowed and says why", () => {
    const found = VECTORS.text_vectors.filter((v) => HONEST_NARROWED.includes(v.id));
    expect(found.map((v) => v.id).sort()).toEqual([...HONEST_NARROWED].sort());
    for (const v of found) {
      expect(v.expect).toBe("allowed");
      expect(v.limit).toBeUndefined();
      expect(v.label).toMatch(/narrowing of 2026-11-19/);
      expect(noted(v).note).toMatch(/narrowing of 2026-11-19/);
      expect(refusesText(v.text)).toBe(false);
    }
  });

  it("every card line the narrowing lets through is a limit with the note", () => {
    const found = VECTORS.text_vectors.filter((v) => LET_THROUGH.includes(v.id));
    expect(found.map((v) => v.id).sort()).toEqual([...LET_THROUGH].sort());
    for (const v of found) {
      expect(v.expect).toBe("allowed");
      expect(v.limit).toBe(true);
      expect(noted(v).note).toMatch(/narrowing of 2026-11-19/);
      expect(refusesText(v.text)).toBe(false);
    }
  });

  it("the vectors the cure changed are refused and carry the dated note", () => {
    const found = VECTORS.text_vectors.filter((v) => CURED.includes(v.id));
    expect(found.map((v) => v.id).sort()).toEqual([...CURED].sort());
    for (const v of found) {
      expect(v.expect).toBe("refused");
      expect(v.limit).toBeUndefined();
      expect(noted(v).note).toMatch(/2026-11-19/);
      expect(noted(v).note).toMatch(/spacing slip/);
      expect(v.label).toMatch(/2026-11-19/);
      expect(v.label).toMatch(/spacing slip/);
      expect(refusesText(v.text)).toBe(true);
    }
  });

  it("a card line of every brand is refused", () => {
    for (const [name] of BRAND_TABLE) {
      const v = VECTORS.text_vectors.find((x) => x.id === `card-line-${name.toLowerCase().replace(/ /g, "-")}`)!;
      expect(v.expect, name).toBe("refused");
      expect(refusesText(v.text), name).toBe(true);
    }
  });

  it("every prefix range is pinned at both edges and just outside it", () => {
    const byId = new Map(VECTORS.text_vectors.map((v) => [v.id, v]));
    for (const [name, prefixes] of EXPECTED_TABLE as [string, number[][], number[]][]) {
      const slug = name.toLowerCase().replace(/ /g, "-");
      const merged: number[][] = []; // [digits, low, high] with touching entries joined
      for (const [k, lo, hi] of prefixes) {
        const last = merged[merged.length - 1];
        if (last && last[0] === k && last[2] + 1 === lo) last[2] = hi;
        else merged.push([k, lo, hi]);
      }
      for (const [, lo, hi] of merged) {
        const key = lo === hi ? String(lo) : `${lo}-${hi}`;
        const wanted: [string, "refused" | "allowed"][] = [["first", "refused"], ["below", "allowed"], ["above", "allowed"]];
        if (hi !== lo) wanted.push(["last", "refused"]);
        for (const [which, expectation] of wanted) {
          const v = byId.get(`brand-${slug}-${key}-${which}`)!;
          expect(v.expect, `${slug} ${key} ${which}`).toBe(expectation);
          expect(refusesText(v.text), `${slug} ${key} ${which}`).toBe(expectation === "refused");
          expect(v.limit === true, `${slug} ${key} ${which}`).toBe(expectation === "allowed");
        }
      }
    }
  });
});

describe("the twenty shapes of the safety review", () => {
  const shapes = VECTORS.text_vectors.filter((v) => v.id.startsWith("shape-"));
  it("there are twenty and every one is refused", () => {
    expect(shapes).toHaveLength(20);
    expect(shapes.every((v) => v.expect === "refused")).toBe(true);
  });
  it.each(shapes.map((v) => [v.id, v] as const))("%s", (_id, v) => {
    expect(refusesText(v.text)).toBe(true);
  });

  const whyAllowed = [
    "phone-pair", "phone-uk-pair", "amount-spaced", "dates-times-words", "luhn-invalid-16-code",
    "luhn-invalid-16-expiry", "record-id-tx", "record-id-list", "record-id-login", "record-id-generic",
    "unix-pair-ok", "white-honest-two-counts",
  ];
  it("each vector that stays allowed for a reason carries the reason in its label", () => {
    const found = VECTORS.text_vectors.filter((v) => whyAllowed.includes(v.id));
    expect(found).toHaveLength(whyAllowed.length);
    for (const v of found) {
      expect(v.expect).toBe("allowed");
      expect(v.label.length).toBeGreaterThan(30);
      expect(refusesText(v.text)).toBe(false);
    }
  });
});

describe("every white space character is a separator (the owner's cure of 2026-11-19)", () => {
  type SeparatorVectors = { code_points: number[]; added_2026_11_19: number[]; white_space_members: number[] };
  const SEP = (VECTORS as unknown as { separator_vectors: SeparatorVectors }).separator_vectors;
  const ch = (cp: number) => String.fromCodePoint(cp);

  it("the guard's separator set is the pinned list, and holds the six that ended a run", () => {
    expect([...SEPARATORS].sort((a, b) => a - b)).toEqual(SEP.code_points);
    expect(SEP.added_2026_11_19).toEqual([0x0b, 0x0c, 0x85, 0x1680, 0x2028, 0x2029]);
    for (const cp of SEP.added_2026_11_19) expect(SEPARATORS.has(cp), String(cp)).toBe(true);
  });

  it("the pinned members are exactly the engine's White_Space property", () => {
    const re = /^\p{White_Space}$/u;
    const live: number[] = [];
    for (let cp = 0; cp <= 0x10ffff; cp++) {
      if (cp >= 0xd800 && cp <= 0xdfff) continue;
      if (re.test(ch(cp))) live.push(cp);
    }
    expect(live).toEqual(SEP.white_space_members);
    expect(live).toHaveLength(25);
  });

  it("after NFKC every member is a separator and joins a run", () => {
    for (const cp of SEP.white_space_members) {
      for (const c of ch(cp).normalize("NFKC")) expect(SEPARATORS.has(c.codePointAt(0) as number), String(cp)).toBe(true);
      expect(findRuns("4" + ch(cp) + "1").map((r) => r.groups), String(cp)).toEqual([["4", "1"]]);
    }
  });

  it("characters that are not white space still end a run", () => {
    // U+001C to U+001F are white space for some engines' \s but not for the property
    for (const cp of [0x1c, 0x1d, 0x1e, 0x1f, 0x2e, 0x2f, 0x5f, 0x2c, 0x3a, 0x41, 0x2016]) {
      expect(findRuns("4" + ch(cp) + "1").map((r) => r.groups), String(cp)).toEqual([["4"], ["1"]]);
    }
  });

  it("three separators in a row join and four end a run, whatever they are", () => {
    for (const cp of SEP.code_points) {
      const s = ch(cp);
      expect(refusesText("4111" + s.repeat(3) + "1111 1111 1111"), String(cp)).toBe(true);
      expect(refusesText("41111111" + s.repeat(4) + "11111111"), String(cp)).toBe(false);
    }
    const three = ch(0x0b) + ch(0x2028) + ch(0x0c);
    expect(refusesText("4111" + three + "1111 1111 1111")).toBe(true);
    expect(refusesText("41111111" + three + " " + "11111111")).toBe(false);
  });

  it("the white space vectors are in the file with their verdicts", () => {
    const byId = new Map(VECTORS.text_vectors.filter((v) => v.id.startsWith("white-")).map((v) => [v.id, v] as const));
    expect(byId.size).toBe(17);
    for (const slug of ["vertical-tab", "form-feed", "next-line", "line-separator", "paragraph-separator", "ogham-space"]) {
      for (const kind of ["alone", "expiry"]) {
        const v = byId.get(`white-${slug}-${kind}`)!;
        expect(v.expect).toBe("refused");
        expect(noted(v).limit).toBeUndefined();
        expect(noted(v).note).toMatch(/2026-11-19/);
      }
    }
    for (const id of ["white-four-line-separators", "white-four-mixed-white-space"]) {
      expect(byId.get(id)!.expect).toBe("allowed");
      expect(noted(byId.get(id)).limit).toBe(true);
    }
    const honest = byId.get("white-honest-two-counts")!;
    expect(honest.expect).toBe("allowed");
    expect(noted(honest).limit).toBeUndefined();
    expect(honest.text).toContain(ch(0x2028));
  });
});

describe("the rule: groups, spans of whole groups, and a group of 20 digits or more", () => {
  // 20 digit groups made from the published test number with 4 digits run on: the prefix windows
  // (13 to 19 digits from the first digit) pass Luhn in the first, the suffix windows in the second.
  const PREFIX_ONLY = "41111111111111115678";
  const SUFFIX_ONLY = "12344111111111111111";

  it("keeps each run as its groups", () => {
    expect(findRuns("4111 1111-1111\n1111").map((r) => r.groups)).toEqual([["4111", "1111", "1111", "1111"]]);
    expect(findRuns("12 ab 34").map((r) => r.groups)).toEqual([["12"], ["34"]]);
    expect(findRuns("4111    1111").map((r) => r.groups)).toEqual([["4111"], ["1111"]]);
  });

  it("refuses a span of whole groups, not only the whole run", () => {
    expect(refusesText(`${VISA_GROUPED} 12 27 123`)).toBe(true); // the number, its expiry and its code
    expect(refusesText(`14 05 ${VISA_GROUPED}`)).toBe(true); // a time before it
    expect(refusesText(`${VISA_GROUPED}\n12 27`)).toBe(true);
  });

  it("judges only spans of 13 to 19 digits", () => {
    expect(refusesText("4111 1111 1111")).toBe(false); // 12 digits
    expect(refusesText("4222 2222 2222 2")).toBe(true); // 13 digits, a published test number
    expect(refusesText("8 4222 2222 2222 2")).toBe(true); // a 13 digit span inside a 14 digit run
    expect(refusesText("1042 1043 1044 1045")).toBe(false); // 16 digits, no span passes
  });

  it("never refuses a group of more than 19 digits (a stated limit since the owner's narrowing of 2026-11-19)", () => {
    expect(refusesText(PREFIX_ONLY)).toBe(false);
    expect(refusesText(SUFFIX_ONLY)).toBe(false);
    expect(refusesText("note-0123" + VISA + "abcdefabcdef")).toBe(false);
    expect(refusesText(VISA + "12345678")).toBe(false); // 24 digits, the first 16 pass
    expect(refusesText("12345678901234560003")).toBe(false);
    expect(refusesText("62000000000000000000")).toBe(false); // 20 digits, the first 19 pass
    expect(runRefused([PREFIX_ONLY], false)).toBe(false);
    expect(runRefused(["12345678", SUFFIX_ONLY], false)).toBe(false);
    expect(refusesText(VISA + " 12345678")).toBe(true); // with a separator it is a group of its own
  });

  it("the Save rule and the closed count agree on every shared text vector", () => {
    for (const v of VECTORS.text_vectors) expect(refusesText(v.text)).toBe(refusedClosedCount(v.text, null) > 0);
  });
});

describe("the owner's narrowing of 2026-11-19: the original rule, plus a brand's number in a card layout", () => {
  const cut = (num: string, sizes: number[]): string => {
    const out: string[] = [];
    let at = 0;
    for (const s of sizes) {
      out.push(num.slice(at, at + s));
      at += s;
    }
    return out.join(" ");
  };
  /** A number of the given length that starts with prefix, its last digit the Luhn check digit. */
  const valid = (prefix: string, length: number): string => {
    const body = (prefix + "0".repeat(length)).slice(0, length - 1);
    for (let c = 0; c < 10; c++) if (luhnValid(body + c)) return body + c;
    throw new Error("no check digit");
  };
  /** The line with an expiry and a code; the month is the first that keeps the whole run off Luhn. */
  const lineFor = (num: string, sizes: number[]): string => {
    for (const month of ["12", "11", "10", "09", "08"]) if (!luhnValid(num + month)) return `${cut(num, sizes)} ${month}/27 123`;
    throw new Error("no month");
  };

  it("the brand table is the eight rows checked against the article", () => {
    expect(BRAND_TABLE.map(([n, p, l]) => [n, p.map((r) => [...r]), [...l]])).toEqual(EXPECTED_TABLE);
  });

  it("the original rule stays whatever the digits are", () => {
    expect(refusesText("1763556000000")).toBe(true); // a 13 digit Unix time
    expect(refusesText("1 7 6 3 5 5 6 0 0 0 0 0 0")).toBe(true); // 13 digits in single digit groups
    expect(refusesText("5063516945005047")).toBe(true); // a prefix no row holds, 16 digits, alone
    expect(refusesText("2026-11-01 2026-11-05")).toBe(true); // the stated false positive
    expect(refusesText("1763556003600")).toBe(false);
  });

  it("a card line is refused in every layout cards are written in, with a space or a hyphen", () => {
    const cards: [number[], string[]][] = [
      [[4, 4, 4, 1], ["4222222222222"]],
      [[4, 6, 4], ["36227206271667"]],
      [[4, 6, 5], ["378282246310005"]],
      [[4, 4, 4, 4], [VISA, "5555555555554444"]],
      [[4, 4, 4, 4, 3], ["6205500000000000004"]],
    ];
    for (const [sizes, nums] of cards) {
      for (const num of nums) {
        for (const sep of [" ", "-"]) {
          const line = cut(num, sizes).replace(/ /g, sep);
          expect(refusesText(`${line} 12/27 123`), line.length + sep).toBe(true);
          expect(refusesText(`14:05 ${line} 3`), line.length + sep).toBe(true);
        }
        expect(refusesText(`${num} 12/27 123`)).toBe(true); // contiguous: a single group
      }
    }
  });

  it("the layouts: a card's layout (a single group, 4s with a last group of 1 to 4, 4-6-5, 4-6-4) or one slip from one; nothing else", () => {
    const ok: [number, number[]][] = [
      [13, [4, 4, 4, 1]], [14, [4, 4, 4, 2]], [15, [4, 4, 4, 3]], [16, [4, 4, 4, 4]],
      [17, [4, 4, 4, 4, 1]], [18, [4, 4, 4, 4, 2]], [19, [4, 4, 4, 4, 3]],
      [14, [4, 6, 4]], [15, [4, 6, 5]], [16, [16]],
      // one slip from a card's layout (the cure of 2026-11-19)
      [16, [8, 8]], [16, [1, 15]], [16, [15, 1]], [16, [4, 4, 5, 3]], [15, [5, 5, 5]], [15, [4, 5, 6]],
      [16, [4, 4, 4, 2, 2]], [16, [4, 4, 4, 3, 1]], [16, [3, 5, 4, 4]], [19, [4, 4, 4, 4, 2, 1]],
    ];
    const bad: [number, number[]][] = [
      [16, [2, 2, 2, 2, 2, 2, 2, 2]], [16, [3, 4, 4, 5]], [16, [4, 6, 6]], [16, [3, 5, 3, 5]],
      [15, [3, 6, 6]], [19, [3, 5, 4, 3, 4]], // the last three: two slips or further
    ];
    // a prefix of a row that has the length (Visa 13, 16 and 19, Diners Club 14, Amex 15, Discover 17 and 18)
    const prefixOf: Record<number, string> = { 13: "4", 14: "36", 15: "34", 16: "4", 17: "6011", 18: "6011", 19: "4" };
    for (const [length, sizes] of ok) expect(refusesText(lineFor(valid(prefixOf[length], length), sizes)), `${length} ${sizes}`).toBe(true);
    for (const [length, sizes] of bad) {
      expect(refusesText(lineFor(valid(length === 15 ? "34" : "4", length), sizes)), `${length} ${sizes}`).toBe(false);
    }
  });

  it("a number in a layout cards are not written in passes with an expiry beside it", () => {
    const pairs = Array.from({ length: 8 }, (_, i) => VISA.slice(2 * i, 2 * i + 2)).join(" ");
    expect(refusesText(`${pairs} 12/27`)).toBe(false);
    expect(refusesText(pairs)).toBe(true); // nothing beside it: the original rule refuses the whole run
    expect(refusesText(`${VISA_GROUPED} 12/27`)).toBe(true);
  });

  it("a prefix outside the table passes with a code beside it", () => {
    const off = "5063516945005047";
    expect(luhnValid(off)).toBe(true);
    expect(refusesText(off)).toBe(true); // alone: the original rule
    expect(refusesText(`${off} 12/27 123`)).toBe(false);
    expect(refusesText("5063 5169 4500 5047 12/27 123")).toBe(false);
  });

  it("a prefix and a length of two different rows are not a brand's number", () => {
    expect(luhnValid("411111111111116")).toBe(true); // a valid 15 digit number that starts with 4
    expect(refusesText("4111 1111 1111 116 12/27")).toBe(false); // Visa has 13, 16 and 19 digits
    expect(luhnValid("3482822463100055")).toBe(true); // a valid 16 digit number that starts with 34
    expect(refusesText("3482 8224 6310 0055 12/27")).toBe(false); // Amex has 15 digits
  });

  it("a group of more than 19 digits is never part of a span", () => {
    expect(refusesText(`${VISA}1234 12/27`)).toBe(false);
    expect(refusesText(`12/27 ${VISA}1234`)).toBe(false);
  });

  it("the whole run is judged without the brand and the layout; a span that is not the whole run is not", () => {
    expect(runRefused(["176", "35560", "00000"], false)).toBe(true);
    expect(runRefused(["176", "35560", "00001"], false)).toBe(false);
    expect(refusesText("1763556000000")).toBe(true);
    expect(refusesText("1763556000000 12/27")).toBe(false);
  });
});

describe("the digit table (backend/tests/note_digit_table.json)", () => {
  it("reads digits from the table, not from the engine", () => {
    expect(digitValue(0x30)).toBe(0);
    expect(digitValue(0x39)).toBe(9);
    expect(digitValue(0x0664)).toBe(4); // Arabic-Indic four
    expect(digitValue(0xff15)).toBe(5); // fullwidth five
    expect(digitValue(0x10d43)).toBe(3); // Garay three, a Unicode 16 script
    expect(digitValue(0x41)).toBe(-1);
    expect(digitValue(0x2f)).toBe(-1);
    expect(digitValue(0x3a)).toBe(-1);
    expect(digitValue(0xb2)).toBe(-1); // superscript two is not a decimal digit before NFKC
  });
  it("lists format characters", () => {
    expect(isFormatCp(0x200b)).toBe(true);
    expect(isFormatCp(0x00ad)).toBe(true);
    expect(isFormatCp(0x41)).toBe(false);
    expect(isFormatCp(0x20)).toBe(false);
  });
});

describe("runs and Luhn", () => {
  it("the Luhn check", () => {
    expect(luhnValid(VISA)).toBe(true);
    expect(luhnValid("378282246310005")).toBe(true);
    expect(luhnValid("1234567890123456")).toBe(false);
  });
  it("a run joins at most three separators and reports whether it ends the text", () => {
    expect(findRuns("4111 1111 1111 1111").map((r) => r.digits)).toEqual([VISA]);
    expect(findRuns("4111    1111").map((r) => r.digits)).toEqual(["4111", "1111"]);
    expect(findRuns("4111   1111").map((r) => r.digits)).toEqual(["41111111"]);
    expect(findRuns("12 ab 34").map((r) => r.digits)).toEqual(["12", "34"]);
    expect(findRuns("4111")[0].atEnd).toBe(true);
    expect(findRuns("4111 ")[0].atEnd).toBe(false);
  });
});

describe("the typing rule: a pure function of the text and the caret", () => {
  /** Type `s` one character at a time at the end; returns the result of each keystroke. */
  function type(s: string, start = ""): { accepted: boolean[]; text: string } {
    let cur: EditState = { text: start, caret: start.length };
    const accepted: boolean[] = [];
    for (const ch of s) {
      const next: EditState = { text: cur.text + ch, caret: cur.text.length + ch.length };
      const ok = acceptEdit(cur, next, 1);
      accepted.push(ok);
      if (ok) cur = next;
    }
    return { accepted, text: cur.text };
  }

  it("a run is open when it ends at the caret, closed otherwise", () => {
    expect(refusedClosedCount(VISA, 16)).toBe(0); // open
    expect(refusedClosedCount(VISA, 3)).toBe(1); // the caret is inside the run
    expect(refusedClosedCount(VISA, 8)).toBe(1);
    expect(refusedClosedCount(VISA, null)).toBe(1); // Save, paste, blur: all closed
    expect(refusedClosedCount(VISA)).toBe(1);
    expect(refusedClosedCount(VISA + " ", 17)).toBe(1); // the caret passed a separator: closed
    expect(refusedClosedCount(VISA + " ", 16)).toBe(0); // the caret still right after the last digit
    expect(refusedClosedCount("x" + VISA, 17)).toBe(0);
    expect(refusedClosedCount(VISA + "2", 16)).toBe(0); // joined digits make a 17 digit run that fails Luhn
  });

  it("typing a Luhn invalid 16 digits one at a time: every keystroke is accepted", () => {
    const r = type("1234567890123456");
    expect(r.accepted.every(Boolean)).toBe(true);
    expect(r.text).toBe("1234567890123456");
  });

  it("typing a valid 16 digits: 16 accepted, the next space is refused, Save is refused, Backspace is accepted", () => {
    const r = type(VISA);
    expect(r.accepted).toEqual(Array(16).fill(true));
    const afterSpace = type(" ", r.text);
    expect(afterSpace.accepted).toEqual([false]);
    expect(refusesText(r.text)).toBe(true); // Save judges every run as closed
    const before: EditState = { text: VISA, caret: 16 };
    const afterBackspace: EditState = { text: VISA.slice(0, 15), caret: 15 };
    expect(acceptEdit(before, afterBackspace, 0)).toBe(true);
  });

  it("typing a valid number in groups of four: each digit accepted, the closing space after the last group is refused", () => {
    const r = type("4111 1111 1111 1111");
    expect(r.accepted.every(Boolean)).toBe(true);
    expect(type("x", r.text).accepted).toEqual([false]);
  });

  it("a paste or a drop (an insert of 2 or more characters) judges every run as closed", () => {
    const before: EditState = { text: "", caret: 0 };
    expect(acceptEdit(before, { text: VISA, caret: 16 }, 16)).toBe(false);
    expect(acceptEdit(before, { text: "hello there", caret: 11 }, 11)).toBe(true);
    // two characters make a paste: the open number is no longer open
    const open: EditState = { text: VISA, caret: 16 };
    expect(acceptEdit(open, { text: VISA + "ab", caret: 18 }, 2)).toBe(false);
  });

  it("a caret-only change is not judged; an edit elsewhere is then accepted; Save is refused", () => {
    const open: EditState = { text: VISA, caret: 16 };
    const moved: EditState = { text: VISA, caret: 3 };
    expect(acceptEdit(open, moved, 0)).toBe(true); // the caret may always move: no trap
    expect(refusedClosedCount(moved.text, moved.caret)).toBe(1); // the number is now closed
    const edited: EditState = { text: "x" + VISA, caret: 1 };
    expect(acceptEdit(moved, edited, 1)).toBe(true); // the count did not rise
    expect(refusesText(edited.text)).toBe(true); // Save (no caret) is refused
    // leaving the editor closes the run the same way: no caret, count 1, Save refused
    expect(refusedClosedCount(edited.text, null)).toBe(1);
  });

  it("a deletion is always accepted; the closed run it may leave is stopped at Save", () => {
    const before: EditState = { text: "4111 1111 a 1111 1111", caret: 12 };
    const after: EditState = { text: "4111 1111  1111 1111", caret: 11 };
    expect(acceptEdit(before, after, 0)).toBe(true);
    expect(refusesText(after.text)).toBe(true);
  });

  it("an edit that raises the number of refused closed runs is refused", () => {
    const before: EditState = { text: "4111 1111 1111 111", caret: 18 };
    // the digit at the caret completes a valid 16 digits: open, so accepted
    expect(acceptEdit(before, { text: before.text + "1", caret: 19 }, 1)).toBe(true);
    // a letter typed in the middle of an existing number closes nothing new
    expect(acceptEdit({ text: "ab", caret: 2 }, { text: "abc", caret: 3 }, 1)).toBe(true);
  });

  it("a span of an open run is open only when it ends at the run's last digit", () => {
    // the number, then two more digits: the span of the first four groups ends before the last digit
    const withExpiry = `${VISA_GROUPED} 12`;
    expect(refusedClosedCount(withExpiry, withExpiry.length)).toBe(1);
    expect(refusedClosedCount(withExpiry, null)).toBe(1);
    // a time before the number: the span that holds the number ends at the last digit, so it is open
    const afterTime = `14 05 ${VISA_GROUPED}`;
    expect(refusedClosedCount(afterTime, afterTime.length)).toBe(0);
    expect(refusedClosedCount(afterTime, null)).toBe(1);
    expect(refusedClosedCount(`${afterTime} `, afterTime.length)).toBe(0); // the caret is still after the last digit
    expect(refusedClosedCount(`${afterTime} `, afterTime.length + 1)).toBe(1); // the caret passed a separator
    // a caret inside the run closes the whole run
    expect(refusedClosedCount(afterTime, 8)).toBe(1);
  });

  it("a group of more than 19 digits is never refused, open or closed", () => {
    const PREFIX_ONLY = "41111111111111115678";
    const SUFFIX_ONLY = "12344111111111111111";
    for (const t of [PREFIX_ONLY, SUFFIX_ONLY, VISA + "12345678"]) {
      expect(refusedClosedCount(t, t.length)).toBe(0); // open
      expect(refusedClosedCount(t, 3)).toBe(0); // the caret inside it: closed
      expect(refusedClosedCount(t, null)).toBe(0); // Save, paste, blur: closed
    }
    // typing the 20 digits one at a time: the 16th digit completes a valid number, the 17th run it on to
    // a group that is no longer a number; every keystroke is accepted
    const r = type(PREFIX_ONLY);
    expect(r.accepted.every(Boolean)).toBe(true);
    expect(refusesText(r.text)).toBe(false);
  });

  it("a number in pairs of 2 with its expiry beside it: pasted and saved it is allowed; typed alone it is refused at the next separator", () => {
    const pairs = Array.from({ length: 8 }, (_, i) => VISA.slice(2 * i, 2 * i + 2)).join(" ");
    const line = `${pairs} 12/27 123`;
    const before: EditState = { text: "", caret: 0 };
    expect(acceptEdit(before, { text: line, caret: line.length }, line.length)).toBe(true);
    expect(refusedClosedCount(line, line.length)).toBe(0);
    expect(refusesText(line)).toBe(false); // Save
    // the number alone is refused in every layout (the original rule), so typing the space after it is refused
    const r = type(pairs);
    expect(r.accepted.every(Boolean)).toBe(true);
    expect(type(" ", r.text).accepted).toEqual([false]);
  });

  it("a span of an open run is judged by its own digits and group sizes: open at the last digit only", () => {
    // the number in 4-4-4-4 with a time before it: the span of the last four groups ends at the
    // run's last digit, so while the caret is there it is open and judged by nothing new
    const afterTime = `14 05 ${VISA_GROUPED}`;
    expect(refusedClosedCount(afterTime, afterTime.length)).toBe(0);
    expect(refusedClosedCount(afterTime, null)).toBe(1);
    // the same digits in pairs of 2 are not a card layout: closed, still allowed
    const pairs = Array.from({ length: 8 }, (_, i) => VISA.slice(2 * i, 2 * i + 2)).join(" ");
    expect(refusedClosedCount(`14 05 ${pairs}`, null)).toBe(0);
    // a number of a prefix no row holds, with a code after it: no span is a brand's number
    expect(refusedClosedCount("5063 5169 4500 5047 123", null)).toBe(0);
    // the whole run is a span that ends at the last digit, so it is open too
    expect(refusedClosedCount("1763556000000", 13)).toBe(0);
    expect(refusedClosedCount("1763556000000", null)).toBe(1);
  });

  it("typing a date and then a valid number: every digit is accepted, the next space is refused", () => {
    const r = type(VISA, "2026-11-19 ");
    expect(r.accepted.every(Boolean)).toBe(true);
    expect(type(" ", r.text).accepted).toEqual([false]);
    expect(refusesText(r.text)).toBe(true);
  });

  it("the number typed in groups of four, then its expiry: the separator after the number is refused", () => {
    const r = type(VISA_GROUPED);
    expect(r.accepted.every(Boolean)).toBe(true);
    expect(type(" 12/27", r.text).accepted[0]).toBe(false);
  });

  it("a pasted card line with its expiry and its code is refused, with or without a caret", () => {
    const line = `${VISA_GROUPED} 12 27 123`;
    const before: EditState = { text: "", caret: 0 };
    expect(acceptEdit(before, { text: line, caret: line.length }, line.length)).toBe(false);
    expect(refusedClosedCount(line, line.length)).toBe(1); // typed at the end, the number's own span is closed
  });
});

describe("the page's guard against an independent brute force of the narrowed rule (seeded lines)", () => {
  // A separate implementation: a regex for the runs, then every span of consecutive groups by slicing
  // the run's digit string at the group boundaries, a regex per brand, and the layouts spelled out.
  const luhnOk = (s: string): boolean => {
    const ds = [...s].reverse().map(Number);
    return ds.reduce((t, d, i) => t + (i % 2 === 1 ? (d * 2 > 9 ? d * 2 - 9 : d * 2) : d), 0) % 10 === 0;
  };
  // The layout test written a second way, by CUT POSITIONS (the running sums of the group sizes, the
  // total left out): equal to a card layout's cuts, or that plus one cut (a stray space), or minus
  // one (a missing space), or with exactly one cut moved by one position. The card layouts: a single
  // group (no cut); 4s with a last group of 1 to 4 (cuts 4, 8, 12, and 16 from 17 digits); 4-6-5 and
  // 4-6-4 (cuts 4 and 10, for 15 and 14 digits).
  const cardCuts = (total: number): number[][] => {
    const out: number[][] = [[]];
    out.push(total >= 17 ? [4, 8, 12, 16] : [4, 8, 12]);
    if (total === 14 || total === 15) out.push([4, 10]);
    return out;
  };
  function layoutByCuts(sizes: number[]): boolean {
    const total = sizes.reduce((a, b) => a + b, 0);
    const mine = new Set<number>();
    let at = 0;
    for (const s of sizes.slice(0, -1)) mine.add((at += s));
    for (const card of cardCuts(total)) {
      const theirs = new Set(card);
      const onlyMine = [...mine].filter((c) => !theirs.has(c));
      const onlyTheirs = card.filter((c) => !mine.has(c));
      if (onlyMine.length === 0 && onlyTheirs.length === 0) return true;
      if (onlyTheirs.length === 0 && onlyMine.length === 1) return true; // a stray space
      if (onlyMine.length === 0 && onlyTheirs.length === 1) return true; // a missing space
      if (onlyMine.length === 1 && onlyTheirs.length === 1 && Math.abs(onlyMine[0] - onlyTheirs[0]) === 1) return true;
    }
    return false;
  }
  function brute(line: string): boolean {
    for (const m of line.matchAll(/\d+(?:[ \t\r\n-]{1,3}\d+)*/g)) {
      const groups = m[0].match(/\d+/g) as string[];
      const starts = [0];
      for (const g of groups) starts.push(starts[starts.length - 1] + g.length);
      const digits = groups.join("");
      if (digits.length >= 13 && digits.length <= 19 && luhnOk(digits)) return true; // the original rule
      for (let i = 0; i < groups.length; i++) {
        for (let j = i + 1; j <= groups.length; j++) {
          const len = starts[j] - starts[i];
          if (len < 13 || len > 19) continue;
          const span = digits.slice(starts[i], starts[j]);
          if (!luhnOk(span) || !BRAND_RE.test(span)) continue;
          if (layoutByCuts(groups.slice(i, j).map((g) => g.length))) return true;
        }
      }
    }
    return false;
  }

  /** A small seeded generator (mulberry32), so the lines are the same on every run. */
  function rng(seed: number) {
    let a = seed;
    return () => {
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function lines(n: number): string[] {
    const r = rng(20261119);
    const pick = <T,>(xs: readonly T[]): T => xs[Math.floor(r() * xs.length)];
    const seps = [" ", " ", " ", "-", "\n", "  ", "   ", "    ", "x", ".", " and ", "\t"];
    const out: string[] = [];
    for (let i = 0; i < n; i++) {
      const parts: string[] = [];
      const count = 1 + Math.floor(r() * 7);
      for (let g = 0; g < count; g++) {
        const len = pick([1, 2, 2, 3, 4, 4, 4, 5, 8, 13, 16, 19, 20, 24]);
        let s = "";
        for (let d = 0; d < len; d++) s += String(Math.floor(r() * 10));
        parts.push(r() < 0.12 ? VISA.slice(0, Math.min(len, 16)) : s);
        parts.push(pick(seps));
      }
      out.push(parts.join(""));
    }
    return out;
  }

  const set = lines(4000);
  it("agrees with the brute force on every one of 4000 lines, and refuses a fair share of them", () => {
    let refused = 0;
    for (const line of set) {
      const want = brute(line);
      if (want) refused += 1;
      expect(refusesText(line), JSON.stringify(line.length)).toBe(want);
    }
    expect(refused).toBeGreaterThan(200);
    expect(refused).toBeLessThan(3800);
  });

  it("the count with a caret never exceeds the count without one (an open run only loses spans)", () => {
    for (const line of set.slice(0, 1500)) {
      const closed = refusedClosedCount(line, null);
      expect(refusedClosedCount(line, line.length)).toBeLessThanOrEqual(closed);
      expect(refusedClosedCount(line, Math.floor(line.length / 2))).toBeLessThanOrEqual(closed);
    }
  });
});

describe("the strings a note holds are all judged", () => {
  const base = {
    id: "note-0123456789abcdef0123456789abcdef",
    scenario: "card-fraud",
    category: "Note",
    link: { kind: "tx", id: "tx-0001042" },
    body: doc(para(text("Seen at the terminal."))),
  };
  it("a clean note holds none", () => {
    expect(holdsCardNumber(base)).toBe(false);
  });
  it.each([
    ["id", { id: "note-" + VISA + "abcdefabcdefabcd" }],
    ["scenario", { scenario: "4111-1111-1111-1111" }],
    ["category", { category: "4111 1111 1111 1111" }],
    ["link.kind", { link: { kind: "k4111111111111111", id: "tx-1" } }],
    ["link.id", { link: { kind: "tx", id: "tx-" + VISA } }],
    ["body", { body: doc(para(text(VISA))) }],
  ])("a card number in the %s is found", (_name, over) => {
    expect(holdsCardNumber({ ...base, ...over })).toBe(true);
  });
});

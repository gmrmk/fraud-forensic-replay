/**
 * The words of the investigator's paths: every string of PLAN-path part 7 is pinned, labels are at most
 * three words, a fixed tooltip is one sentence of at most twenty words, a builder's first line is a name
 * with no full stop, no string holds a dash character or a conclusion word, and the numbers a sentence
 * names agree with the limits the store enforces.
 */
import { describe, it, expect } from "vitest";
import { MARK_LIMITS } from "../marks/types";
import {
  PATH_WORDS,
  chipTip,
  drawingName,
  hiddenChips,
  hiddenLabel,
  lineTip,
  moreStops,
  plateLabel,
  recordWords,
  removeStopName,
  rowName,
  rowTip,
  stopLine,
  stopTitle,
  stopsCount,
  timeLine,
} from "./paths";

// The dash characters and the middle dot are built from code points so this file holds none of them.
const EN = String.fromCodePoint(0x2013);
const EM = String.fromCodePoint(0x2014);
const DOT = String.fromCodePoint(0xb7);
const words = (s: string): number => s.split(/\s+/).filter(Boolean).length;
const FORBIDDEN = ["fraud", "suspicious", "cause", "risk", "guilty", "attack", "chance"];

const fixed = (): string[] => [...Object.values(PATH_WORDS.labels), ...Object.values(PATH_WORDS.tips)];

/** Every string the builders can print, for a spread of inputs. */
const built = (): string[] => [
  drawingName("Path 1"),
  removeStopName(2),
  rowName("Path 1"),
  stopsCount(1),
  stopsCount(4),
  ...rowTip(4, "globe"),
  ...rowTip(4, "timeline"),
  ...rowTip(4, null),
  stopTitle([2], 4, "Path 1"),
  stopTitle([1, 3], 4, "Path 1"),
  stopTitle([1, 3, 5], 6, "Path 1"),
  plateLabel([1, 3]),
  recordWords("Sign-in", "192.0.2.7"),
  timeLine("May 3, 10:20"),
  ...lineTip("Path 1", 1, 3),
  ...chipTip(2, "Sign-in: 192.0.2.7"),
  stopLine(2, "Sign-in: 192.0.2.7"),
  moreStops(3),
  hiddenLabel(3),
  ...hiddenChips(["a: 1", "b: 2", "c: 3"]),
];

describe("the words of the investigator's paths", () => {
  it("pins every label of part 7", () => {
    expect(PATH_WORDS.labels).toEqual({
      newPath: "New path",
      joinPinned: "Join pinned",
      heading: "Your paths",
      recordNotFound: "Record not found",
      rename: "Rename",
      pathName: "Path name",
      save: "Save",
      renameCancel: "Cancel",
      notSaved: "Not saved",
      remove: "Remove",
      removeAsk: "Remove this path?",
      removeConfirm: "Remove",
      keep: "Keep",
      notRemoved: "Not removed",
      addStop: "Add stop",
      done: "Done",
      cancel: "Cancel",
      discard: "Discard",
      keepDrawing: "Keep drawing",
    });
  });

  it("pins every tooltip sentence of part 7", () => {
    expect(PATH_WORDS.tips).toEqual({
      newPath: "Join records into a path of your own.",
      joinPinned: "Join the pinned records into a path, in time order.",
      joinUnderTwo: "Pin two records to join them.",
      drawingBusy: "Finish or cancel the path you are drawing.",
      limit: "This scenario holds 20 paths, the limit.",
      heading: "Paths you made.",
      rename: "Rename this path.",
      pathName: "The new name of this path.",
      save: "Save the name.",
      renameCancel: "Keep the old name.",
      nameEmpty: "A path needs a name.",
      nameTaken: "Another path has this name.",
      cardNumber: "The name has a number that looks like a card number.",
      nameTooLong: "The name is longer than 24 characters.",
      nameOther: "The name is not saved.",
      remove: "Remove this path.",
      removeConfirm: "Remove the path from this scenario.",
      keep: "Keep this path.",
      notRemoved: "The path is not removed.",
      addStop: "Add the selected record as the next stop.",
      noSelection: "Select a record first.",
      noTime: "This record has no time.",
      alreadyStop: "This record is a stop already.",
      fullPath: "This path has 50 stops.",
      done: "Finish this path.",
      needsTwo: "A path needs two stops.",
      notSavedPath: "The path is not saved.",
      cancel: "Stop drawing this path.",
      discard: "Drop this path and its stops.",
      keepDrawing: "Go back to drawing this path.",
      removeStop: "Remove this stop.",
    });
  });

  it("every label is at most three words", () => {
    for (const label of Object.values(PATH_WORDS.labels)) expect(words(label), label).toBeLessThanOrEqual(3);
  });

  it("every fixed tooltip is one sentence of at most twenty words, ending with a full stop", () => {
    for (const tip of Object.values(PATH_WORDS.tips)) {
      expect(tip.endsWith("."), tip).toBe(true);
      expect(tip.slice(0, -1).includes("."), tip).toBe(false);
      expect(tip.includes("\n"), tip).toBe(false);
      expect(words(tip), tip).toBeLessThanOrEqual(20);
    }
  });

  it("the sentences that name a number agree with the limits", () => {
    expect(PATH_WORDS.tips.limit).toBe(`This scenario holds ${MARK_LIMITS.pathsPerScenario} paths, the limit.`);
    expect(PATH_WORDS.tips.nameTooLong).toBe(`The name is longer than ${MARK_LIMITS.nameChars} characters.`);
    expect(PATH_WORDS.tips.fullPath).toBe(`This path has ${MARK_LIMITS.stopsMax} stops.`);
    expect(MARK_LIMITS.stopsMin).toBe(2);
  });

  it("holds no dash character and no conclusion word in any string, fixed or built", () => {
    for (const s of [...fixed(), ...built()]) {
      expect(s.includes(EN), s).toBe(false);
      expect(s.includes(EM), s).toBe(false);
    }
    for (const s of fixed()) for (const w of FORBIDDEN) expect(s.toLowerCase().includes(w), `${w} in ${s}`).toBe(false);
  });

  it("the stop title names the stop or the stops, the number of stops and the path", () => {
    expect(stopTitle([2], 4, "Path 1")).toBe("Stop 2 of 4, Path 1");
    expect(stopTitle([1, 3], 4, "Path 1")).toBe("Stops 1 and 3 of 4, Path 1");
    expect(stopTitle([1, 3, 5], 6, "Path 1")).toBe("Stops 1, 3 and 5 of 6, Path 1");
  });

  it("the plate label joins the numbers with the middle dot", () => {
    expect(plateLabel([2])).toBe("2");
    expect(plateLabel([1, 3])).toBe(`1${DOT}3`);
  });

  it("the row's tooltip names the stops, then where the path is drawn", () => {
    expect(rowTip(4, "globe")).toEqual(["Your path, 4 stops.", "Drawn on the globe and the Timeline."]);
    expect(rowTip(4, "timeline")).toEqual(["Your path, 4 stops.", "Drawn on the Timeline."]);
    expect(rowTip(4, null)).toEqual(["Your path, 4 stops."]);
  });

  it("the line's tooltip reads two lines", () => {
    expect(lineTip("Path 1", 1, 3)).toEqual(["Your path, Path 1", "Stop 1 to stop 3"]);
  });

  it("the small builders", () => {
    expect(drawingName("Path 1")).toBe("Drawing Path 1");
    expect(removeStopName(2)).toBe("Remove stop 2");
    expect(rowName("Path 1")).toBe("Path 1, your path");
    expect(stopsCount(1)).toBe("1 stop");
    expect(stopsCount(4)).toBe("4 stops");
    expect(recordWords("Sign-in", "192.0.2.7")).toBe("Sign-in: 192.0.2.7");
    expect(timeLine("May 3, 10:20")).toBe("Time: May 3, 10:20");
    expect(chipTip(2, "Sign-in: 192.0.2.7")).toEqual(["Stop 2", "Sign-in: 192.0.2.7"]);
    expect(stopLine(2, "Sign-in: 192.0.2.7")).toBe("2 Sign-in: 192.0.2.7");
    expect(moreStops(3)).toBe("+3 more");
    expect(hiddenLabel(3)).toBe("+3");
  });

  it("the chips hidden past four stops: one heading line, then one numbered line each, eight at most", () => {
    expect(hiddenChips(["a: 1", "b: 2"])).toEqual(["Stops 1 to 2", "1 a: 1", "2 b: 2"]);
    const many = Array.from({ length: 11 }, (_, i) => `k: ${i + 1}`);
    const lines = hiddenChips(many);
    expect(lines[0]).toBe("Stops 1 to 11");
    expect(lines).toHaveLength(1 + 8 + 1);
    expect(lines[8]).toBe("8 k: 8");
    expect(lines[9]).toBe("+3 more");
  });

  it("a builder's first line is a name: no full stop", () => {
    for (const first of [
      stopTitle([2], 4, "Path 1"),
      stopTitle([1, 3], 4, "Path 1"),
      lineTip("Path 1", 1, 3)[0],
      chipTip(2, "Sign-in: 192.0.2.7")[0],
    ]) {
      expect(first.includes("."), first).toBe(false);
    }
  });
});

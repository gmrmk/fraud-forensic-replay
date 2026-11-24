/**
 * The words of the investigator's own paths: every label, tooltip and accessible name of the Paths
 * menu, the drawing strip and the plates, in one place for every builder of the piece (PLAN-path part 7).
 * A label is a plain name of at most three words; a fixed tooltip is one sentence. A builder returns a
 * first line that is a name (no full stop) and, where a second line is shown, a value.
 *
 * Words only: nothing here holds state, reads a store or a clock, or states a conclusion about a case.
 * A record's own words (a kind's manifest label, a headline) and a time already worded come in as
 * arguments, so no word of one story is written here. A middle dot is built from its code point so
 * this file holds only plain ASCII.
 */

/** The middle dot that joins the numbers of a merged plate. */
const MIDDLE_DOT = String.fromCodePoint(0xb7);

/** What a surface shows. `null` for a path drawn on neither (a row of a path with no drawable stop). */
export type Drawn = "globe" | "timeline" | null;

export const PATH_WORDS = {
  labels: {
    newPath: "New path",
    joinPinned: "Join pinned",
    heading: "Your paths",
    recordNotFound: "Record not found",
    rename: "Rename",
    /** The rename field's accessible name. */
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
  },
  tips: {
    newPath: "Join records into a path of your own.",
    joinPinned: "Join the pinned records into a path, in time order.",
    joinUnderTwo: "Pin two records to join them.",
    drawingBusy: "Finish or cancel the path you are drawing.",
    /** Also the strip's "Not saved" reason for a full scenario. Names the store's limit of 20 paths. */
    limit: "This scenario holds 20 paths, the limit.",
    heading: "Paths you made.",
    rename: "Rename this path.",
    /** The rename field's tooltip. */
    pathName: "The new name of this path.",
    save: "Save the name.",
    renameCancel: "Keep the old name.",
    nameEmpty: "A path needs a name.",
    nameTaken: "Another path has this name.",
    cardNumber: "The name has a number that looks like a card number.",
    /** Names the name limit of 24 characters. */
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
    /** Names the limit of 50 stops. */
    fullPath: "This path has 50 stops.",
    done: "Finish this path.",
    needsTwo: "A path needs two stops.",
    notSavedPath: "The path is not saved.",
    cancel: "Stop drawing this path.",
    discard: "Drop this path and its stops.",
    keepDrawing: "Go back to drawing this path.",
    removeStop: "Remove this stop.",
  },
} as const;

/** The strip's accessible name: "Drawing Path 1". */
export const drawingName = (name: string): string => `Drawing ${name}`;

/** A chip's remove button's accessible name: "Remove stop 2". */
export const removeStopName = (n: number): string => `Remove stop ${n}`;

/** A row's switch's accessible name: "Path 1, your path". */
export const rowName = (name: string): string => `${name}, your path`;

/** A row's spoken count: "1 stop", "4 stops". */
export const stopsCount = (n: number): string => (n === 1 ? "1 stop" : `${n} stops`);

/** "+3 more": what is left after a list is cut. */
export const moreStops = (n: number): string => `+${n} more`;

/** A row's tooltip: what the path is, then where it is drawn (a second line only when it is drawn). */
export function rowTip(stops: number, drawn: Drawn): string[] {
  const first = `Your path, ${stopsCount(stops)}.`;
  if (drawn === "globe") return [first, "Drawn on the globe and the Timeline."];
  if (drawn === "timeline") return [first, "Drawn on the Timeline."];
  return [first];
}

/**
 * A plate's first tooltip line: which stop or stops it stands for, of how many, in which path.
 * One number: "Stop 2 of 4, Path 1". Two: "Stops 1 and 3 of 4, Path 1". More: "Stops 1, 3 and 5 of 6, Path 1".
 */
export function stopTitle(nums: readonly number[], total: number, pathName: string): string {
  if (nums.length <= 1) return `Stop ${nums[0] ?? 0} of ${total}, ${pathName}`;
  const head = nums.slice(0, -1).join(", ");
  return `Stops ${head} and ${nums[nums.length - 1]} of ${total}, ${pathName}`;
}

/** A plate's face: the stop numbers, joined by the middle dot when one plate stands for several. */
export const plateLabel = (nums: readonly number[]): string => nums.join(MIDDLE_DOT);

/** A record in words: its kind's label, then its headline. */
export const recordWords = (kindLabel: string, headline: string): string => `${kindLabel}: ${headline}`;

/** A plate's last tooltip line; `when` is a time already worded by the clock form in force. */
export const timeLine = (when: string): string => `Time: ${when}`;

/** The globe line's tooltip: the path, then the two stops the segment joins. */
export const lineTip = (pathName: string, from: number, to: number): string[] => [
  `Your path, ${pathName}`,
  `Stop ${from} to stop ${to}`,
];

/** A chip's tooltip: its stop, then its record in words. */
export const chipTip = (n: number, words: string): string[] => [`Stop ${n}`, words];

/** One numbered line of a list of stops: "2 Sign-in: 192.0.2.7". */
export const stopLine = (n: number, words: string): string => `${n} ${words}`;

/** The strip's label for the stops it does not show as chips: "+3". */
export const hiddenLabel = (n: number): string => `+${n}`;

/** How many numbered lines a hidden-chips tooltip or a merged plate's tooltip lists. */
const LISTED = 8;

/**
 * The tooltip of the strip's "+N": `words[i]` is the record of stop i + 1, in order. A heading line,
 * then one numbered line for each of the first eight, then "+M more" for the rest.
 */
export function hiddenChips(words: readonly string[]): string[] {
  const lines = [`Stops 1 to ${words.length}`, ...words.slice(0, LISTED).map((w, i) => stopLine(i + 1, w))];
  if (words.length > LISTED) lines.push(moreStops(words.length - LISTED));
  return lines;
}

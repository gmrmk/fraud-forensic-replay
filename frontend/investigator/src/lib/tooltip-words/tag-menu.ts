// frontend/investigator/src/lib/tooltip-words/tag-menu.ts
// Every sentence the right-click menu on a record adds (PLAN-tag-menu part 7). Names are plain words of
// at most three; each tooltip is one sentence that says what a thing is or what a press does; none states
// a conclusion about a record or a person. The strings the menu reuses are not repeated here: "Add a
// note" (`ADD_ROW.visible`), the lens row (`OPENER`), the group of three buttons (`GROUP`), each button's
// press and held tooltips (`pressTip`, `heldTip`), the Fail category row (`FAIL_CATEGORY`) and the
// refusal lines (`STATUS`, through `statusWord`). `LIST_NAME` and `LIST_ROW_TIP` are the short list's
// (part D), landed here with the rest and unused until D.
//
// What this file does not do: it holds no component and no logic beyond joining a value into a line.

/** The menu's accessible name: the fixed name, then the head's own text. */
export const MENU_NAME = (head: string): string => `Your mark: ${head}`;

/** The head's tooltip (its first line); a value line follows it. */
export const HEAD_TIP = "The record this menu marks.";

/** A value line: a time already written in the clock's form. */
export const timeLine = (t: string): string => `Time: ${t}`;

/** A value line: how many notes link the record (shown only above zero). */
export const notesLine = (n: number): string => `Notes: ${n}`;

/** The pin row's name, keyed by the record's current state. */
export const PIN_ROW = { pin: "Pin", unpin: "Unpin" } as const;

/** The pin row's tooltip. The menu is not a window, so no clause names one. */
export const PIN_TIP = {
  pin: "Pin the record so it stays drawn and leads your marks.",
  unpin: "Unpin the record.",
} as const;

/** The Add a note row's tooltip; its second line is `timeLine` of the note's time. */
export const ADD_TIP = "Add a note linked to this record.";

/** The tooltip of all three buttons while a mark held before this opening locks them; `word` is one of `DISPOSITION_WORD`. */
export const lockedTip = (word: string): string => `Your mark is ${word}; change it in your window for this record.`;

/** The short list of records at one point (part D): its name and a row's tooltip. */
export const LIST_NAME = "Records here";
export const LIST_ROW_TIP = "A record at this point; a press opens its menu.";

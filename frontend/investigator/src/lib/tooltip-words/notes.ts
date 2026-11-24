// frontend/investigator/src/lib/tooltip-words/notes.ts
// Every sentence a person reads in the custom notes feature, in one file. The notes window,
// the marks, the Inspector rows, the menu and the file messages take their
// words from here, and the app's one tooltip layer shows them (`tip()` in components/ui/Tip.tsx).
//
// The ids (M1, E4, T1 ...) name each sentence. A `{braced}` value is an argument here,
// printed unchanged. Times come from the caller, in the clock switch's 12 or 24 hour form.
// Rules met (Simplified Technical English): R2, R4, R5, R6,
// R7, R11; R8 (every sentence is 20 words or fewer); R9 for sentences, not for one-word labels.
// R1 (the approved dictionary) is not checked: no dictionary is at hand. E7's tip says the guard
// catches a mistake and does not stop a person set on hiding a number: "It catches a
// mistake. It does not stop a person who hides a number on purpose."

// ---- M: the menu and the file (the next piece uses these) ----
export const MENU_BUTTON = "Notes"; // M1
/** M2: the visible text is part of the name (WCAG 2.5.3). */
export const ADD_ROW = { visible: "Add a note", name: "Add a note at the playhead." } as const;
/** The record window's button: a note made there takes the record's own time (PLAN-tag-menu P3). */
export const ADD_ON_RECORD = { visible: "Add a note", name: "Add a note on this record." } as const;
export const addRowValueLines = (time: string, link: { kind: string; headline: string } | null): string[] => [
  `Playhead time: ${time}.`,
  ...(link ? [`Record to link: ${link.kind}: ${link.headline}.`] : []),
];
export const LIST_NAME = "Notes in this scenario"; // M3
export const EMPTY_LINES = ["This scenario has no notes yet.", "Press N on the Timeline to add a note."] as const; // M4
export const STATIC_LINES = ["Notes last for this visit.", "Save them to a file to keep them."] as const; // M5
export const SAVE_FILE = { name: "Save notes to a file.", tip: "The file holds the text of your notes." } as const; // M6
export const LOAD_FILE = { name: "Load notes from a file.", tip: "A note in the file replaces the note with the same ID." } as const; // M7
export const fileResult = {
  loaded: (n: number): string => `Loaded ${n} notes.`,
  notFile: "The file is not a notes file.",
  tooLarge: "The file is too large.",
  card: "The file has a number that looks like a card number. The app loaded no note.",
  scenario: "The file is for a scenario that this page does not have.",
} as const; // M8
export const CATEGORY_ADD = {
  name: "Add a category.",
  field: "Category name",
  card: "The name has a number that looks like a card number.",
  exists: "This category exists already.",
  tooLong: "The name is too long. The limit is 24 characters.",
} as const; // M9
/** The two buttons beside the category field (the design's prose names them; see the header). */
export const CATEGORY_FIELD_BUTTONS = { add: "Add", cancel: "Cancel" } as const;

// ---- E: the editor window ----
export const noteWindowName = (time: string): string => `Note, ${time}`; // E1

export const COLOUR_GROUP = "Colour"; // E2
export const colourName = (n: number): string => `Colour ${n}`;
export const colourTip = (n: number): string[] => [`This is note colour ${n} of 6.`, "It follows the active palette."];

export const CATEGORY = {
  name: "Category",
  tip: ["This is the category of the note.", "Add your own with the button beside the list."],
} as const; // E3

export const DECISION = {
  group: "PASS or FAIL",
  tip: ["PASS or FAIL is your own mark.", "The app does not set it."],
  choices: {
    none: { name: "None", tip: "This note has no mark." },
    pass: { name: "PASS", tip: "Mark this note PASS. The mark is yours." },
    fail: { name: "FAIL", tip: "Mark this note FAIL. The mark is yours." },
  },
} as const; // E4

export const TEXT_NAME = "Note text"; // E5

export const FORMATS = {
  bold: { name: "Bold", tip: "Make the selected text bold." },
  italic: { name: "Italic", tip: "Make the selected text italic." },
  underline: { name: "Underline", tip: "Underline the selected text." },
  strike: { name: "Strike", tip: "Strike through the selected text." },
  bullet_list: { name: "Bullet list", tip: "Make a bulleted list." },
  ordered_list: { name: "Numbered list", tip: "Make a numbered list." },
  quote: { name: "Quote", tip: "Make a quote." },
} as const; // E6

export const HINT = {
  lines: ["Do not type card data.", "The editor refuses card numbers only."],
  tip: [
    "The editor refuses a number that looks like a card number.",
    "It catches a mistake. It does not stop a person who hides a number on purpose.",
    "It does not check a number written in words.",
    "It does not check a security code or an expiry date.",
    "It does not check a number split across two notes.",
  ],
} as const; // E7

export const LINK = {
  line: (kind: string, headline: string): string => `Linked record: ${kind}: ${headline}`,
  remove: {
    name: "Remove the link.",
    tip: ["Remove the link to the record.", "The note then shows on the Timeline only."],
  },
  missing: "The linked record is not in the data.",
} as const; // E8

export const BUTTONS = { save: "Save the note.", delete: "Delete the note.", edit: "Edit the note." } as const; // E9
/** Save's tooltip: `draft` on every new note (its first Save closes its window); a saved note keeps `saved`. */
export const SAVE_TIP = { draft: "Save the note and close this window.", saved: "Save the changes to this note." } as const;

export const STATUS = {
  saved: "Saved.",
  savedVisit: "Saved for this visit.",
  unsaved: "Changes are not saved.",
  card: "The note has a number that looks like a card number. Remove it, then save.",
  tooLong: "The note is too long. The limit is 4,000 characters.",
  noAnswer: "The backend did not answer. The note is not saved. Press Save to try again.",
  refused: "The backend refused the note. Check the text and the category.",
  limit: "This scenario holds 1,000 notes. That is the limit.",
} as const; // E10

export const CLOSE = { ask: "This note has changes that are not saved.", save: "Save", discard: "Discard", cancel: "Cancel" } as const; // E11
export const DELETE = { ask: "Delete this note? This action is permanent.", confirm: "Delete", keep: "Keep" } as const; // E12

// ---- T1 and G1: the marks ----
export const markName = (category: string, label: string, time: string): string => `Open note: ${category}, ${label}, ${time}`;

export interface MarkTipInput {
  category: string;
  label: string;
  time: string;
  decision: "none" | "pass" | "fail";
  link: { kind: string; headline: string } | null;
}
/** T1's tooltip: what the thing is first, then its values. The mark is the person's, so the
 *  words say "You marked this". */
export function markTip(n: MarkTipInput): string[] {
  const out = [`Your note, category ${n.category}.`, n.label, `Time: ${n.time}`];
  if (n.decision === "pass") out.push("You marked this PASS.");
  if (n.decision === "fail") out.push("You marked this FAIL.");
  if (n.link) out.push(LINK.line(n.link.kind, n.link.headline));
  return out;
}
export const globeMarkName = (category: string, label: string, kind: string, headline: string): string =>
  `Open note: ${category}, ${label}, linked to ${kind}: ${headline}`; // G1

// ---- I1: the Inspector rows ----
export const INSPECTOR_ROWS = {
  title: "Your note",
  category: "Category",
  decision: "PASS or FAIL",
  time: "Time",
  link: "Linked record",
  body: "Note",
} as const;

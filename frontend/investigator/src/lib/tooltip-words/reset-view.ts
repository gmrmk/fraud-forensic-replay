// frontend/investigator/src/lib/tooltip-words/reset-view.ts
// The words of the reset button's tooltip: a first line that
// says what the button is, and one instruction that says what a press does. It says what the thing
// does and never what to conclude. The sentence follows the Simplified
// Technical English rules as the Wikipedia article states them.
//
// Nothing here is a word of one pack: "the opening view" is whatever view the case opened on.

// Tags beside the sentence, as in transport.ts:
//   R2 R3 R4 R6 R7 R8 R9 R11. Instruction, 13 words. "opening view" is a technical noun (R3, two
//   words), and its -ing form is a modifier in it (R6).

export const resetViewWords = (): string[] => [
  "Reset view",
  "Press to move the globe back to the opening view of this case.",
];

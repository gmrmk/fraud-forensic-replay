/**
 * The words the investigator's marks share: a disposition's name as the person reads it. PASS and
 * FAIL are the note's own words; WAITING is the data's status word. Words only: no state, no checks.
 */
import type { SetDisposition } from "./types";

export const DISPOSITION_WORD: Readonly<Record<SetDisposition, string>> = { pass: "PASS", fail: "FAIL", wait: "WAITING" };

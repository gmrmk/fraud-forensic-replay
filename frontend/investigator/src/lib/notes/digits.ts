/**
 * The one digit and format table the backend guard reads too (backend/tests/note_digit_table.json),
 * so the two languages cannot drift. The page reads it as a data module inside the app
 * (digit-table-data.ts, generated from that file; digit-table-data.test.ts fails when they
 * differ): the dev server refuses a file outside the app's root. The guard never asks the runtime
 * what a digit is: the JS engine's Unicode data and Python's differ by version.
 *
 * A code point z+d is the decimal digit d when z is one of digit_zeros and 0 <= d <= 9.
 * format_ranges are the Unicode format characters (category Cf), as inclusive ranges.
 */
import { DIGIT_TABLE_DATA as TABLE } from "./digit-table-data";

const ZEROS: readonly number[] = TABLE.digit_zeros;
const FORMAT: readonly (readonly number[])[] = TABLE.format_ranges;

/** Unicode version the table was generated from. */
export const DIGIT_TABLE_VERSION: string = TABLE.unicode_version;

/** The decimal value of a code point, or -1 when it is not a decimal digit. Binary search. */
export function digitValue(cp: number): number {
  let lo = 0;
  let hi = ZEROS.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const z = ZEROS[mid];
    if (cp < z) hi = mid - 1;
    else if (cp > z + 9) lo = mid + 1;
    else return cp - z;
  }
  return -1;
}

/** True for a Unicode format character (zero width joiner, soft hyphen, bidi marks and so on). */
export function isFormatCp(cp: number): boolean {
  let lo = 0;
  let hi = FORMAT.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const [a, b] = FORMAT[mid];
    if (cp < a) hi = mid - 1;
    else if (cp > b) lo = mid + 1;
    else return true;
  }
  return false;
}

/** True for a C0 or C1 control character (category Cc: stable since Unicode 1). */
export function isControlCp(cp: number): boolean {
  return cp <= 0x1f || (cp >= 0x7f && cp <= 0x9f);
}

/** Bidi override and isolate controls: U+202A to U+202E and U+2066 to U+2069. */
export function isBidiOverrideCp(cp: number): boolean {
  return (cp >= 0x202a && cp <= 0x202e) || (cp >= 0x2066 && cp <= 0x2069);
}

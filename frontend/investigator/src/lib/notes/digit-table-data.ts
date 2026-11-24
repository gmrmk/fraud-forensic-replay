/**
 * The digit and format table, as data inside the app. Generated from
 * backend/tests/note_digit_table.json (the file the backend guard reads), because the dev server
 * refuses a file outside the app's root and no other source file reaches out of it.
 * digit-table-data.test.ts reads both files and fails when they differ. To regenerate after a new
 * Unicode version, copy the three values of that JSON file here and run the notes tests.
 */
export const DIGIT_TABLE_DATA = {
  unicode_version: "16.0.0",
  digit_zeros: [48, 1632, 1776, 1984, 2406, 2534, 2662, 2790, 2918, 3046, 3174, 3302, 3430, 3558, 3664, 3792, 3872, 4160, 4240, 6112, 6160, 6470, 6608, 6784, 6800, 6992, 7088, 7232, 7248, 42528, 43216, 43264, 43472, 43504, 43600, 44016, 65296, 66720, 68912, 68928, 69734, 69872, 69942, 70096, 70384, 70736, 70864, 71248, 71360, 71376, 71386, 71472, 71904, 72016, 72688, 72784, 73040, 73120, 73552, 90416, 92768, 92864, 93008, 93552, 118000, 120782, 120792, 120802, 120812, 120822, 123200, 123632, 124144, 124401, 125264, 130032] as readonly number[],
  format_ranges: [[173,173], [1536,1541], [1564,1564], [1757,1757], [1807,1807], [2192,2193], [2274,2274], [6158,6158], [8203,8207], [8234,8238], [8288,8292], [8294,8303], [65279,65279], [65529,65531], [69821,69821], [69837,69837], [78896,78911], [113824,113827], [119155,119162], [917505,917505], [917536,917631]] as readonly (readonly [number, number])[],
} as const;

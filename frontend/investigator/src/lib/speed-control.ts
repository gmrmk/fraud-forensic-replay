import { SPEED_CHIPS } from "../components/timeline/speed-chips";

/**
 * The next discrete playback speed when stepping `current` by `dir` (+1 = faster,
 * −1 = slower / toward reverse) through SPEED_CHIPS, clamped at the ends. An
 * off-axis rate (one not in the set) anchors at 1× first so a step always has a
 * sane reference. Shared by the glyph transport (⏪/⏩) and the chip picker so both
 * agree on "what's the next speed".
 */
export function steppedRate(current: number, dir: 1 | -1): number {
  const i = SPEED_CHIPS.indexOf(current as (typeof SPEED_CHIPS)[number]);
  const from = i === -1 ? SPEED_CHIPS.indexOf(1) : i;
  const next = Math.max(0, Math.min(SPEED_CHIPS.length - 1, from + dir));
  return SPEED_CHIPS[next];
}

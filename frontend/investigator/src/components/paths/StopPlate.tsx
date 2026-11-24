/**
 * The square plate of one stop of the investigator's path: the stop's number (or the numbers of a plate
 * that stands for several, joined by the middle dot), led by the lens on the path's first drawn plate.
 * One markup for both surfaces: the globe's plate (mono 9 px, 13 px high) and the Timeline's (mono 8 px,
 * 11 px high). Drawn with square corners on the neutral plate ground the marks use, with a 1 px ink border.
 *
 * What this file does not do: it holds no state, reads no store, makes no tooltip and takes no press
 * (the marker or the button around it does), and sets no size above 9 px.
 */
import { PLATE as GROUND } from "../verdict/tone-style";
import { MarkGlyph } from "../marks/glyphs";
import { PLATE } from "./path-geometry";

interface Props {
  /** What the plate reads: `plateLabel(nums)`. */
  label: string;
  /** True on the plate with the path's lowest drawn number. */
  lens: boolean;
  size: "globe" | "timeline";
  /** The plate's own opacity (a path dimmed, a stop ahead of the playhead); full when absent. */
  opacity?: number;
}

export function StopPlate({ label, lens, size, opacity }: Props) {
  const box = size === "globe" ? PLATE.globe : PLATE.timeline;
  const height = size === "globe" ? PLATE.globe.height : PLATE.timeline.size;
  const minWidth = size === "globe" ? PLATE.globe.minWidth : PLATE.timeline.size;
  return (
    <span
      data-stop-plate={size}
      className={`flex items-center justify-center gap-[2px] font-mono font-semibold tabular-nums leading-none ${size === "globe" ? "text-[9px]" : "text-[8px]"}`}
      style={{
        background: GROUND,
        // Longhands, so the border reads back in a test environment that cannot split a shorthand holding a var().
        borderWidth: 1,
        borderStyle: "solid",
        borderColor: "var(--text)",
        color: "var(--text)",
        height,
        minWidth,
        paddingInline: box.padX,
        ...(opacity === undefined ? null : { opacity }),
      }}
    >
      {lens ? <MarkGlyph name="lens" size={box.lens} /> : null}
      <span>{label}</span>
    </span>
  );
}

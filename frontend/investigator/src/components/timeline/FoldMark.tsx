// frontend/investigator/src/components/timeline/FoldMark.tsx
// The one mark of a fold in the playbar: every fold control at the left end of a section (the
// Timeline, Total Events, the rows' header, an open row, a measure lane) and the grouping menu's caret
// draw it. It is a filled triangle drawn as a small picture, pointing right while the fold is closed
// and turned a quarter turn (pointing down) while it is open. One drawing in both states, so the mark
// is the same size open and closed; the two text characters it replaces were drawn at different sizes
// by the font.
//
// The right-pointing text character stays in the span, hidden, so the span's box and the label's
// metrics are what they were, and the picture is laid over that box. Every fold state of the playbar
// draws this one mark, a folded section that still shows a small version (`head/BarFold.tsx`,
// `LaneSmall.tsx`, `rows/RowsSmall.tsx`) included: there is no outline drawing anywhere. No motion:
// the turn is instant: open is the same drawing set at a quarter turn, not a transition.
import type { ReactElement } from "react";

/** The right-pointing triangle character, built from its code point. It is the hidden glyph that
 *  holds the box open; it is never visible. */
const HIDDEN_GLYPH = String.fromCodePoint(0x25b8);

/** The glyph's box as built: 5.8 by 12 CSS px (an 8 px mono glyph on a 12 px line). */
const BOX_W = 5.8;
const BOX_H = 12;

/** The one triangle, as a path in that box: standing on the capitals' baseline at y = 8, pointing
 *  right. It was the shape of the outline mark that folded sections with a small version drew; that
 *  mark is gone and this constant is where the shape now lives. `FoldMark.test.tsx` pins it. */
const TRIANGLE = "M1.25 3L5 5.5L1.25 8Z";

/** The mark of a fold: a filled triangle, pointing right while the fold is closed and turned a
 *  quarter turn (pointing down) while it is open. One drawing, so the two states are the same size.
 *  The right-pointing text character stays in the span, hidden, so the span's box and the label's
 *  metrics are what they were. `className` replaces the span's spacing (`mr-1 shrink-0`). */
export function FoldMark({ open, className }: { open: boolean; className?: string }): ReactElement {
  return (
    <span
      aria-hidden="true"
      data-fold-mark={open ? "open" : "closed"}
      className={className ?? "mr-1 shrink-0"}
      style={{ position: "relative", visibility: "hidden" }}
    >
      {HIDDEN_GLYPH}
      <svg
        aria-hidden="true"
        focusable="false"
        width={BOX_W}
        height={BOX_H}
        viewBox={`0 0 ${BOX_W} ${BOX_H}`}
        style={{ position: "absolute", left: 0, top: 0, visibility: "visible", overflow: "visible" }}
      >
        <path d={TRIANGLE} fill="currentColor" transform={open ? `rotate(90 ${BOX_W / 2} ${BOX_H / 2})` : undefined} />
      </svg>
    </span>
  );
}

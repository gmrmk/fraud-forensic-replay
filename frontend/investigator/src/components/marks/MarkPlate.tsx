/**
 * The investigator's plate: a small square plate that holds, in this order, the lens (when asked),
 * the count of the record's notes (none at 0), the disposition glyph (none for none) and the pin
 * (when pinned). The Timeline and the globe both draw it; the caller wraps it in the button that owns
 * the name, the tooltip and the press.
 *
 * Ahead of the playhead the contents (lens, count, glyph) dim, each to the opacity at which it still
 * reads 3 to 1 or more over the plate (`mark-ink.ts`), and the pin stays at full ink; the plate's
 * ground never dims, so a dimmed glyph keeps a known ground. While the record's window is open the
 * plate inverts: the ground is the text colour, the plain parts take the page background, and the
 * disposition glyph keeps the hue of its tone, fitted to that ground.
 *
 * It draws a pile's face when given one (`pile`): the lens (when asked), the multiplication sign
 * with the number of records in the muted ink, each decision glyph the pile carries once, and the pin.
 * A pile's glyph dims on its own flag, the lens and the figure on `dim`, the pin never; open, the
 * figure takes the open ink and each glyph its own fitted tone. The form of a single plate does not
 * change, and neither form has an outline.
 *
 * What this file does not do: it holds no words and no clock, draws no ring or handle (that is
 * `GlobeLens`), and decides nothing about which marks make a pile (`mark-piles.ts` does, and says
 * what the face holds). It reads only the theme and
 * colour mode, and only to fit colours when the plate is open or dimmed; at rest it draws in the
 * theme's variables. It exports components only (the refresh rule); the plate's width is `plateWidth`
 * in `geometry.ts`.
 */
import { MARK_INK, MarkGlyph, DispositionGlyph, MARK_GLYPH_PX } from "./glyphs";
import { PLATE_GAP_PX, PLATE_PAD_PX } from "./geometry";
import { plateInk } from "./mark-ink";
import type { PileGlyph } from "./mark-piles";
import type { Disposition } from "../../lib/marks/types";
import { useTheme } from "../../store/theme";
import { PLATE } from "../verdict/tone-style";

export interface MarkPlateProps {
  /** Lead with the lens (the Timeline's plate, and a globe plate that has no ring). */
  lens: boolean;
  /** The count of the record's notes; no part at 0. */
  notes: number;
  disposition: Disposition;
  pinned: boolean;
  /** The record is ahead of the playhead: contents dim, the pin does not. */
  dim: boolean;
  /** The record's window is open: the plate inverts. */
  open: boolean;
  /**
   * A pile's face in place of one record's: the sign and the number of records, then one glyph for
   * each decision the pile carries, in the order given. `notes` and `disposition` are not read.
   * Each glyph dims on its own flag; `dim` dims the lens and the figure.
   */
  pile?: { records: number; glyphs: readonly PileGlyph[] };
}

const OPEN_INK = "rgb(var(--bg-rgb))";
const ROW = { display: "inline-flex", alignItems: "center", gap: PLATE_GAP_PX } as const;

/** The multiplication sign, built from its code point (no source file holds it typed). */
const TIMES = String.fromCharCode(0xd7);
/** The ink of a pile's sign and figure at rest; open, they take OPEN_INK like the lens. */
const PILE_INK = "var(--text-muted)";
/** The text class of a count and of a pile's figure: the one size, mono 8 px. */
const FIGURE_CLASS = "font-mono text-[8px] leading-none tabular-nums";

export function MarkPlate({ lens, notes, disposition, pinned, dim, open, pile }: MarkPlateProps) {
  const theme = useTheme((s) => s.theme);
  const color = useTheme((s) => s.color);
  const ink = open ? OPEN_INK : MARK_INK;
  const hasGroup = pile !== undefined || lens || notes >= 1 || disposition !== "none";
  // At rest nothing is fitted: the plate draws in the theme's own variables, as it always did. A pile
  // fits as soon as one glyph of it dims, since a glyph dims on its own flag and the pile need not.
  const needFit = open || dim || (pile?.glyphs.some((g) => g.dim) ?? false);
  const fit = needFit ? plateInk(theme, color, pile ? "none" : disposition, open) : null;
  const plainDim = dim && fit ? { opacity: fit.plain } : null;
  const decisionDim = dim && fit ? { opacity: fit.decision } : null;
  const pileDim = dim && fit ? { opacity: fit.pileCount } : null;
  return (
    <span
      data-mark-plate
      data-open={open}
      className="shrink-0 whitespace-nowrap font-mono leading-none"
      style={{ ...ROW, background: open ? "var(--text)" : PLATE, padding: PLATE_PAD_PX, height: MARK_GLYPH_PX + 2 * PLATE_PAD_PX }}
    >
      {hasGroup && (
        <span data-dim-group style={{ ...ROW, opacity: 1 }}>
          {lens && (
            <span data-part="lens" style={{ ...ROW, color: ink, ...plainDim }}>
              <MarkGlyph name="lens" />
            </span>
          )}
          {pile && (
            <>
              <span
                data-part="pile"
                className={FIGURE_CLASS}
                style={{ ...ROW, height: MARK_GLYPH_PX, color: open ? OPEN_INK : PILE_INK, ...pileDim }}
              >
                {`${TIMES}${pile.records}`}
              </span>
              {pile.glyphs.map((g) => {
                // Each glyph is fitted for its own decision: the inverted colour, and its own dim.
                const own = needFit ? plateInk(theme, color, g.disposition, open) : null;
                return (
                  <span
                    key={g.disposition}
                    data-part="disposition"
                    data-disposition={g.disposition}
                    style={{ ...ROW, ...(g.dim && own ? { opacity: own.decision } : null) }}
                  >
                    <DispositionGlyph disposition={g.disposition} color={own?.glyph ?? undefined} />
                  </span>
                );
              })}
            </>
          )}
          {!pile && notes >= 1 && (
            <span data-part="count" className={FIGURE_CLASS} style={{ ...ROW, height: MARK_GLYPH_PX, color: ink, ...plainDim }}>
              {notes}
            </span>
          )}
          {!pile && disposition !== "none" && (
            <span data-part="disposition" style={{ ...ROW, ...decisionDim }}>
              <DispositionGlyph disposition={disposition} color={fit?.glyph ?? undefined} />
            </span>
          )}
        </span>
      )}
      {pinned && (
        <span data-part="pin" style={{ ...ROW, color: ink, opacity: 1 }}>
          <MarkGlyph name="pin" />
        </span>
      )}
    </span>
  );
}

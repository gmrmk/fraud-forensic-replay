/**
 * The shared small drawings of the investigator's marks: a check, a cross, an hourglass, a pushpin
 * and a lens, at 9 px on a plate and 12 px in a button, plus the disposition glyph in its tone and
 * the lens that sits over a dot on the globe. Pure svg, hidden from readers, with no words and no
 * store. Paint is the text colour (`currentColor`), so the place that uses a glyph sets its colour;
 * only `DispositionGlyph` sets one, the tone's. The paths and strokes are in `glyph-paths.ts`.
 *
 * This file exports only literal constants, one type and components (the refresh rule).
 */
import { TONE_STYLE } from "../verdict/tone-style";
import { toneOf, type SetDisposition } from "../../lib/marks/types";
import { GLYPH_PATHS, P12, P9, STROKE, lensGeometry, type GlyphName } from "./glyph-paths";

export type { GlyphName } from "./glyph-paths";

/** A glyph on a plate, in px. */
export const MARK_GLYPH_PX = 9;
/** A glyph in a button, in px. */
export const BUTTON_GLYPH_PX = 12;
/** The ink of a mark's plain parts. */
export const MARK_INK = "var(--text)";

const STROKED = { fill: "none", stroke: "currentColor", strokeLinecap: "butt" } as const;

/** One glyph. From 12 px the 12 unit form is drawn where the glyph has one (the pin has none). */
export function MarkGlyph({ name, size = MARK_GLYPH_PX }: { name: GlyphName; size?: number }) {
  const big = size >= BUTTON_GLYPH_PX && name !== "pin";
  const box = big ? 12 : 9;
  return (
    <svg aria-hidden="true" data-glyph={name} viewBox={`0 0 ${box} ${box}`} width={size} height={size} focusable="false">
      {name === "check" && (
        <path d={big ? P12.check : GLYPH_PATHS.check} strokeWidth={big ? STROKE.check12 : STROKE.check9} {...STROKED} />
      )}
      {name === "cross" && (
        <path d={big ? P12.cross : GLYPH_PATHS.cross} strokeWidth={big ? STROKE.cross12 : STROKE.cross9} {...STROKED} />
      )}
      {name === "hourglass" && <path d={big ? P12.hourglass : P9.hourglass} fill="currentColor" />}
      {name === "pin" && <path d={P9.pinUpright} fill="currentColor" />}
      {name === "lens" && (
        <>
          <path d={big ? P12.lensRing : P9.lensRing} strokeWidth={big ? STROKE.lensRing12 : STROKE.lensRing9} {...STROKED} />
          <path d={big ? P12.lensHandle : P9.lensHandle} strokeWidth={big ? STROKE.lensHandle12 : STROKE.lensHandle9} {...STROKED} />
        </>
      )}
    </svg>
  );
}

const DISPOSITION_GLYPH: Record<SetDisposition, GlyphName> = { pass: "check", fail: "cross", wait: "hourglass" };

/** PASS, FAIL or WAITING as its glyph in its tone's text colour, or in `color` where the ground asks for another (the inverted plate). */
export function DispositionGlyph({
  disposition,
  size = MARK_GLYPH_PX,
  color,
}: {
  disposition: SetDisposition;
  size?: number;
  color?: string;
}) {
  return (
    <span className="inline-flex" style={{ color: color ?? TONE_STYLE[toneOf(disposition)].text }}>
      <MarkGlyph name={DISPOSITION_GLYPH[disposition]} size={size} />
    </span>
  );
}

/**
 * The lens over a dot on the globe: a square svg centred on the ring, so the ring's centre is the
 * svg's centre, with the handle from the ring up and left at 135 degrees.
 */
export function GlobeLens({ ring, handle }: { ring: number; handle: number }) {
  const g = lensGeometry(ring, handle);
  return (
    <svg aria-hidden="true" data-glyph="lens" viewBox={`0 0 ${g.box} ${g.box}`} width={g.box} height={g.box} focusable="false">
      <circle cx={g.c} cy={g.c} r={g.r} strokeWidth={STROKE.globeRing} {...STROKED} />
      <line x1={g.from.x} y1={g.from.y} x2={g.to.x} y2={g.to.y} strokeWidth={STROKE.globeHandle} {...STROKED} />
    </svg>
  );
}

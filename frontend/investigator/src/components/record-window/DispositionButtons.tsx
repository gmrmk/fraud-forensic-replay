// frontend/investigator/src/components/record-window/DispositionButtons.tsx
// The three buttons of the record's own window: PASS, FAIL and WAITING, each a glyph and its word. A
// press asks the caller to set that disposition; a press on the held one asks it to clear (the marks
// store holds that rule, not this file). The held button is marked three ways, so a tone is never the
// only signal: aria-pressed, the text colour with a brighter border, and a 2 px rule in its tone.
//
// The tag menu draws the same buttons (`menuItems`: menuitemcheckbox roles; `lockedTip`: a mark held before
// the menu opened locks all three; `refused`: a line added to one button's tooltip). In those two states a
// button is aria-disabled and never `disabled`, so it keeps its focus and its tooltip; a press on it is
// ignored here. Without those props the markup is the record window's own.
//
// What this file does not do: it holds no state, reads no store, and decides nothing about a press beyond
// ignoring one on a locked or busy-in-a-menu button (the marks store holds the set and clear rule).
import { DISPOSITION_WORD } from "../../lib/marks/words";
import type { Disposition, SetDisposition } from "../../lib/marks/types";
import { GROUP, heldTip, pressTip } from "../../lib/tooltip-words/record-window";
import { TONE_STYLE } from "../verdict/tone-style";
import { BUTTON_GLYPH_PX, MarkGlyph } from "../marks/glyphs";
import { tip } from "../ui/Tip";
import { GLYPH_OF } from "./record-window";

const ORDER: readonly SetDisposition[] = ["pass", "fail", "wait"];

const BUTTON =
  "flex h-[22px] items-center gap-1 border border-panel-border-strong px-1.5 font-mono text-[9px] uppercase tracking-[0.12em] text-muted hover:bg-text/10 hover:text-text disabled:opacity-40 outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-accent";

interface Props {
  value: Disposition;
  /** A press waits for its answer: every button is disabled meanwhile (aria-disabled in a menu). */
  busy: boolean;
  onPress: (d: SetDisposition) => void;
  /** Given: every button is aria-disabled="true" (not disabled, so it keeps focus and its tooltip), a press
   *  does nothing, it dims, and this is each button's tooltip. */
  lockedTip?: string;
  /** In a menu: role menuitemcheckbox and aria-checked in place of aria-pressed, and `busy` is drawn as
   *  aria-disabled="true" with the press ignored (never `disabled`), so the pressed button keeps its focus. */
  menuItems?: boolean;
  /** A refused press: this button's tooltip gains `line` as its second line (the menu has no status line). */
  refused?: { d: SetDisposition; line: string } | null;
}

export function DispositionButtons({ value, busy, onPress, lockedTip, menuItems = false, refused = null }: Props) {
  const locked = lockedTip !== undefined;
  const inert = locked || (menuItems && busy);
  return (
    <div role="group" aria-label={GROUP.name} {...tip([GROUP.tip])} className="flex gap-1">
      {ORDER.map((d) => {
        const word = DISPOSITION_WORD[d];
        const held = value === d;
        // Longhands only: a shorthand beside them warns on the next render.
        const style = held
          ? {
              borderTopColor: "var(--text)",
              borderRightColor: "var(--text)",
              borderBottomColor: "var(--text)",
              borderLeftWidth: "2px",
              borderLeftStyle: "solid" as const,
              borderLeftColor: TONE_STYLE[d].text,
              color: "var(--text)",
              background: "rgb(var(--text-rgb) / 0.10)",
            }
          : undefined;
        return (
          <button
            key={d}
            type="button"
            {...(menuItems ? { role: "menuitemcheckbox", "aria-checked": held } : { "aria-pressed": held })}
            aria-disabled={inert ? true : undefined}
            disabled={!menuItems && !locked ? busy : undefined}
            data-disposition={d}
            onClick={() => {
              if (!inert) onPress(d);
            }}
            {...tip([lockedTip !== undefined ? lockedTip : held ? heldTip(word) : pressTip(word), refused?.d === d ? refused.line : null])}
            className={inert ? `${BUTTON} aria-disabled:opacity-40` : BUTTON}
            style={style}
          >
            <MarkGlyph name={GLYPH_OF[d]} size={BUTTON_GLYPH_PX} />
            {word}
          </button>
        );
      })}
    </div>
  );
}

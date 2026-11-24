import { useMemo, type ReactNode } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { useTheme } from "../store/theme";
import { legibleOnPanel } from "../theme/legibility";
import { resolvePalette } from "../theme/resolve";
import { Eyebrow, FocusButton } from "./ui";
import { tip } from "./ui/Tip";

/**
 * Layer menu rows. A LayerSwitch is a button for a layer or path the analyst can switch; a KeyRow
 * names a kind that cannot be switched, so it has no button, no hover and no pointer. Both rows are
 * 26 px tall and end in the same columns, so counts line up down a menu.
 */

/** The square on a switch row: filled in its colour when on, a 1 px ring in the dim token when
 *  off, so the state reads by shape as well as by colour. */
export function Swatch({ on, color }: { on: boolean; color: string }) {
  return (
    <span
      aria-hidden="true"
      className={`inline-block h-[9px] w-[9px] shrink-0 rounded-xs forced-color-adjust-none${on ? "" : " border border-dim"}`}
      style={on ? { backgroundColor: color } : undefined}
    />
  );
}

/** The square of a switch that is on with some of its values off: an outline with its left half filled,
 *  in the row's colour. Its corners are square; the fill survives forced colours as the plain square's does. */
export function MixedSwatch({ color }: { color: string }) {
  return (
    <svg
      aria-hidden="true"
      width="9"
      height="9"
      viewBox="0 0 9 9"
      className="shrink-0 forced-color-adjust-none"
      style={{ color }}
    >
      <rect x="0.5" y="0.5" width="8" height="8" fill="none" stroke="currentColor" strokeWidth="1" />
      <rect x="1" y="1" width="3.5" height="7" fill="currentColor" />
    </svg>
  );
}

export interface LayerSwitchProps {
  label: string;
  /** Accessible name, when it should differ from the label (a path reads "<label> path"). */
  name?: string;
  on: boolean;
  onToggle: () => void;
  color: string;
  count?: string;
  /** What a screen reader hears for the count, when "<a> of <b>" made from it is not right. */
  countSpoken?: string;
  /** A css colour for the count; the muted text tone when absent. */
  countTone?: string;
  /** Present when the row has details: a chevron button that folds the region `id`. `tipLines` are the
   *  chevron's tooltip lines (a title, then its sentence). */
  details?: { open: boolean; onToggle: () => void; id: string; tipLines?: readonly string[] };
  /** Keeps the row's count in the column of rows that carry a chevron. */
  gutter?: boolean;
  /** The id of an element that describes the toggle (a note under the row). */
  describedBy?: string;
  /** On with some of what it holds off: `aria-pressed="mixed"` and the two-part square. */
  mixed?: boolean;
  /** The label as the data holds it (no capitals, no letter spacing) at the row label's size. */
  plain?: boolean;
  /** The tooltip lines for the toggle (the first says what the row is). Given, they replace the native
   *  title on the label. Named `tipLines`, not `tip`, so the prop does not shadow the `tip()` helper. */
  tipLines?: readonly string[];
  /** A small drawing between the square and the label, in a 9 px box that a screen reader skips. */
  glyph?: ReactNode;
  /** Looks off and ignores a press, yet stays focusable and hoverable so its tooltip can be read. */
  disabled?: boolean;
}

const PLAIN_TONE = { text: "var(--text)", muted: "var(--text-muted)", dim: "var(--text-faint)" } as const;

/** A label as the data holds it: no capitals, no letter spacing, at the size and weight of the Eyebrow
 *  label (10 px, 600). A plain span, so no class override of the Eyebrow is in play. */
function PlainLabel({ tone, children }: { tone: keyof typeof PLAIN_TONE; children: ReactNode }) {
  return (
    <span className="truncate text-[10px]" style={{ color: PLAIN_TONE[tone], fontWeight: 600 }}>
      {children}
    </span>
  );
}

/** The empty column a chevron would occupy. */
function ChevronGutter() {
  return <span aria-hidden="true" className="w-6 shrink-0" />;
}

/** The count in words: "144 / 144" is read "144 of 144"; a given spoken form wins. */
function spokenCount(count: string, countSpoken?: string): string {
  return countSpoken ?? count.replace(" / ", " of ");
}

export function LayerSwitch({
  label,
  name,
  on,
  onToggle,
  color,
  count,
  countSpoken,
  countTone,
  details,
  gutter,
  describedBy,
  mixed,
  plain,
  tipLines,
  glyph,
  disabled,
}: LayerSwitchProps) {
  const FoldIcon = details?.open ? ChevronDown : ChevronRight;
  // The label's tone: faint while disabled, the text tone while on or mixed, muted when off.
  const tone = disabled ? "dim" : on || mixed ? "text" : "muted";
  return (
    <div className="flex items-center gap-0.5">
      <FocusButton
        variant="ghost"
        aria-pressed={mixed ? "mixed" : on}
        aria-label={name}
        aria-describedby={describedBy}
        aria-disabled={disabled ? true : undefined}
        onClick={disabled ? undefined : onToggle}
        {...(tipLines ? tip(tipLines) : {})}
        className="flex h-[26px] min-w-0 flex-1 items-center justify-between gap-2.5 rounded-xs px-1.5 -ml-1.5 text-left transition-colors hover:bg-text/10"
      >
        {/* The native tooltip is on this span, not on the button: a title on the button would read
            its name to a screen reader a second time. A row given `tipLines` carries its tooltip on
            the button instead (the focus finds it there) and no title. */}
        <span title={tipLines ? undefined : label} className="flex min-w-0 items-center gap-2">
          {mixed ? <MixedSwatch color={color} /> : <Swatch on={on} color={color} />}
          {glyph !== undefined && (
            <span
              aria-hidden="true"
              className="inline-flex h-[9px] w-[9px] shrink-0 items-center justify-center"
              style={{ color: "var(--text)" }}
            >
              {glyph}
            </span>
          )}
          {plain ? <PlainLabel tone={tone}>{label}</PlainLabel> : <Eyebrow tone={tone} className="truncate">{label}</Eyebrow>}
        </span>
        {count !== undefined && (
          <>
            <span
              aria-hidden="true"
              className="shrink-0 font-mono text-[10px] tabular-nums"
              style={{ color: countTone ?? "var(--text-muted)" }}
            >
              {count}
            </span>
            <span className="sr-only">{spokenCount(count, countSpoken)}</span>
          </>
        )}
      </FocusButton>
      {details ? (
        <FocusButton
          variant="icon"
          aria-expanded={details.open}
          aria-controls={details.open ? details.id : undefined}
          aria-label={`${label} details`}
          onClick={details.onToggle}
          {...(details.tipLines ? tip(details.tipLines) : {})}
          className="grid h-6 w-6 shrink-0 place-items-center rounded-xs text-muted transition-colors hover:bg-text/10"
        >
          <FoldIcon size={12} aria-hidden="true" />
        </FocusButton>
      ) : (
        gutter && <ChevronGutter />
      )}
    </div>
  );
}

/** A pack's own kind: a round dot in its colour, the label and the count reached over the total.
 *  Not a button. */
export function KeyRow({
  label,
  color,
  count,
  countSpoken,
  gutter,
}: {
  label: string;
  color: string;
  count: string;
  /** What a screen reader hears for the count, when "<a> of <b>" made from it is not right. */
  countSpoken?: string;
  gutter?: boolean;
}) {
  return (
    <div className="flex items-center gap-0.5">
      {/* pr-1.5 matches the switch button's padding, so the counts end at one edge. */}
      <div className="flex h-[26px] min-w-0 flex-1 items-center justify-between gap-2.5 pr-1.5">
        <span title={label} className="flex min-w-0 items-center gap-2">
          <span
            aria-hidden="true"
            className="mx-[1.5px] inline-block h-1.5 w-1.5 shrink-0 rounded-full forced-color-adjust-none"
            style={{ backgroundColor: color }}
          />
          <Eyebrow className="truncate">{label}</Eyebrow>
        </span>
        <span aria-hidden="true" className="shrink-0 font-mono text-[10px] tabular-nums text-muted">
          {count}
        </span>
        <span className="sr-only">{spokenCount(count, countSpoken)}</span>
      </div>
      {gutter && <ChevronGutter />}
    </div>
  );
}

/**
 * Maps a pack-declared colour to the one the menu draws. A #rrggbb colour keeps its hue and steps
 * its lightness to 3:1 against the menu surface of the current theme and colour mode (WCAG 1.4.11,
 * a graphic); the map keeps the declared colour. Any other value passes through as it is.
 */
// eslint-disable-next-line react-refresh/only-export-components -- the hook is shared by the two menu panels and sits with the rows that draw its colours
export function useOnMenu(): (declared: string) => string {
  const theme = useTheme((s) => s.theme);
  const color = useTheme((s) => s.color);
  return useMemo(() => {
    const surface = resolvePalette(theme, color)
      .material.panelBase.split(/\s+/)
      .map((n) => Number(n) / 255) as [number, number, number];
    return (declared: string): string =>
      /^#[0-9a-f]{6}$/i.test(declared) ? legibleOnPanel(declared, surface, 3) : declared;
  }, [theme, color]);
}

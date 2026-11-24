/**
 * The note window's small controls: the six colour swatches, the PASS or FAIL group, and the
 * format buttons. Radios are buttons with role=radio and a roving tab stop; arrows move the
 * choice. A colour reaches a style only through `colourCss` (the fixed table); the tooltip's
 * accent takes the same table value. Every name and every tooltip line is from the notes words.
 * Colour never carries the meaning alone: the checked swatch has a mark, and each PASS or FAIL
 * choice has a glyph and a word.
 */
import type { KeyboardEvent, ReactNode } from "react";
import { tip } from "../ui/Tip";
import { COMMANDS_ORDER } from "./note-format";
import type { FormatKind } from "./editor-commands";
import type { EditorSnapshot } from "./editor-snapshot";
import { COLOUR_SLOTS, DECISIONS, type ColourSlot, type Decision } from "../../lib/notes/types";
import { colourCss } from "../../lib/notes/colours";
import { COLOUR_GROUP, DECISION, FORMATS, colourName, colourTip } from "../../lib/tooltip-words/notes";

const FALLBACK = "var(--text-faint-on-panel)";
const FOCUS = "outline-none focus-visible:ring-1 focus-visible:ring-signal";

function moveOnArrow<T extends string>(values: readonly T[], value: T, onChange: (v: T) => void) {
  return (e: KeyboardEvent<HTMLElement>) => {
    const i = values.indexOf(value);
    let n: number;
    if (e.key === "ArrowRight" || e.key === "ArrowDown") n = (i + 1) % values.length;
    else if (e.key === "ArrowLeft" || e.key === "ArrowUp") n = (i - 1 + values.length) % values.length;
    else return;
    e.preventDefault();
    onChange(values[n]);
    const radios = e.currentTarget.querySelectorAll<HTMLElement>('[role="radio"]');
    radios[n]?.focus();
  };
}

export function ColourSwatches({ value, onChange }: { value: string; onChange: (c: ColourSlot) => void }) {
  const keys = moveOnArrow(COLOUR_SLOTS, value as ColourSlot, onChange);
  return (
    <div role="radiogroup" aria-label={COLOUR_GROUP} onKeyDown={keys} className="flex items-center gap-1.5">
      {COLOUR_SLOTS.map((slot, i) => {
        const checked = slot === value;
        const css = colourCss(slot) ?? FALLBACK;
        return (
          <button
            key={slot}
            type="button"
            role="radio"
            aria-checked={checked}
            aria-label={colourName(i + 1)}
            tabIndex={checked ? 0 : -1}
            {...tip(colourTip(i + 1), css)}
            onClick={() => onChange(slot)}
            className={`relative h-[18px] w-[18px] rounded-sm border border-panel-border-strong ${checked ? "ring-1 ring-text ring-offset-1 ring-offset-[rgb(var(--panel-base))]" : ""} ${FOCUS}`}
            style={{ background: css }}
          >
            {checked ? (
              <svg aria-hidden="true" viewBox="0 0 18 18" className="absolute inset-0 h-full w-full">
                <path d="M4.5 9.5l3 3 6-6.5" fill="none" stroke="rgb(var(--panel-base))" strokeWidth="2" />
              </svg>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}

const GLYPH: Record<Decision, ReactNode> = {
  none: <path d="M2.5 6h7" fill="none" stroke="currentColor" strokeWidth="1.6" />,
  pass: <path d="M2 6.2l2.6 2.6L10 3.4" fill="none" stroke="currentColor" strokeWidth="1.6" />,
  fail: <path d="M2.5 2.5l7 7M9.5 2.5l-7 7" fill="none" stroke="currentColor" strokeWidth="1.6" />,
};

export function DecisionGroup({ value, colour, onChange }: { value: Decision; colour: string; onChange: (d: Decision) => void }) {
  const keys = moveOnArrow(DECISIONS, value, onChange);
  return (
    <div role="radiogroup" aria-label={DECISION.group} {...tip(DECISION.tip)} onKeyDown={keys} className="flex items-center gap-1">
      {DECISIONS.map((d) => {
        const checked = d === value;
        return (
          <button
            key={d}
            type="button"
            role="radio"
            aria-checked={checked}
            tabIndex={checked ? 0 : -1}
            {...tip([DECISION.choices[d].tip])}
            onClick={() => onChange(d)}
            className={`flex h-6 items-center gap-1 rounded-sm border px-1.5 font-mono text-[9px] tracking-[0.12em] ${checked ? "border-current" : "border-panel-border text-muted"} ${FOCUS}`}
            style={checked ? { color: colour } : undefined}
          >
            <svg aria-hidden="true" viewBox="0 0 12 12" className="h-3 w-3 shrink-0">
              {GLYPH[d]}
            </svg>
            {DECISION.choices[d].name}
          </button>
        );
      })}
    </div>
  );
}

const ICON: Record<FormatKind, ReactNode> = {
  bold: <span className="font-bold">B</span>,
  italic: <span className="italic">I</span>,
  underline: <span className="underline">U</span>,
  strike: <span className="line-through">S</span>,
  bullet_list: (
    <svg aria-hidden="true" viewBox="0 0 12 12" className="h-3 w-3">
      <path d="M4.5 3h6M4.5 6h6M4.5 9h6" stroke="currentColor" strokeWidth="1.2" />
      <circle cx="1.8" cy="3" r="0.9" fill="currentColor" />
      <circle cx="1.8" cy="6" r="0.9" fill="currentColor" />
      <circle cx="1.8" cy="9" r="0.9" fill="currentColor" />
    </svg>
  ),
  ordered_list: (
    <svg aria-hidden="true" viewBox="0 0 12 12" className="h-3 w-3">
      <path d="M5 3h6M5 6h6M5 9h6" stroke="currentColor" strokeWidth="1.2" />
      <path d="M1 2.4l1-.6v2.6M1 7.4h2L1 9.6h2" fill="none" stroke="currentColor" strokeWidth="0.8" />
    </svg>
  ),
  quote: (
    <svg aria-hidden="true" viewBox="0 0 12 12" className="h-3 w-3">
      <path d="M1.5 2v8" stroke="currentColor" strokeWidth="1.4" />
      <path d="M4.5 4h6M4.5 7h5" stroke="currentColor" strokeWidth="1.2" />
    </svg>
  ),
};

export function FormatBar({
  active,
  enabled,
  onRun,
}: {
  active: EditorSnapshot["active"] | null;
  enabled: EditorSnapshot["enabled"] | null;
  onRun: (k: FormatKind) => void;
}) {
  return (
    <div role="toolbar" className="flex items-center gap-0.5">
      {COMMANDS_ORDER.map((k) => (
        <button
          key={k}
          type="button"
          aria-label={FORMATS[k].name}
          aria-pressed={active ? active[k] : false}
          disabled={enabled ? !enabled[k] : false}
          {...tip([FORMATS[k].tip])}
          // The press must not take the focus from the text, or the selection it acts on would go.
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => onRun(k)}
          className={`flex h-[22px] w-[22px] items-center justify-center rounded-sm font-mono text-[10px] text-muted hover:text-text disabled:opacity-40 aria-pressed:bg-text/10 aria-pressed:text-text ${FOCUS}`}
        >
          {ICON[k]}
        </button>
      ))}
    </div>
  );
}

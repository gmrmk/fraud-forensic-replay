import { useEffect, useId, useState, type CSSProperties, type ReactNode } from "react";
import { WindowFrame } from "./WindowFrame";
import { ValueText } from "./ValueText";
import { firstPieceChars } from "../../lib/value-pieces";
import { usePivotStore } from "../../store/pivot";
import { useNavigation } from "../../store/navigation";
import { resolveEntityRef } from "../../lib/decision-entities";
import { entityLngLat } from "../../lib/node-anchor";
import { actionRampVar } from "../../lib/decisions";
import type { Decision, DecisionInput } from "../../lib/decisions";
import type { TraceWindowState } from "../../store/pivot";
import { isMatchableField, type PivotContext } from "../../lib/matches";
import { FieldMatchBadge } from "../match/FieldMatchBadge";
import { InspectorField } from "../inspector/InspectorField";
import { tip } from "../ui/Tip";

/** The backend may tag an input with the pivot column it came from (the CPP
 *  rule's Terminal carries `field: "terminal_id"`); DecisionInput does not
 *  declare it, and an unregistered tag is simply not matchable. */
type TaggedInput = DecisionInput & { field?: unknown };

interface Props {
  window: TraceWindowState;
  decisions: Decision[];
  context: PivotContext;
  screenPos?: { x: number; y: number };
  /** Entity ahead of the playhead (layer-computed). */
  dimmed?: boolean;
  onToggleFlag?: () => void;
  onDragTo?: (x: number, y: number) => void;
}

// Built from code points so no glyph sits in the source: the "greater or equal" sign, the "less or
// equal" sign, the no-break space, and the triangle WindowFrame's own fold control uses.
const GE = String.fromCharCode(0x2265);
const LE = String.fromCharCode(0x2264);
const NBSP = String.fromCharCode(0xa0);
const TRIANGLE = String.fromCharCode(0x25b8);

/** A bound already carries its own comparison operator (">=", "<=", ">", "<", the two signs above,
 *  "=") as a leading token, e.g. a rule authored as ">= 900 mph". */
const BOUND_HAS_OPERATOR = new RegExp("^\\s*(>=|<=|[><=" + GE + LE + "])");

/** A bound that is a bare number (optionally signed/decimal): the only shape where a synthesized
 *  comparison operator is meaningful. Prose bounds ("known device required") or bounds with units
 *  read fine standing alone. */
const BOUND_IS_PLAIN_NUMBER = /^\s*-?\d+(\.\d+)?\s*$/;

/** The space after a leading operator, so an operator never parts from its number. */
const OPERATOR_SPACE = new RegExp("^(\\s*(?:>=|<=|[><=" + GE + LE + "]))\\s");

/** The operator is only synthesized for a bare numeric bound (">" when breached, the
 *  "greater or equal" sign otherwise); any other shape (already operator-bearing or prose) prints
 *  `bound` as given, letting the bound's own relation speak for itself. */
function boundWithOperator(bound: string, breached: boolean): string {
  const text =
    BOUND_HAS_OPERATOR.test(bound) || !BOUND_IS_PLAIN_NUMBER.test(bound)
      ? bound
      : `${breached ? ">" : GE} ${bound}`;
  return text.replace(OPERATOR_SPACE, "$1" + NBSP);
}

/** Between a label and its value on one line: 8 px at least, and what the value's first piece needs
 *  is kept free of the label, so a label that does not fit with it wraps and the value stays whole on
 *  its first line. The value holds its own 8 px (padding or margin before its first piece, which fits
 *  on a line with it or drops under the label whole); the label's cap is that gap plus the piece's
 *  width. LIMIT: the piece's width is its characters at 0.64 em, the advance of the mono face at the
 *  window's text size (6.95 px at 11 px, measured); a face with a wider advance leaves less than the
 *  cap's room, and the value then drops under its label, whole, instead of touching it. */
const MONO_ADVANCE_EM = 0.64;
const LABEL_GAP_PX = 8;
const CROSS_ROOM_PX = 12;
// (text-left: a label that wraps starts each line at the left edge, not at the row's right alignment)
const LABEL_CAP = "[&_.float-left]:max-w-[calc(100%_-_var(--lbl-room))] [&_.float-left]:text-left";
function labelRoom(chars: number, extraPx = 0): CSSProperties {
  const em = Math.round(chars * MONO_ADVANCE_EM * 100) / 100;
  return { ["--lbl-room" as string]: `calc(${em}em + ${LABEL_GAP_PX + extraPx}px)` };
}

/** A row of Inspector fields with the label's cap set from its value (see `labelRoom`). */
function TraceRow({ first, children }: { first: string; children: ReactNode }) {
  return (
    <div data-trace-row className={LABEL_CAP} style={labelRoom(firstPieceChars(first))}>
      {children}
    </div>
  );
}

/** A section: a hairline, its heading (the Inspector's section-heading tier), then its rows. Its rows
 *  take `text-wrap: pretty`, so a value that wraps keeps its first line full and does not end in a lone
 *  word where the browser can avoid it. Measured in the Chromium of the captures, beside a label's
 *  float: `text-wrap: balance` evens the lines by cutting the first one, which left one word alone on
 *  the first line of four rows ("Cobstead", "Tidewater" twice, "4"); pretty sets three of those as
 *  they were before and still leaves "4". Where the property is absent the lines are set as before,
 *  with the unbreakable pieces of ValueText still in place. Switch: this class and the test that reads it. */
function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="border-t border-panel-border pb-1.5 [text-wrap:pretty]">
      <h4 className="pt-2 pb-1 uppercase text-[10px] leading-[14px] tracking-widest font-semibold text-muted">{title}</h4>
      {children}
    </section>
  );
}

/** The mark of a crossed bound: two strokes, `currentColor`, so the state does not ride on colour
 *  alone. Named "breach" for assistive tech and the app's tooltip; the word is not drawn. It sits in
 *  the 12 px the actual keeps clear at its right. */
function Cross() {
  return (
    <svg
      width="7" height="7" viewBox="0 0 7 7" role="img" aria-label="breach" {...tip(["breach"])}
      className="absolute right-0 top-1"
    >
      <path d="M0.75 0.75L6.25 6.25M6.25 0.75L0.75 6.25" stroke="currentColor" strokeWidth="1.5" fill="none" />
    </svg>
  );
}

/** A threshold is one Inspector row (the label and the actual) with its bound in a small line of its
 *  own under the actual. The line is this window's: the Inspector's row has no line under its value.
 *
 *  A crossed actual is kept whole (no-wrap), so its cross, which sits at the end of the box, can never
 *  land over a first line of it. LIMIT: a crossed actual wider than the row (about 280 px at 11 px)
 *  is clipped by the row; none of the four rules captured at 320 px has one (the longest is "30/30 (100%)"). A bound that is not
 *  crossed has no mark and its actual wraps freely. */
function ThresholdRow({ label, actual, bound, breached }: { label: string; actual: string; bound: string; breached: boolean }) {
  // A crossed actual stays whole on the first line: its whole width, and the cross's room, is kept free
  // of the label. An actual that is not crossed keeps only its first piece free.
  const room = breached ? labelRoom(actual.length, CROSS_ROOM_PX) : labelRoom(firstPieceChars(actual));
  return (
    <div data-trace-threshold data-trace-row className={`pb-0.5 ${LABEL_CAP}`} style={room}>
      <InspectorField
        label={label}
        valueClass={`font-semibold ${breached ? "text-[color:var(--alarm-on-inspector)]" : "text-text"}`}
        value={
          <span className={`relative pl-2 pr-3 break-words ${breached ? "whitespace-nowrap" : ""}`}>
            {breached ? actual : <ValueText text={actual} />}
            {breached && <Cross />}
          </span>
        }
      />
      <div className="-mt-0.5 pr-3 text-right font-mono text-[9px] leading-[13.5px] tracking-widest text-[color:var(--text-faint-on-inspector)]">
        <ValueText text={boundWithOperator(bound, breached)} />
      </div>
    </div>
  );
}

/** The rule's standing text, folded behind its heading. Open when the window opens; a press shuts it
 *  and the next opens it. Nothing under the heading is rendered while it is shut. The words are the
 *  payload's own: `what` as given, then, when the payload keeps any `why`, its heading and the `why`.
 *  The state is this window's: a new window opens the fold again. */
function StandingText({ what, why }: { what: string; why: string }) {
  const [open, setOpen] = useState(true);
  const regionId = useId();
  return (
    <section className="border-t border-panel-border pb-1.5">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={regionId}
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-baseline gap-x-1.5 pt-2 pb-1 text-left uppercase text-[10px] leading-[14px] tracking-widest font-semibold text-muted hover:text-text"
      >
        <span>What this rule is</span>
        <span
          aria-hidden
          className="inline-block text-[9px] motion-safe:transition-transform motion-safe:duration-[120ms] motion-safe:ease-out"
          style={{ transform: open ? "rotate(90deg)" : "none" }}
        >
          {TRIANGLE}
        </span>
      </button>
      {open && (
        <div id={regionId}>
          {what.trim() !== "" && (
            <p className="m-0 text-[10px] leading-[14px] font-medium text-muted">
              <ValueText text={what} />
            </p>
          )}
          {why.trim() !== "" && (
            <>
              <h4 className="pt-1.5 pb-0.5 uppercase text-[10px] leading-[14px] tracking-widest font-semibold text-muted">Why it fires</h4>
              <p className="m-0 text-[10px] leading-[14px] font-medium text-muted">
                <ValueText text={why} />
              </p>
            </>
          )}
        </div>
      )}
    </section>
  );
}

/** A value that is pressable: underlined in the faint ink (no colour of its own), the underline turning
 *  to the text ink and a tint on hover (where the pointer hovers), a darker tint while pressed. The
 *  transitions are 100 ms and only where motion is allowed. The button holds the value only, never the
 *  row, because the Inspector's row is made of divs. */
const PRESSABLE =
  "text-right underline decoration-1 underline-offset-2 decoration-[color:var(--text-faint-on-inspector)] " +
  "active:bg-text/10 [@media(hover:hover)_and_(pointer:fine)]:hover:bg-text/5 " +
  "[@media(hover:hover)_and_(pointer:fine)]:hover:decoration-[color:var(--text)] " +
  "motion-safe:transition-[background-color,text-decoration-color] motion-safe:duration-100 motion-safe:ease-out";

/**
 * Windowed Predictive Assist trace.
 * Shows how one machine rule fired on this record and how the decision was queued: the outcome line
 * (action, verdict, severity), the thresholds with the values read, the inputs, the evidence, and,
 * folded at the foot and open at first, the rule's standing text (what it is, why it fires; identical
 * for every instance, from the scenario manifest, never composed here). Evidence rows that carry a
 * resolvable `entityRef` cross-highlight the globe via navigate(); rows without one render inert.
 * Every word on screen is the payload's, or a heading this window printed before. How the text is set:
 * a value breaks only at its spaces (hyphenated words, arrows and the items of a " / " list are held
 * whole, see ValueText), a wrapping value avoids a lone last word, a label keeps 8 px from its value and wraps
 * before the value does, and the body shows a cue at its foot while more lies below. The WindowFrame
 * chrome supplies drag/pin/collapse/flag/close - this component owns only the body content and
 * self-closes if its decision no longer exists (a scrub/scenario change can strand a trace).
 */
export function RuleTraceWindow({ window: w, decisions, context, screenPos, dimmed, onToggleFlag, onDragTo }: Props) {
  const closeWindow = usePivotStore((s) => s.closeWindow);
  const navigate = useNavigation((s) => s.navigate);
  const decision = decisions.find((d) => d.id === w.decisionId);
  // A scrub/scenario change can strand a trace whose decision no longer
  // exists - self-close rather than render a husk. The close fires in an
  // effect, NOT during render: a store write mid-render would trigger
  // React's cross-component-update warning (and can loop) once a parent
  // layer maps the same windows slice.
  useEffect(() => {
    if (!decision) closeWindow(w.id);
  }, [decision, w.id, closeWindow]);
  if (!decision) return null; // render nothing this pass; the effect reaps it next tick
  const action = decision.decision;
  const sop = decision.rule.sop;
  const what = typeof sop?.what === "string" ? sop.what : "";
  const why = typeof sop?.why === "string" ? sop.why : "";
  const crossHighlight = (entityRef?: string) => {
    const match = resolveEntityRef(entityRef, context);
    if (match) navigate(match);
  };
  const trigger = decision.triggerEntityIds
    .map((id) => resolveEntityRef(id, context))
    .find((m) => m !== null && entityLngLat(m) !== null);
  const pos =
    screenPos ?? (w.anchor.type === "screen" ? { x: w.anchor.x, y: w.anchor.y } : { x: 0, y: 0 });
  return (
    <WindowFrame
      id={w.id}
      title={decision.rule.label}
      anchorScreen={pos}
      z={w.z}
      accent={`rgb(var(${actionRampVar(action)}-rgb))`}
      pinned={w.pinned}
      collapsed={w.collapsed}
      flagged={w.anchor.type === "node"}
      canFlag={trigger != null}
      dimmed={dimmed}
      onToggleFlag={onToggleFlag}
      onDragTo={onDragTo}
      width={320}
      square
      footCue
    >
      {/* The one place the body's type size is set: the window's text is 11 px, and what is smaller
          (headings, the bound, the standing text) says so itself. */}
      <div className="text-[11px] leading-snug">
        {/* the outcome line: the action word, the verdict, and (pushed right) the severity */}
        <div data-trace-outcome className="flex flex-wrap items-baseline pt-1.5 pb-2" style={{ columnGap: 7 }}>
          <span className="font-mono text-[11px] font-bold" style={{ color: `var(${actionRampVar(action)}-on-inspector)` }}>
            {action.replace("_", "-")}
          </span>
          <span className="text-[11px] font-semibold whitespace-nowrap text-text">{decision.verdict}</span>
          <span className="ml-auto inline-flex items-baseline" style={{ columnGap: 4 }}>
            <span className="text-[10px] font-medium text-muted">severity</span>
            <span className="font-mono text-[11px] font-semibold text-text">{decision.severity.toFixed(2)}</span>
          </span>
        </div>

        {decision.thresholds.length > 0 && (
          <Section title="Thresholds">
            {decision.thresholds.map((t, i) => (
              <ThresholdRow key={i} label={t.label} actual={t.actual} bound={t.bound} breached={t.breached} />
            ))}
          </Section>
        )}

        {decision.inputs.length > 0 && (
          <Section title="Inputs">
            {decision.inputs.map((inp, i) => {
              const field = (inp as TaggedInput).field;
              return (
                <TraceRow key={i} first={inp.value}>
                  <InspectorField
                    label={inp.label}
                    value={
                      <span className="pl-2 break-words">
                        <ValueText text={inp.value} />
                        {isMatchableField(field, context) && (
                          <FieldMatchBadge field={field} value={inp.value} context={context} prefetch />
                        )}
                      </span>
                    }
                  />
                </TraceRow>
              );
            })}
          </Section>
        )}

        {decision.evidence.length > 0 && (
          <Section title="Evidence">
            {decision.evidence.map((e, i) => {
              const match = resolveEntityRef(e.entityRef, context);
              return (
                <TraceRow key={i} first={e.value}>
                  <InspectorField
                    label={e.label}
                    value={
                      match ? (
                        <button type="button" onClick={() => crossHighlight(e.entityRef)} className={`ml-2 break-words ${PRESSABLE}`}>
                          <ValueText text={e.value} />
                        </button>
                      ) : (
                        <span className="pl-2 break-words">
                          <ValueText text={e.value} />
                        </span>
                      )
                    }
                  />
                </TraceRow>
              );
            })}
          </Section>
        )}

        {(what.trim() !== "" || why.trim() !== "") && <StandingText what={what} why={why} />}
      </div>
    </WindowFrame>
  );
}

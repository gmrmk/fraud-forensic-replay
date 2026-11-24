import type { CSSProperties, MouseEvent as ReactMouseEvent } from "react";
import { actionRuleColor, actionRuleWidth, actionTextColor } from "../lib/decisions";
import type { Decision } from "../lib/decisions";

interface Props {
  decision: Decision;
  onClick: (e: ReactMouseEvent<HTMLButtonElement>) => void;
  /** Decisions triggered by the inspected entity render full strength;
   *  the rest of the case's reached decisions render dimmed (the rule only;
   *  the words keep full strength). */
  emphasized?: boolean;
  /** Accessible action suffix - what a click DOES in this placement
   *  (Inspector pills open the breakout; the rule-card header opens the
   *  console). Keeps label-in-name honest per placement. */
  actionLabel?: string;
}

/** The plate around the ML tag, the count's plate in the
 *  action word's colour: a square box (1 px radius), a 1 px line in that colour at 60 percent, a fill
 *  of that colour at --tag-fill (theme/tokens.ts tagFillOf), 1 px above and below, 3 px at the sides.
 *  The line's and the fill's colours are the .tag-plate class (index.css: currentColor mixed at 60
 *  percent and at --tag-fill), the box is here. The .12em tracking leaves that much after the last letter, so the right padding is 3 px less that
 *  much and the two letters sit centred. A look and nothing more: no text, title or name is added. */
function mlPlate(): CSSProperties {
  return {
    borderWidth: 1,
    borderStyle: "solid",
    borderRadius: 1,
    padding: "1px 3px",
    paddingRight: "calc(3px - .12em)",
    lineHeight: 1,
  };
}

/**
 * The rule chip: a left rule and two words, no fill. Variant B of the verdict
 * marks board (owner pick, 2026-11-14). The rule's width follows severity
 * (DECLINE 3 px, the review/step-up family 2 px, ALLOW 1 px, from the same
 * ramp switch that colours it), then the action word in the on-panel colour of
 * its slot, then the rule name; an ML tag leads for the model layer. Every
 * colour rides the risk ramp via lib/decisions, so the chip recolors across all
 * 6 color modes, and the on-panel forms keep every word at 4.5:1 on the
 * Inspector and the matches window. Severity also reads without colour: the
 * action word is printed and the rule width differs.
 *
 * Lives in the Inspector's DECISIONS section and the matches window's rule
 * card; click opens the Matches window in rule mode (the placement's
 * actionLabel names what a click does). The accessible name starts with the
 * visible text (WCAG 2.5.3): "STEP-UP ACCOUNT TAKEOVER. Open the rule trace."
 * The bespoke focus ring is gone (the B-4 :focus-visible baseline covers it).
 * This covers rule findings. Business decisions draw on the
 * globe as capsules, and each event a rule queued as a flag until a decision
 * works it (components/verdict).
 */
export function DecisionPill({
  decision,
  onClick,
  emphasized = true,
  actionLabel = "Open the rule trace.",
}: Props) {
  const action = decision.decision;
  const text = actionTextColor(action);
  const isModel = decision.rule.kind === "ml-anomaly";

  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={`${isModel ? "ML " : ""}${decision.decision} ${decision.verdict}. ${actionLabel}`}
      className="group font-mono cursor-pointer select-none inline-flex items-baseline whitespace-nowrap transition active:scale-[0.97] motion-reduce:transition-none"
      style={{
        gap: 7,
        padding: "1px 0 1px 6px",
        letterSpacing: ".05em",
        borderLeftWidth: actionRuleWidth(action),
        borderLeftStyle: "solid",
        borderLeftColor: actionRuleColor(action, emphasized),
      }}
    >
      {isModel && (
        <span
          className="uppercase font-bold tag-plate"
          style={{ fontSize: 6.5, color: text, letterSpacing: ".12em", ...mlPlate() }}
        >
          ML
        </span>
      )}
      {/* Hover underlines each word in its own colour; no filter, so no colour
          drops below 4.5:1 (a brightness hover failed in the light cells). */}
      <span
        className="uppercase font-bold group-hover:underline underline-offset-2"
        style={{ fontSize: 9, color: text }}
      >
        {decision.decision}
      </span>
      <span
        className="uppercase group-hover:underline underline-offset-2"
        style={{ color: "var(--text)", fontSize: 8.5, fontWeight: 600 }}
      >
        {decision.verdict}
      </span>
    </button>
  );
}

/**
 * Frontend Decision contract. The backend (/api/decisions) returns snake_case;
 * this maps to the camelCase Decision the badge + console render - the same
 * API↔frontend adapter pattern as Entity over /api/entities.
 */
/** A rule's standing SOP - what it is + why it fires. Generic to the rule,
 *  identical for every instance; the Predictive Assist panel leads with it.
 *  `brief` is the terse investigator boilerplate the rule-card breakout renders
 *  VERBATIM: authored in the scenario manifest, zero interpolation, no LLM
 *  inference anywhere in the path (user-ratified constraint, 2026-06-11). */
export interface RuleSop { what: string; why: string; brief?: string; }
export interface DecisionRule { id: string; label: string; kind: string; sop?: RuleSop; }
export interface DecisionInput { label: string; value: string; }
export interface DecisionThreshold { label: string; actual: string; bound: string; breached: boolean; }
export interface DecisionEvidence { label: string; value: string; entityRef?: string; }

// REVIEW: the ml-anomaly layer's soft action - surface for a human look, never
// auto-decline. STEP-UP (hyphen) is the backend's account-takeover spelling.
export type DecisionAction =
  | "DECLINE"
  | "FLAG"
  | "STEP_UP"
  | "STEP-UP"
  | "ALLOW"
  | "REVIEW";

export interface Decision {
  id: string;
  rule: DecisionRule;
  subjectPathKind: string;
  triggerEntityIds: string[];
  inputs: DecisionInput[];
  thresholds: DecisionThreshold[];
  verdict: string;
  decision: DecisionAction;
  evidence: DecisionEvidence[];
  severity: number;
}

export interface RawDecision {
  id: string;
  rule: DecisionRule;
  subject_path_kind: string;
  trigger_entity_ids: string[];
  inputs: DecisionInput[];
  thresholds: DecisionThreshold[];
  verdict: string;
  decision: string;
  evidence: { label: string; value: string; entity_ref?: string }[];
  severity: number;
}

/** The risk-ramp / alarm slot a decision action maps to (the bare CSS var name,
 *  no var() wrapping - for callers building rgb()/alpha fills). The verdict color
 *  RIDES the risk ramp: DECLINE = the alarm channel (highest), the
 *  flag/step-up/review family = elevated (r3), ALLOW = low risk (r1). There is no
 *  "success" color in the system by design - the tool models risk severity, not
 *  approval, so an allowed verdict reads as the LOW end of the ramp, never a green
 *  badge. Mode-aware: each slot recolors per (theme×color) cell. The three slots
 *  are luminance-distinct in the dedicated CVD modes (deuteranopia / protanopia /
 *  tritanopia / monochrome); in neon and rainbow they separate primarily by HUE.
 *  (Neon's --r3 is decoupled from its --alarm red - they used to be the same
 *  hex, so a DECLINE pill and a REVIEW pill rendered identical in neon, the
 *  default mode; --r3 is now a vivid orange.) The verdict TEXT, always rendered on
 *  the pill + console, reinforces the color as a redundant non-color cue. */
export function actionRampVar(action: DecisionAction): string {
  switch (action) {
    case "DECLINE":
      return "--alarm";
    case "FLAG":
    case "STEP_UP":
    case "STEP-UP":
    case "REVIEW":
      return "--r3";
    case "ALLOW":
      return "--r1";
  }
}

/** Full-strength mode-aware CSS var for a decision action (e.g. `var(--alarm)`).
 *  Drives the verdict accent + the action chip across all rules; recolors per
 *  theme×color cell with no JS, resolving through the generated tokens.
 *  (Moved from DecisionConsole so component modules export only components.) */
export function actionColor(action: DecisionAction): string {
  return `var(${actionRampVar(action)})`;
}

/** A translucent fill of the action color, mode-aware, via the rgb-triplet idiom
 *  (the css-gen `--x-rgb` vars). Replaces the old `${hex}66` alpha-suffix trick,
 *  which only worked on a literal hex and froze the color against the theme. */
export function actionAlpha(action: DecisionAction, alpha: number): string {
  return `rgb(var(${actionRampVar(action)}-rgb) / ${alpha})`;
}

/** The width in px of the left rule a decision chip draws: severity read from
 *  the colour slot, so a new action gets a width wherever it gets a colour.
 *  Alarm 3, the r3 family 2, r1 1. */
export function actionRuleWidth(action: DecisionAction): 1 | 2 | 3 {
  switch (actionRampVar(action)) {
    case "--alarm":
      return 3;
    case "--r3":
      return 2;
    default:
      return 1;
  }
}

/** The on-panel text colour of the action's slot (`var(--alarm-on-panel)` and
 *  its siblings): the legible form of the slot on the Inspector's surface and
 *  the matches window, where the raw slot falls short in the colour-blind and
 *  light cells. */
export function actionTextColor(action: DecisionAction): string {
  return `var(${actionRampVar(action)}-on-panel)`;
}

/** The colour of a chip's left rule: full on-panel strength when lit, the
 *  slot at 40 percent alpha when dimmed (the words keep full strength). */
export function actionRuleColor(action: DecisionAction, emphasized: boolean): string {
  return emphasized ? actionTextColor(action) : actionAlpha(action, 0.4);
}

export function mapDecision(raw: RawDecision): Decision {
  return {
    id: raw.id,
    rule: raw.rule,
    subjectPathKind: raw.subject_path_kind,
    triggerEntityIds: raw.trigger_entity_ids,
    inputs: raw.inputs,
    thresholds: raw.thresholds,
    verdict: raw.verdict,
    decision: raw.decision as DecisionAction,
    evidence: raw.evidence.map((e) => ({ label: e.label, value: e.value, entityRef: e.entity_ref })),
    severity: raw.severity,
  };
}

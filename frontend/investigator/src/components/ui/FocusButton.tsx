import type { ButtonHTMLAttributes } from "react";

/** Visual register of the button. Carries no bespoke focus-ring class; the
 *  universal :focus-visible base rule in index.css supplies the ring and the variant inherits it. */
type FocusButtonVariant = "ghost" | "chip" | "icon";

export interface FocusButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: FocusButtonVariant;
}

/** Per-variant marker class. These are stable hooks for the later focus-ring
 *  base rule + any variant-specific styling; they intentionally carry no
 *  color/material so the primitive stays material-agnostic. */
const VARIANT_CLASS: Record<FocusButtonVariant, string> = {
  ghost: "fb-ghost",
  chip: "fb-chip",
  icon: "fb-icon",
};

/**
 * FocusButton - the base interactive element of the ui/ layer. Bare <button>s
 * across the app migrate to this; Pill/Badge-as-button compose it. It only
 * normalizes type="button" and tags a variant; it forwards every native button
 * attribute so callers keep full control of behavior and a11y. The visible
 * focus indicator comes from the live universal :focus-visible base rule in
 * index.css, not from a per-variant class.
 */
export function FocusButton({
  variant = "ghost",
  type,
  className = "",
  children,
  ...rest
}: FocusButtonProps) {
  return (
    <button
      type={type ?? "button"}
      className={[VARIANT_CLASS[variant], className].filter(Boolean).join(" ")}
      {...rest}
    >
      {children}
    </button>
  );
}

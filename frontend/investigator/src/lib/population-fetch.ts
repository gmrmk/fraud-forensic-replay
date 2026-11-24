/**
 * Case-boot fetch rule. A pack that declares no focal is a population-scale pack; the case
 * boot must not pull its unscoped whole transactions table. Pure, so the rule unit-tests without a
 * render harness.
 */

/**
 * Whether the case-boot must SKIP the unscoped whole-table bundle.
 *
 * The case view tells ONE customer's story. A manifest that declares a `focal` scopes the
 * case-boot to a single card/account - a small, bounded read. A population-scale pack declares NO
 * focal; an unscoped case-boot there would pull the entire transactions table (the ~198MB
 * case-boot). When there is no manifest focal, skip the case bundle: the
 * population case view is not a designed surface, so serving it 198MB of rows it never renders is
 * pure waste.
 */
export function shouldSkipUnscopedCaseBundle(hasManifestFocal: boolean): boolean {
  return !hasManifestFocal;
}

/**
 * Marker color tokens.
 *
 * Semantic palette:
 *  - CYAN - authorizations / data signal (default)
 *  - MAGENTA - identity event (login success)
 *  - AMBER - elevated but resolved (step-up passed)
 *  - RED - severity (fraud, step-up failed, declined)
 *
 * Every color carries an entity meaning. No decorative hues. Per-category
 * variations stay within the cyan range - saturation/lightness only -
 * so a busy globe still reads as a coherent layer at the cluster scale.
 *
 * All values are [r, g, b, a] in deck.gl's expected 0-255 / 0-255 form.
 */
import type { LoginOutcome } from "../types";

export type Rgba = [number, number, number, number];

// --- Authorizations (transactions) ----------------------------------

export const MARKER_COLOR_DEFAULT: Rgba = [0, 229, 255, 200]; // cyan, primary

export const CATEGORY_COLORS: Record<string, Rgba> = {
  groceries:     [0, 229, 255, 200],     // cyan - base data
  gas:           [120, 200, 230, 200],
  fast_food:     [180, 220, 235, 180],
  restaurant:    [0, 229, 255, 220],     // primary cyan emphasis
  coffee:        [150, 200, 220, 180],
  warehouse:     [110, 180, 210, 200],
  pharmacy:      [180, 230, 235, 180],
  department:    [130, 200, 220, 180],
  subscription:  [90, 160, 200, 180],    // dimmer for CNP / online
  kids_activity: [200, 230, 240, 180],
  auto_service:  [140, 200, 220, 180],
  work_lodging:  [60, 180, 220, 220],    // slightly emphasized - travel signal
  online_retail: [80, 150, 190, 180],    // dimmer for CNP
  rideshare:     [110, 190, 210, 180],
};

// --- Logins ---------------------------------------------------------

export const LOGIN_SUCCESS: Rgba = [255, 92, 232, 220];   // magenta
export const LOGIN_STEPUP:  Rgba = [255, 179, 71, 230];   // amber
export const LOGIN_FAILED:  Rgba = [255, 61, 46, 240];    // signal red

export function loginColor(outcome: LoginOutcome): Rgba {
  switch (outcome) {
    case "success":
      return LOGIN_SUCCESS;
    case "challenge_passed":
      return LOGIN_STEPUP;
    case "challenge_required":
      // In-flight challenge - should be rare in a finished session.
      // Render with amber to signal "elevated state."
      return LOGIN_STEPUP;
    case "challenge_failed":
    case "failed":
      return LOGIN_FAILED;
  }
}

// --- Severity (fraud) -----------------------------------------------

export const FRAUD_COLOR: Rgba = [255, 61, 46, 255]; // reserved for fraud severity

// --- Places context -------------------------------------------------

/** Hollow ring for the Places context layer. Deliberately faint -
 *  these are ambient context (what's here?), not entity data. They MUST
 *  read beneath the auth (cyan) and login (magenta/amber/red) markers.
 *  If you can see the financial pins clearly with Places on, the alpha
 *  is right. */
export const PLACE_CONTEXT_COLOR: Rgba = [170, 170, 180, 75];

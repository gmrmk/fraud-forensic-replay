// frontend/investigator/src/theme/entity-mapping.ts

/** A slot key in a ThemePalette - either a ramp position, the alarm channel, or textFaint. */
export type RampSlot = "r0" | "r1" | "r2" | "r3" | "r4" | "alarm" | "textFaint";

/**
 * Fixed mapping from entity kind to a palette slot.
 *
 * `fraud` uses the dedicated `alarm` channel so it
 * remains visually distinct across every colorblind mode. All other kinds map
 * to a hue-agnostic ramp position - the actual color shifts with the active
 * ColorMode but the semantic ordering is preserved.
 *
 * Unknown kinds fall back to `textFaint` (handled by `slotFor`).
 */
export const KIND_SLOT: Record<string, RampSlot> = {
  fraud: "alarm",
  auth: "r1",
  login: "r2",
  account_event: "r3",
  transfer: "r1",
  place: "textFaint",
};

/**
 * Resolve the palette slot for an entity kind.
 * Falls back to `"textFaint"` for any kind not present in KIND_SLOT.
 */
export function slotFor(kind: string): RampSlot {
  return KIND_SLOT[kind] ?? "textFaint";
}

/**
 * Per-entity-kind palette helper. Returns the chrome colors used by
 * every entity-anchored window surface - DetailWindow border + header,
 * Flyout border + header, Inspector title.
 *
 * The 4-color semantic palette IS the visual language. An investigator
 * needs to read entity type at a glance without parsing text:
 *   - auth   → cyan      (allowed / normal)
 *   - fraud  → red       (severity)
 *   - login  → magenta   (identity event)
 *   - place  → muted gray (ambient context, not entity data)
 *
 * Hex tokens (#00e5ff, #ff5ce8, etc.) work fine for solid `border-X`
 * and `text-X` Tailwind utilities, but Tailwind opacity-shifted classes
 * like `bg-accent/5` and `border-accent/20` silently no-op on hex
 * tokens (they require RGB-channel colors). For those cases we hand
 * back inline rgba strings - see PivotBadge.tsx for the established
 * workaround pattern.
 */
import type { EntityMatch } from "./matches";
import { slotFor, type RampSlot } from "../theme/entity-mapping";
import { useSchema } from "../store/schema";

/** The four entity kinds carried by the 4-color semantic palette.
 *  Named alias for ergonomics - `parentKind: EntityKind` reads better
 *  than `parentKind: EntityMatch["kind"]` on a Zustand interface. */
export type EntityKind = EntityMatch["kind"];

export interface EntityPalette {
  /** Hex value - pass to WindowFrame's `accent` prop, use anywhere
   *  Tailwind opacity utilities would no-op on hex tokens. */
  hex: string;
  /** Tailwind text utility, e.g. `text-accent`. Safe with hex tokens. */
  textClass: string;
  /** Tailwind border utility, e.g. `border-accent`. Safe with hex tokens. */
  borderClass: string;
  /** rgba(...) - header background tint (~5% opacity). Use inline. */
  headerBgRgba: string;
  /** rgba(...) - header divider border (~20% opacity). Use inline. */
  headerDividerRgba: string;
}

const AUTH: EntityPalette = {
  hex: "#00e5ff",
  textClass: "text-accent",
  borderClass: "border-accent",
  headerBgRgba: "rgba(0, 229, 255, 0.05)",
  headerDividerRgba: "rgba(0, 229, 255, 0.20)",
};

const FRAUD: EntityPalette = {
  hex: "#ff3d2e",
  textClass: "text-signal",
  borderClass: "border-signal",
  headerBgRgba: "rgba(255, 61, 46, 0.05)",
  headerDividerRgba: "rgba(255, 61, 46, 0.20)",
};

const LOGIN: EntityPalette = {
  hex: "#ff5ce8",
  textClass: "text-identity",
  borderClass: "border-identity",
  headerBgRgba: "rgba(255, 92, 232, 0.05)",
  headerDividerRgba: "rgba(255, 92, 232, 0.20)",
};

// Places intentionally read as ambient context, not entity data - match
// the `muted` token (#808080 = rgb 128, 128, 128) used elsewhere.
const PLACE: EntityPalette = {
  hex: "#808080",
  textClass: "text-muted",
  borderClass: "border-muted",
  headerBgRgba: "rgba(128, 128, 128, 0.05)",
  headerDividerRgba: "rgba(128, 128, 128, 0.20)",
};

// 2026-06-10 realism program - the behavioral kill-chain lanes.
// account_event amber: a profile mutation (email change, payee add) is a
// warning-tier identity signal; transfer green: money movement.
const ACCOUNT_EVENT: EntityPalette = {
  hex: "#ffb347",
  textClass: "text-[#ffb347]",
  borderClass: "border-[#ffb347]",
  headerBgRgba: "rgba(255, 179, 71, 0.05)",
  headerDividerRgba: "rgba(255, 179, 71, 0.20)",
};

const TRANSFER: EntityPalette = {
  hex: "#7bdc6e",
  textClass: "text-[#7bdc6e]",
  borderClass: "border-[#7bdc6e]",
  headerBgRgba: "rgba(123, 220, 110, 0.05)",
  headerDividerRgba: "rgba(123, 220, 110, 0.20)",
};

const PALETTES: Record<string, EntityPalette> = {
  auth: AUTH,
  fraud: FRAUD,
  login: LOGIN,
  place: PLACE,
  account_event: ACCOUNT_EVENT,
  transfer: TRANSFER,
};

// `KIND_RGB` (a static per-kind comma-triplet map frozen at the NEON palette)
// was retired 2026-06-18: it was mode-blind - the Timeline dots/lanes/tooltip
// stayed neon in every CVD/color mode while the rest of the app recolored. The
// two helpers below replace it with per-mode slot vars (delegating to slotFor),
// mirroring the ticker's kind-token fix.

/** The CSS slot name, dash-cased for var() composition. The palette slots are
 *  already dash-free (r0..r4, alarm) except `textFaint`, which the emitted vars
 *  spell `text-faint` (--text-faint-rgb, --text-faint-on-panel). */
function dashedSlot(slot: RampSlot): string {
  return slot === "textFaint" ? "text-faint" : slot;
}

/**
 * The RAW per-mode slot triplet var name for a kind, e.g. `"--r1-rgb"`.
 *
 * Mode-aware replacement for `KIND_RGB[kind]`: where `KIND_RGB` froze a kind at
 * its NEON comma triplet (mode-blind), this delegates to `slotFor` so the kind
 * recolors with the active ColorMode. The emitted vars are SPACE-separated
 * triplets, so compose with slash-alpha: `rgb(var(${kindRgbVar(k)}) / ${a})`,
 * NOT `rgba(${triplet}, ${a})`. Used for decorative/ambient marks (lane + ambient
 * gradients, dot glow boxShadow) that sit on the dark globe-glass substrate.
 */
export function kindRgbVar(kind: string): string {
  return `--${dashedSlot(slotFor(kind))}-rgb`;
}

/**
 * The PANEL-LEGIBLE per-mode slot var name for a kind, e.g. `"--r1-on-panel"`.
 *
 * For small solid marks/text that sit on the glass instrument panel (event-dot
 * fill, kind tooltip, severity rings) - the raw globe slots read as low as
 * ~1.1:1 there, so these are luminance-clamped to clear WCAG AA on the panel
 * (tokens.ts OnPanelTokens). On-panel vars exist ONLY for r1/r2/r3/alarm/textFaint
 * - never r0/r4; every Timeline kind maps to one of those, but if `slotFor` ever
 * returns r0/r4 we fail safe to `--text-faint-on-panel` (a real var) rather than
 * emit the nonexistent `--r0-on-panel`/`--r4-on-panel`.
 */
export function kindOnPanelVar(kind: string): string {
  const slot = slotFor(kind);
  if (slot === "r0" || slot === "r4") return "--text-faint-on-panel";
  return `--${dashedSlot(slot)}-on-panel`;
}

/** Palette lookup by kind alone - used where you have the kind but
 *  not a full EntityMatch (e.g., PivotWindow.parentKind on the
 *  pivot store, where the pivot aggregates rows of mixed kinds and
 *  the chrome color is set by the entity that *opened* the pivot).
 *  Unknown kinds degrade to the ambient PLACE treatment instead of
 *  throwing - the platform seam stays unsealed. */
export function paletteForKind(kind: string): EntityPalette {
  return PALETTES[kind] ?? manifestPalette(kind) ?? PLACE;
}

/** A manifest-declared kind outside the six concrete ones carries its own colour
 *  (ScenarioNode.palette). Tints are inline rgba, like the concrete palettes:
 *  Tailwind cannot generate a class from a runtime hex. */
function manifestPalette(kind: string): EntityPalette | null {
  const hex = useSchema.getState().nodeFor(kind)?.palette;
  const m = hex && /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex);
  if (!m) return null;
  const [r, g, b] = [m[1], m[2], m[3]].map((c) => parseInt(c, 16));
  return {
    hex,
    textClass: "text-muted",
    borderClass: "border-muted",
    headerBgRgba: `rgba(${r}, ${g}, ${b}, 0.05)`,
    headerDividerRgba: `rgba(${r}, ${g}, ${b}, 0.20)`,
  };
}

export function paletteFor(entity: EntityMatch): EntityPalette {
  return paletteForKind(entity.kind === "entity" ? entity.entity.kind : entity.kind);
}

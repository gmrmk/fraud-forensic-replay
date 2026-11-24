import { useEffect, useRef, useState, type FocusEvent } from "react";
import { useTheme } from "../store/theme";
import { THEMES, COLOR_MODES, type ColorMode, type Theme } from "../theme/axes";
import { Panel, Eyebrow } from "./ui";
import { TextSizeRow } from "./TextSizeRow";

const RAMP_VARS = ["--r0", "--r1", "--r2", "--r3", "--r4", "--alarm"] as const;

/**
 * Appearance flyout: a gear trigger over a transient opaque popover that holds the theme
 * toggle, the colour mode select and a live palette preview, and nothing else (the map's
 * layers and paths have their own menus). The popover is closed by default, so it costs no
 * screen space at rest. A press outside it, focus moving to an element outside it, or Escape
 * closes it, and Escape returns focus to the gear. The gear is a fixed 37 px square, the height
 * of the top bar's text controls, and its root wraps it exactly so the menu lines up with it.
 * The menu's surface is the opaque instrument material (the Inspector's own), 176 px wide,
 * and its content scrolls in an inner element, below the top bar and above the bottom stack.
 */
export function ThemeSwitcher() {
  const theme = useTheme((s) => s.theme);
  const color = useTheme((s) => s.color);
  const setTheme = useTheme((s) => s.setTheme);
  const setColor = useTheme((s) => s.setColor);

  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const gearRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);

  // Dismissal contract: pointerdown-outside closes; focus-outside closes (onBlur below);
  // Escape closes AND restores focus to the gear. pointerdown (not click) so a drag started
  // outside also dismisses; it is a no-op inside rootRef, so the gear's own toggle still wins.
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        gearRef.current?.focus();
      }
    };
    // Capture phase, because the map's verdict badges stop their own pointerdown, which a
    // bubbling listener on the document would never hear.
    document.addEventListener("pointerdown", onPointerDown, true);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown, true);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  // React's onBlur bubbles, so this hears focus leaving any element in the root. Focus moving
  // to somewhere inside keeps the menu open; a blur with no related target is the window losing
  // focus, which also keeps it open. A keyboard user moving to another top-bar menu closes this
  // one, as a press there would.
  const onBlur = (e: FocusEvent<HTMLDivElement>) => {
    const next = e.relatedTarget;
    if (next instanceof Node && !e.currentTarget.contains(next)) setOpen(false);
  };

  // Land keyboard/screen-reader focus inside the popover when it opens.
  useEffect(() => {
    if (open) dialogRef.current?.focus();
  }, [open]);

  return (
    <div ref={rootRef} className="relative" onBlur={onBlur}>
      <button
        ref={gearRef}
        type="button"
        aria-label="Appearance"
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        // A fixed square, the height of the bar's text controls (the bar stretches its items, so
        // the four stay one height). The size is fixed rather than h-full with aspect-square
        // because a width derived from the height does not widen the root div, which would stay
        // narrower than the button and leave the right-anchored menu ending near the gear's centre.
        className="glass grid h-[37px] w-[37px] place-items-center rounded-md outline-none transition-colors focus-visible:ring-1 focus-visible:ring-accent"
        style={{ color: open ? "var(--text)" : "var(--text-muted)" }}
      >
        <GearIcon active={open} />
      </button>

      {open && (
        <div
          ref={dialogRef}
          role="dialog"
          aria-label="Appearance"
          tabIndex={-1}
          className="absolute right-0 top-full z-50 mt-2 outline-none"
        >
          <Panel material="instrument" radius="md" className="w-[176px]">
            {/* The scroller is this inner div, never the Panel: the instrument's grain
                child is absolutely placed over the panel box and would scroll away. */}
            <div className="p-2.5 max-h-[calc(var(--vh-c)_-_var(--bottom-stack-c)_-_64px)] overflow-y-auto">
            <Eyebrow tone="muted">Appearance</Eyebrow>

            {/* Dark / Light segmented toggle */}
            <div
              role="group"
              aria-label="Theme"
              style={{ display: "flex", gap: 2, margin: "8px 0" }}
            >
              {THEMES.map((t: Theme) => (
                <button
                  key={t}
                  type="button"
                  aria-pressed={theme === t}
                  onClick={() => setTheme(t)}
                  style={{
                    flex: 1,
                    padding: "3px 0",
                    borderRadius: 6,
                    border: "none",
                    cursor: "pointer",
                    fontFamily: "var(--body)",
                    fontSize: 10,
                    fontWeight: 700,
                    letterSpacing: "0.08em",
                    textTransform: "uppercase",
                    background:
                      theme === t ? "color-mix(in srgb, var(--r2) 25%, transparent)" : "transparent",
                    color: theme === t ? "var(--text)" : "var(--text-muted)",
                    transition: "background 150ms, color 150ms",
                  }}
                >
                  {t}
                </button>
              ))}
            </div>

            {/* 6-mode color select */}
            <select
              aria-label="Color mode"
              value={color}
              onChange={(e) => setColor(e.target.value as ColorMode)}
              className="font-mono"
              style={{
                width: "100%",
                padding: "3px 6px",
                borderRadius: 6,
                border: "1px solid rgb(var(--hairline-rgb, 255 255 255) / 0.12)",
                background: "transparent",
                fontSize: 10,
                color: "var(--text)",
                cursor: "pointer",
              }}
            >
              {COLOR_MODES.map((c: ColorMode) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>

            <TextSizeRow />

            {/* Live palette preview - a glanceable confirmation of the active mode */}
            <div
              aria-hidden="true"
              style={{ display: "flex", gap: 3, marginTop: 8 }}
            >
              {/* Each swatch is edged in the dim token (3:1 or more on the menu): a ramp step
                  near the menu's own colour drew at 1.03:1 and left a gap in the row. */}
              {RAMP_VARS.map((v) => (
                <span
                  key={v}
                  style={{
                    background: `var(${v})`,
                    boxShadow: "inset 0 0 0 1px rgb(var(--text-faint-rgb))",
                    width: 14,
                    height: 14,
                    borderRadius: 3,
                    display: "inline-block",
                    flexShrink: 0,
                  }}
                />
              ))}
            </div>
            </div>
          </Panel>
        </div>
      )}
    </div>
  );
}

/** Feather-style cog. Spins a hair on hover/open for a touch of life. */
function GearIcon({ active }: { active: boolean }) {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      style={{
        transform: active ? "rotate(40deg)" : "rotate(0deg)",
        transition: "transform 200ms var(--ease, ease)",
      }}
    >
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  );
}

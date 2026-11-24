/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        // Bridged to the theme CSS vars (src/theme/* -> virtual:theme.css, keyed
        // by <html data-theme data-color>). Every existing utility (text-accent,
        // bg-panel-bg, border-panel-border, ...) now recolors when the theme or
        // color-mode axis flips, with NO per-surface rewrite. The `-rgb` triplet
        // vars carry the channels so Tailwind's `<alpha-value>` opacity utilities
        // (bg-accent/15, border-panel-border/60, ...) keep working.
        //
        // Semantics preserved via the entity-mapping ramp slots: accent=auth=r1
        // (cyan), identity=login=r2, elevated=step-up=r3, signal=fraud=alarm.
        // The hue moves with the active ramp (incl. the 3 CVD modes); fraud rides
        // the separate alarm channel so it survives every mode.
        ground: "rgb(var(--bg-rgb) / <alpha-value>)",
        ink: "rgb(var(--bg-rgb) / <alpha-value>)",
        "panel-bg": "rgb(var(--surface-rgb) / <alpha-value>)",
        "panel-border": "rgb(var(--hairline-rgb) / <alpha-value>)",
        "panel-border-strong": "rgb(var(--hairline-rgb) / <alpha-value>)",
        text: "rgb(var(--text-rgb) / <alpha-value>)",
        muted: "rgb(var(--text-muted-rgb) / <alpha-value>)",
        dim: "rgb(var(--text-faint-rgb) / <alpha-value>)",
        accent: "rgb(var(--r1-rgb) / <alpha-value>)",          // auth / data signal
        "accent-dim": "rgb(var(--r1-rgb) / 0.55)",
        identity: "rgb(var(--r2-rgb) / <alpha-value>)",        // login (success)
        "identity-dim": "rgb(var(--r2-rgb) / 0.55)",
        elevated: "rgb(var(--r3-rgb) / <alpha-value>)",        // step-up passed
        "elevated-dim": "rgb(var(--r3-rgb) / 0.55)",
        signal: "rgb(var(--alarm-rgb) / <alpha-value>)",       // severity (fraud / step-up failed)
        "signal-dim": "rgb(var(--alarm-rgb) / 0.55)",
      },
      fontFamily: {
        // One humanist, hyperlegible family app-wide (Atkinson Hyperlegible Next,
        // Braille Institute); weight does the stylization, not a second family.
        // display + mono both resolve to it so existing font-display/font-mono
        // classes harmonize onto one typeface. The CSS vars are driven by the
        // theme bridge (src/theme/*), so this stays in sync with the active theme.
        display: ["var(--display)", "system-ui", "sans-serif"],
        mono: ["var(--mono)", "ui-monospace", "monospace"],
      },
      letterSpacing: {
        widest: "0.18em",
        ultra: "0.28em",
      },
      // Rounded geometry - the high-end forensic terminal keeps terminal
      // density but trades sharp 0px corners for a quiet, consistent radius
      // scale. Panels/cards → md/lg; buttons/chips → md/pill; tooltips → md;
      // the timeline + ticker shells → lg at the outer edge. (Design-elevation
      // brief § 1, 2026-06-13.)
      borderRadius: {
        xs: "2px",
        sm: "9px",
        md: "14px",
        lg: "24px",
        pill: "9999px",
      },
      // Elevation - a layered shadow scale that reads as real depth on the
      // pure-black ground, plus a hairline top highlight (the "lit edge") on
      // raised surfaces for the premium feel. elev-1 = base chrome; elev-2/3 =
      // floating panels (inspector, decision console, matches, tooltips).
      // Each tier folds in the inset top-highlight so a raised surface always
      // carries its lit edge. (Design-elevation brief § 1, 2026-06-13.)
      boxShadow: {
        "elev-1":
          "0 1px 2px rgba(0,0,0,.5), inset 0 1px 0 rgba(255,255,255,.04)",
        "elev-2":
          "0 4px 16px rgba(0,0,0,.45), 0 1px 2px rgba(0,0,0,.6), inset 0 1px 0 rgba(255,255,255,.04)",
        "elev-3":
          "0 12px 40px rgba(0,0,0,.5), 0 2px 8px rgba(0,0,0,.6), inset 0 1px 0 rgba(255,255,255,.05)",
        // The lit-edge alone, for surfaces that want the highlight without a
        // cast shadow (e.g. a flush inset row).
        "edge-hi": "inset 0 1px 0 rgba(255,255,255,.04)",
      },
    },
  },
  plugins: [],
};

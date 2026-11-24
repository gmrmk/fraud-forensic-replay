/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        bg: "#eef0f4", panel: "#ffffff", ink: "#0b0e16", muted: "#6b7280",
        // muted's hue, darkened only to reach 4.6 to 1 on bg, fraud.bg and panel (small text on those).
        "muted-strong": "#666c7a",
        faint: "#9aa1ad", line: "#e8eaef",
        indigo: { DEFAULT: "#4338ca", deep: "#312e81", bright: "#6d28d9" },
        fraud: { DEFAULT: "#b42318", bg: "#fff3f2", line: "#fdd9d4" },
        warn: { DEFAULT: "#b45309", bg: "#fffaeb", line: "#fde68a" },
      },
      fontFamily: {
        // Editorial Premium scheme (user pick): Fraunces display + Hanken Grotesk body.
        sans: ["Hanken Grotesk Variable", "Hanken Grotesk", "-apple-system", "Segoe UI", "sans-serif"],
        display: ["Fraunces Variable", "Fraunces", "Georgia", "serif"],
      },
    },
  },
  plugins: [],
};

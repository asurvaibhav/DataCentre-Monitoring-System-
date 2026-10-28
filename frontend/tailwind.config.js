/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      // AO-02 design tokens. The visual system is intentionally warm and
      // technical: paper canvas, ink text, hairline rules and one green accent.
      // Palette changes happen here, never in data or agent logic.
      colors: {
        brand: {
          canvas: "#eae8e2",
          ink: "#292c29",
          muted: "#646861",
          line: "#bcbfb5",
          "line-soft": "#d4d7cc",
          surface: "#f4f3ee",
          "surface-2": "#e4e4dc",
          accent: "#34765f",
          "accent-soft": "#dce5da",
          ok: "#34765f",
          warn: "#8a5a2b",
          critical: "#a33a2f",
        },
      },
      fontFamily: {
        sans: ["Segoe UI", "Arial", "sans-serif"],
        mono: ["Cascadia Code", "Consolas", "monospace"],
      },
      borderRadius: {
        DEFAULT: "4px",
        sm: "3px",
      },
    },
  },
  plugins: [],
}

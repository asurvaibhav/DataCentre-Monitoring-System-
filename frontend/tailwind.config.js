/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      // AO-02 design tokens — swap the brand palette here without touching
      // backend APIs or frontend data logic (decoupled headless-state pattern).
      colors: {
        brand: {
          dark: "#0f172a",
          surface: "#1e293b",
          accent: "#38bdf8",
          ok: "#22c55e",
          warn: "#f59e0b",
          critical: "#ef4444",
        },
      },
    },
  },
  plugins: [],
}

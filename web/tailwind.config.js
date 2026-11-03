/** @type {import('tailwindcss').Config} */

// Theme-aware color: resolves to an RGB triplet CSS variable defined in
// src/index.css (dark by default, `html.light` for the light theme), and
// keeps Tailwind's opacity modifiers working (e.g. bg-white/80).
const v = (name) => `rgb(var(--c-${name}) / <alpha-value>)`;

export default {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      // Inter app-wide, per Jefferson's request - covers both the default
      // sans stack (body text, buttons, tables, forms, nav) and the
      // "plus-jakarta" utility (still used for headings/brand wordmark in a
      // handful of files) so nothing needs to be touched at the call site.
      fontFamily: {
        sans: ["Inter", "ui-sans-serif", "system-ui", "sans-serif"],
        "plus-jakarta": ["Inter", "sans-serif"],
      },
      // USTP brand palette, pulled from the official e-Learning Portal login
      // screen (Zaki's reference). Reuse these classes app-wide instead of
      // hardcoding hex values in individual components.
      colors: {
        navy: {
          DEFAULT: "#1B2A6B",
          dark: "#12194A",
        },
        gold: {
          DEFAULT: "#F5A623",
        },
        // Ticket-status categorical triad for charts and badges. Same hue
        // families as before (amber/blue/green); lifted to brighter tones in
        // the dark theme so they stay legible on dark surfaces.
        status: {
          pending: v("status-pending"),
          active: v("status-active"),
          resolved: v("status-resolved"),
        },
        // Theme surfaces for new components. `glass` is a real white for
        // translucent overlays (bg-glass/10), since bg-white is a surface.
        app: v("bg"),
        surface: { DEFAULT: v("surface"), 2: v("surface-2"), 3: v("surface-3") },
        glass: "#FFFFFF",
      },
      // The existing pages were written for a light UI with bg-white cards,
      // text-navy/text-gray-* copy and border-gray-* dividers. Remapping just
      // those utilities per CSS property lets every page follow the theme
      // without rewriting each file (text-white on buttons, the navy login
      // gradient etc. are untouched since only these properties change).
      backgroundColor: {
        white: v("surface"),
        gray: { 50: v("surface-2"), 100: v("surface-3") },
        navy: { DEFAULT: v("primary"), dark: v("primary-hover") },
        red: { 50: v("danger-soft"), 100: v("danger-soft-2") },
      },
      textColor: {
        navy: { DEFAULT: v("text"), dark: "#12194A" },
        gray: {
          300: v("text-5"),
          400: v("text-4"),
          500: v("text-3"),
          600: v("text-2"),
        },
        red: { 600: v("danger") },
      },
      borderColor: {
        navy: { DEFAULT: v("primary") },
        gray: {
          50: v("border-1"),
          100: v("border-2"),
          200: v("border-3"),
          300: v("border-4"),
        },
        red: { 200: v("danger-border") },
      },
    },
  },
  plugins: [],
};

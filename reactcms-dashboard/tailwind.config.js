/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // ── PagePilot brand palette ───────────────────────────────────────
        // All existing `indigo-*` classes in the dashboard now map to green.
        indigo: {
          50: '#f0fdf4',
          100: '#dcfce7',
          200: '#bbf7d0',
          300: '#86efac',
          400: '#4ade80',
          500: '#22c55e',   // primary brand green
          600: '#22c55e',   // buttons, active states
          700: '#16a34a',   // hover
          800: '#15803d',
          900: '#14532d',
        },
        // Background and card system
        gray: {
          50: '#0b1220',   // page bg
          100: '#111c2e',   // card bg
          200: '#1e293b',   // border / divider
          300: '#334155',   // subtle border
          400: '#475569',   // muted icon
          500: '#64748b',   // secondary muted text
          600: '#94a3b8',   // body muted text
          700: '#cbd5e1',   // secondary text
          800: '#e2e8f0',   // primary text
          900: '#f1f5f9',   // headings / high contrast
        },
        // Keep white for explicit white uses (modal overlays etc)
        white: '#e2e8f0',
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'sans-serif'],
        mono: ['JetBrains Mono', 'Fira Code', 'monospace'],
      },
      borderRadius: {
        lg: '8px',
        xl: '10px',
        '2xl': '12px',
      },
      boxShadow: {
        sm: '0 1px 3px rgba(0,0,0,0.4)',
        DEFAULT: '0 2px 8px rgba(0,0,0,0.4)',
        lg: '0 4px 20px rgba(0,0,0,0.5)',
        xl: '0 8px 40px rgba(0,0,0,0.6)',
      },
    },
  },
  plugins: [],
};
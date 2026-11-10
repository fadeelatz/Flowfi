const c = (name) => `rgb(var(--c-${name}) / <alpha-value>)`

/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        bg: c('bg'),
        surface: c('surface'),
        surface2: c('surface2'),
        line: c('line'),
        ink: c('ink'),
        muted: c('muted'),
        accent: c('accent'),
        onaccent: c('onaccent'),
        teal: c('teal'),
        info: c('info'),
        ok: c('ok'),
        bad: c('bad'),
        warn: c('warn'),
        side: c('side'),
        sideink: c('sideink'),
        sidemuted: c('sidemuted'),
        sideline: c('sideline'),
        sidehl: c('sidehl'),
        sidehlfg: c('sidehlfg'),
      },
      fontFamily: {
        display: ['"Space Grotesk"', 'sans-serif'],
        sans: ['"DM Sans"', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'monospace'],
      },
      boxShadow: {
        glow: 'var(--shadow-glow)',
        card: 'var(--shadow-card)',
      },
    },
  },
  plugins: [],
}

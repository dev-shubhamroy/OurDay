import type { Config } from 'tailwindcss'

const token = (name: string) => `rgb(var(--${name}) / <alpha-value>)`

/** Midnight Aurora: every colour comes from CSS variables defined in styles/index.css. */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  darkMode: ['selector', '[data-theme="dark"]'],
  theme: {
    extend: {
      colors: {
        bg: token('bg'),
        sidebar: token('sidebar'),
        surface: token('surface'),
        /** Elevated surface (cards, tiles). */
        card: token('elevated'),
        fg: token('fg'),
        muted: token('muted'),
        line: token('line'),
        accent: token('accent'),
        'accent-fg': token('accent-fg'),
        /** Secondary accent (violet). */
        accent2: token('accent-2'),
        electric: token('electric'),
        glow: token('glow'),
        /** Semantic */
        ok: token('ok'),
        warn: token('warn'),
        danger: token('danger'),
        partner: token('partner'),
        'on-fill': token('on-fill'),
      },
      fontFamily: {
        sans: ['"Inter Variable"', 'ui-sans-serif', 'system-ui', '-apple-system', 'sans-serif'],
        display: ['"Manrope Variable"', '"Inter Variable"', 'ui-sans-serif', 'system-ui', 'sans-serif'],
      },
      borderRadius: {
        /** Main surfaces 20px, small cards/rows 14px, controls 14px, inputs 12px. */
        card: '20px',
        tile: '14px',
        ctl: '14px',
      },
      boxShadow: {
        card: 'var(--shadow-card)',
        lift: 'var(--shadow-lift)',
        glow: 'var(--shadow-glow)',
        float: 'var(--shadow-float)',
      },
      keyframes: {
        float: { '0%,100%': { transform: 'translateY(0)' }, '50%': { transform: 'translateY(-8px)' } },
        rise: { from: { opacity: '0', transform: 'translateY(8px)' }, to: { opacity: '1', transform: 'none' } },
        fade: { from: { opacity: '0' }, to: { opacity: '1' } },
        pop: { '0%': { transform: 'scale(1)' }, '45%': { transform: 'scale(1.16)' }, '100%': { transform: 'scale(1)' } },
        blink: { '0%,92%,100%': { transform: 'scaleY(1)' }, '96%': { transform: 'scaleY(0.08)' } },
        glance: {
          '0%,100%': { transform: 'translate(0,0)' },
          '30%': { transform: 'translate(3px,-1px)' },
          '60%': { transform: 'translate(-3px,1px)' },
        },
        nod: { '0%,100%': { transform: 'rotate(0)' }, '35%': { transform: 'rotate(-4deg) translateY(2px)' }, '70%': { transform: 'rotate(3deg)' } },
        pulseRing: { '0%': { opacity: '.45', transform: 'scale(.92)' }, '100%': { opacity: '0', transform: 'scale(1.5)' } },
        draw: { to: { strokeDashoffset: '0' } },
        ping: { '0%': { boxShadow: '0 0 0 0 rgb(var(--accent) / .45)' }, '100%': { boxShadow: '0 0 0 8px rgb(var(--accent) / 0)' } },
      },
      animation: {
        float: 'float 5.5s ease-in-out infinite',
        rise: 'rise .3s cubic-bezier(.2,.7,.2,1) both',
        fade: 'fade .2s ease-out both',
        pop: 'pop .3s ease-out',
        blink: 'blink 5.5s infinite',
        glance: 'glance 9s ease-in-out infinite',
        nod: 'nod .7s ease-in-out',
        pulseRing: 'pulseRing 3s ease-out infinite',
        draw: 'draw .25s ease-out .05s forwards',
        ping: 'ping .9s ease-out 1',
      },
    },
  },
  plugins: [],
} satisfies Config

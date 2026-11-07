import type { Config } from 'tailwindcss'

const token = (name: string) => `rgb(var(--${name}) / <alpha-value>)`

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  darkMode: ['selector', '[data-theme="dark"]'],
  theme: {
    extend: {
      colors: {
        bg: token('bg'),
        surface: token('surface'),
        card: token('card'),
        fg: token('fg'),
        muted: token('muted'),
        line: token('line'),
        accent: token('accent'),
        'accent-fg': token('accent-fg'),
        danger: token('danger'),
        warn: token('warn'),
        ok: token('ok'),
        partner: token('partner'),
      },
      fontFamily: {
        sans: ['"Outfit Variable"', 'ui-sans-serif', 'system-ui', '-apple-system', 'sans-serif'],
      },
      borderRadius: { '4xl': '2rem' },
      boxShadow: {
        card: 'var(--shadow-card)',
        glow: 'var(--shadow-glow)',
        float: 'var(--shadow-float)',
      },
      keyframes: {
        float: { '0%,100%': { transform: 'translateY(0)' }, '50%': { transform: 'translateY(-8px)' } },
        rise: { from: { opacity: '0', transform: 'translateY(10px)' }, to: { opacity: '1', transform: 'none' } },
        pop: { '0%': { transform: 'scale(1)' }, '45%': { transform: 'scale(1.18)' }, '100%': { transform: 'scale(1)' } },
        blink: { '0%,92%,100%': { transform: 'scaleY(1)' }, '96%': { transform: 'scaleY(0.08)' } },
        glance: {
          '0%,100%': { transform: 'translate(0,0)' },
          '30%': { transform: 'translate(3px,-1px)' },
          '60%': { transform: 'translate(-3px,1px)' },
        },
        nod: { '0%,100%': { transform: 'rotate(0)' }, '35%': { transform: 'rotate(-4deg) translateY(2px)' }, '70%': { transform: 'rotate(3deg)' } },
        pulseRing: { '0%': { opacity: '.55', transform: 'scale(.9)' }, '100%': { opacity: '0', transform: 'scale(1.6)' } },
        draw: { to: { strokeDashoffset: '0' } },
      },
      animation: {
        float: 'float 5s ease-in-out infinite',
        rise: 'rise .5s cubic-bezier(.2,.7,.2,1) both',
        pop: 'pop .4s ease-out',
        blink: 'blink 5.5s infinite',
        glance: 'glance 9s ease-in-out infinite',
        nod: 'nod .7s ease-in-out',
        pulseRing: 'pulseRing 2.4s ease-out infinite',
        draw: 'draw .35s ease-out .05s forwards',
      },
    },
  },
  plugins: [],
} satisfies Config

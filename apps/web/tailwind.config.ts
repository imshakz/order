import type { Config } from 'tailwindcss';

/**
 * Ember & Oak palette: bottle-green dining room, brass fittings, stone tabletops.
 * Status colours are kept distinct so a host can read the floor at a glance.
 */
const config: Config = {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}', './lib/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        forest: { 950: '#0b211b', 900: '#0f2a22', 800: '#14342b', 700: '#1d4a3d', 600: '#2a6352', 500: '#3b7d69' },
        brass: { DEFAULT: '#c9a24a', light: '#e6cd8a', dark: '#9c7a2c' },
        stone: { 50: '#f5f6f3', 100: '#eceee9', 200: '#dde1da', 300: '#c4cac1', 400: '#9aa39a', 500: '#78827a', 600: '#5c665e', 700: '#3f4842' },
        ink: '#1a2420',
        ember: '#e2553d',
        status: {
          available: '#4f9d7a',
          seated: '#5b8def',
          ordered: '#c9a24a',
          attention: '#e2553d',
          reserved: '#8b7bd8',
          cleaning: '#78827a',
        },
        tier: { member: '#9aa39a', silver: '#b8c4cc', gold: '#d4a72c' },
      },
      fontFamily: {
        display: ['var(--font-display)', 'system-ui', 'sans-serif'],
        sans: ['var(--font-body)', 'system-ui', 'sans-serif'],
      },
      borderRadius: { xl: '14px', '2xl': '20px' },
      keyframes: {
        pulseRing: { '0%': { boxShadow: '0 0 0 0 rgba(226,85,61,.55)' }, '100%': { boxShadow: '0 0 0 14px rgba(226,85,61,0)' } },
        slideIn: { from: { transform: 'translateX(24px)', opacity: '0' }, to: { transform: 'none', opacity: '1' } },
        rise: { from: { transform: 'translateY(16px)', opacity: '0' }, to: { transform: 'none', opacity: '1' } },
      },
      animation: {
        pulseRing: 'pulseRing 1.6s ease-out infinite',
        slideIn: 'slideIn .22s ease-out',
        rise: 'rise .25s ease-out',
      },
    },
  },
  plugins: [],
};

export default config;

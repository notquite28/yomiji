/** @type {import('tailwindcss').Config} */
module.exports = {
  presets: [require('nativewind/preset')],

  // Class-based dark mode so AppThemeProvider can toggle a single 'dark' class.
  darkMode: 'class',

  content: ['./App.tsx', './src/**/*.{ts,tsx}'],

  theme: {
    extend: {
      colors: {
        // ── Semantic surface ──────────────────────────────────────
        background: {
          DEFAULT: '#f8f4ef',
          dark: '#151119',
        },
        surface: {
          DEFAULT: '#fffaf2',
          dark: '#211a27',
        },
        'surface-elevated': {
          DEFAULT: '#ffffff',
          dark: '#2c2134',
        },
        text: {
          DEFAULT: '#201a24',
          dark: '#fff7fb',
        },
        'text-muted': {
          DEFAULT: '#6f6574',
          dark: '#c6b7c9',
        },
        border: {
          DEFAULT: '#eadfdb',
          dark: '#443648',
        },

        // ── Semantic status ───────────────────────────────────────
        success: {
          DEFAULT: '#20805f',
          dark: '#79d7b4',
        },
        warning: {
          DEFAULT: '#a86200',
          dark: '#ffbd63',
        },
        danger: {
          DEFAULT: '#b3261e',
          dark: '#ffb4ab',
        },

        // ── Subject-type colours (theme-invariant) ────────────────
        radical: '#00aaff',
        kanji: '#ff00aa',
        vocabulary: '#aa00ff',

        // ── SRS-stage colours (theme-invariant) ───────────────────
        apprentice: '#dd0093',
        guru: '#882d9e',
        master: '#294ddb',
        enlightened: '#0093dd',
        burned: '#434343',
        lesson: '#00aaff',
        review: '#ff00aa',
      },

      // ── Exact-px spacing for the app's bespoke values ──────────
      spacing: {
        '4': '4px',
        '14': '14px',
        '18': '18px',
        '22': '22px',
        '26': '26px',
        '28': '28px',
        '34': '34px',
        '38': '38px',
        '42': '42px',
        '44': '44px',
        '54': '54px',
        '58': '58px',
        '72': '72px',
        '150': '150px',
        '172': '172px',
        '210': '210px',
        '300': '300px',
      },

      // ── Border radius (replaces bespoke values across the app) ──
      borderRadius: {
        sm: '10px',
        DEFAULT: '14px',
        md: '16px',
        lg: '18px',
        xl: '20px',
        '2xl': '22px',
        '3xl': '24px',
        '4xl': '28px',
        '5xl': '34px',
        full: '9999px',
      },

      // ── Typography (matches the app's current scale) ────────────
      fontSize: {
        '2xs': ['8px', { lineHeight: '10px' }],
        xs: ['9px', { lineHeight: '11px' }],
        sm: ['12px', { lineHeight: '14px' }],
        base: ['15px', { lineHeight: '22px' }],
        lg: ['18px', { lineHeight: '25px' }],
        xl: ['20px', { lineHeight: '24px' }],
        '2xl': ['21px', { lineHeight: '26px' }],
        '3xl': ['28px', { lineHeight: '32px' }],
        '4xl': ['34px', { lineHeight: '39px' }],
        '5xl': ['40px', { lineHeight: '48px' }],
        '6xl': ['64px', { lineHeight: '70px' }],
        '7xl': ['68px', { lineHeight: '74px' }],
        '8xl': ['72px', { lineHeight: '80px' }],
      },

      fontWeight: {
        heavy: '800',
        black: '900',
      },

      letterSpacing: {
        tightest: '-1.6',
        tighter: '-1.2',
        tight: '-0.3',
        normal: '0.1',
        wide: '0.2',
        wider: '0.3',
        widest: '0.4',
        ultra: '0.8',
        ultra2: '0.9',
        ultra3: '1.2',
        ultra4: '1.4',
      },
    },
  },

  plugins: [],
};

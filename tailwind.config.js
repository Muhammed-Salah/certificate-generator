/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['var(--font-body)', 'Georgia', 'serif'],
        display: ['var(--font-display)', 'Georgia', 'serif'],
        mono: ['JetBrains Mono', 'monospace'],
      },
      colors: {
        ink: {
          50:  '#f5f3ef',
          100: '#e8e4db',
          200: '#cfc8b8',
          300: '#b5a992',
          400: '#9a8b6d',
          500: '#7d6f55',
          600: '#635643',
          700: '#4a4032',
          800: '#322b22',
          900: '#1a1612',
          950: '#0d0b09',
        },
        parchment: {
          50:  '#fdfbf7',
          100: '#faf6ed',
          200: '#f4ecda',
          300: '#ecdfc2',
          400: '#e0cea3',
          500: '#d4bc84',
        },
        accent: {
          gold:    '#c9a84c',
          crimson: '#8b2635',
          forest:  '#2d5a3d',
          navy:    '#1e3a5f',
        },
      },
      animation: {
        'fade-in':    'fadeIn 0.4s ease-out',
        'slide-up':   'slideUp 0.5s ease-out',
        'shimmer':    'shimmer 1.5s infinite',
        'pulse-slow': 'pulse 3s ease-in-out infinite',
      },
      keyframes: {
        fadeIn:  { from: { opacity: '0' }, to: { opacity: '1' } },
        slideUp: { from: { opacity: '0', transform: 'translateY(12px)' }, to: { opacity: '1', transform: 'translateY(0)' } },
        shimmer: {
          '0%':   { backgroundPosition: '-200% 0' },
          '100%': { backgroundPosition: '200% 0' },
        },
      },
      boxShadow: {
        'soft':     '0 2px 20px rgba(26,22,18,0.08)',
        'medium':   '0 4px 40px rgba(26,22,18,0.12)',
        'strong':   '0 8px 60px rgba(26,22,18,0.18)',
        'inset-sm': 'inset 0 1px 3px rgba(26,22,18,0.1)',
      },
    },
  },
  plugins: [],
};

import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        ink: { 900: '#07060d', 800: '#0d0b17', 700: '#151223', 600: '#1e1a2f', 500: '#2b2542' },
        neon: { pink: '#ff3d81', violet: '#8b5cf6', cyan: '#22d3ee', lime: '#a3e635', amber: '#fbbf24' },
      },
      fontFamily: { display: ['var(--font-display)', 'system-ui', 'sans-serif'] },
      boxShadow: {
        glow: '0 0 0 1px rgba(139,92,246,.35), 0 8px 40px -8px rgba(139,92,246,.55)',
        'glow-pink': '0 0 0 1px rgba(255,61,129,.4), 0 8px 40px -8px rgba(255,61,129,.6)',
      },
      animation: {
        'pulse-fast': 'pulse 1s cubic-bezier(.4,0,.6,1) infinite',
        float: 'float 3s ease-in-out infinite',
      },
      keyframes: {
        float: { '0%,100%': { transform: 'translateY(0)' }, '50%': { transform: 'translateY(-6px)' } },
      },
    },
  },
  plugins: [],
};
export default config;

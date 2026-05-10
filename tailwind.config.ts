import type { Config } from 'tailwindcss';

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        'bg-deep': '#0a0d18',
        'bg-card': '#131725',
        'bg-card-hi': '#1a1f30',
        'border-base': '#28304a',
        'border-hi': '#3d476a',
        'text-cream': '#e8d8b0',
        'text-dim': '#9a9080',
        'text-low': '#6a6354',
        aether: '#6ec5ce',
        'aether-soft': '#4a8a91',
        gold: '#d4a958',
        'gold-hi': '#f0c878',
        crimson: '#c2604a',
        jade: '#6ab06f',
      },
      fontFamily: {
        display: ['Cinzel', 'serif'],
        body: ['Fraunces', 'Georgia', 'serif'],
        mono: ['"JetBrains Mono"', 'monospace'],
      },
    },
  },
  plugins: [],
} satisfies Config;

import type { Config } from 'tailwindcss';

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        'bg-deep': '#0a0d18',
        'bg-card': '#131725',
        'bg-card-hi': '#1a1f30',
        'border-base': '#2f3858',
        'border-hi': '#3d476a',
        'text-cream': '#e8d8b0',
        'text-dim': '#9a9080',
        'text-low': '#8a8274',
        aether: '#6ec5ce',
        'aether-soft': '#4a8a91',
        gold: '#d4a958',
        'gold-hi': '#f0c878',
        crimson: '#c06a59',
        jade: '#64b46b',
        // Crafter identity colors (FFXIV Disciples of the Hand).
        // Tuned to read on the dark card background without competing with
        // the gold/aether accents used for primary affordances.
        'crp': '#c1956a',  // Carpenter — warm wood
        'bsm': '#c66a64',  // Blacksmith — forged red
        'arm': '#94a0b6',  // Armorer — steel
        'gsm': '#e6c060',  // Goldsmith — bright gold
        'ltw': '#a07452',  // Leatherworker — saddle brown
        'wvr': '#d8b8c4',  // Weaver — dusty rose
        'alc': '#a07ed0',  // Alchemist — violet
        'cul': '#e6924a',  // Culinarian — orange
      },
      fontFamily: {
        display: ['Cinzel', 'serif'],
        body: ['"JetBrains Mono"', 'ui-monospace', 'monospace'],
        mono: ['"JetBrains Mono"', 'monospace'],
      },
    },
  },
  plugins: [],
} satisfies Config;

# FFXIV Helper Phase 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the single-file `phantom_crafting_tracker.html` artifact as a hostable React SPA with parity on the watchlist + Universalis market data, plus an in-app Settings page (retainer levels, world/DC, watchlist management with starter packs and XIVAPI search-add) and `localStorage` persistence.

**Architecture:** Static SPA. React 18 + Vite + TypeScript. Tailwind for styling (existing palette ported as theme tokens). Zustand for client state (with `persist` middleware → localStorage). TanStack Query for Universalis fetches. React Router v6 for the three top-level routes. No backend.

**Tech Stack:** React 18, Vite 5, TypeScript 5, Tailwind 3, Zustand 4, @tanstack/react-query 5, react-router-dom 6, Vitest + @testing-library/react.

**Spec:** `docs/superpowers/specs/2026-05-10-ffxiv-helper-rebuild-design.md`

---

## Conventions

- **TDD discipline:** every pure function and store gets a failing test first, then implementation. UI components get a smoke render test plus behavior tests for interactive bits.
- **Commits:** small, conventional (`feat:`, `test:`, `chore:`, `refactor:`).
- **Paths:** all paths relative to repo root `c:/Users/esthe/Documents/Dev/ffxiv-helper`.
- **Run commands:** `npm` (default with Vite). PowerShell or Bash both fine; commands shown work in either.
- **Test command shorthand:** `npm test -- <pattern>` runs Vitest on a specific file/pattern.

---

## Task 1: Initialize git repo and quarantine the legacy artifact

**Files:**
- Modify: `phantom_crafting_tracker.html` → moved to `legacy/phantom_crafting_tracker.html`
- Create: `.gitignore`
- Create: `README.md`

- [ ] **Step 1: Init git repo**

Run:
```
git init
git branch -M main
```

Expected: `Initialized empty Git repository in .../ffxiv-helper/.git/`.

- [ ] **Step 2: Create `.gitignore`**

Write `c:/Users/esthe/Documents/Dev/ffxiv-helper/.gitignore`:
```
node_modules
dist
.vite
.DS_Store
*.log
.env
.env.local
coverage
```

- [ ] **Step 3: Move legacy artifact**

Run:
```
mkdir legacy
git mv phantom_crafting_tracker.html legacy/phantom_crafting_tracker.html
```
(If `git mv` errors because the file isn't tracked yet, do `mv phantom_crafting_tracker.html legacy/` then proceed.)

- [ ] **Step 4: Create minimal README**

Write `c:/Users/esthe/Documents/Dev/ffxiv-helper/README.md`:
```markdown
# ffxiv-helper

Personal crafting/market tool for FFXIV. Live data via Universalis, item metadata via XIVAPI.

Default world: Phantom · DC: Chaos.

## Dev

```
npm install
npm run dev
```

## Legacy

The original single-file artifact lives in `legacy/phantom_crafting_tracker.html` for reference.
```

- [ ] **Step 5: Initial commit**

Run:
```
git add -A
git commit -m "chore: init repo, quarantine legacy artifact"
```

---

## Task 2: Scaffold Vite + React + TypeScript

**Files:**
- Create: `package.json`, `tsconfig.json`, `tsconfig.node.json`, `vite.config.ts`, `index.html`, `src/main.tsx`, `src/App.tsx`, `src/styles/index.css`

- [ ] **Step 1: Scaffold via Vite**

Run:
```
npm create vite@latest . -- --template react-ts
```

When prompted "Current directory is not empty", choose **"Ignore files and continue"**. This generates `package.json`, `tsconfig*.json`, `vite.config.ts`, `index.html`, `src/main.tsx`, `src/App.tsx`, `src/index.css`, etc.

- [ ] **Step 2: Install dependencies**

Run:
```
npm install
```

Expected: clean install, no audit errors that block.

- [ ] **Step 3: Sanity-check the dev server starts**

Run:
```
npm run dev
```

Expected: Vite logs `Local: http://localhost:5173/`. Open in browser, see the default Vite + React landing page. Stop the server (`Ctrl+C`).

- [ ] **Step 4: Replace `src/App.tsx` with an empty shell**

Overwrite `src/App.tsx`:
```tsx
export default function App() {
  return (
    <div className="min-h-screen bg-bg-deep text-text-cream">
      <h1>FFXIV Helper</h1>
    </div>
  );
}
```

(Tailwind classes won't resolve until Task 3 — that's fine, we'll fix in the next task.)

- [ ] **Step 5: Move styles file**

Rename `src/index.css` → `src/styles/index.css`. Update `src/main.tsx` import to `./styles/index.css`. Delete `src/App.css` if present.

- [ ] **Step 6: Commit**

```
git add -A
git commit -m "feat: scaffold Vite + React + TypeScript"
```

---

## Task 3: Install and configure Tailwind with the existing palette

**Files:**
- Create: `tailwind.config.ts`, `postcss.config.js`
- Modify: `src/styles/index.css`

- [ ] **Step 1: Install Tailwind**

Run:
```
npm install -D tailwindcss@3 postcss autoprefixer
npx tailwindcss init -p
```

Expected: creates `tailwind.config.js` and `postcss.config.js`.

- [ ] **Step 2: Convert config to TS and set theme**

Delete `tailwind.config.js`. Write `c:/Users/esthe/Documents/Dev/ffxiv-helper/tailwind.config.ts`:
```ts
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
```

- [ ] **Step 3: Wire Tailwind into the global stylesheet**

Overwrite `src/styles/index.css`:
```css
@import url('https://fonts.googleapis.com/css2?family=Cinzel:wght@400;500;600;700&family=Fraunces:opsz,wght@9..144,300;9..144,400;9..144,500;9..144,600&family=JetBrains+Mono:wght@400;500&display=swap');

@tailwind base;
@tailwind components;
@tailwind utilities;

html, body, #root {
  min-height: 100vh;
}
body {
  @apply bg-bg-deep text-text-cream font-body;
  background-image:
    radial-gradient(circle at 15% -10%, rgba(110,197,206,0.06), transparent 50%),
    radial-gradient(circle at 90% 110%, rgba(212,169,88,0.05), transparent 55%);
}
```

- [ ] **Step 4: Verify Tailwind compiles**

Run `npm run dev`, reload page. The `bg-bg-deep` background should render dark navy and "FFXIV Helper" should appear in cream. Stop the server.

- [ ] **Step 5: Commit**

```
git add -A
git commit -m "feat: configure Tailwind with theme palette"
```

---

## Task 4: Install runtime libs and add Vitest

**Files:**
- Modify: `package.json`, `vite.config.ts`
- Create: `src/test/setup.ts`

- [ ] **Step 1: Install runtime libs**

Run:
```
npm install zustand @tanstack/react-query react-router-dom
```

- [ ] **Step 2: Install dev/test libs**

Run:
```
npm install -D vitest @testing-library/react @testing-library/jest-dom @testing-library/user-event jsdom
```

- [ ] **Step 3: Add `test` script and configure Vitest**

Edit `package.json`:
- Add `"test": "vitest"` to `scripts`.

Edit `vite.config.ts` to add a `test` block under the existing config:
```ts
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    globals: true,
  },
});
```

If TypeScript complains about `test` not being a known property of `defineConfig`, change the import to:
```ts
import { defineConfig } from 'vitest/config';
```

- [ ] **Step 4: Add the test setup file**

Write `src/test/setup.ts`:
```ts
import '@testing-library/jest-dom/vitest';
```

- [ ] **Step 5: Smoke-test Vitest**

Write `src/sanity.test.ts`:
```ts
import { describe, it, expect } from 'vitest';

describe('sanity', () => {
  it('runs', () => {
    expect(1 + 1).toBe(2);
  });
});
```

Run `npm test -- --run`. Expected: 1 passed.

Delete `src/sanity.test.ts`.

- [ ] **Step 6: Commit**

```
git add -A
git commit -m "chore: install runtime libs (zustand, tanstack-query, router) + Vitest setup"
```

---

## Task 5: Universalis typed client

**Files:**
- Create: `src/lib/universalis.ts`
- Create: `src/lib/universalis.test.ts`

- [ ] **Step 1: Write failing tests**

Write `src/lib/universalis.test.ts`:
```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fetchMarketData, buildMarketUrl, parseMarketResponse } from './universalis';

describe('buildMarketUrl', () => {
  it('builds a Phantom URL with all item ids comma-separated', () => {
    expect(buildMarketUrl('Phantom', [1, 2, 3])).toBe(
      'https://universalis.app/api/v2/Phantom/1,2,3?listings=10&entries=15'
    );
  });

  it('builds a Chaos DC URL', () => {
    expect(buildMarketUrl('Chaos', [42])).toBe(
      'https://universalis.app/api/v2/Chaos/42?listings=10&entries=15'
    );
  });
});

describe('parseMarketResponse', () => {
  it('extracts min NQ, min HQ, average HQ, velocity, and lastUploadTime per item', () => {
    const raw = {
      items: {
        '100': {
          listings: [
            { hq: false, pricePerUnit: 50 },
            { hq: true, pricePerUnit: 200 },
            { hq: true, pricePerUnit: 180 },
          ],
          recentHistory: [
            { hq: false, pricePerUnit: 60 },
            { hq: true, pricePerUnit: 190 },
          ],
          regularSaleVelocity: 4.2,
          lastUploadTime: 1715000000000,
        },
      },
    };
    const out = parseMarketResponse(raw);
    expect(out['100']).toEqual({
      minNQ: 50,
      minHQ: 180,
      avgNQ: 60,
      avgHQ: 190,
      velocity: 4.2,
      lastUploadTime: 1715000000000,
      listingCount: 3,
    });
  });

  it('returns null prices when no matching listings', () => {
    const out = parseMarketResponse({ items: { '7': { listings: [], recentHistory: [], regularSaleVelocity: 0, lastUploadTime: 0 } } });
    expect(out['7']).toEqual({
      minNQ: null, minHQ: null, avgNQ: null, avgHQ: null,
      velocity: 0, lastUploadTime: 0, listingCount: 0,
    });
  });
});

describe('fetchMarketData', () => {
  beforeEach(() => { vi.restoreAllMocks(); });

  it('throws when response not OK', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 500 }));
    await expect(fetchMarketData('Phantom', [1])).rejects.toThrow('Universalis 500');
  });

  it('returns parsed data on success', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ items: { '1': { listings: [{ hq: false, pricePerUnit: 99 }], recentHistory: [], regularSaleVelocity: 1, lastUploadTime: 1 } } }),
    }));
    const out = await fetchMarketData('Phantom', [1]);
    expect(out['1'].minNQ).toBe(99);
  });
});
```

- [ ] **Step 2: Run tests, verify they fail**

Run `npm test -- universalis --run`. Expected: errors / module not found.

- [ ] **Step 3: Implement client**

Write `src/lib/universalis.ts`:
```ts
export type Scope = string; // world or DC name, e.g. 'Phantom' | 'Chaos'

export interface MarketItem {
  minNQ: number | null;
  minHQ: number | null;
  avgNQ: number | null;
  avgHQ: number | null;
  velocity: number;
  lastUploadTime: number;
  listingCount: number;
}

export type MarketData = Record<string, MarketItem>;

interface RawListing { hq: boolean; pricePerUnit: number }
interface RawHistory { hq: boolean; pricePerUnit: number }
interface RawItem {
  listings?: RawListing[];
  recentHistory?: RawHistory[];
  regularSaleVelocity?: number;
  lastUploadTime?: number;
}
interface RawResponse { items?: Record<string, RawItem> }

export function buildMarketUrl(scope: Scope, ids: number[]): string {
  return `https://universalis.app/api/v2/${scope}/${ids.join(',')}?listings=10&entries=15`;
}

function minPrice(arr: RawListing[], hq: boolean): number | null {
  const v = arr.filter((l) => l.hq === hq).map((l) => l.pricePerUnit);
  return v.length ? Math.min(...v) : null;
}

function avgPrice(arr: RawHistory[], hq: boolean): number | null {
  const v = arr.filter((l) => l.hq === hq).map((l) => l.pricePerUnit);
  if (!v.length) return null;
  return Math.round(v.reduce((a, b) => a + b, 0) / v.length);
}

export function parseMarketResponse(raw: RawResponse): MarketData {
  const out: MarketData = {};
  const items = raw.items ?? {};
  for (const [id, item] of Object.entries(items)) {
    const listings = item.listings ?? [];
    const history = item.recentHistory ?? [];
    out[id] = {
      minNQ: minPrice(listings, false),
      minHQ: minPrice(listings, true),
      avgNQ: avgPrice(history, false),
      avgHQ: avgPrice(history, true),
      velocity: item.regularSaleVelocity ?? 0,
      lastUploadTime: item.lastUploadTime ?? 0,
      listingCount: listings.length,
    };
  }
  return out;
}

export async function fetchMarketData(scope: Scope, ids: number[]): Promise<MarketData> {
  const res = await fetch(buildMarketUrl(scope, ids));
  if (!res.ok) throw new Error(`Universalis ${res.status}`);
  const raw = (await res.json()) as RawResponse;
  return parseMarketResponse(raw);
}
```

- [ ] **Step 4: Run tests, verify pass**

Run `npm test -- universalis --run`. Expected: all pass.

- [ ] **Step 5: Commit**

```
git add -A
git commit -m "feat(universalis): typed client with URL builder + response parser"
```

---

## Task 6: Score function (parity placeholder)

**Files:**
- Create: `src/lib/score.ts`
- Create: `src/lib/score.test.ts`

- [ ] **Step 1: Failing tests**

Write `src/lib/score.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { computeRawScore, normalizeScores } from './score';

describe('computeRawScore', () => {
  it('returns refPrice * velocity', () => {
    expect(computeRawScore({ refPrice: 1000, velocity: 3 })).toBe(3000);
  });
  it('returns 0 when no price', () => {
    expect(computeRawScore({ refPrice: 0, velocity: 5 })).toBe(0);
  });
  it('returns 0 when no velocity', () => {
    expect(computeRawScore({ refPrice: 1000, velocity: 0 })).toBe(0);
  });
});

describe('normalizeScores', () => {
  it('scales raw scores to 0-100 against the max', () => {
    expect(normalizeScores([0, 50, 100, 200])).toEqual([0, 25, 50, 100]);
  });
  it('returns zeros when all raw scores are 0', () => {
    expect(normalizeScores([0, 0, 0])).toEqual([0, 0, 0]);
  });
});
```

- [ ] **Step 2: Verify failing**

Run `npm test -- score --run`. Expected: module not found.

- [ ] **Step 3: Implement**

Write `src/lib/score.ts`:
```ts
export interface ScoreInput { refPrice: number; velocity: number }

export function computeRawScore({ refPrice, velocity }: ScoreInput): number {
  return refPrice * velocity;
}

export function normalizeScores(raw: number[]): number[] {
  const max = Math.max(0, ...raw);
  if (max === 0) return raw.map(() => 0);
  return raw.map((r) => Math.round((r / max) * 100));
}
```

- [ ] **Step 4: Verify pass**

Run `npm test -- score --run`. Expected: all pass.

- [ ] **Step 5: Commit**

```
git add -A
git commit -m "feat(score): price*velocity raw score + normalize 0-100"
```

---

## Task 7: Item types and starter pack data

**Files:**
- Create: `src/features/items/types.ts`
- Create: `src/features/items/starterPacks.ts`
- Create: `src/features/items/starterPacks.test.ts`

- [ ] **Step 1: Define shared types**

Write `src/features/items/types.ts`:
```ts
export type CrafterCode = 'CRP' | 'BSM' | 'ARM' | 'GSM' | 'LTW' | 'WVR' | 'ALC' | 'CUL' | 'ANY';
export type ItemCategory = 'Raid' | 'Tincture' | 'Food' | 'Dye' | 'Glamour' | 'Housing' | 'Materia';

export interface TrackedItem {
  id: number;
  name: string;
  crafter: CrafterCode;
  lvl: number;
  cat: ItemCategory;
  subcat?: string;
}

export type StarterPackId =
  | 'raid-current'
  | 'tinctures-g4'
  | 'food-7x'
  | 'dyes'
  | 'materia-xii'
  | 'glamour-faves'
  | 'housing-faves';

export interface StarterPack {
  id: StarterPackId;
  label: string;
  defaultOn: boolean;
  items: TrackedItem[];
}
```

- [ ] **Step 2: Failing test for starter packs**

Write `src/features/items/starterPacks.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { STARTER_PACKS, allItemsFromEnabledPacks } from './starterPacks';

describe('STARTER_PACKS', () => {
  it('has all seven packs', () => {
    const ids = STARTER_PACKS.map((p) => p.id).sort();
    expect(ids).toEqual([
      'dyes', 'food-7x', 'glamour-faves', 'housing-faves',
      'materia-xii', 'raid-current', 'tinctures-g4',
    ]);
  });

  it('current raid pack contains the Courtly Lover head piece (id 49281)', () => {
    const raid = STARTER_PACKS.find((p) => p.id === 'raid-current')!;
    expect(raid.items.some((i) => i.id === 49281)).toBe(true);
  });

  it('marks 7.x packs as defaultOn and Quaintrelle/housing as defaultOff', () => {
    const byId = Object.fromEntries(STARTER_PACKS.map((p) => [p.id, p]));
    expect(byId['raid-current'].defaultOn).toBe(true);
    expect(byId['tinctures-g4'].defaultOn).toBe(true);
    expect(byId['food-7x'].defaultOn).toBe(true);
    expect(byId['housing-faves'].defaultOn).toBe(false);
  });
});

describe('allItemsFromEnabledPacks', () => {
  it('returns the union of items from enabled packs, deduped by id', () => {
    const enabled = { 'raid-current': true, 'tinctures-g4': true, 'food-7x': false, 'dyes': false, 'materia-xii': false, 'glamour-faves': false, 'housing-faves': false } as const;
    const items = allItemsFromEnabledPacks(enabled);
    const ids = new Set(items.map((i) => i.id));
    expect(ids.size).toBe(items.length);
    expect(ids.has(49281)).toBe(true); // raid
    expect(ids.has(49234)).toBe(true); // gemdraught of strength
    expect(ids.has(49232)).toBe(false); // food, disabled
  });
});
```

- [ ] **Step 3: Verify failing**

Run `npm test -- starterPacks --run`. Expected: module not found.

- [ ] **Step 4: Port the item data from the legacy artifact**

Write `src/features/items/starterPacks.ts`. Copy the item data from `legacy/phantom_crafting_tracker.html` (the `ITEMS` array, lines 554-677) and split into packs. Full file:
```ts
import type { StarterPack, StarterPackId, TrackedItem } from './types';

const raidCurrent: TrackedItem[] = [
  { id: 49281, name: "Courtly Lover's Temple Chain of Striking", crafter: 'LTW', lvl: 100, cat: 'Raid', subcat: 'Head' },
  { id: 49282, name: "Courtly Lover's Cloak of Striking",        crafter: 'LTW', lvl: 100, cat: 'Raid', subcat: 'Body' },
  { id: 49283, name: "Courtly Lover's Armguards of Striking",    crafter: 'LTW', lvl: 100, cat: 'Raid', subcat: 'Hands' },
  { id: 49284, name: "Courtly Lover's Brais of Striking",        crafter: 'LTW', lvl: 100, cat: 'Raid', subcat: 'Legs' },
  { id: 49285, name: "Courtly Lover's Boots of Striking",        crafter: 'LTW', lvl: 100, cat: 'Raid', subcat: 'Feet' },
  { id: 49286, name: "Courtly Lover's Hairpin of Aiming",        crafter: 'LTW', lvl: 100, cat: 'Raid', subcat: 'Head' },
  { id: 49287, name: "Courtly Lover's Shirt of Aiming",          crafter: 'LTW', lvl: 100, cat: 'Raid', subcat: 'Body' },
  { id: 49288, name: "Courtly Lover's Halfgloves of Aiming",     crafter: 'LTW', lvl: 100, cat: 'Raid', subcat: 'Hands' },
  { id: 49289, name: "Courtly Lover's Trousers of Aiming",       crafter: 'LTW', lvl: 100, cat: 'Raid', subcat: 'Legs' },
  { id: 49290, name: "Courtly Lover's Shoes of Aiming",          crafter: 'LTW', lvl: 100, cat: 'Raid', subcat: 'Feet' },
  { id: 49291, name: "Courtly Lover's Hairpin of Scouting",      crafter: 'LTW', lvl: 100, cat: 'Raid', subcat: 'Head' },
  { id: 49292, name: "Courtly Lover's Shirt of Scouting",        crafter: 'LTW', lvl: 100, cat: 'Raid', subcat: 'Body' },
  { id: 49293, name: "Courtly Lover's Halfgloves of Scouting",   crafter: 'LTW', lvl: 100, cat: 'Raid', subcat: 'Hands' },
  { id: 49294, name: "Courtly Lover's Trousers of Scouting",     crafter: 'LTW', lvl: 100, cat: 'Raid', subcat: 'Legs' },
  { id: 49295, name: "Courtly Lover's Shoes of Scouting",        crafter: 'LTW', lvl: 100, cat: 'Raid', subcat: 'Feet' },
  { id: 49296, name: "Courtly Lover's Hood of Healing",          crafter: 'WVR', lvl: 100, cat: 'Raid', subcat: 'Head' },
  { id: 49297, name: "Courtly Lover's Longcoat of Healing",      crafter: 'WVR', lvl: 100, cat: 'Raid', subcat: 'Body' },
  { id: 49298, name: "Courtly Lover's Gloves of Healing",        crafter: 'WVR', lvl: 100, cat: 'Raid', subcat: 'Hands' },
  { id: 49299, name: "Courtly Lover's Pantaloons of Healing",    crafter: 'WVR', lvl: 100, cat: 'Raid', subcat: 'Legs' },
  { id: 49300, name: "Courtly Lover's Shoes of Healing",         crafter: 'WVR', lvl: 100, cat: 'Raid', subcat: 'Feet' },
  { id: 49301, name: "Courtly Lover's Hood of Casting",          crafter: 'WVR', lvl: 100, cat: 'Raid', subcat: 'Head' },
  { id: 49302, name: "Courtly Lover's Longcoat of Casting",      crafter: 'WVR', lvl: 100, cat: 'Raid', subcat: 'Body' },
  { id: 49303, name: "Courtly Lover's Gloves of Casting",        crafter: 'WVR', lvl: 100, cat: 'Raid', subcat: 'Hands' },
  { id: 49304, name: "Courtly Lover's Pantaloons of Casting",    crafter: 'WVR', lvl: 100, cat: 'Raid', subcat: 'Legs' },
  { id: 49305, name: "Courtly Lover's Shoes of Casting",         crafter: 'WVR', lvl: 100, cat: 'Raid', subcat: 'Feet' },
];

const tincturesG4: TrackedItem[] = [
  { id: 49234, name: 'Grade 4 Gemdraught of Strength',     crafter: 'ALC', lvl: 100, cat: 'Tincture' },
  { id: 49235, name: 'Grade 4 Gemdraught of Dexterity',    crafter: 'ALC', lvl: 100, cat: 'Tincture' },
  { id: 49236, name: 'Grade 4 Gemdraught of Vitality',     crafter: 'ALC', lvl: 100, cat: 'Tincture' },
  { id: 49237, name: 'Grade 4 Gemdraught of Intelligence', crafter: 'ALC', lvl: 100, cat: 'Tincture' },
  { id: 49238, name: 'Grade 4 Gemdraught of Mind',         crafter: 'ALC', lvl: 100, cat: 'Tincture' },
  { id: 49218, name: 'Grade 4 Gemsap of Strength',         crafter: 'ALC', lvl: 100, cat: 'Tincture' },
  { id: 49219, name: 'Grade 4 Gemsap of Dexterity',        crafter: 'ALC', lvl: 100, cat: 'Tincture' },
  { id: 49220, name: 'Grade 4 Gemsap of Vitality',         crafter: 'ALC', lvl: 100, cat: 'Tincture' },
  { id: 49221, name: 'Grade 4 Gemsap of Intelligence',     crafter: 'ALC', lvl: 100, cat: 'Tincture' },
  { id: 49222, name: 'Grade 4 Gemsap of Mind',             crafter: 'ALC', lvl: 100, cat: 'Tincture' },
];

const food7x: TrackedItem[] = [
  { id: 49232, name: 'Rock-fist Popoto',         crafter: 'CUL', lvl: 100, cat: 'Food' },
  { id: 49240, name: 'Caramel Popcorn',          crafter: 'CUL', lvl: 100, cat: 'Food' },
  { id: 49241, name: 'Prune Ponzecake',          crafter: 'CUL', lvl: 100, cat: 'Food' },
  { id: 49242, name: 'Prune-packed Fruitcake',   crafter: 'CUL', lvl: 100, cat: 'Food' },
  { id: 49244, name: 'Popoto Potage',            crafter: 'CUL', lvl: 100, cat: 'Food' },
  { id: 49245, name: 'Rock-fisted Popoto Stew',  crafter: 'CUL', lvl: 100, cat: 'Food' },
  { id: 49246, name: 'Rock-fisted Popoto Salad', crafter: 'CUL', lvl: 100, cat: 'Food' },
  { id: 49247, name: 'Clam Cake',                crafter: 'CUL', lvl: 100, cat: 'Food' },
];

const dyes: TrackedItem[] = [
  { id: 13114, name: 'General-purpose Pure White Dye',      crafter: 'WVR', lvl: 50, cat: 'Dye' },
  { id: 13115, name: 'General-purpose Jet Black Dye',       crafter: 'WVR', lvl: 50, cat: 'Dye' },
  { id: 13116, name: 'General-purpose Metallic Silver Dye', crafter: 'WVR', lvl: 50, cat: 'Dye' },
  { id: 13117, name: 'General-purpose Metallic Gold Dye',   crafter: 'WVR', lvl: 50, cat: 'Dye' },
];

const materiaXii: TrackedItem[] = [
  { id: 41771, name: "Heavens' Eye Materia XII", crafter: 'ANY', lvl: 100, cat: 'Materia' },
  { id: 41772, name: 'Savage Aim Materia XII',   crafter: 'ANY', lvl: 100, cat: 'Materia' },
  { id: 41773, name: 'Savage Might Materia XII', crafter: 'ANY', lvl: 100, cat: 'Materia' },
  { id: 41774, name: 'Battledance Materia XII',  crafter: 'ANY', lvl: 100, cat: 'Materia' },
  { id: 41781, name: 'Quickarm Materia XII',     crafter: 'ANY', lvl: 100, cat: 'Materia' },
  { id: 41782, name: 'Quicktongue Materia XII',  crafter: 'ANY', lvl: 100, cat: 'Materia' },
];

const glamourFaves: TrackedItem[] = [
  { id: 29435, name: 'Neo-Ishgardian Top of Striking', crafter: 'LTW', lvl: 80, cat: 'Glamour' },
  { id: 29429, name: 'Neo-Ishgardian Top of Maiming',  crafter: 'ARM', lvl: 80, cat: 'Glamour' },
  { id: 29441, name: 'Neo-Ishgardian Top of Aiming',   crafter: 'LTW', lvl: 80, cat: 'Glamour' },
  { id: 29447, name: 'Neo-Ishgardian Top of Scouting', crafter: 'LTW', lvl: 80, cat: 'Glamour' },
  { id: 29459, name: 'Neo-Ishgardian Top of Casting',  crafter: 'WVR', lvl: 80, cat: 'Glamour' },
  { id: 29453, name: 'Neo-Ishgardian Top of Healing',  crafter: 'WVR', lvl: 80, cat: 'Glamour' },
  { id: 39676, name: 'Diadochos Coat of Healing',      crafter: 'WVR', lvl: 90, cat: 'Glamour' },
  { id: 39681, name: 'Diadochos Coat of Casting',      crafter: 'WVR', lvl: 90, cat: 'Glamour' },
  { id: 40618, name: 'Ornate Diadochos Coat of Healing', crafter: 'WVR', lvl: 90, cat: 'Glamour' },
  { id: 40619, name: 'Ornate Diadochos Coat of Casting', crafter: 'WVR', lvl: 90, cat: 'Glamour' },
  { id: 39663, name: 'Diadochos Bottoms of Striking',  crafter: 'LTW', lvl: 90, cat: 'Glamour' },
  { id: 23373, name: "Quaintrelle's Hat",              crafter: 'WVR', lvl: 50, cat: 'Glamour' },
  { id: 23374, name: "Quaintrelle's Dress Shoes",      crafter: 'WVR', lvl: 50, cat: 'Glamour' },
  { id: 23001, name: "Quaintrelle's Ruffled Dress",    crafter: 'WVR', lvl: 50, cat: 'Glamour' },
  { id: 23002, name: "Quaintrelle's Ruffled Skirt",    crafter: 'WVR', lvl: 50, cat: 'Glamour' },
  { id: 29234, name: 'Crystarium Robe of Casting',     crafter: 'WVR', lvl: 80, cat: 'Glamour' },
];

const housingFaves: TrackedItem[] = [
  { id: 12087, name: 'Stuffed Carbuncle',     crafter: 'LTW', lvl: 50, cat: 'Housing' },
  { id: 8729,  name: 'Stuffed Tonberry',      crafter: 'LTW', lvl: 50, cat: 'Housing' },
  { id: 6653,  name: 'Stuffed Moogle',        crafter: 'WVR', lvl: 50, cat: 'Housing' },
  { id: 6654,  name: 'Stuffed Chocobo',       crafter: 'WVR', lvl: 50, cat: 'Housing' },
  { id: 6601,  name: 'Riviera Round Table',   crafter: 'CRP', lvl: 30, cat: 'Housing' },
  { id: 6603,  name: 'Glade Round Table',     crafter: 'CRP', lvl: 30, cat: 'Housing' },
  { id: 6602,  name: 'Oasis Round Table',     crafter: 'CRP', lvl: 30, cat: 'Housing' },
  { id: 12085, name: 'Alpine Round Table',    crafter: 'CRP', lvl: 60, cat: 'Housing' },
  { id: 39411, name: 'Faerie Round Table',    crafter: 'CRP', lvl: 90, cat: 'Housing' },
  { id: 6543,  name: 'Glade Bed',             crafter: 'CRP', lvl: 50, cat: 'Housing' },
  { id: 6544,  name: 'Oasis Bed',             crafter: 'CRP', lvl: 50, cat: 'Housing' },
  { id: 6583,  name: 'Riviera Floor Lamp',    crafter: 'GSM', lvl: 30, cat: 'Housing' },
  { id: 6584,  name: 'Glade Floor Lamp',      crafter: 'GSM', lvl: 30, cat: 'Housing' },
  { id: 6585,  name: 'Oasis Floor Lamp',      crafter: 'GSM', lvl: 30, cat: 'Housing' },
  { id: 6587,  name: 'Tonberry Floor Lamp',   crafter: 'GSM', lvl: 50, cat: 'Housing' },
  { id: 14048, name: 'Pudding Floor Lamp',    crafter: 'GSM', lvl: 50, cat: 'Housing' },
  { id: 38596, name: 'Sharlayan Chair',       crafter: 'CRP', lvl: 90, cat: 'Housing' },
  { id: 38597, name: 'Sharlayan Desk',        crafter: 'CRP', lvl: 90, cat: 'Housing' },
  { id: 21831, name: 'Sharlayan Cabinet',     crafter: 'CRP', lvl: 90, cat: 'Housing' },
  { id: 21832, name: 'Sharlayan Wardrobe',    crafter: 'CRP', lvl: 90, cat: 'Housing' },
  { id: 38598, name: 'Sharlayan Rug',         crafter: 'WVR', lvl: 90, cat: 'Housing' },
  { id: 20741, name: 'Hingan Andon Lamp',     crafter: 'GSM', lvl: 70, cat: 'Housing' },
  { id: 20211, name: 'Doman Bubble Eye',      crafter: 'CUL', lvl: 70, cat: 'Housing' },
  { id: 20776, name: 'Far Eastern Antique',   crafter: 'CRP', lvl: 70, cat: 'Housing' },
  { id: 14045, name: 'Orchestrion',           crafter: 'GSM', lvl: 50, cat: 'Housing' },
  { id: 28751, name: "Skybuilders' Counter",  crafter: 'CRP', lvl: 80, cat: 'Housing' },
  { id: 27282, name: 'Crystarium Bench',      crafter: 'CRP', lvl: 80, cat: 'Housing' },
];

export const STARTER_PACKS: StarterPack[] = [
  { id: 'raid-current',   label: 'Current raid set (7.x)',  defaultOn: true,  items: raidCurrent },
  { id: 'tinctures-g4',   label: 'Tinctures (Grade 4)',     defaultOn: true,  items: tincturesG4 },
  { id: 'food-7x',        label: 'Food (7.x)',              defaultOn: true,  items: food7x },
  { id: 'dyes',           label: 'General-purpose dyes',    defaultOn: true,  items: dyes },
  { id: 'materia-xii',    label: 'Materia XII',             defaultOn: true,  items: materiaXii },
  { id: 'glamour-faves',  label: 'Glamour favourites',      defaultOn: false, items: glamourFaves },
  { id: 'housing-faves',  label: 'Housing favourites',      defaultOn: false, items: housingFaves },
];

export type StarterPackToggles = Record<StarterPackId, boolean>;

export function defaultStarterToggles(): StarterPackToggles {
  return Object.fromEntries(STARTER_PACKS.map((p) => [p.id, p.defaultOn])) as StarterPackToggles;
}

export function allItemsFromEnabledPacks(toggles: StarterPackToggles): TrackedItem[] {
  const seen = new Set<number>();
  const out: TrackedItem[] = [];
  for (const pack of STARTER_PACKS) {
    if (!toggles[pack.id]) continue;
    for (const item of pack.items) {
      if (seen.has(item.id)) continue;
      seen.add(item.id);
      out.push(item);
    }
  }
  return out;
}
```

- [ ] **Step 5: Verify pass**

Run `npm test -- starterPacks --run`. Expected: all pass.

- [ ] **Step 6: Commit**

```
git add -A
git commit -m "feat(items): item types + starter packs ported from legacy artifact"
```

---

## Task 8: Settings store (Zustand persisted)

**Files:**
- Create: `src/features/settings/store.ts`
- Create: `src/features/settings/store.test.ts`

- [ ] **Step 1: Failing tests**

Write `src/features/settings/store.test.ts`:
```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { useSettingsStore, defaultSettings } from './store';

beforeEach(() => {
  localStorage.clear();
  useSettingsStore.setState(defaultSettings());
});

describe('settings store', () => {
  it('starts with Phantom/Chaos and the legacy retainer levels', () => {
    const s = useSettingsStore.getState();
    expect(s.world).toBe('Phantom');
    expect(s.dc).toBe('Chaos');
    expect(s.retainerLevels.LTW).toBe(100);
    expect(s.retainerLevels.BSM).toBe(33);
  });

  it('setRetainerLevel updates a single crafter', () => {
    useSettingsStore.getState().setRetainerLevel('BSM', 50);
    expect(useSettingsStore.getState().retainerLevels.BSM).toBe(50);
  });

  it('setWorld and setDc update scope', () => {
    useSettingsStore.getState().setWorld('Phoenix');
    useSettingsStore.getState().setDc('Light');
    expect(useSettingsStore.getState().world).toBe('Phoenix');
    expect(useSettingsStore.getState().dc).toBe('Light');
  });

  it('persists to localStorage under ffxiv-helper:settings', () => {
    useSettingsStore.getState().setRetainerLevel('CRP', 99);
    const raw = localStorage.getItem('ffxiv-helper:settings');
    expect(raw).toBeTruthy();
    expect(JSON.parse(raw!).state.retainerLevels.CRP).toBe(99);
  });
});
```

- [ ] **Step 2: Verify failing**

Run `npm test -- settings/store --run`. Expected: module not found.

- [ ] **Step 3: Implement**

Write `src/features/settings/store.ts`:
```ts
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { CrafterCode } from '../items/types';

export type CrafterLevels = Record<Exclude<CrafterCode, 'ANY'>, number>;

export interface SettingsState {
  _v: 1;
  world: string;
  dc: string;
  retainerLevels: CrafterLevels;
  overheadMinutes: number;
  setWorld: (w: string) => void;
  setDc: (d: string) => void;
  setRetainerLevel: (c: keyof CrafterLevels, lvl: number) => void;
  setOverheadMinutes: (n: number) => void;
}

export function defaultSettings(): Pick<SettingsState, '_v' | 'world' | 'dc' | 'retainerLevels' | 'overheadMinutes'> {
  return {
    _v: 1,
    world: 'Phantom',
    dc: 'Chaos',
    retainerLevels: {
      CRP: 93, BSM: 33, ARM: 42, GSM: 83, LTW: 100, WVR: 100, ALC: 90, CUL: 100,
    },
    overheadMinutes: 5,
  };
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      ...defaultSettings(),
      setWorld: (world) => set({ world }),
      setDc: (dc) => set({ dc }),
      setRetainerLevel: (c, lvl) => set((s) => ({ retainerLevels: { ...s.retainerLevels, [c]: lvl } })),
      setOverheadMinutes: (overheadMinutes) => set({ overheadMinutes }),
    }),
    { name: 'ffxiv-helper:settings' },
  ),
);
```

- [ ] **Step 4: Verify pass**

Run `npm test -- settings/store --run`. Expected: all pass.

- [ ] **Step 5: Commit**

```
git add -A
git commit -m "feat(settings): zustand persisted settings store"
```

---

## Task 9: Watchlist store (Zustand persisted)

**Files:**
- Create: `src/features/items/watchlistStore.ts`
- Create: `src/features/items/watchlistStore.test.ts`

- [ ] **Step 1: Failing tests**

Write `src/features/items/watchlistStore.test.ts`:
```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { useWatchlistStore, defaultWatchlist } from './watchlistStore';

beforeEach(() => {
  localStorage.clear();
  useWatchlistStore.setState(defaultWatchlist());
});

describe('watchlist store', () => {
  it('starts with default starter pack toggles', () => {
    const s = useWatchlistStore.getState();
    expect(s.starterPacks['raid-current']).toBe(true);
    expect(s.starterPacks['housing-faves']).toBe(false);
    expect(s.customItems).toEqual([]);
  });

  it('togglePack flips a pack on/off', () => {
    useWatchlistStore.getState().togglePack('housing-faves');
    expect(useWatchlistStore.getState().starterPacks['housing-faves']).toBe(true);
    useWatchlistStore.getState().togglePack('housing-faves');
    expect(useWatchlistStore.getState().starterPacks['housing-faves']).toBe(false);
  });

  it('addCustomItem appends and dedupes by id', () => {
    const item = { id: 12345, name: 'Test Item', crafter: 'CRP' as const, lvl: 90, cat: 'Glamour' as const };
    useWatchlistStore.getState().addCustomItem(item);
    useWatchlistStore.getState().addCustomItem(item);
    expect(useWatchlistStore.getState().customItems).toHaveLength(1);
    expect(useWatchlistStore.getState().customItems[0].id).toBe(12345);
  });

  it('removeCustomItem drops by id', () => {
    const a = { id: 1, name: 'A', crafter: 'CRP' as const, lvl: 1, cat: 'Glamour' as const };
    const b = { id: 2, name: 'B', crafter: 'WVR' as const, lvl: 1, cat: 'Glamour' as const };
    useWatchlistStore.getState().addCustomItem(a);
    useWatchlistStore.getState().addCustomItem(b);
    useWatchlistStore.getState().removeCustomItem(1);
    expect(useWatchlistStore.getState().customItems.map((i) => i.id)).toEqual([2]);
  });
});
```

- [ ] **Step 2: Verify failing**

Run `npm test -- watchlistStore --run`. Expected: module not found.

- [ ] **Step 3: Implement**

Write `src/features/items/watchlistStore.ts`:
```ts
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { TrackedItem } from './types';
import { defaultStarterToggles, type StarterPackId, type StarterPackToggles } from './starterPacks';

export interface WatchlistState {
  _v: 1;
  starterPacks: StarterPackToggles;
  customItems: TrackedItem[];
  togglePack: (id: StarterPackId) => void;
  addCustomItem: (item: TrackedItem) => void;
  removeCustomItem: (id: number) => void;
}

export function defaultWatchlist(): Pick<WatchlistState, '_v' | 'starterPacks' | 'customItems'> {
  return { _v: 1, starterPacks: defaultStarterToggles(), customItems: [] };
}

export const useWatchlistStore = create<WatchlistState>()(
  persist(
    (set) => ({
      ...defaultWatchlist(),
      togglePack: (id) => set((s) => ({ starterPacks: { ...s.starterPacks, [id]: !s.starterPacks[id] } })),
      addCustomItem: (item) => set((s) => (
        s.customItems.some((i) => i.id === item.id) ? s : { customItems: [...s.customItems, item] }
      )),
      removeCustomItem: (id) => set((s) => ({ customItems: s.customItems.filter((i) => i.id !== id) })),
    }),
    { name: 'ffxiv-helper:watchlist' },
  ),
);
```

- [ ] **Step 4: Verify pass**

Run `npm test -- watchlistStore --run`. Expected: all pass.

- [ ] **Step 5: Commit**

```
git add -A
git commit -m "feat(items): persisted watchlist store"
```

---

## Task 10: UI store (filters/sort, persisted)

**Files:**
- Create: `src/features/ui/uiStore.ts`
- Create: `src/features/ui/uiStore.test.ts`

- [ ] **Step 1: Failing tests**

Write `src/features/ui/uiStore.test.ts`:
```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { useUiStore, defaultUi } from './uiStore';

beforeEach(() => {
  localStorage.clear();
  useUiStore.setState(defaultUi());
});

describe('ui store', () => {
  it('defaults', () => {
    const s = useUiStore.getState();
    expect(s.catFilter).toBe('All');
    expect(s.craftFilter).toBe('All');
    expect(s.sortKey).toBe('score');
    expect(s.sortDir).toBe('desc');
    expect(s.search).toBe('');
  });

  it('setSort toggles direction when clicking the same key', () => {
    useUiStore.getState().setSort('score');
    expect(useUiStore.getState().sortDir).toBe('asc');
    useUiStore.getState().setSort('score');
    expect(useUiStore.getState().sortDir).toBe('desc');
  });

  it('setSort on a new key uses asc for name/crafter, desc for everything else', () => {
    useUiStore.getState().setSort('name');
    expect(useUiStore.getState().sortKey).toBe('name');
    expect(useUiStore.getState().sortDir).toBe('asc');

    useUiStore.getState().setSort('phantom');
    expect(useUiStore.getState().sortDir).toBe('desc');
  });
});
```

- [ ] **Step 2: Verify failing**

Run `npm test -- uiStore --run`. Expected: module not found.

- [ ] **Step 3: Implement**

Write `src/features/ui/uiStore.ts`:
```ts
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type SortKey = 'name' | 'crafter' | 'lvl' | 'phantom' | 'dc' | 'spd' | 'score';
export type SortDir = 'asc' | 'desc';

export interface UiState {
  _v: 1;
  catFilter: string;
  craftFilter: string;
  search: string;
  sortKey: SortKey;
  sortDir: SortDir;
  setCat: (c: string) => void;
  setCraft: (c: string) => void;
  setSearch: (q: string) => void;
  setSort: (k: SortKey) => void;
}

export function defaultUi(): Pick<UiState, '_v' | 'catFilter' | 'craftFilter' | 'search' | 'sortKey' | 'sortDir'> {
  return { _v: 1, catFilter: 'All', craftFilter: 'All', search: '', sortKey: 'score', sortDir: 'desc' };
}

const ASC_DEFAULT_KEYS: SortKey[] = ['name', 'crafter'];

export const useUiStore = create<UiState>()(
  persist(
    (set) => ({
      ...defaultUi(),
      setCat: (catFilter) => set({ catFilter }),
      setCraft: (craftFilter) => set({ craftFilter }),
      setSearch: (search) => set({ search }),
      setSort: (k) => set((s) => {
        if (s.sortKey === k) {
          return { sortDir: s.sortDir === 'asc' ? 'desc' : 'asc' };
        }
        return { sortKey: k, sortDir: ASC_DEFAULT_KEYS.includes(k) ? 'asc' : 'desc' };
      }),
    }),
    { name: 'ffxiv-helper:ui' },
  ),
);
```

- [ ] **Step 4: Verify pass**

Run `npm test -- uiStore --run`. Expected: all pass.

- [ ] **Step 5: Commit**

```
git add -A
git commit -m "feat(ui): persisted filter/sort store"
```

---

## Task 11: Craft-status helper

**Files:**
- Create: `src/features/items/craftStatus.ts`
- Create: `src/features/items/craftStatus.test.ts`

- [ ] **Step 1: Failing tests**

Write `src/features/items/craftStatus.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { craftStatus } from './craftStatus';

const levels = { CRP: 93, BSM: 33, ARM: 42, GSM: 83, LTW: 100, WVR: 100, ALC: 90, CUL: 100 };

describe('craftStatus', () => {
  it('returns ok for ANY items regardless of levels', () => {
    expect(craftStatus({ crafter: 'ANY', lvl: 100 }, levels)).toBe('ok');
  });
  it('returns ok when retainer level >= recipe level', () => {
    expect(craftStatus({ crafter: 'LTW', lvl: 90 }, levels)).toBe('ok');
    expect(craftStatus({ crafter: 'LTW', lvl: 100 }, levels)).toBe('ok');
  });
  it('returns short when within 10 levels', () => {
    expect(craftStatus({ crafter: 'BSM', lvl: 42 }, levels)).toBe('short');
  });
  it('returns no when more than 10 below', () => {
    expect(craftStatus({ crafter: 'BSM', lvl: 50 }, levels)).toBe('no');
  });
});
```

- [ ] **Step 2: Verify failing**

Run `npm test -- craftStatus --run`. Expected: module not found.

- [ ] **Step 3: Implement**

Write `src/features/items/craftStatus.ts`:
```ts
import type { CrafterCode } from './types';
import type { CrafterLevels } from '../settings/store';

export type CraftStatus = 'ok' | 'short' | 'no';

export function craftStatus(
  item: { crafter: CrafterCode; lvl: number },
  levels: CrafterLevels,
): CraftStatus {
  if (item.crafter === 'ANY') return 'ok';
  const my = levels[item.crafter];
  if (my >= item.lvl) return 'ok';
  if (my >= item.lvl - 10) return 'short';
  return 'no';
}
```

- [ ] **Step 4: Verify pass**

Run `npm test -- craftStatus --run`. Expected: all pass.

- [ ] **Step 5: Commit**

```
git add -A
git commit -m "feat(items): craftStatus helper"
```

---

## Task 12: Number formatter

**Files:**
- Create: `src/lib/format.ts`
- Create: `src/lib/format.test.ts`

- [ ] **Step 1: Failing tests**

Write `src/lib/format.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { fmtGil } from './format';

describe('fmtGil', () => {
  it('returns em-dash for null/undefined', () => {
    expect(fmtGil(null)).toBe('—');
    expect(fmtGil(undefined)).toBe('—');
  });
  it('formats sub-1k with grouping', () => {
    expect(fmtGil(950)).toBe('950');
  });
  it('formats 1k–10k with one decimal', () => {
    expect(fmtGil(1234)).toBe('1.2k');
  });
  it('formats 10k+ as integer thousands', () => {
    expect(fmtGil(15600)).toBe('16k');
  });
  it('formats 1M+ as M with up to two decimals, trimmed', () => {
    expect(fmtGil(1_500_000)).toBe('1.5M');
    expect(fmtGil(2_000_000)).toBe('2M');
    expect(fmtGil(1_234_567)).toBe('1.23M');
  });
});
```

- [ ] **Step 2: Verify failing**

Run `npm test -- lib/format --run`. Expected: module not found.

- [ ] **Step 3: Implement**

Write `src/lib/format.ts`:
```ts
export function fmtGil(n: number | null | undefined): string {
  if (n == null) return '—';
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(2).replace(/\.?0+$/, '') + 'M';
  if (n >= 10_000) return Math.round(n / 1000) + 'k';
  if (n >= 1000) return (n / 1000).toFixed(1) + 'k';
  return n.toLocaleString();
}
```

- [ ] **Step 4: Verify pass**

Run `npm test -- lib/format --run`. Expected: all pass.

- [ ] **Step 5: Commit**

```
git add -A
git commit -m "feat(lib): gil number formatter"
```

---

## Task 13: Watchlist row builder (pure function)

**Files:**
- Create: `src/features/watchlist/buildRows.ts`
- Create: `src/features/watchlist/buildRows.test.ts`

The watchlist row is the join of (tracked item) × (Phantom market data) × (Chaos market data) + a normalized score and craft status. Building this as a pure function makes the table component dumb and the logic testable.

- [ ] **Step 1: Failing tests**

Write `src/features/watchlist/buildRows.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { buildRows } from './buildRows';
import type { TrackedItem } from '../items/types';
import type { MarketData } from '../../lib/universalis';

const items: TrackedItem[] = [
  { id: 1, name: 'A', crafter: 'LTW', lvl: 100, cat: 'Raid' },
  { id: 2, name: 'B', crafter: 'WVR', lvl: 100, cat: 'Raid' },
];

const phantom: MarketData = {
  '1': { minNQ: 100, minHQ: 200, avgNQ: 110, avgHQ: 220, velocity: 1, lastUploadTime: Date.now(), listingCount: 1 },
  '2': { minNQ: 50,  minHQ: null, avgNQ: 55,  avgHQ: null, velocity: 0.2, lastUploadTime: Date.now(), listingCount: 1 },
};

const dc: MarketData = {
  '1': { minNQ: 90,  minHQ: 180, avgNQ: 95,  avgHQ: 200, velocity: 5, lastUploadTime: Date.now(), listingCount: 5 },
  '2': { minNQ: 40,  minHQ: null, avgNQ: 45,  avgHQ: null, velocity: 1, lastUploadTime: Date.now(), listingCount: 2 },
};

const levels = { CRP: 100, BSM: 100, ARM: 100, GSM: 100, LTW: 100, WVR: 100, ALC: 100, CUL: 100 };

describe('buildRows', () => {
  it('produces one row per item with phantom + dc + score + craftStatus', () => {
    const rows = buildRows(items, phantom, dc, levels, Date.now());
    expect(rows).toHaveLength(2);
    expect(rows[0].id).toBe(1);
    expect(rows[0].dcMinHQ).toBe(180);
    expect(rows[0].pAvgHQ).toBe(220);
    expect(rows[0].dcSpd).toBe(5);
    expect(rows[0].craftStatus).toBe('ok');
  });

  it('refPrice prefers DC HQ → DC NQ → Phantom HQ avg → Phantom NQ avg', () => {
    const rows = buildRows(items, phantom, dc, levels, Date.now());
    expect(rows[0].refPrice).toBe(180);
    expect(rows[1].refPrice).toBe(40);
  });

  it('normalizes scores 0-100 against the max raw score', () => {
    const rows = buildRows(items, phantom, dc, levels, Date.now());
    // raw: row0 = 180*5 = 900, row1 = 40*1 = 40
    expect(rows[0].score).toBe(100);
    expect(rows[1].score).toBe(Math.round((40 / 900) * 100));
  });

  it('flags stale when last upload is > 3 days old', () => {
    const now = 10_000_000_000_000;
    const oldTs = now - (4 * 86_400_000);
    const stalePhantom: MarketData = { '1': { ...phantom['1'], lastUploadTime: oldTs }, '2': phantom['2'] };
    const staleDc: MarketData = { '1': { ...dc['1'], lastUploadTime: oldTs }, '2': dc['2'] };
    const rows = buildRows(items, stalePhantom, staleDc, levels, now);
    expect(rows[0].staleDays).toBeGreaterThan(3);
  });
});
```

- [ ] **Step 2: Verify failing**

Run `npm test -- buildRows --run`. Expected: module not found.

- [ ] **Step 3: Implement**

Write `src/features/watchlist/buildRows.ts`:
```ts
import type { TrackedItem } from '../items/types';
import type { MarketData, MarketItem } from '../../lib/universalis';
import { craftStatus, type CraftStatus } from '../items/craftStatus';
import { computeRawScore, normalizeScores } from '../../lib/score';
import type { CrafterLevels } from '../settings/store';

export interface WatchlistRow extends TrackedItem {
  pMinNQ: number | null;
  pMinHQ: number | null;
  pAvgNQ: number | null;
  pAvgHQ: number | null;
  pSpd: number;
  pListings: number;
  dcMinNQ: number | null;
  dcMinHQ: number | null;
  dcSpd: number;
  refPrice: number;
  rawScore: number;
  score: number;
  staleDays: number | null;
  craftStatus: CraftStatus;
}

function refPrice(p: MarketItem | undefined, d: MarketItem | undefined): number {
  return d?.minHQ ?? d?.minNQ ?? p?.avgHQ ?? p?.avgNQ ?? 0;
}

export function buildRows(
  items: TrackedItem[],
  phantom: MarketData,
  dc: MarketData,
  levels: CrafterLevels,
  now: number,
): WatchlistRow[] {
  const partial = items.map((item) => {
    const p = phantom[item.id];
    const d = dc[item.id];
    const lastUpload = Math.max(p?.lastUploadTime ?? 0, d?.lastUploadTime ?? 0);
    const staleDays = lastUpload ? (now - lastUpload) / 86_400_000 : null;
    const price = refPrice(p, d);
    const velocity = d?.velocity ?? p?.velocity ?? 0;
    return {
      ...item,
      pMinNQ: p?.minNQ ?? null,
      pMinHQ: p?.minHQ ?? null,
      pAvgNQ: p?.avgNQ ?? null,
      pAvgHQ: p?.avgHQ ?? null,
      pSpd: p?.velocity ?? 0,
      pListings: p?.listingCount ?? 0,
      dcMinNQ: d?.minNQ ?? null,
      dcMinHQ: d?.minHQ ?? null,
      dcSpd: d?.velocity ?? 0,
      refPrice: price,
      rawScore: computeRawScore({ refPrice: price, velocity }),
      staleDays,
      craftStatus: craftStatus(item, levels),
    };
  });

  const scores = normalizeScores(partial.map((r) => r.rawScore));
  return partial.map((r, i) => ({ ...r, score: scores[i] }));
}
```

- [ ] **Step 4: Verify pass**

Run `npm test -- buildRows --run`. Expected: all pass.

- [ ] **Step 5: Commit**

```
git add -A
git commit -m "feat(watchlist): pure buildRows joining items + market data + score"
```

---

## Task 14: Filter + sort helpers

**Files:**
- Create: `src/features/watchlist/filterSort.ts`
- Create: `src/features/watchlist/filterSort.test.ts`

- [ ] **Step 1: Failing tests**

Write `src/features/watchlist/filterSort.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { filterAndSort } from './filterSort';
import type { WatchlistRow } from './buildRows';

const base: WatchlistRow = {
  id: 0, name: '', crafter: 'LTW', lvl: 100, cat: 'Raid',
  pMinNQ: null, pMinHQ: null, pAvgNQ: null, pAvgHQ: null, pSpd: 0, pListings: 0,
  dcMinNQ: null, dcMinHQ: null, dcSpd: 0,
  refPrice: 0, rawScore: 0, score: 0, staleDays: null, craftStatus: 'ok',
};

const rows: WatchlistRow[] = [
  { ...base, id: 1, name: 'Alpha',  cat: 'Raid',     dcSpd: 4, score: 80 },
  { ...base, id: 2, name: 'Beta',   cat: 'Tincture', crafter: 'ALC', dcSpd: 2, score: 50 },
  { ...base, id: 3, name: 'Gamma',  cat: 'Tincture', crafter: 'ALC', dcSpd: 5, score: 90 },
];

describe('filterAndSort', () => {
  it('filters by category', () => {
    const out = filterAndSort(rows, { catFilter: 'Tincture', craftFilter: 'All', search: '', sortKey: 'name', sortDir: 'asc' });
    expect(out.map((r) => r.id)).toEqual([2, 3]);
  });
  it('filters by crafter', () => {
    const out = filterAndSort(rows, { catFilter: 'All', craftFilter: 'LTW', search: '', sortKey: 'name', sortDir: 'asc' });
    expect(out.map((r) => r.id)).toEqual([1]);
  });
  it('filters by search (case-insensitive substring)', () => {
    const out = filterAndSort(rows, { catFilter: 'All', craftFilter: 'All', search: 'BET', sortKey: 'name', sortDir: 'asc' });
    expect(out.map((r) => r.id)).toEqual([2]);
  });
  it('sorts by score desc by default', () => {
    const out = filterAndSort(rows, { catFilter: 'All', craftFilter: 'All', search: '', sortKey: 'score', sortDir: 'desc' });
    expect(out.map((r) => r.id)).toEqual([3, 1, 2]);
  });
  it('sorts by name asc', () => {
    const out = filterAndSort(rows, { catFilter: 'All', craftFilter: 'All', search: '', sortKey: 'name', sortDir: 'asc' });
    expect(out.map((r) => r.id)).toEqual([1, 2, 3]);
  });
});
```

- [ ] **Step 2: Verify failing**

Run `npm test -- filterSort --run`. Expected: module not found.

- [ ] **Step 3: Implement**

Write `src/features/watchlist/filterSort.ts`:
```ts
import type { WatchlistRow } from './buildRows';
import type { SortKey, SortDir } from '../ui/uiStore';

export interface FilterSortOpts {
  catFilter: string;
  craftFilter: string;
  search: string;
  sortKey: SortKey;
  sortDir: SortDir;
}

function getSortValue(r: WatchlistRow, key: SortKey): string | number {
  switch (key) {
    case 'name': return r.name;
    case 'crafter': return r.crafter;
    case 'lvl': return r.lvl;
    case 'phantom': return r.pAvgHQ ?? r.pAvgNQ ?? r.pMinNQ ?? 0;
    case 'dc': return r.dcMinHQ ?? r.dcMinNQ ?? 0;
    case 'spd': return r.dcSpd;
    case 'score':
    default: return r.rawScore;
  }
}

export function filterAndSort(rows: WatchlistRow[], opts: FilterSortOpts): WatchlistRow[] {
  let out = rows;
  if (opts.catFilter !== 'All') out = out.filter((r) => r.cat === opts.catFilter);
  if (opts.craftFilter !== 'All') out = out.filter((r) => r.crafter === opts.craftFilter);
  if (opts.search) {
    const q = opts.search.toLowerCase();
    out = out.filter((r) => r.name.toLowerCase().includes(q));
  }
  const dir = opts.sortDir === 'asc' ? 1 : -1;
  return [...out].sort((a, b) => {
    const av = getSortValue(a, opts.sortKey);
    const bv = getSortValue(b, opts.sortKey);
    if (typeof av === 'string' && typeof bv === 'string') return av.localeCompare(bv) * dir;
    return ((av as number) - (bv as number)) * dir;
  });
}
```

- [ ] **Step 4: Verify pass**

Run `npm test -- filterSort --run`. Expected: all pass.

- [ ] **Step 5: Commit**

```
git add -A
git commit -m "feat(watchlist): pure filter+sort helper"
```

---

## Task 15: TanStack Query hook for market data

**Files:**
- Create: `src/features/watchlist/useMarketData.ts`
- Create: `src/features/watchlist/useMarketData.test.tsx`

- [ ] **Step 1: Failing test**

Write `src/features/watchlist/useMarketData.test.tsx`:
```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useMarketData } from './useMarketData';

function wrap() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );
}

beforeEach(() => { vi.restoreAllMocks(); });

describe('useMarketData', () => {
  it('fetches Phantom + Chaos in parallel and returns both', async () => {
    const fetchMock = vi.fn().mockImplementation((url: string) => {
      const isPhantom = url.includes('/Phantom/');
      const items = isPhantom
        ? { '1': { listings: [{ hq: false, pricePerUnit: 100 }], recentHistory: [], regularSaleVelocity: 1, lastUploadTime: 1 } }
        : { '1': { listings: [{ hq: false, pricePerUnit: 90  }], recentHistory: [], regularSaleVelocity: 5, lastUploadTime: 1 } };
      return Promise.resolve({ ok: true, json: async () => ({ items }) });
    });
    vi.stubGlobal('fetch', fetchMock);

    const { result } = renderHook(
      () => useMarketData([1], 'Phantom', 'Chaos'),
      { wrapper: wrap() },
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data!.phantom['1'].minNQ).toBe(100);
    expect(result.current.data!.dc['1'].minNQ).toBe(90);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('does nothing when ids array is empty', () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const { result } = renderHook(
      () => useMarketData([], 'Phantom', 'Chaos'),
      { wrapper: wrap() },
    );
    expect(result.current.fetchStatus).toBe('idle');
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Verify failing**

Run `npm test -- useMarketData --run`. Expected: module not found.

- [ ] **Step 3: Implement**

Write `src/features/watchlist/useMarketData.ts`:
```ts
import { useQuery } from '@tanstack/react-query';
import { fetchMarketData, type MarketData } from '../../lib/universalis';

export interface MarketBundle {
  phantom: MarketData;
  dc: MarketData;
}

export function useMarketData(ids: number[], world: string, dc: string) {
  const sortedIds = [...ids].sort((a, b) => a - b);
  return useQuery<MarketBundle>({
    queryKey: ['market', world, dc, sortedIds],
    enabled: ids.length > 0,
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const [phantom, dcRes] = await Promise.all([
        fetchMarketData(world, sortedIds),
        fetchMarketData(dc, sortedIds),
      ]);
      return { phantom, dc: dcRes };
    },
  });
}
```

- [ ] **Step 4: Verify pass**

Run `npm test -- useMarketData --run`. Expected: all pass.

- [ ] **Step 5: Commit**

```
git add -A
git commit -m "feat(watchlist): useMarketData TanStack Query hook"
```

---

## Task 16: App shell — router, query client, layout

**Files:**
- Modify: `src/main.tsx`
- Modify: `src/App.tsx`
- Create: `src/components/layout/Header.tsx`
- Create: `src/routes/Home.tsx`
- Create: `src/routes/Watchlist.tsx`
- Create: `src/routes/Settings.tsx`

- [ ] **Step 1: Wire QueryClient + BrowserRouter into entry**

Overwrite `src/main.tsx`:
```tsx
import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import App from './App';
import './styles/index.css';

const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 5 * 60 * 1000, refetchOnWindowFocus: false } },
});

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </QueryClientProvider>
  </React.StrictMode>,
);
```

- [ ] **Step 2: Header component**

Write `src/components/layout/Header.tsx`:
```tsx
import { NavLink } from 'react-router-dom';

const navClass = ({ isActive }: { isActive: boolean }) =>
  `px-3 py-2 font-mono text-xs tracking-widest uppercase transition-colors ${
    isActive ? 'text-gold' : 'text-text-dim hover:text-aether'
  }`;

export function Header() {
  return (
    <header className="border-b border-border-base mb-7 pb-5">
      <div className="max-w-7xl mx-auto px-4 flex items-end justify-between gap-4">
        <div>
          <div className="font-mono text-[11px] tracking-widest text-aether uppercase mb-1">
            Final Fantasy XIV · Crafting Helper
          </div>
          <h1 className="font-display font-semibold text-3xl tracking-wide leading-tight">
            Phantom <span className="text-gold italic">Crafting</span> Ledger
          </h1>
        </div>
        <nav className="flex gap-1">
          <NavLink to="/" end className={navClass}>Home</NavLink>
          <NavLink to="/watchlist" className={navClass}>Watchlist</NavLink>
          <NavLink to="/settings" className={navClass}>Settings</NavLink>
        </nav>
      </div>
    </header>
  );
}
```

- [ ] **Step 3: Route stubs**

Write `src/routes/Home.tsx`:
```tsx
export default function Home() {
  return (
    <div className="max-w-7xl mx-auto px-4">
      <div className="border border-border-base bg-bg-card p-8 rounded-sm">
        <h2 className="font-display text-xl text-gold mb-2">Session recommender</h2>
        <p className="text-text-dim text-sm">
          Time-budgeted session planning lands in Phase 3. For now, head to the Watchlist tab.
        </p>
      </div>
    </div>
  );
}
```

Write `src/routes/Watchlist.tsx`:
```tsx
export default function Watchlist() {
  return <div className="max-w-7xl mx-auto px-4 text-text-dim">Watchlist (next task)</div>;
}
```

Write `src/routes/Settings.tsx`:
```tsx
export default function Settings() {
  return <div className="max-w-7xl mx-auto px-4 text-text-dim">Settings (later task)</div>;
}
```

- [ ] **Step 4: Wire routes in App**

Overwrite `src/App.tsx`:
```tsx
import { Routes, Route } from 'react-router-dom';
import { Header } from './components/layout/Header';
import Home from './routes/Home';
import Watchlist from './routes/Watchlist';
import Settings from './routes/Settings';

export default function App() {
  return (
    <div className="min-h-screen pt-8 pb-20">
      <Header />
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/watchlist" element={<Watchlist />} />
        <Route path="/settings" element={<Settings />} />
      </Routes>
    </div>
  );
}
```

- [ ] **Step 5: Manually verify**

Run `npm run dev`, visit `/`, `/watchlist`, `/settings`. Each route renders the placeholder. Header nav highlights the active tab. Stop the server.

- [ ] **Step 6: Commit**

```
git add -A
git commit -m "feat(app): router + query client + header layout shell"
```

---

## Task 17: Watchlist table view (data wired)

**Files:**
- Create: `src/components/Spinner.tsx`
- Create: `src/components/StatusBanner.tsx`
- Create: `src/features/watchlist/CraftTag.tsx`
- Create: `src/features/watchlist/ScoreBar.tsx`
- Create: `src/features/watchlist/WatchlistTable.tsx`
- Create: `src/features/watchlist/FilterBar.tsx`
- Modify: `src/routes/Watchlist.tsx`

- [ ] **Step 1: Small primitives**

Write `src/components/Spinner.tsx`:
```tsx
export function Spinner({ label = 'Loading…' }: { label?: string }) {
  return (
    <div className="font-mono text-xs text-text-low animate-pulse">{label}</div>
  );
}
```

Write `src/components/StatusBanner.tsx`:
```tsx
export function StatusBanner({ kind, children }: { kind: 'error' | 'info'; children: React.ReactNode }) {
  const cls = kind === 'error'
    ? 'border-crimson text-crimson'
    : 'border-aether text-aether';
  return (
    <div className={`border ${cls} bg-bg-card-hi/50 px-4 py-2 font-mono text-xs mb-4`}>{children}</div>
  );
}
```

Write `src/features/watchlist/CraftTag.tsx`:
```tsx
import type { CraftStatus } from '../items/craftStatus';
import type { CrafterCode } from '../items/types';

const cls: Record<CraftStatus, string> = {
  ok: 'border-jade text-jade',
  short: 'border-gold text-gold',
  no: 'border-crimson text-crimson opacity-70',
};

export function CraftTag({ crafter, status }: { crafter: CrafterCode; status: CraftStatus }) {
  return (
    <span className={`inline-block font-mono text-[10px] tracking-widest px-1.5 py-0.5 border rounded-sm ${cls[status]}`}>
      {crafter}
    </span>
  );
}
```

Write `src/features/watchlist/ScoreBar.tsx`:
```tsx
export function ScoreBar({ score }: { score: number }) {
  return (
    <span className="inline-flex items-center gap-2">
      <span className="inline-block w-16 h-1 bg-border-base relative align-middle">
        <span
          className="block h-full bg-gradient-to-r from-aether to-gold"
          style={{ width: `${score}%` }}
        />
      </span>
      <span className="font-mono text-xs">{score}</span>
    </span>
  );
}
```

- [ ] **Step 2: Watchlist table component**

Write `src/features/watchlist/WatchlistTable.tsx`:
```tsx
import { useUiStore, type SortKey } from '../ui/uiStore';
import type { WatchlistRow } from './buildRows';
import { CraftTag } from './CraftTag';
import { ScoreBar } from './ScoreBar';
import { fmtGil } from '../../lib/format';

const COLS: { key: SortKey; label: string; align?: 'right' }[] = [
  { key: 'name', label: 'Item' },
  { key: 'crafter', label: 'Craft' },
  { key: 'lvl', label: 'Lvl', align: 'right' },
  { key: 'phantom', label: 'Phantom', align: 'right' },
  { key: 'dc', label: 'Chaos DC min', align: 'right' },
  { key: 'spd', label: 'DC sales/day', align: 'right' },
  { key: 'score', label: 'Score', align: 'right' },
];

export function WatchlistTable({ rows }: { rows: WatchlistRow[] }) {
  const { sortKey, sortDir, setSort } = useUiStore();

  if (rows.length === 0) {
    return (
      <div className="border border-border-base bg-bg-card p-12 text-center text-text-low italic">
        No items match those filters.
      </div>
    );
  }

  return (
    <div className="border border-border-base bg-bg-card overflow-x-auto">
      <table className="w-full text-sm border-collapse">
        <thead>
          <tr>
            {COLS.map((c) => {
              const sorted = sortKey === c.key;
              const arrow = sorted ? (sortDir === 'asc' ? ' ▲' : ' ▼') : '';
              return (
                <th
                  key={c.key}
                  onClick={() => setSort(c.key)}
                  className={`px-3 py-2 bg-bg-card-hi font-mono text-[10px] tracking-widest uppercase cursor-pointer select-none whitespace-nowrap sticky top-0 z-10 ${
                    sorted ? 'text-gold' : 'text-text-dim hover:text-aether'
                  } ${c.align === 'right' ? 'text-right' : 'text-left'}`}
                >
                  {c.label}{arrow}
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} className="border-t border-border-base hover:bg-bg-card-hi">
              <td className="px-3 py-2.5">
                <a
                  href={`https://universalis.app/market/${r.id}`}
                  target="_blank"
                  rel="noreferrer"
                  className="text-text-cream hover:border-b hover:border-aether border-b border-transparent"
                >
                  {r.name}
                </a>
                <div className="font-mono text-[10px] text-text-low mt-0.5">
                  {r.cat}{r.subcat ? ` · ${r.subcat}` : ''}
                  {r.staleDays != null && r.staleDays > 3 && (
                    <span className="text-crimson ml-2">{r.staleDays.toFixed(0)}d stale</span>
                  )}
                </div>
              </td>
              <td className="px-3 py-2.5"><CraftTag crafter={r.crafter} status={r.craftStatus} /></td>
              <td className="px-3 py-2.5 font-mono text-right text-text-low">{r.lvl}</td>
              <td className="px-3 py-2.5 font-mono text-right">
                {r.pAvgHQ ? <>{fmtGil(r.pAvgHQ)} <span className="text-text-low text-[10px]">avg HQ</span></>
                  : r.pAvgNQ ? <>{fmtGil(r.pAvgNQ)} <span className="text-text-low text-[10px]">avg NQ</span></>
                  : r.pMinNQ ? <>{fmtGil(r.pMinNQ)} <span className="text-text-low text-[10px]">list NQ</span></>
                  : <span className="text-text-low">—</span>}
              </td>
              <td className="px-3 py-2.5 font-mono text-right">
                {r.dcMinHQ ? <>{fmtGil(r.dcMinHQ)} <span className="text-text-low text-[10px]">HQ</span></>
                  : r.dcMinNQ ? <>{fmtGil(r.dcMinNQ)} <span className="text-text-low text-[10px]">NQ</span></>
                  : <span className="text-text-low">—</span>}
              </td>
              <td className="px-3 py-2.5 font-mono text-right">{r.dcSpd.toFixed(1)}</td>
              <td className="px-3 py-2.5 text-right"><ScoreBar score={r.score} /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
```

- [ ] **Step 3: Filter bar**

Write `src/features/watchlist/FilterBar.tsx`:
```tsx
import { useUiStore } from '../ui/uiStore';

const CATS = ['All', 'Raid', 'Tincture', 'Food', 'Dye', 'Glamour', 'Housing', 'Materia'];
const CRAFTERS = ['All', 'LTW', 'WVR', 'CUL', 'ALC', 'CRP', 'GSM', 'ARM', 'BSM', 'ANY'];

export function FilterBar() {
  const { catFilter, craftFilter, search, setCat, setCraft, setSearch } = useUiStore();

  return (
    <div className="flex flex-wrap gap-2 items-center mb-4">
      <span className="font-mono text-[10px] tracking-widest text-text-low uppercase mr-1">Category</span>
      <div className="flex border border-border-base">
        {CATS.map((c) => (
          <button
            key={c}
            onClick={() => setCat(c)}
            className={`font-mono text-[11px] tracking-wider px-3.5 py-2 border-r border-border-base last:border-r-0 uppercase transition-colors ${
              catFilter === c ? 'bg-bg-card-hi text-gold' : 'text-text-dim hover:text-aether'
            }`}
          >
            {c}
          </button>
        ))}
      </div>
      <span className="font-mono text-[10px] tracking-widest text-text-low uppercase ml-3 mr-1">Crafter</span>
      <div className="flex border border-border-base">
        {CRAFTERS.map((c) => (
          <button
            key={c}
            onClick={() => setCraft(c)}
            className={`font-mono text-[11px] tracking-wider px-3.5 py-2 border-r border-border-base last:border-r-0 uppercase transition-colors ${
              craftFilter === c ? 'bg-bg-card-hi text-gold' : 'text-text-dim hover:text-aether'
            }`}
          >
            {c}
          </button>
        ))}
      </div>
      <input
        type="text"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Search items…"
        className="bg-bg-card border border-border-base text-text-cream font-mono text-xs px-3 py-2 w-52 ml-auto focus:outline-none focus:border-aether"
      />
    </div>
  );
}
```

- [ ] **Step 4: Watchlist route — wire it all together**

Overwrite `src/routes/Watchlist.tsx`:
```tsx
import { useMemo } from 'react';
import { useSettingsStore } from '../features/settings/store';
import { useWatchlistStore } from '../features/items/watchlistStore';
import { useUiStore } from '../features/ui/uiStore';
import { useMarketData } from '../features/watchlist/useMarketData';
import { allItemsFromEnabledPacks } from '../features/items/starterPacks';
import { buildRows } from '../features/watchlist/buildRows';
import { filterAndSort } from '../features/watchlist/filterSort';
import { WatchlistTable } from '../features/watchlist/WatchlistTable';
import { FilterBar } from '../features/watchlist/FilterBar';
import { Spinner } from '../components/Spinner';
import { StatusBanner } from '../components/StatusBanner';

export default function Watchlist() {
  const { world, dc, retainerLevels } = useSettingsStore();
  const { starterPacks, customItems } = useWatchlistStore();
  const ui = useUiStore();

  const items = useMemo(() => {
    const fromPacks = allItemsFromEnabledPacks(starterPacks);
    const seen = new Set(fromPacks.map((i) => i.id));
    return [...fromPacks, ...customItems.filter((i) => !seen.has(i.id))];
  }, [starterPacks, customItems]);

  const ids = useMemo(() => items.map((i) => i.id), [items]);
  const market = useMarketData(ids, world, dc);

  const rows = useMemo(() => {
    if (!market.data) return [];
    return buildRows(items, market.data.phantom, market.data.dc, retainerLevels, Date.now());
  }, [items, market.data, retainerLevels]);

  const filtered = useMemo(() => filterAndSort(rows, ui), [rows, ui]);

  return (
    <div className="max-w-7xl mx-auto px-4">
      <div className="flex items-center justify-between mb-3">
        <FilterBar />
        <button
          onClick={() => market.refetch()}
          disabled={market.isFetching}
          className="font-display text-xs tracking-widest uppercase bg-bg-card-hi border border-gold text-gold px-5 py-2.5 disabled:opacity-40 hover:bg-gold hover:text-bg-deep transition-colors"
        >
          ⟳ Refresh
        </button>
      </div>
      {market.isError && (
        <StatusBanner kind="error">Universalis fetch failed: {(market.error as Error).message}</StatusBanner>
      )}
      {market.isLoading && <div className="py-6"><Spinner label="Fetching Phantom + DC market data…" /></div>}
      {!market.isLoading && <WatchlistTable rows={filtered} />}
    </div>
  );
}
```

- [ ] **Step 5: Manually verify**

Run `npm run dev`, click "Watchlist", confirm rows render with live data. Try sorting by clicking column headers, switching category/crafter filters, typing in search. Stop the server.

- [ ] **Step 6: Commit**

```
git add -A
git commit -m "feat(watchlist): table view with live Universalis data + filters/sort"
```

---

## Task 18: XIVAPI search client + hook

**Files:**
- Create: `src/lib/xivapi.ts`
- Create: `src/lib/xivapi.test.ts`
- Create: `src/features/items/useItemSearch.ts`

XIVAPI v2 (`https://v2.xivapi.com`) uses GET `/search?sheets=Item&query=...` and returns rows with the item id, name, and a `Recipes` linked sheet. We filter to craftable items by checking that any recipe is linked. The exact response shape is documented at https://v2.xivapi.com/api/docs.

- [ ] **Step 1: Failing test (URL builder + parser)**

Write `src/lib/xivapi.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { buildItemSearchUrl, parseItemSearchResponse } from './xivapi';

describe('buildItemSearchUrl', () => {
  it('builds a name-search URL with the Item sheet and Recipes link', () => {
    expect(buildItemSearchUrl('courtly')).toBe(
      'https://v2.xivapi.com/api/search?sheets=Item&query=Name~%22courtly%22&fields=Name,Icon,LevelItem,ClassJobCategory&limit=20'
    );
  });
});

describe('parseItemSearchResponse', () => {
  it('returns rows with id, name, level, classJobCategory', () => {
    const raw = {
      results: [
        { row_id: 49281, fields: { Name: "Courtly Lover's Temple Chain of Striking", Icon: 'x', LevelItem: 770, ClassJobCategory: { Name: 'LTW' } } },
        { row_id: 49297, fields: { Name: "Courtly Lover's Longcoat of Healing",      Icon: 'y', LevelItem: 770, ClassJobCategory: { Name: 'WVR' } } },
      ],
    };
    expect(parseItemSearchResponse(raw)).toEqual([
      { id: 49281, name: "Courtly Lover's Temple Chain of Striking", level: 770, classJobCategory: 'LTW' },
      { id: 49297, name: "Courtly Lover's Longcoat of Healing",      level: 770, classJobCategory: 'WVR' },
    ]);
  });

  it('drops rows missing fields', () => {
    expect(parseItemSearchResponse({ results: [{ row_id: 1 }] })).toEqual([]);
  });
});
```

- [ ] **Step 2: Verify failing**

Run `npm test -- xivapi --run`. Expected: module not found.

- [ ] **Step 3: Implement client**

Write `src/lib/xivapi.ts`:
```ts
const BASE = (import.meta.env?.VITE_XIVAPI_BASE as string | undefined) ?? 'https://v2.xivapi.com';

export interface XivapiItemRow {
  id: number;
  name: string;
  level: number;
  classJobCategory: string;
}

interface RawResult {
  row_id?: number;
  fields?: { Name?: string; Icon?: string; LevelItem?: number; ClassJobCategory?: { Name?: string } };
}

export function buildItemSearchUrl(query: string): string {
  const q = encodeURIComponent(`Name~"${query}"`);
  return `${BASE.replace(/\/$/, '')}/api/search?sheets=Item&query=${q}&fields=Name,Icon,LevelItem,ClassJobCategory&limit=20`;
}

export function parseItemSearchResponse(raw: { results?: RawResult[] }): XivapiItemRow[] {
  return (raw.results ?? [])
    .filter((r): r is Required<Pick<RawResult, 'row_id' | 'fields'>> & RawResult =>
      typeof r.row_id === 'number' && !!r.fields?.Name && typeof r.fields.LevelItem === 'number',
    )
    .map((r) => ({
      id: r.row_id!,
      name: r.fields!.Name!,
      level: r.fields!.LevelItem!,
      classJobCategory: r.fields!.ClassJobCategory?.Name ?? '',
    }));
}

export async function searchItems(query: string): Promise<XivapiItemRow[]> {
  if (!query.trim()) return [];
  const res = await fetch(buildItemSearchUrl(query.trim()));
  if (!res.ok) throw new Error(`XIVAPI ${res.status}`);
  return parseItemSearchResponse(await res.json());
}
```

- [ ] **Step 4: Hook**

Write `src/features/items/useItemSearch.ts`:
```ts
import { useQuery } from '@tanstack/react-query';
import { searchItems } from '../../lib/xivapi';

export function useItemSearch(query: string) {
  return useQuery({
    queryKey: ['xivapi-search', query],
    enabled: query.trim().length >= 2,
    staleTime: 60 * 1000,
    queryFn: () => searchItems(query),
  });
}
```

- [ ] **Step 5: Verify pass**

Run `npm test -- xivapi --run`. Expected: all pass.

- [ ] **Step 6: Commit**

```
git add -A
git commit -m "feat(xivapi): item search client + hook"
```

---

## Task 19: Settings page — world/DC + retainer levels

**Files:**
- Create: `src/features/settings/WorldDcPicker.tsx`
- Create: `src/features/settings/LevelsEditor.tsx`
- Modify: `src/routes/Settings.tsx`

- [ ] **Step 1: WorldDcPicker**

Write `src/features/settings/WorldDcPicker.tsx`:
```tsx
import { useSettingsStore } from './store';

const DCS = ['Chaos', 'Light', 'Materia', 'Crystal', 'Aether', 'Primal', 'Dynamis', 'Mana', 'Gaia', 'Elemental', 'Meteor'];
const PHANTOM_WORLDS = ['Phantom', 'Lich', 'Shiva', 'Twintania', 'Zodiark']; // populated by user as needed

export function WorldDcPicker() {
  const { world, dc, setWorld, setDc } = useSettingsStore();
  return (
    <div className="grid grid-cols-2 gap-4 max-w-md">
      <label className="block">
        <span className="font-mono text-[10px] tracking-widest text-text-low uppercase">World</span>
        <input
          type="text"
          value={world}
          onChange={(e) => setWorld(e.target.value)}
          list="worlds"
          className="mt-1 block w-full bg-bg-card border border-border-base px-3 py-2 font-mono text-sm focus:outline-none focus:border-aether"
        />
        <datalist id="worlds">{PHANTOM_WORLDS.map((w) => <option key={w} value={w} />)}</datalist>
      </label>
      <label className="block">
        <span className="font-mono text-[10px] tracking-widest text-text-low uppercase">Data Center</span>
        <select
          value={dc}
          onChange={(e) => setDc(e.target.value)}
          className="mt-1 block w-full bg-bg-card border border-border-base px-3 py-2 font-mono text-sm focus:outline-none focus:border-aether"
        >
          {DCS.map((d) => <option key={d} value={d}>{d}</option>)}
        </select>
      </label>
    </div>
  );
}
```

- [ ] **Step 2: LevelsEditor**

Write `src/features/settings/LevelsEditor.tsx`:
```tsx
import { useSettingsStore, type CrafterLevels } from './store';

const ORDER: (keyof CrafterLevels)[] = ['CRP', 'BSM', 'ARM', 'GSM', 'LTW', 'WVR', 'ALC', 'CUL'];

function tierClass(lvl: number): string {
  if (lvl >= 100) return 'text-gold-hi';
  if (lvl >= 80) return 'text-text-cream';
  if (lvl >= 50) return 'text-text-dim';
  return 'text-text-low';
}

export function LevelsEditor() {
  const { retainerLevels, setRetainerLevel } = useSettingsStore();
  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-2">
      {ORDER.map((c) => {
        const lvl = retainerLevels[c];
        return (
          <label key={c} className="flex flex-col items-center text-center p-2 border border-border-base bg-bg-card">
            <span className="font-mono text-[10px] tracking-widest text-text-dim uppercase">{c}</span>
            <input
              type="number"
              min={1}
              max={100}
              value={lvl}
              onChange={(e) => setRetainerLevel(c, Math.max(1, Math.min(100, Number(e.target.value) || 0)))}
              className={`mt-1 w-full bg-transparent text-center font-display text-2xl font-semibold focus:outline-none ${tierClass(lvl)}`}
            />
          </label>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 3: Settings route**

Overwrite `src/routes/Settings.tsx`:
```tsx
import { WorldDcPicker } from '../features/settings/WorldDcPicker';
import { LevelsEditor } from '../features/settings/LevelsEditor';

export default function Settings() {
  return (
    <div className="max-w-7xl mx-auto px-4 space-y-10">
      <section>
        <h2 className="font-display text-lg text-gold mb-3 tracking-wide">World &amp; Data Center</h2>
        <WorldDcPicker />
      </section>
      <section>
        <h2 className="font-display text-lg text-gold mb-3 tracking-wide">Retainer levels</h2>
        <LevelsEditor />
      </section>
      <section>
        <h2 className="font-display text-lg text-gold mb-3 tracking-wide">Watchlist</h2>
        <p className="text-text-low text-sm italic">Pack toggles + custom items in the next task.</p>
      </section>
    </div>
  );
}
```

- [ ] **Step 4: Manually verify**

Run `npm run dev`, visit `/settings`. Edit a retainer level — confirm it persists across a hard refresh. Change DC, go to `/watchlist`, confirm fetch URL switches DC. Stop the server.

- [ ] **Step 5: Commit**

```
git add -A
git commit -m "feat(settings): world/DC picker + retainer level editor"
```

---

## Task 20: Settings page — starter packs + custom items

**Files:**
- Create: `src/features/settings/PackToggles.tsx`
- Create: `src/features/settings/AddItemSearch.tsx`
- Modify: `src/routes/Settings.tsx`

- [ ] **Step 1: PackToggles**

Write `src/features/settings/PackToggles.tsx`:
```tsx
import { STARTER_PACKS } from '../items/starterPacks';
import { useWatchlistStore } from '../items/watchlistStore';

export function PackToggles() {
  const { starterPacks, togglePack } = useWatchlistStore();
  return (
    <ul className="grid sm:grid-cols-2 lg:grid-cols-3 gap-2">
      {STARTER_PACKS.map((p) => {
        const on = starterPacks[p.id];
        return (
          <li key={p.id}>
            <button
              onClick={() => togglePack(p.id)}
              className={`w-full text-left px-3 py-2 border font-mono text-xs flex justify-between items-center transition-colors ${
                on ? 'border-gold text-gold bg-bg-card-hi' : 'border-border-base text-text-dim hover:border-aether hover:text-aether'
              }`}
            >
              <span>{p.label}</span>
              <span className="text-[10px] tracking-widest uppercase">{on ? 'On' : 'Off'} · {p.items.length}</span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
```

- [ ] **Step 2: AddItemSearch**

Write `src/features/settings/AddItemSearch.tsx`:
```tsx
import { useState } from 'react';
import { useItemSearch } from '../items/useItemSearch';
import { useWatchlistStore } from '../items/watchlistStore';
import type { TrackedItem, CrafterCode, ItemCategory } from '../items/types';
import { Spinner } from '../../components/Spinner';

const CRAFTERS: CrafterCode[] = ['CRP', 'BSM', 'ARM', 'GSM', 'LTW', 'WVR', 'ALC', 'CUL', 'ANY'];
const CATS: ItemCategory[] = ['Raid', 'Tincture', 'Food', 'Dye', 'Glamour', 'Housing', 'Materia'];

export function AddItemSearch() {
  const [q, setQ] = useState('');
  const [pendingCrafter, setPendingCrafter] = useState<CrafterCode>('LTW');
  const [pendingCat, setPendingCat] = useState<ItemCategory>('Glamour');
  const search = useItemSearch(q);
  const { customItems, addCustomItem, removeCustomItem } = useWatchlistStore();

  function add(row: { id: number; name: string; level: number }) {
    const item: TrackedItem = {
      id: row.id, name: row.name, lvl: row.level, crafter: pendingCrafter, cat: pendingCat,
    };
    addCustomItem(item);
  }

  return (
    <div className="space-y-4 max-w-2xl">
      <div className="grid grid-cols-3 gap-2">
        <input
          type="text"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search XIVAPI… (min 2 chars)"
          className="col-span-3 sm:col-span-1 bg-bg-card border border-border-base px-3 py-2 font-mono text-sm focus:outline-none focus:border-aether"
        />
        <select
          value={pendingCrafter}
          onChange={(e) => setPendingCrafter(e.target.value as CrafterCode)}
          className="bg-bg-card border border-border-base px-3 py-2 font-mono text-sm"
          title="Tag added items with this crafter"
        >
          {CRAFTERS.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
        <select
          value={pendingCat}
          onChange={(e) => setPendingCat(e.target.value as ItemCategory)}
          className="bg-bg-card border border-border-base px-3 py-2 font-mono text-sm"
          title="Tag added items with this category"
        >
          {CATS.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
      </div>

      {search.isFetching && <Spinner label="Searching XIVAPI…" />}
      {search.isError && <div className="text-crimson font-mono text-xs">XIVAPI error: {(search.error as Error).message}</div>}

      <ul className="divide-y divide-border-base">
        {(search.data ?? []).map((row) => (
          <li key={row.id} className="py-2 flex justify-between items-center">
            <div>
              <div className="text-text-cream">{row.name}</div>
              <div className="font-mono text-[10px] text-text-low">id {row.id} · ilvl {row.level}</div>
            </div>
            <button
              onClick={() => add(row)}
              className="font-mono text-[10px] tracking-widest uppercase border border-aether text-aether px-3 py-1 hover:bg-aether hover:text-bg-deep"
            >
              + Add
            </button>
          </li>
        ))}
      </ul>

      <div>
        <h3 className="font-mono text-[10px] tracking-widest text-text-low uppercase mb-2">Your custom items</h3>
        {customItems.length === 0 ? (
          <div className="text-text-low text-sm italic">None yet.</div>
        ) : (
          <ul className="divide-y divide-border-base">
            {customItems.map((i) => (
              <li key={i.id} className="py-2 flex justify-between items-center">
                <div>
                  <div className="text-text-cream">{i.name}</div>
                  <div className="font-mono text-[10px] text-text-low">{i.crafter} · lvl {i.lvl} · {i.cat}</div>
                </div>
                <button
                  onClick={() => removeCustomItem(i.id)}
                  className="font-mono text-[10px] tracking-widest uppercase border border-crimson text-crimson px-3 py-1 hover:bg-crimson hover:text-bg-deep"
                >
                  Remove
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Wire into Settings page**

Overwrite the Watchlist `<section>` in `src/routes/Settings.tsx`:
```tsx
import { WorldDcPicker } from '../features/settings/WorldDcPicker';
import { LevelsEditor } from '../features/settings/LevelsEditor';
import { PackToggles } from '../features/settings/PackToggles';
import { AddItemSearch } from '../features/settings/AddItemSearch';

export default function Settings() {
  return (
    <div className="max-w-7xl mx-auto px-4 space-y-10">
      <section>
        <h2 className="font-display text-lg text-gold mb-3 tracking-wide">World &amp; Data Center</h2>
        <WorldDcPicker />
      </section>
      <section>
        <h2 className="font-display text-lg text-gold mb-3 tracking-wide">Retainer levels</h2>
        <LevelsEditor />
      </section>
      <section>
        <h2 className="font-display text-lg text-gold mb-3 tracking-wide">Starter packs</h2>
        <PackToggles />
      </section>
      <section>
        <h2 className="font-display text-lg text-gold mb-3 tracking-wide">Add custom items</h2>
        <AddItemSearch />
      </section>
    </div>
  );
}
```

- [ ] **Step 4: Manually verify**

Run `npm run dev`. Open `/settings`:
- Toggle a starter pack off → go to `/watchlist`, confirm those items disappear.
- Search XIVAPI for "popoto" or "courtly" → confirm results render.
- Add a custom item → confirm it shows up in `/watchlist` and after a refresh.
- Remove a custom item → confirm it's gone.

Stop the server.

- [ ] **Step 5: Commit**

```
git add -A
git commit -m "feat(settings): pack toggles + XIVAPI search-add for custom items"
```

---

## Task 21: Mobile responsive pass

**Files:**
- Modify: `src/features/watchlist/WatchlistTable.tsx`
- Modify: `src/features/watchlist/FilterBar.tsx`
- Modify: `src/components/layout/Header.tsx`

- [ ] **Step 1: Header — stack nav under title on small screens**

Edit `src/components/layout/Header.tsx`. Change the inner `<div>` flex to:
```tsx
<div className="max-w-7xl mx-auto px-4 flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
```

- [ ] **Step 2: FilterBar — wrap and full-width search on mobile**

Edit `src/features/watchlist/FilterBar.tsx`. Change the search input to:
```tsx
<input
  type="text"
  value={search}
  onChange={(e) => setSearch(e.target.value)}
  placeholder="Search items…"
  className="bg-bg-card border border-border-base text-text-cream font-mono text-xs px-3 py-2 w-full sm:w-52 sm:ml-auto focus:outline-none focus:border-aether"
/>
```

- [ ] **Step 3: WatchlistTable — hide non-essential columns on mobile**

Edit `src/features/watchlist/WatchlistTable.tsx`. Add a `hideOnMobile?: boolean` flag to columns Lvl, Phantom, DC sales/day:
```tsx
const COLS: { key: SortKey; label: string; align?: 'right'; hideOnMobile?: boolean }[] = [
  { key: 'name', label: 'Item' },
  { key: 'crafter', label: 'Craft' },
  { key: 'lvl', label: 'Lvl', align: 'right', hideOnMobile: true },
  { key: 'phantom', label: 'Phantom', align: 'right', hideOnMobile: true },
  { key: 'dc', label: 'Chaos DC min', align: 'right' },
  { key: 'spd', label: 'DC sales/day', align: 'right', hideOnMobile: true },
  { key: 'score', label: 'Score', align: 'right' },
];
```

In the header render, append `${c.hideOnMobile ? 'hidden md:table-cell' : ''}` to the `<th>` classes.
In the row render, do the same for the matching `<td>`s — add `hidden md:table-cell` to the Lvl, Phantom, and DC sales/day cells.

- [ ] **Step 4: Manually verify**

Run `npm run dev`, open the page, resize the browser narrow (or use devtools mobile preview). Confirm:
- Header stacks.
- Filter bar wraps; search input goes full-width.
- Table only shows Item / Craft / Chaos DC min / Score on narrow.

Stop the server.

- [ ] **Step 5: Commit**

```
git add -A
git commit -m "feat(ui): mobile responsive pass on header, filters, table"
```

---

## Task 22: Vercel deploy config

**Files:**
- Create: `vercel.json`
- Modify: `README.md`

- [ ] **Step 1: SPA rewrites for client-side routing**

Write `c:/Users/esthe/Documents/Dev/ffxiv-helper/vercel.json`:
```json
{
  "rewrites": [
    { "source": "/(.*)", "destination": "/" }
  ]
}
```

This makes refreshing on `/watchlist` or `/settings` work — Vercel rewrites unknown paths to `index.html` so React Router takes over.

- [ ] **Step 2: README deploy instructions**

Append to `README.md`:
```markdown

## Deploy

1. Push to GitHub.
2. Import the repo on Vercel (`https://vercel.com/new`).
3. Vercel auto-detects Vite, no config needed beyond `vercel.json` already in repo.
4. Optional env var: `VITE_XIVAPI_BASE` if you want to override the default `https://v2.xivapi.com`.

## Test

```
npm test
```
```

- [ ] **Step 3: Final build sanity check**

Run:
```
npm run build
```

Expected: builds without TS errors, emits `dist/`.

- [ ] **Step 4: Commit**

```
git add -A
git commit -m "chore: vercel SPA rewrite + README deploy notes"
```

---

## Task 23: Smoke test for the watchlist route

**Files:**
- Create: `src/routes/Watchlist.test.tsx`

A render test that mocks both Universalis fetches and asserts a table row appears.

- [ ] **Step 1: Failing test**

Write `src/routes/Watchlist.test.tsx`:
```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import Watchlist from './Watchlist';
import { useSettingsStore, defaultSettings } from '../features/settings/store';
import { useWatchlistStore, defaultWatchlist } from '../features/items/watchlistStore';
import { useUiStore, defaultUi } from '../features/ui/uiStore';

beforeEach(() => {
  localStorage.clear();
  useSettingsStore.setState(defaultSettings());
  useWatchlistStore.setState(defaultWatchlist());
  useUiStore.setState(defaultUi());
  vi.restoreAllMocks();
});

function withProviders(node: React.ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return (
    <QueryClientProvider client={qc}>
      <MemoryRouter>{node}</MemoryRouter>
    </QueryClientProvider>
  );
}

describe('Watchlist route', () => {
  it('renders rows from a mocked Universalis response', async () => {
    vi.stubGlobal('fetch', vi.fn().mockImplementation(() => Promise.resolve({
      ok: true,
      json: async () => ({
        items: {
          '49281': { listings: [{ hq: false, pricePerUnit: 250000 }], recentHistory: [], regularSaleVelocity: 2.5, lastUploadTime: Date.now() },
        },
      }),
    })));

    render(withProviders(<Watchlist />));

    await waitFor(() => {
      expect(screen.getByText(/Courtly Lover's Temple Chain of Striking/)).toBeInTheDocument();
    });
  });
});
```

- [ ] **Step 2: Run + verify pass**

Run `npm test -- routes/Watchlist --run`. Expected: test passes.

- [ ] **Step 3: Run the full suite**

Run `npm test -- --run`. Expected: all tests pass.

- [ ] **Step 4: Commit**

```
git add -A
git commit -m "test(watchlist): smoke render test with mocked Universalis"
```

---

## Done — Phase 1 ships when:

- `npm run build` succeeds with no TS errors.
- `npm test -- --run` shows green.
- `npm run dev` lets you: see live data on `/watchlist`, edit retainer levels in `/settings` and watch the watchlist re-render with new craft-status colors, toggle a starter pack off and watch items disappear, search XIVAPI and add a custom item that shows up on the watchlist.
- All settings persist after a hard refresh.

Phase 2 (recipe tree + true profit) starts on a separate plan against the same spec's appendix.
